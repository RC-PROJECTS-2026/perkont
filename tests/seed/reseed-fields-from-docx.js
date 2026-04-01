/**
 * Tüm DOCX şablonlarını parse ederek form_fields tablosunu günceller.
 * DOCX'teki tablo hücrelerinden alan bilgilerini çıkarır.
 *
 * Run: node tests/seed/reseed-fields-from-docx.js
 */
const mammoth = require('c:/tmp/node_modules/mammoth');
const mysql = require('./../../backend/node_modules/mysql2/promise');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DB = { host: 'localhost', user: 'root', password: '', database: 'perkont_db', charset: 'utf8mb4' };
const BASE_DIR = path.resolve(__dirname, '../../PERKONT_FORMLAR/RAPOR_SABLONLARI');

// Türkçe → ASCII
function toKey(s) {
  return s.replace(/[ğüşıöçĞÜŞİÖÇ]/g, c =>
    ({ ğ:'g',ü:'u',ş:'s',ı:'i',ö:'o',ç:'c',Ğ:'G',Ü:'U',Ş:'S',İ:'I',Ö:'O',Ç:'C' }[c] || c))
    .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').substring(0, 60);
}

// Hücre tipini tahmin et
function guessFieldType(text) {
  const t = text.toLowerCase();
  // Bölüm başlıkları (numaralı bölümler, büyük harf başlıklar)
  if (/^\d+\.\s/.test(text) && text === text.toUpperCase()) return 'SECTION_HEADER';
  if (/^[A-ZÇĞİÖŞÜ\s]{4,}$/.test(text) && !/[a-zçğıöşü]/.test(text)) return 'SECTION_HEADER';

  // Tarih alanları
  if (/tarih/i.test(t) || /date/i.test(t)) return 'DATE';

  // İmza
  if (/imza/i.test(t) || /onay/i.test(t)) return 'SIGNATURE';

  // Sayısal
  if (/hacim|kapasite|ağırlık|basınç|sıcaklık|bar|lt|kg|mm|adet|no$/i.test(t)) return 'NUMBER';

  // Kontrol maddeleri
  if (/kontrol|uygun|muayene kriter/i.test(t) && /^\d+\./.test(text)) return 'CHECK_ITEM';

  return 'TEXT';
}

// Bölümü tahmin et
function guessSection(text, currentSection) {
  const match = text.match(/^(\d+)\.\s/);
  if (match && text.length < 80) return text;
  return currentSection;
}

async function parseDocx(filePath) {
  const result = await mammoth.convertToHtml({ path: filePath });
  const html = result.value;

  // Tablo hücrelerini çıkar
  const cellRegex = /<td[^>]*>(.*?)<\/td>/gs;
  let match;
  const cells = [];
  while ((match = cellRegex.exec(html)) !== null) {
    let text = match[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (text && text !== '-' && text.length > 1) cells.push(text);
  }

  // Hücreleri fields'a dönüştür
  const fields = [];
  let currentSection = 'Genel';
  let order = 1;

  for (const cell of cells) {
    // Çok kısa veya meta bilgi olan hücreleri atla
    if (cell.length < 2) continue;
    if (/^(ROYALCERT|BELGELENDİRME|MUAYENE|PERİYODİK KONTROLÜ|formunda)/i.test(cell)) continue;
    if (/^Muayene formunda/.test(cell)) continue;

    const fieldType = guessFieldType(cell);

    if (fieldType === 'SECTION_HEADER') {
      currentSection = cell;
    }

    fields.push({
      fieldKey: toKey(cell),
      label: cell.substring(0, 255),
      fieldType: fieldType,
      section: currentSection,
      orderIndex: order++,
      isRequired: fieldType !== 'SECTION_HEADER' && fieldType !== 'SIGNATURE',
    });
  }

  return fields;
}

async function main() {
  console.log('=== DOCX → DB Field Seeder ===\n');
  const conn = await mysql.createConnection(DB);

  // DB'deki şablonları al
  const [templates] = await conn.query('SELECT id, code, name FROM form_templates ORDER BY code');
  console.log(`DB'de ${templates.length} şablon var\n`);

  // DOCX dosyalarını bul
  const docxFiles = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.docx') && !entry.name.startsWith('~$')) docxFiles.push(full);
    }
  }
  walk(BASE_DIR);
  console.log(`${docxFiles.length} DOCX dosyası bulundu\n`);

  let totalInserted = 0;
  let templateMatched = 0;

  for (const docxPath of docxFiles) {
    const filename = path.basename(docxPath, '.docx').replace(/_kurumsal$/, '');

    // DB'deki şablonla eşleştir
    const template = templates.find(t => {
      const tCode = t.code.split(' ')[0].trim();
      return filename.startsWith(tCode) || t.name === filename || t.code === filename;
    });

    if (!template) {
      console.log(`  SKIP (no match): ${filename.substring(0, 60)}`);
      continue;
    }

    templateMatched++;

    try {
      const fields = await parseDocx(docxPath);

      // Mevcut alanları sil
      await conn.query('DELETE FROM form_fields WHERE templateId = ?', [template.id]);

      // Yeni alanları ekle
      for (const field of fields) {
        const id = crypto.randomUUID();
        await conn.query(
          `INSERT INTO form_fields (id, templateId, fieldKey, label, fieldType, section, orderIndex, isRequired, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
          [id, template.id, field.fieldKey, field.label, field.fieldType, field.section, field.orderIndex, field.isRequired ? 1 : 0]
        );
      }

      totalInserted += fields.length;
      console.log(`  OK: ${template.code.substring(0, 40).padEnd(42)} → ${fields.length} alan`);
    } catch (e) {
      console.log(`  ERR: ${filename.substring(0, 50)} - ${e.message}`);
    }
  }

  console.log(`\n=== Sonuç ===`);
  console.log(`Eşleşen: ${templateMatched} / ${docxFiles.length}`);
  console.log(`Eklenen alan: ${totalInserted}`);

  await conn.end();
}

main().catch(e => { console.error(e); process.exit(1); });

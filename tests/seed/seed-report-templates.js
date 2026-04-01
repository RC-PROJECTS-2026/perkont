/**
 * 89 Rapor Sablonunu form_templates tablosuna seed eder.
 * DOCX dosyalari PERKONT_FORMLAR/RAPOR_SABLONLARI/ altindadir.
 * Bu script sablon metadata'sini DB'ye kaydeder, DOCX'ler MinIO'ya ayrica yuklenir.
 *
 * Run: cd backend && NODE_PATH=./node_modules node ../tests/seed/seed-report-templates.js
 */
const mysql = require('mysql2/promise');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const DB = { host:'localhost', user:'root', password:'', database: process.env.DB_DATABASE || 'perkont_staging', charset:'utf8mb4' };

// Ekipman tipi esleme: dizin adi → equipment_type kodu
const CATEGORY_MAP = {
  'ELEKTRİK': ['ET-001','ET-002','ET-003'], // Genel elektrik tipleri
  'BASINÇLI KAPLAR VE KAZANLAR': ['ET-004','ET-005','ET-006'],
  'KALDIRMA VE İLETME MAKİNELERİ': ['ET-007','ET-008','ET-009'],
  'KALDIRMA VE İLETME MAKİNELERİ - İŞ MAKİNELERİ': ['ET-010','ET-011'],
  'YANGIN TESİSATI - TESİSATLAR': ['ET-012','ET-013'],
  'OYUN ALANLARI VE SPOR EKİPMANLARI': ['ET-014','ET-015'],
};

async function main() {
  console.log('=== Report Template Seed ===');
  const conn = await mysql.createConnection(DB);

  const baseDir = path.resolve(__dirname, '../../PERKONT_FORMLAR/RAPOR_SABLONLARI');
  const files = [];

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.docx')) files.push(full);
    }
  }
  walk(baseDir);
  console.log(`Found ${files.length} DOCX templates`);

  let inserted = 0;
  for (const file of files) {
    const rel = path.relative(baseDir, file);
    const parts = rel.split(path.sep);
    const accredited = parts[0].includes('OLANLAR') && !parts[0].includes('OLMAYAN');
    const category = parts.length >= 3 ? parts[2] : (parts[1] || 'GENEL');
    const filename = path.basename(file, '.docx').replace(/_kurumsal$/, '');

    // Extract code: RC-M-XX-FRNN_rev
    const codeMatch = filename.match(/RC-M-([A-ZÇĞİÖŞÜa-zçğıöşü]+)-FR(\d+)/);
    const revMatch = filename.match(/_(\d+)\s/);
    const code = codeMatch ? `RC-M-${codeMatch[1]}-FR${codeMatch[2]}` : `TMPL-${String(inserted+1).padStart(3,'0')}`;
    const revision = revMatch ? `Rev.${String(revMatch[1]).padStart(2,'0')}` : 'Rev.01';

    // Template name: everything after the code
    let name = filename;
    if (codeMatch) {
      name = filename.replace(/RC-M-[A-ZÇĞİÖŞÜa-zçğıöşü]+-FR\d+_\d+\s*/, '').trim();
    }
    if (!name) name = filename;

    const id = crypto.randomUUID();

    // Check if already exists
    const [existing] = await conn.query('SELECT id FROM form_templates WHERE code = ? LIMIT 1', [code]);
    if (existing.length > 0) {
      console.log(`  SKIP: ${code} (already exists)`);
      continue;
    }

    await conn.query(`
      INSERT INTO form_templates (id, code, name, revision, revisionDate, status, equipmentTypeId, isAccredited, category, sourceFile, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, CURDATE(), 'draft', NULL, ?, ?, ?, NOW(), NOW())
    `, [id, code, name.slice(0, 255), revision, accredited ? 1 : 0, category, rel]);

    inserted++;
  }

  console.log(`\nInserted: ${inserted} / ${files.length}`);
  console.log('Note: equipmentTypeId must be mapped manually for each template.');
  console.log('Note: DOCX files need to be uploaded to MinIO and outputTemplateUrl set.');
  await conn.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });

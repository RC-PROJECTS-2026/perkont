/**
 * Tüm DOCX şablonlarını Word COM ile PDF'e dönüştürür.
 * PS1 dosyasını UTF-8 BOM ile yazar - Türkçe dosya yolları için.
 * Run: node tests/seed/convert-docx-to-pdf.js
 */
const { execFileSync } = require('child_process');
const mysql = require('../../backend/node_modules/mysql2/promise');
const fs = require('fs');
const path = require('path');

const DB = { host: 'localhost', user: 'root', password: '', database: 'perkont_db', charset: 'utf8mb4' };
const BASE_DIR = path.resolve(__dirname, '../../PERKONT_FORMLAR/RAPOR_SABLONLARI');
const OUTPUT_DIR = path.resolve(__dirname, '../../backend/storage/templates');
const PS_SCRIPT = path.resolve(__dirname, '../../backend/storage/_convert.ps1');

function convertDocxToPdf(docxPath, pdfPath) {
  const winDocx = docxPath.replace(/\//g, '\\');
  const winPdf = pdfPath.replace(/\//g, '\\');

  const ps1Content = [
    '$ErrorActionPreference = "Stop"',
    '$word = New-Object -ComObject Word.Application',
    '$word.Visible = $false',
    '$word.DisplayAlerts = 0',
    'try {',
    `    $doc = $word.Documents.Open("${winDocx}")`,
    `    $doc.SaveAs([ref]"${winPdf}", [ref]17)`,
    '    $doc.Close([ref]0)',
    '} finally {',
    '    $word.Quit()',
    '    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($word) | Out-Null',
    '}',
  ].join('\r\n');

  // Write with UTF-8 BOM for Turkish characters
  const BOM = Buffer.from([0xEF, 0xBB, 0xBF]);
  const content = Buffer.concat([BOM, Buffer.from(ps1Content, 'utf8')]);
  fs.writeFileSync(PS_SCRIPT, content);

  execFileSync('powershell.exe', ['-ExecutionPolicy', 'Bypass', '-File', PS_SCRIPT], {
    timeout: 45000,
    stdio: 'pipe',
    windowsHide: true,
  });
}

async function main() {
  console.log('=== DOCX -> PDF Toplu Donusturme ===\n');
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const conn = await mysql.createConnection(DB);
  const [templates] = await conn.query('SELECT id, code, name FROM form_templates ORDER BY code');
  console.log(`DB: ${templates.length} sablon\n`);

  const docxFiles = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.docx') && !entry.name.startsWith('~$')) docxFiles.push(full);
    }
  }
  walk(BASE_DIR);
  console.log(`${docxFiles.length} DOCX bulundu\n`);

  let converted = 0, failed = 0, skipped = 0;

  for (let i = 0; i < docxFiles.length; i++) {
    const docxPath = docxFiles[i];
    const filename = path.basename(docxPath, '.docx').replace(/_kurumsal$/, '');

    const template = templates.find(t => {
      const tCode = t.code.split(' ')[0].trim();
      return filename.startsWith(tCode) || t.name === filename;
    });

    if (!template) { skipped++; continue; }

    const pdfName = `${template.id}.pdf`;
    const pdfPath = path.join(OUTPUT_DIR, pdfName);

    if (fs.existsSync(pdfPath) && fs.statSync(pdfPath).size > 1000) {
      await conn.query('UPDATE form_templates SET outputTemplateUrl = ?, outputTemplateObjectName = ? WHERE id = ?',
        [`local://templates/${pdfName}`, `templates/${pdfName}`, template.id]);
      converted++;
      console.log(`  [${i+1}/${docxFiles.length}] SKIP: ${template.code.substring(0, 35)} (zaten var)`);
      continue;
    }

    try {
      convertDocxToPdf(docxPath, pdfPath);

      if (fs.existsSync(pdfPath) && fs.statSync(pdfPath).size > 100) {
        const size = fs.statSync(pdfPath).size;
        await conn.query('UPDATE form_templates SET outputTemplateUrl = ?, outputTemplateObjectName = ? WHERE id = ?',
          [`local://templates/${pdfName}`, `templates/${pdfName}`, template.id]);
        converted++;
        console.log(`  [${i+1}/${docxFiles.length}] OK: ${template.code.substring(0, 35).padEnd(37)} -> ${(size / 1024).toFixed(0)} KB`);
      } else {
        failed++;
        console.log(`  [${i+1}/${docxFiles.length}] FAIL: ${template.code.substring(0, 35)}`);
      }
    } catch (e) {
      failed++;
      console.log(`  [${i+1}/${docxFiles.length}] ERR: ${template.code.substring(0, 35)} - ${e.stderr ? e.stderr.toString().substring(0, 80) : e.message.substring(0, 80)}`);
      try { execFileSync('taskkill', ['/F', '/IM', 'WINWORD.EXE'], { stdio: 'pipe' }); } catch {}
    }
  }

  try { fs.unlinkSync(PS_SCRIPT); } catch {}

  console.log(`\n=== Sonuc ===`);
  console.log(`Donusturulen: ${converted} / ${docxFiles.length}`);
  console.log(`Basarisiz: ${failed}`);

  await conn.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });

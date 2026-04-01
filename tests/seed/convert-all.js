/**
 * DOCX → PDF: Her dosya için ayrı PowerShell çağrısı (güvenli).
 * ASCII temp paths + sequential processing.
 */
const { execFileSync } = require('child_process');
const mysql = require('../../backend/node_modules/mysql2/promise');
const fs = require('fs');
const path = require('path');

const DB = { host: 'localhost', user: 'root', password: '', database: 'perkont_db', charset: 'utf8mb4' };
const BASE_DIR = path.resolve(__dirname, '../../PERKONT_FORMLAR/RAPOR_SABLONLARI');
const OUTPUT_DIR = path.resolve(__dirname, '../../backend/storage/templates');

function convertOne(docxPath, pdfPath) {
  // Temp ASCII paths
  const tmpDocx = 'C:\\tmp\\conv_input.docx';
  const tmpPdf = 'C:\\tmp\\conv_output.pdf';
  const ps1 = 'C:\\tmp\\conv.ps1';

  fs.copyFileSync(docxPath, tmpDocx);
  try { fs.unlinkSync(tmpPdf); } catch {}

  const script = [
    '$word = New-Object -ComObject Word.Application',
    '$word.Visible = $false',
    '$word.DisplayAlerts = 0',
    `$doc = $word.Documents.Open("${tmpDocx}")`,
    `$doc.SaveAs([ref]"${tmpPdf}", [ref]17)`,
    '$doc.Close([ref]0)',
    '$word.Quit()',
    '[System.Runtime.Interopservices.Marshal]::ReleaseComObject($word) | Out-Null',
    '[gc]::Collect()',
    '[gc]::WaitForPendingFinalizers()',
  ].join('\r\n');

  fs.writeFileSync(ps1, Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from(script, 'utf8')]));

  execFileSync('powershell.exe', ['-ExecutionPolicy', 'Bypass', '-File', ps1], {
    timeout: 60000,
    stdio: 'pipe',
    windowsHide: true,
  });

  if (fs.existsSync(tmpPdf) && fs.statSync(tmpPdf).size > 100) {
    fs.copyFileSync(tmpPdf, pdfPath);
    return true;
  }
  return false;
}

async function main() {
  console.log('=== DOCX -> PDF (sirayla) ===\n');
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const conn = await mysql.createConnection(DB);
  const [templates] = await conn.query('SELECT id, code, name FROM form_templates ORDER BY code');

  const docxFiles = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.docx') && !entry.name.startsWith('~$')) docxFiles.push(full);
    }
  }
  walk(BASE_DIR);

  let ok = 0, fail = 0, skip = 0;

  for (let i = 0; i < docxFiles.length; i++) {
    const docxPath = docxFiles[i];
    const filename = path.basename(docxPath, '.docx').replace(/_kurumsal$/, '');

    const template = templates.find(t => {
      const tCode = t.code.split(' ')[0].trim();
      return filename.startsWith(tCode) || t.name === filename;
    });
    if (!template) continue;

    const pdfName = `${template.id}.pdf`;
    const pdfPath = path.join(OUTPUT_DIR, pdfName);

    if (fs.existsSync(pdfPath) && fs.statSync(pdfPath).size > 1000) {
      await conn.query('UPDATE form_templates SET outputTemplateUrl = ?, outputTemplateObjectName = ? WHERE id = ?',
        [`local://templates/${pdfName}`, `templates/${pdfName}`, template.id]);
      skip++;
      continue;
    }

    try {
      const success = convertOne(docxPath, pdfPath);
      if (success) {
        const sz = (fs.statSync(pdfPath).size / 1024).toFixed(0);
        await conn.query('UPDATE form_templates SET outputTemplateUrl = ?, outputTemplateObjectName = ? WHERE id = ?',
          [`local://templates/${pdfName}`, `templates/${pdfName}`, template.id]);
        ok++;
        console.log(`  [${ok+skip}/${docxFiles.length}] OK: ${template.code.substring(0, 40).padEnd(42)} ${sz} KB`);
      } else {
        fail++;
        console.log(`  [${i+1}/${docxFiles.length}] FAIL: ${template.code.substring(0, 40)}`);
      }
    } catch (e) {
      fail++;
      const msg = e.stderr ? e.stderr.toString().split('\n')[0].substring(0, 80) : e.message.substring(0, 80);
      console.log(`  [${i+1}/${docxFiles.length}] ERR: ${template.code.substring(0, 35)} - ${msg}`);
      // Kill stuck Word
      try { execFileSync('taskkill', ['/F', '/IM', 'WINWORD.EXE'], { stdio: 'pipe' }); } catch {}
      // Wait before retry
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  // Cleanup
  try { fs.unlinkSync('C:\\tmp\\conv_input.docx'); } catch {}
  try { fs.unlinkSync('C:\\tmp\\conv_output.pdf'); } catch {}
  try { fs.unlinkSync('C:\\tmp\\conv.ps1'); } catch {}

  console.log(`\n=== Sonuc ===`);
  console.log(`OK: ${ok} | FAIL: ${fail} | SKIP: ${skip} | TOPLAM: ${ok + skip}/${docxFiles.length}`);
  await conn.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });

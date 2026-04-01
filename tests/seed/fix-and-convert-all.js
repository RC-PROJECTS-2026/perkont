/**
 * Tüm DOCX şablonlarını:
 * 1. Tablo genişliklerini sayfa genişliğine otomatik sığdır
 * 2. PDF'e dönüştür
 * 3. DB'yi güncelle
 */
const { execFileSync } = require('child_process');
const mysql = require('../../backend/node_modules/mysql2/promise');
const fs = require('fs');
const path = require('path');

const DB = { host: 'localhost', user: 'root', password: '', database: 'perkont_db', charset: 'utf8mb4' };
const BASE_DIR = path.resolve(__dirname, '../../PERKONT_FORMLAR/RAPOR_SABLONLARI');
const OUTPUT_DIR = path.resolve(__dirname, '../../backend/storage/templates');
const TMP_DOCX = 'C:\\tmp\\conv_input.docx';
const TMP_PDF = 'C:\\tmp\\conv_output.pdf';
const PS_FILE = 'C:\\tmp\\conv_fix.ps1';

const PS_TEMPLATE = `
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {
    $doc = $word.Documents.Open("TMP_DOCX_PATH")
    $ps = $doc.PageSetup
    $cw = $ps.PageWidth - $ps.LeftMargin - $ps.RightMargin
    foreach ($t in $doc.Tables) {
        $t.PreferredWidthType = 2
        $t.PreferredWidth = $cw
        $t.AutoFitBehavior(2)
    }
    $doc.SaveAs([ref]"TMP_PDF_PATH", [ref]17)
    $doc.Close([ref]0)
} finally {
    $word.Quit()
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($word) | Out-Null
    [gc]::Collect()
    [gc]::WaitForPendingFinalizers()
}
`;

function convertOne(docxPath, pdfPath) {
  fs.copyFileSync(docxPath, TMP_DOCX);
  try { fs.unlinkSync(TMP_PDF); } catch {}

  const script = PS_TEMPLATE
    .replace('TMP_DOCX_PATH', TMP_DOCX)
    .replace('TMP_PDF_PATH', TMP_PDF);

  fs.writeFileSync(PS_FILE, Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from(script, 'utf8')]));

  execFileSync('powershell.exe', ['-ExecutionPolicy', 'Bypass', '-File', PS_FILE], {
    timeout: 60000, stdio: 'pipe', windowsHide: true,
  });

  if (fs.existsSync(TMP_PDF) && fs.statSync(TMP_PDF).size > 100) {
    fs.copyFileSync(TMP_PDF, pdfPath);
    return true;
  }
  return false;
}

async function main() {
  console.log('=== DOCX -> PDF (tablo duzeltmeli) ===\n');
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
  console.log(`${docxFiles.length} DOCX bulundu\n`);

  let ok = 0, fail = 0;

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

    try {
      const success = convertOne(docxPath, pdfPath);
      if (success) {
        const sz = (fs.statSync(pdfPath).size / 1024).toFixed(0);
        await conn.query('UPDATE form_templates SET outputTemplateUrl = ?, outputTemplateObjectName = ? WHERE id = ?',
          [`local://templates/${pdfName}`, `templates/${pdfName}`, template.id]);
        ok++;
        console.log(`  [${ok}/${docxFiles.length}] OK: ${template.code.substring(0, 42).padEnd(44)} ${sz} KB`);
      } else {
        fail++;
        console.log(`  [${i+1}/${docxFiles.length}] FAIL: ${template.code.substring(0, 40)}`);
      }
    } catch (e) {
      fail++;
      console.log(`  [${i+1}/${docxFiles.length}] ERR: ${template.code.substring(0, 35)} - ${(e.stderr?.toString() || e.message).split('\n')[0].substring(0, 60)}`);
      try { execFileSync('taskkill', ['/F', '/IM', 'WINWORD.EXE'], { stdio: 'pipe' }); } catch {}
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  try { fs.unlinkSync(TMP_DOCX); } catch {}
  try { fs.unlinkSync(TMP_PDF); } catch {}
  try { fs.unlinkSync(PS_FILE); } catch {}

  console.log(`\n=== Sonuc ===`);
  console.log(`OK: ${ok} | FAIL: ${fail} | TOPLAM: ${ok}/${docxFiles.length}`);
  await conn.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });

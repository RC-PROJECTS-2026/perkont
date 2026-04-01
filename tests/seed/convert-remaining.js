const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const mysql = require('../../backend/node_modules/mysql2/promise');

const OUTPUT_DIR = path.resolve(__dirname, '../../backend/storage/templates');
const TMP_DOCX = 'C:\\tmp\\conv_input.docx';
const TMP_PDF = 'C:\\tmp\\conv_output.pdf';
const PS_FILE = 'C:\\tmp\\conv_fix.ps1';

const FILES = [
  {
    id: '24bd7224-8218-464f-9a51-d3e2ba2e5203',
    src: path.resolve(__dirname, '../../PERKONT_FORMLAR/RAPOR_SABLONLARI/TÜRKAK AKREDİTASYONU OLANLAR/ELEKTRİK/RC-M-ET-FR21_3 TRANSFORMATÖR 1-36kV YG GÖZLE KONTROL VE TOPRAKLAMA TESİSATI PERİYODİK KONTROL RA_kurumsal.docx'),
    code: 'RC-M-ET-FR21',
  },
  {
    id: '40a25741-fd7d-4558-b2e5-70f375c0d4e2',
    src: path.resolve(__dirname, '../../PERKONT_FORMLAR/RAPOR_SABLONLARI/TÜRKAK AKREDİTASYONU OLANLAR/ELEKTRİK/RC-M-ET-FR23_4 UPS AKÜMÜLATÖR PERİYODİK KONTROL RAPORU_kurumsal.docx'),
    code: 'RC-M-ET-FR23',
  },
  {
    id: 'a78279b1-327a-444d-8ab9-93e8d318b660',
    src: path.resolve(__dirname, '../../PERKONT_FORMLAR/RAPOR_SABLONLARI/TÜRKAK AKREDİTASYONU OLANLAR/MEKANİK/YANGIN TESİSATI - TESİSATLAR/RC-M-YK-FR16_7 PORTATİF YANGIN SÖNDÜRME TÜPLERİ YERLEŞİMİ MUAYENE RAPORU_kurumsal.docx'),
    code: 'RC-M-YK-FR16',
  },
  {
    id: 'a8ba4a95-bcff-4cb9-b6f0-5da7d07753c8',
    src: path.resolve(__dirname, '../../PERKONT_FORMLAR/RAPOR_SABLONLARI/TÜRKAK AKREDİTASYONU OLANLAR/MEKANİK/YANGIN TESİSATI - TESİSATLAR/RC-M-YK-FR20_7 CO2 GAZLI OTO. SÖNDÜRME SİSTEMLERİ MUAYENE RAPORU_kurumsal.docx'),
    code: 'RC-M-YK-FR20',
  },
];

const PS_SCRIPT = `$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {
    $doc = $word.Documents.Open("C:\\tmp\\conv_input.docx")
    $ps = $doc.PageSetup
    $cw = $ps.PageWidth - $ps.LeftMargin - $ps.RightMargin
    foreach ($t in $doc.Tables) { $t.PreferredWidthType = 2; $t.PreferredWidth = $cw; $t.AutoFitBehavior(2) }
    $doc.SaveAs([ref]"C:\\tmp\\conv_output.pdf", [ref]17)
    $doc.Close([ref]0)
} finally {
    $word.Quit()
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($word) | Out-Null
    [gc]::Collect()
    [gc]::WaitForPendingFinalizers()
}`;

async function main() {
  const conn = await mysql.createConnection({ host: 'localhost', user: 'root', password: '', database: 'perkont_db', charset: 'utf8mb4' });

  // Kill any Word first
  try { execFileSync('taskkill', ['/F', '/IM', 'WINWORD.EXE'], { stdio: 'pipe' }); } catch {}

  for (const f of FILES) {
    console.log(`\n${f.code}:`);
    const pdfPath = path.join(OUTPUT_DIR, `${f.id}.pdf`);

    if (!fs.existsSync(f.src)) {
      console.log('  DOCX bulunamadi!');
      continue;
    }

    // Node.js ile kopyala (read+write - lock sorununu asar)
    console.log('  Kopyalaniyor...');
    const buf = fs.readFileSync(f.src);
    fs.writeFileSync(TMP_DOCX, buf);
    console.log('  Kopyalandi:', buf.length, 'bytes');

    try { fs.unlinkSync(TMP_PDF); } catch {}

    // PS1 dosyasını yaz (BOM ile)
    fs.writeFileSync(PS_FILE, Buffer.concat([
      Buffer.from([0xEF, 0xBB, 0xBF]),
      Buffer.from(PS_SCRIPT, 'utf8'),
    ]));

    console.log('  Donusturuluyor...');
    try {
      const result = execFileSync('powershell.exe', ['-ExecutionPolicy', 'Bypass', '-File', PS_FILE], {
        timeout: 60000,
        encoding: 'utf8',
        windowsHide: true,
      });
      if (result && result.trim()) console.log('  PS:', result.trim());
    } catch (e) {
      console.log('  PS HATA:', (e.stderr || e.message).toString().split('\n')[0].substring(0, 100));
      try { execFileSync('taskkill', ['/F', '/IM', 'WINWORD.EXE'], { stdio: 'pipe' }); } catch {}

      // Alternatif: tablo fix'siz dogrudan donustur
      console.log('  Alternatif deneniyor (tablo fix olmadan)...');
      const PS2 = `$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {
    $doc = $word.Documents.Open("C:\\tmp\\conv_input.docx")
    $doc.SaveAs([ref]"C:\\tmp\\conv_output.pdf", [ref]17)
    $doc.Close([ref]0)
} finally {
    $word.Quit()
}`;
      fs.writeFileSync(PS_FILE, Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from(PS2, 'utf8')]));
      try {
        execFileSync('powershell.exe', ['-ExecutionPolicy', 'Bypass', '-File', PS_FILE], {
          timeout: 60000, encoding: 'utf8', windowsHide: true,
        });
      } catch (e2) {
        console.log('  Alternatif de basarisiz:', (e2.stderr || e2.message).toString().split('\n')[0].substring(0, 80));
        try { execFileSync('taskkill', ['/F', '/IM', 'WINWORD.EXE'], { stdio: 'pipe' }); } catch {}
      }
    }

    // Kontrol
    await new Promise(r => setTimeout(r, 2000));
    if (fs.existsSync(TMP_PDF) && fs.statSync(TMP_PDF).size > 100) {
      fs.copyFileSync(TMP_PDF, pdfPath);
      const sz = (fs.statSync(pdfPath).size / 1024).toFixed(0);
      await conn.query('UPDATE form_templates SET outputTemplateUrl = ?, outputTemplateObjectName = ? WHERE id = ?',
        [`local://templates/${f.id}.pdf`, `templates/${f.id}.pdf`, f.id]);
      console.log(`  OK: ${sz} KB`);
    } else {
      console.log('  BASARISIZ - PDF olusturulmadi');
    }

    // Word'u temizle
    await new Promise(r => setTimeout(r, 3000));
    try { execFileSync('taskkill', ['/F', '/IM', 'WINWORD.EXE'], { stdio: 'pipe' }); } catch {}
    await new Promise(r => setTimeout(r, 2000));
  }

  // Cleanup
  try { fs.unlinkSync(TMP_DOCX); } catch {}
  try { fs.unlinkSync(TMP_PDF); } catch {}
  try { fs.unlinkSync(PS_FILE); } catch {}

  // Final check
  let ok = 0;
  for (const f of FILES) {
    const pdf = path.join(OUTPUT_DIR, `${f.id}.pdf`);
    if (fs.existsSync(pdf) && fs.statSync(pdf).size > 1000) ok++;
  }
  console.log(`\nSONUC: ${ok}/${FILES.length} basarili`);

  await conn.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });

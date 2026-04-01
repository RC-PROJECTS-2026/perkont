/**
 * Form sablonlarini ekipman tiplerine esle.
 * Eksik tipler olusturulur, sonra form_templates.equipmentTypeId guncellenir.
 *
 * Run: cd backend && NODE_PATH=./node_modules node ../tests/seed/map-templates-to-types.js
 */
const mysql = require('mysql2/promise');
const crypto = require('crypto');

const DB = { host:'localhost', user:'root', password:'', database: process.env.DB_DATABASE || 'perkont_staging', charset:'utf8mb4' };

// Her form kodu → ekipman tipi esleme
// Ayni tip birden fazla forma atanabilir
const TEMPLATE_TO_TYPE = {
  // ELEKTRIK
  'RC-M-ET-FR02': { name: 'Topraklama Tesisatı', code: 'ET-TOPRAK', period: 12 },
  'RC-M-ET-FR04': { name: 'Yıldırımdan Korunma Tesisatı', code: 'ET-YILDIRIM', period: 12 },
  'RC-M-ET-FR08': { name: 'Elektrik İç Tesisat', code: 'ET-ICTESISAT', period: 12 },
  'RC-M-ET-FR10': { name: 'Katodik Koruma', code: 'ET-KATODIK', period: 12 },
  'RC-M-ET-FR12': { name: 'Jeneratör', code: 'ET-JENERATOR', period: 12 },
  'RC-M-ET-FR14': { name: 'Yalıtım Direnci Ölçümü', code: 'ET-YALITIM', period: 12 },
  'RC-M-ET-FR18': { name: 'Kompanzasyon Panosu', code: 'ET-KOMPANZ', period: 12 },
  'RC-M-ET-FR20': { name: 'Termografik Ölçüm', code: 'ET-TERMOGRAF', period: 12 },
  'RC-M-ET-FR21': { name: 'Transformatör', code: 'ET-TRAFO', period: 12 },
  'RC-M-ET-FR23': { name: 'UPS Akümülatör', code: 'ET-UPS', period: 12 },

  // YANGIN
  'RC-M-YK-FR02': { name: 'Kaçış Yolu Basınçlandırma', code: 'YK-KACIS', period: 12 },
  'RC-M-YK-FR06': { name: 'Kimyevi/Gazlı Söndürme Sistemi', code: 'YK-KIMYEVI', period: 12 },
  'RC-M-YK-FR08': { name: 'Sulu Yangın Söndürme', code: 'YK-SULU', period: 12 },
  'RC-M-YK-FR10': { name: 'Yangın Algılama ve Uyarı', code: 'YK-ALGILAMA', period: 12 },
  'RC-M-YK-FR12': { name: 'Duman Tahliye Sistemi', code: 'YK-DUMAN', period: 12 },
  'RC-M-YK-FR14': { name: 'Havalandırma Tesisatı', code: 'YK-HAVA', period: 12 },
  'RC-M-YK-FR16': { name: 'Portatif Yangın Söndürme Tüpü', code: 'YK-PORTATIF', period: 12 },
  'RC-M-YK-FR20': { name: 'CO2 Gazlı Söndürme', code: 'YK-CO2', period: 12 },

  // BASINC
  'RC-M-İE-FR27': { name: 'Kompresör Hava Tankı', code: 'BK-KOMPRESOR', period: 12 },
  'RC-M-İE-FR29': { name: 'Basınçlı Hava Tankı', code: 'BK-HAVA', period: 12 },
  'RC-M-İE-FR31': { name: 'Otoklav', code: 'BK-OTOKLAV', period: 12 },
  'RC-M-İE-FR33': { name: 'Hidrofor/Genleşme Tankı', code: 'BK-HIDROFOR', period: 12 },
  'RC-M-İE-FR35': { name: 'Buhar Jeneratörü', code: 'BK-BUHARJEN', period: 12 },
  'RC-M-İE-FR37': { name: 'Boyler/Akümülasyon Tankı', code: 'BK-BOYLER', period: 12 },
  'RC-M-İE-FR39': { name: 'Atmosferik Depolama Tankı', code: 'BK-ATMOSFER', period: 12 },
  'RC-M-İE-FR41': { name: 'Buhar Kazanı', code: 'BK-BUHAR', period: 12 },
  'RC-M-İE-FR43': { name: 'Kalorifer/Sıcak Su Kazanı', code: 'BK-KALORIFER', period: 12 },
  'RC-M-İE-FR45': { name: 'Ütü Kazanı', code: 'BK-UTU', period: 12 },
  'RC-M-İE-FR47': { name: 'Kızgın Su Kazanı', code: 'BK-KIZGINSU', period: 12 },
  'RC-M-İE-FR49': { name: 'Kızgın Yağ Kazanı', code: 'BK-KIRGINYAG', period: 12 },
  'RC-M-İE-FR51': { name: 'Boyama Kazanı', code: 'BK-BOYAMA', period: 12 },

  // KALDIRMA
  'RC-M-İE-FR01': { name: 'Yürüyen Merdiven/Bant', code: 'KM-YURUYEN', period: 12 },
  'RC-M-İE-FR04': { name: 'Seyyar İş Platformu', code: 'KM-PLATFORM', period: 12 },
  'RC-M-İE-FR06': { name: 'Vinç (Köprülü/Monoray/Portal)', code: 'KM-VINC', period: 12 },
  'RC-M-İE-FR13': { name: 'Kule Vinç', code: 'KM-KULEVINC', period: 6 },
  'RC-M-İE-FR15': { name: 'Sütunlu Çalışma Platformu', code: 'KM-SUTUNLU', period: 12 },
  'RC-M-İE-FR17': { name: 'Asılı Erişim Donanımı', code: 'KM-ASILI', period: 12 },
  'RC-M-İE-FR19': { name: 'Caraskal', code: 'KM-CARASKAL', period: 12 },
  'RC-M-İE-FR21': { name: 'Araç Kaldırma Lifti', code: 'KM-LIFT', period: 12 },
  'RC-M-İE-FR23': { name: 'Transpalet', code: 'KM-TRANSPALET', period: 12 },
  'RC-M-İE-FR25': { name: 'Forklift', code: 'KM-FORKLIFT', period: 12 },
  'RC-M-İE-FR55': { name: 'Kriko', code: 'KM-KRIKO', period: 12 },
  'RC-M-İE-FR57': { name: 'Çektirme/Gerdirme', code: 'KM-CEKTIRME', period: 12 },
  'RC-M-İE-FR61': { name: 'İnşaat Asansörü', code: 'KM-INSAAT', period: 6 },
  'RC-M-İE-FR63': { name: 'İstif Makinası', code: 'KM-ISTIF', period: 12 },
  'RC-M-İE-FR65': { name: 'Yük Asansörü', code: 'KM-YUKASANSOR', period: 12 },
  'RC-M-İE-FR67': { name: 'Servis Asansörü', code: 'KM-SERVIS', period: 12 },
  'RC-M-İE-FR69': { name: 'Değişken Erişimli Araç', code: 'KM-DEGISKEN', period: 12 },
  'RC-M-İE-FR71': { name: 'Park Lifti', code: 'KM-PARKLIFT', period: 12 },
  'RC-M-İE-FR73': { name: 'Hareketli Yükleme Rampası', code: 'KM-RAMPA', period: 12 },
  'RC-M-İE-FR75': { name: 'Engelli Kaldırma Platformu', code: 'KM-ENGELLI', period: 12 },
  'RC-M-İE-FR79': { name: 'Endüstriyel Raf', code: 'KM-RAF', period: 12 },
  'RC-M-İE-FR81': { name: 'Kılavuz Raylı Personel Platformu', code: 'KM-KILAVUZ', period: 12 },
  'RC-M-İE-FR83': { name: 'İskele/Merdiven', code: 'KM-ISKELE', period: 12 },

  // IS MAKINALARI / TEZGAHLAR
  'RC-M-İE-FR85': { name: 'Freze Tezgahı', code: 'IM-FREZE', period: 12 },
  'RC-M-İE-FR87': { name: 'İş Makinası (Genel)', code: 'IM-GENEL', period: 12 },
  'RC-M-İE-FR89': { name: 'Endüstriyel Seksiyonel Kapı', code: 'IM-KAPI', period: 12 },
  'RC-M-İE-FR91': { name: 'Matkap Tezgahı', code: 'IM-MATKAP', period: 12 },
  'RC-M-İE-FR93': { name: 'Tezgah/Makine (Genel)', code: 'IM-TEZGAH', period: 12 },
  'RC-M-İE-FR95': { name: 'Torna Tezgahı', code: 'IM-TORNA', period: 12 },
  'RC-M-İE-FR97': { name: 'Vargel Tezgahı', code: 'IM-VARGEL', period: 12 },
  'RC-M-İE-FR99': { name: 'Greyder', code: 'IM-GREYDER', period: 12 },
  'RC-M-İE-FR101': { name: 'Hidrolik Kazıcı/Ekskavatör', code: 'IM-EKSKVATOR', period: 12 },
  'RC-M-İE-FR103': { name: 'Kazıcı Yükleyici', code: 'IM-KAZICI', period: 12 },
  'RC-M-İE-FR105': { name: 'Yükleyici', code: 'IM-YUKLEYICI', period: 12 },
  'RC-M-İE-FR107': { name: 'Daire Testere Tezgahı', code: 'IM-DAIRE', period: 12 },
  'RC-M-İE-FR108': { name: 'Kalınlık/Planya Tezgahı', code: 'IM-PLANYA', period: 12 },
  'RC-M-İE-FR109': { name: 'Şerit Testere Tezgahı', code: 'IM-SERIT', period: 12 },
  'RC-M-İE-FR110': { name: 'Sabit Taşlama Makinası', code: 'IM-TASLAMA', period: 12 },
  'RC-M-İE-FR111': { name: 'Yatar Daire Testere', code: 'IM-YATAR', period: 12 },
  'RC-M-İE-FR114': { name: 'Soğutma Ünitesi', code: 'IM-SOGUTMA', period: 12 },
  'RC-M-İE-FR117': { name: 'Kaldırma/İletme Makinası (Genel)', code: 'KM-GENEL', period: 12 },
  'RC-M-İE-FR119': { name: 'Sapan', code: 'KM-SAPAN', period: 12 },
  'RC-M-İE-FR121': { name: 'Konveyör', code: 'KM-KONVEYOR', period: 12 },
  'RC-M-İE-FR123': { name: 'Manyetik Kaldıraç', code: 'KM-MANYETIK', period: 12 },
  'RC-M-İE-FR128': { name: 'Rüzgar Türbini Servis Asansörü', code: 'KM-RUZGAR', period: 12 },
  'RC-M-İE-FR130': { name: 'Kablolu Taşıma Tesisatı (Teleferik)', code: 'KM-KABLOLU', period: 12 },
  'RC-M-İE-FR131': { name: 'Kaldırma Aksesuarı', code: 'KM-AKSESUAR', period: 12 },
  'RC-M-İE-FR133': { name: 'Yük Kaldırma Sepeti', code: 'KM-SEPET', period: 12 },
  'RC-M-İE-FR136': { name: 'Otomatik Döner Kapı', code: 'IM-DONERKAPI', period: 12 },

  // OYUN ALANI
  'RC-M-COA-FR02': { name: 'Havada Asılı Ağlar', code: 'OA-AGLAR', period: 12 },
  'RC-M-COA-FR03': { name: 'Kapalı Oyun Elemanları', code: 'OA-KAPALI', period: 12 },
  'RC-M-COA-FR08': { name: 'Kaydırak', code: 'OA-KAYDIRAK', period: 12 },
  'RC-M-COA-FR09': { name: 'Salıncak', code: 'OA-SALINCAK', period: 12 },
  'RC-M-COA-FR10': { name: 'Sallanma Ekipmanı', code: 'OA-SALLANMA', period: 12 },
  'RC-M-COA-FR14': { name: 'Atlıkarınca', code: 'OA-ATLI', period: 12 },
  'RC-M-COA-FR15': { name: 'Dış Mekan Egzersiz Aleti', code: 'OA-EGZERSIZ', period: 12 },
  'RC-M-COA-FR16': { name: 'Yapay Tırmanma Yapısı', code: 'OA-TIRMANMA', period: 12 },
};

async function main() {
  console.log('=== Equipment Type ↔ Form Template Mapping ===');
  const conn = await mysql.createConnection(DB);
  await conn.query('SET FOREIGN_KEY_CHECKS=0');

  // Mevcut tipleri yükle
  const [existingTypes] = await conn.query('SELECT id, code FROM equipment_types');
  const typeMap = new Map(existingTypes.map(t => [t.code, t.id]));

  let newTypes = 0, mapped = 0, unmapped = 0;

  for (const [tplCode, typeInfo] of Object.entries(TEMPLATE_TO_TYPE)) {
    // Ekipman tipi var mi?
    let typeId = typeMap.get(typeInfo.code);
    if (!typeId) {
      // Yeni ekipman tipi olustur
      typeId = crypto.randomUUID();
      await conn.query(
        'INSERT INTO equipment_types (id, code, name, defaultPeriodMonths, isActive, createdAt, updatedAt) VALUES (?, ?, ?, ?, 1, NOW(), NOW())',
        [typeId, typeInfo.code, typeInfo.name, typeInfo.period]
      );
      typeMap.set(typeInfo.code, typeId);
      newTypes++;
    }

    // Form sablonunu guncelle
    const [result] = await conn.query(
      'UPDATE form_templates SET equipmentTypeId = ? WHERE code = ?',
      [typeId, tplCode]
    );
    if (result.affectedRows > 0) mapped++;
    else unmapped++;
  }

  // Eslenemeyen sablonlari kontrol et
  const [unmappedTpls] = await conn.query("SELECT code, name FROM form_templates WHERE equipmentTypeId = '' OR equipmentTypeId IS NULL");

  await conn.query('SET FOREIGN_KEY_CHECKS=1');

  // Verify
  const [typeCount] = await conn.query('SELECT COUNT(*) as c FROM equipment_types');
  const [mappedCount] = await conn.query("SELECT COUNT(*) as c FROM form_templates WHERE equipmentTypeId != '' AND equipmentTypeId IS NOT NULL");

  console.log(`\n=== SONUC ===`);
  console.log(`Yeni ekipman tipi olusturuldu: ${newTypes}`);
  console.log(`Sablon eslendi: ${mapped}`);
  console.log(`Toplam ekipman tipi: ${typeCount[0].c}`);
  console.log(`Eslenmis sablon: ${mappedCount[0].c} / 88`);

  if (unmappedTpls.length > 0) {
    console.log(`\nEslenmemis sablonlar (${unmappedTpls.length}):`);
    unmappedTpls.forEach(t => console.log(`  ${t.code} — ${t.name}`));
  } else {
    console.log('\nTum sablonlar eslendi!');
  }

  await conn.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });

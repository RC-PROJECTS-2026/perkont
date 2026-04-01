/**
 * DEMO MÜŞTERİ + TÜM EKİPMANLAR + İŞ EMRİ + DENETİMLER
 * Her ekipman tipi için denetim oluşturur.
 */
const mysql = require('../../backend/node_modules/mysql2/promise');
const crypto = require('crypto');

const uuid = () => crypto.randomUUID();

async function main() {
  const conn = await mysql.createConnection({
    host: 'localhost', user: 'root', password: '', database: 'perkont_db', charset: 'utf8mb4',
  });

  const adminId = 'f10db0f6-2866-11f1-98df-c8d3ffeb7bb3';
  const inspectorId = '106e3044-ed64-46a4-8c71-6c9d0fc75d73'; // Aylin ERGÜL

  // ═══════════════════════════════════════════════════════════════════════
  // 1. MÜŞTERİ
  // ═══════════════════════════════════════════════════════════════════════
  const custId = uuid();
  await conn.query(`INSERT INTO customers (id, code, name, taxNumber, contactName, contactPhone, contactEmail, invoiceEmail, city, district, sector, createdById, isActive, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,NOW(),NOW())`,
    [custId, 'DEMO-TEST-001', 'DEMO SANAYİ VE TİCARET A.Ş.', '1234567890',
     'Mehmet YILMAZ', '0532 111 2233', 'mehmet@demosanayi.com', 'muhasebe@demosanayi.com',
     'İSTANBUL', 'KARTAL', 'Üretim / Sanayi', adminId]);
  console.log('Müşteri:', custId);

  // ═══════════════════════════════════════════════════════════════════════
  // 2. LOKASYONLAR
  // ═══════════════════════════════════════════════════════════════════════
  const loc1 = uuid();
  const loc2 = uuid();
  await conn.query(`INSERT INTO customer_locations (id, customerId, name, address, city, district, contactName, contactPhone, isActive, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,1,NOW(),NOW())`,
    [loc1, custId, 'Ana Fabrika', 'Organize Sanayi Bölgesi 3. Cadde No:15', 'İSTANBUL', 'KARTAL', 'Ali KAYA', '0533 444 5566']);
  await conn.query(`INSERT INTO customer_locations (id, customerId, name, address, city, district, contactName, contactPhone, isActive, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,1,NOW(),NOW())`,
    [loc2, custId, 'Depo / Lojistik Merkezi', 'Sanayi Mahallesi Lojistik Caddesi No:8', 'İSTANBUL', 'TUZLA', 'Veli DEMIR', '0535 777 8899']);
  console.log('Lokasyonlar:', loc1, loc2);

  // ═══════════════════════════════════════════════════════════════════════
  // 3. EKİPMANLAR (her tip için 1-2 adet)
  // ═══════════════════════════════════════════════════════════════════════
  const equipment = [
    // BKP - Basınçlı Kaplar
    { id: uuid(), code: 'DEMO-BKP-001', type: 'a533687f-4037-4568-bcd0-d23caadf9e3b', loc: loc1,
      brand: 'PAKKENS', model: 'ATM-500', serial: 'PKN-2021-44521', capacity: '500 Lt', desc: 'Atmosferik Depolama Tankı' },
    { id: uuid(), code: 'DEMO-BKP-002', type: 'a533687f-4037-4568-bcd0-d23caadf9e3b', loc: loc1,
      brand: 'MANNESMAN', model: 'HF-300', serial: 'MNS-2020-33210', capacity: '300 Lt', desc: 'Hidrofor Tankı' },

    // ELK - Elektrik Tesisatı
    { id: uuid(), code: 'DEMO-ELK-001', type: '8bfb5efd-1237-46ad-89ab-66098fdb2f8e', loc: loc1,
      brand: 'ABB', model: 'TRAFO-1000', serial: 'ABB-2019-78123', capacity: '1000 kVA', desc: 'Trafo / Topraklama Tesisatı' },
    { id: uuid(), code: 'DEMO-ELK-002', type: '8bfb5efd-1237-46ad-89ab-66098fdb2f8e', loc: loc2,
      brand: 'SCHNEIDER', model: 'SM6-24', serial: 'SCH-2022-55412', capacity: '24 kV', desc: 'YG Hücre / Topraklama' },

    // KIE - Kaldırma ve İletme
    { id: uuid(), code: 'DEMO-KIE-001', type: 'f6e8beec-ae78-48f9-97f8-82cc5a0e4c12', loc: loc1,
      brand: 'TOYOTA', model: '8FD30', serial: 'TYT-2020-11234', capacity: '3 Ton', desc: 'Forklift' },
    { id: uuid(), code: 'DEMO-KIE-002', type: 'f6e8beec-ae78-48f9-97f8-82cc5a0e4c12', loc: loc1,
      brand: 'ABUS', model: 'ELV-5T', serial: 'ABS-2018-67890', capacity: '5 Ton', desc: 'Gezer Köprülü Vinç' },
    { id: uuid(), code: 'DEMO-KIE-003', type: 'f6e8beec-ae78-48f9-97f8-82cc5a0e4c12', loc: loc2,
      brand: 'OTIS', model: 'Gen2-1600', serial: 'OTS-2021-99001', capacity: '1600 kg / 21 kişi', desc: 'Servis Asansörü' },

    // YGN - Yangın
    { id: uuid(), code: 'DEMO-YGN-001', type: '9897dabd-a064-44fd-966b-6028bfbcc30e', loc: loc1,
      brand: 'FIRE ALARM', model: 'FA-2000', serial: 'FA-2022-12345', capacity: '-', desc: 'Yangın Algılama ve Uyarı Sistemi' },
    { id: uuid(), code: 'DEMO-YGN-002', type: '9897dabd-a064-44fd-966b-6028bfbcc30e', loc: loc2,
      brand: 'KIDDE', model: 'KD-BASINCLANDIRMA', serial: 'KD-2021-54321', capacity: '-', desc: 'Kaçış Yolu Basınçlandırma Sistemi' },
  ];

  for (const eq of equipment) {
    await conn.query(`INSERT INTO equipment (id, customerId, locationId, equipmentTypeId, inventoryCode, brand, model, serialNumber, capacity, status, controlPeriodMonths, nextControlDate, installationLocation, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,NOW(),NOW())`,
      [eq.id, custId, eq.loc, eq.type, eq.code, eq.brand, eq.model, eq.serial, eq.capacity, 'active', 12, '2026-04-15', eq.desc]);
  }
  console.log('Ekipmanlar:', equipment.length, 'adet');

  // ═══════════════════════════════════════════════════════════════════════
  // 4. SÖZLEŞME
  // ═══════════════════════════════════════════════════════════════════════
  const contractId = uuid();
  await conn.query(`INSERT INTO contracts (id, contractNumber, customerId, status, startDate, endDate, totalValue, currency, createdById, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?,NOW(),NOW())`,
    [contractId, 'SOZ-2026-DEMO', custId, 'active', '2026-01-01', '2026-12-31', 85000, 'TRY', adminId]);
  console.log('Sözleşme:', contractId);

  // ═══════════════════════════════════════════════════════════════════════
  // 5. İŞ EMRİ
  // ═══════════════════════════════════════════════════════════════════════
  const woId = uuid();
  await conn.query(`INSERT INTO work_orders (id, workOrderNumber, customerId, locationId, contractId, status, plannedDate, assignedInspectorId, priority, createdById, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,NOW(),NOW())`,
    [woId, 'IE-2026-DEMO', custId, loc1, contractId, 'in_progress', '2026-04-02', inspectorId, 'normal', adminId]);
  console.log('İş Emri:', woId);

  // ═══════════════════════════════════════════════════════════════════════
  // 6. İŞ EMRİ EKİPMANLARI + DENETİMLER
  // ═══════════════════════════════════════════════════════════════════════
  // Ekipman → Form şablonu eşleştirme
  const templateMap = {
    'DEMO-BKP-001': '09b4cc36-f78f-4786-8601-2a406c88c4b3', // Atmosferik Depolama
    'DEMO-BKP-002': '131354fd-f89d-4f7b-ade0-0c08666ee40b', // Hidrofor
    'DEMO-ELK-001': '24bd7224-8218-464f-9a51-d3e2ba2e5203', // Trafo Topraklama
    'DEMO-ELK-002': '24bd7224-8218-464f-9a51-d3e2ba2e5203', // Trafo Topraklama
    'DEMO-KIE-001': 'a6fae2d6-ef82-4d09-9c0c-5ab4cbc36c36', // Forklift
    'DEMO-KIE-002': '3d497183-d285-42b0-ae55-474c682d6b9d', // Vinç
    'DEMO-KIE-003': '0bb9e8cc-d5c3-4ba6-8de7-89d36d2dcd09', // Asansör
    'DEMO-YGN-001': 'cdc2301d-380c-40e0-95c7-1a62b27fe619', // Yangın Algılama (Soğutma Ünitesi şablonu - YGN'ye bağlı)
    'DEMO-YGN-002': '69f89b11-8eb1-42d4-a635-e72c6ec6fc95', // Basınçlandırma
  };

  // Doğru YGN form bul
  const [yngTemplates] = await conn.query(`SELECT id, name FROM form_templates WHERE equipmentTypeId = '9897dabd-a064-44fd-966b-6028bfbcc30e' AND status = 'active' ORDER BY name`);
  if (yngTemplates.length > 0) {
    const algilama = yngTemplates.find(t => t.name.includes('Algılama') || t.name.includes('ALGILAMA'));
    if (algilama) templateMap['DEMO-YGN-001'] = algilama.id;
    const basinclandirma = yngTemplates.find(t => t.name.includes('BASINÇLANDIRMA') || t.name.includes('Basınçlandırma'));
    if (basinclandirma) templateMap['DEMO-YGN-002'] = basinclandirma.id;
  }

  let inspCount = 0;
  const inspIds = [];

  for (const eq of equipment) {
    const ftId = templateMap[eq.code];
    if (!ftId) { console.log('  SKIP:', eq.code, '(no template)'); continue; }

    // İş emri ekipmanı
    const woeId = uuid();
    await conn.query(`INSERT INTO work_order_equipment (id, workOrderId, equipmentId, formTemplateId, status, unitPrice, createdAt, updatedAt) VALUES (?,?,?,?,?,?,NOW(),NOW())`,
      [woeId, woId, eq.id, ftId, 'in_progress', 3500]);

    // Denetim oluştur (in_progress)
    const inspId = uuid();
    await conn.query(`INSERT INTO inspections (id, equipmentId, inspectorId, formTemplateId, formTemplateRevision, workOrderId, workOrderEquipmentId, status, startedAt, syncStatus, version, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,NOW(),?,?,NOW(),NOW())`,
      [inspId, eq.id, inspectorId, ftId, 'Rev.01', woId, woeId, 'in_progress', 'synced', 1]);

    // Firma bilgileri alanlarını otomatik doldur
    const [formFields] = await conn.query(`SELECT id, fieldKey, fieldType FROM form_fields WHERE templateId = ? ORDER BY orderIndex`, [ftId]);

    const autoFill = {
      unvan: 'DEMO SANAYİ VE TİCARET A.Ş.',
      firma_adi: 'DEMO SANAYİ VE TİCARET A.Ş.',
      adres: eq.loc === loc1 ? 'OSB 3. Cadde No:15 Kartal/İstanbul' : 'Sanayi Mah. Lojistik Cd. No:8 Tuzla/İstanbul',
      muayene_adres: eq.loc === loc1 ? 'OSB 3. Cadde No:15 Kartal/İstanbul' : 'Sanayi Mah. Lojistik Cd. No:8 Tuzla/İstanbul',
      telefon: '0532 111 2233',
      posta: 'mehmet@demosanayi.com',
      e_posta: 'mehmet@demosanayi.com',
      sgk: '34-123456-01',
      rapor_no: `RPR-2026-DEMO-${String(inspCount + 1).padStart(3, '0')}`,
      muayene_tarihi: '2026-04-02',
      rapor_tarihi: '2026-04-02',
      gelecek_muayene: '2027-04-02',
      baslama: '09:00',
      bitis: '12:00',
      marka: eq.brand,
      model: eq.model,
      seri: eq.serial,
      seri_no: eq.serial,
      hacim: eq.capacity,
      kapasite: eq.capacity,
      imal_tarihi: '2021',
      sozlesme: 'SOZ-2026-DEMO',
      ekipman_bulundugu: eq.desc,
      cihaz_no: eq.code,
    };

    let filled = 0;
    for (const f of formFields) {
      if (f.fieldType === 'section_header') continue;
      let val = null;
      for (const [k, v] of Object.entries(autoFill)) {
        if (f.fieldKey.includes(k)) { val = v; break; }
      }
      if (val) {
        await conn.query(`INSERT INTO inspection_field_values (id, inspectionId, fieldId, fieldKey, valueText, enteredById, enteredAt, createdAt, updatedAt) VALUES (?,?,?,?,?,?,NOW(),NOW(),NOW())`,
          [uuid(), inspId, f.id, f.fieldKey, val, inspectorId]);
        filled++;
      }
    }

    inspIds.push({ id: inspId, eq: eq.code, desc: eq.desc, fields: formFields.length, filled });
    inspCount++;
    console.log(`  Denetim: ${eq.code} (${eq.desc}) → ${filled}/${formFields.length} alan dolduruldu`);
  }

  console.log('\n═══════════════════════════════════════════════════');
  console.log('DEMO VERİ OLUŞTURMA TAMAMLANDI');
  console.log('═══════════════════════════════════════════════════');
  console.log(`Müşteri: DEMO SANAYİ VE TİCARET A.Ş. (${custId})`);
  console.log(`Lokasyonlar: Ana Fabrika + Depo/Lojistik`);
  console.log(`Ekipmanlar: ${equipment.length} adet`);
  console.log(`Sözleşme: SOZ-2026-DEMO`);
  console.log(`İş Emri: IE-2026-DEMO (${inspCount} ekipman)`);
  console.log(`Denetimler: ${inspCount} adet (tümü in_progress)`);
  console.log('');
  console.log('DENETİMLER:');
  inspIds.forEach((d, i) => {
    console.log(`  ${i + 1}. ${d.desc.padEnd(45)} → ${d.filled}/${d.fields} alan | ID: ${d.id}`);
  });
  console.log('');
  console.log('Denetçi: Aylin ERGÜL (aylin.ergul@perkont.com)');
  console.log('Tüm denetimler "Devam Ediyor" durumunda - form doldurulabilir.');

  await conn.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });

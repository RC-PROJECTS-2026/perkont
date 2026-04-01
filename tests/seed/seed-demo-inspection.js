const mysql = require('../../backend/node_modules/mysql2/promise');
const crypto = require('crypto');

async function main() {
  const conn = await mysql.createConnection({ host:'localhost', user:'root', password:'', database:'perkont_db', charset:'utf8mb4' });

  const adminId = 'f10db0f6-2866-11f1-98df-c8d3ffeb7bb3';
  const inspectorId = '106e3044-ed64-46a4-8c71-6c9d0fc75d73';
  const customerId = 'c968ca2d-7fc0-451c-8737-e5edbd3a29f2';
  const locationId = '01a04d06-fe78-429e-b535-9c6cc89d9d23';
  const eqHidrofor = '8099f60f-1d12-4bad-b23b-ff20e9b70798';
  const eqBoyler = '835ece0a-d466-47d8-9ad7-d1fd5a9ff96d';
  const eqYangin = '37609f5c-0a93-4b30-828e-5ca57f4b3d5e';
  const ftHidrofor = '131354fd-f89d-4f7b-ade0-0c08666ee40b';
  const ftBoyler = '2e94ff8c-39f3-447d-a498-731fa03ed0a2';

  // 1. Sozlesme
  const contractId = crypto.randomUUID();
  await conn.query(`INSERT INTO contracts (id,contractNumber,customerId,status,startDate,endDate,totalValue,currency,createdById,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,NOW(),NOW())`,
    [contractId,'SOZ-2026-0042',customerId,'active','2026-01-01','2026-12-31',28500,'TRY',adminId]);
  console.log('Sozlesme:', contractId);

  // 2. Is Emri
  const woId = crypto.randomUUID();
  await conn.query(`INSERT INTO work_orders (id,workOrderNumber,customerId,locationId,contractId,status,plannedDate,assignedInspectorId,priority,createdById,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,NOW(),NOW())`,
    [woId,'IE-2026-0088',customerId,locationId,contractId,'in_progress','2026-04-02',inspectorId,'normal',adminId]);
  console.log('Is Emri:', woId);

  // 3. Is Emri Ekipmanlari
  const woe1 = crypto.randomUUID(), woe2 = crypto.randomUUID(), woe3 = crypto.randomUUID();
  await conn.query(`INSERT INTO work_order_equipment (id,workOrderId,equipmentId,formTemplateId,status,unitPrice,createdAt,updatedAt) VALUES (?,?,?,?,?,?,NOW(),NOW())`, [woe1,woId,eqHidrofor,ftHidrofor,'in_progress',2850]);
  await conn.query(`INSERT INTO work_order_equipment (id,workOrderId,equipmentId,formTemplateId,status,unitPrice,createdAt,updatedAt) VALUES (?,?,?,?,?,?,NOW(),NOW())`, [woe2,woId,eqBoyler,ftBoyler,'completed',2850]);
  await conn.query(`INSERT INTO work_order_equipment (id,workOrderId,equipmentId,formTemplateId,status,unitPrice,createdAt,updatedAt) VALUES (?,?,?,?,?,?,NOW(),NOW())`, [woe3,woId,eqYangin,null,'pending',3200]);

  // 4. Denetim 1 - Hidrofor (devam eden)
  const insp1 = crypto.randomUUID();
  await conn.query(`INSERT INTO inspections (id,equipmentId,inspectorId,formTemplateId,formTemplateRevision,workOrderId,workOrderEquipmentId,status,startedAt,syncStatus,version,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,DATE_SUB(NOW(),INTERVAL 2 HOUR),?,?,NOW(),NOW())`,
    [insp1,eqHidrofor,inspectorId,ftHidrofor,'Rev.07',woId,woe1,'in_progress','synced',1]);
  console.log('Denetim 1 (devam eden):', insp1);

  // 5. Denetim 2 - Boyler (tamamlanmis)
  const insp2 = crypto.randomUUID();
  await conn.query(`INSERT INTO inspections (id,equipmentId,inspectorId,formTemplateId,formTemplateRevision,workOrderId,workOrderEquipmentId,status,startedAt,completedAt,submittedAt,overallResult,inspectorNotes,syncStatus,version,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,DATE_SUB(NOW(),INTERVAL 5 HOUR),DATE_SUB(NOW(),INTERVAL 3 HOUR),DATE_SUB(NOW(),INTERVAL 2 HOUR),?,?,?,?,NOW(),NOW())`,
    [insp2,eqBoyler,inspectorId,ftBoyler,'Rev.07',woId,woe2,'submitted','uygun','Ekipman genel durumu iyi. Tum kontrol noktalari uygun bulunmustur.','synced',2]);
  console.log('Denetim 2 (tamamlanmis):', insp2);

  // 6. Denetim alan degerleri - Hidrofor
  const [hFields] = await conn.query(`SELECT id, fieldKey, fieldType FROM form_fields WHERE templateId = ? AND fieldType != 'SECTION_HEADER' ORDER BY orderIndex LIMIT 25`, [ftHidrofor]);
  const hValues = {
    unvan: 'ASTER OTELCILIK A.S.',
    adres: 'Seyitnizam, Mevlana Cd. No:79 Zeytinburnu/Istanbul',
    telefon: '0212 555 1234',
    rapor_no: 'RPR-2026-0088-001',
    muayene_tarihi: '2026-04-01',
    rapor_tarihi: '2026-04-01',
    gelecek: '2027-04-01',
    marka: 'WILO',
    seri: 'WL-2022-88451',
    model: 'Helix V 2207',
    hacim: '500 Lt',
    basinc: '6 Bar',
    presostat: '6 Bar',
    kalibrasyon: '2025-11-15',
  };
  let hInserted = 0;
  for (const f of hFields) {
    let val = null;
    for (const [k, v] of Object.entries(hValues)) {
      if (f.fieldKey.includes(k)) { val = v; break; }
    }
    if (!val && f.fieldType === 'CHECK_ITEM') val = 'Uygun';
    if (val) {
      await conn.query(`INSERT INTO inspection_field_values (id,inspectionId,fieldId,fieldKey,valueText,enteredById,enteredAt,createdAt,updatedAt) VALUES (?,?,?,?,?,?,NOW(),NOW(),NOW())`,
        [crypto.randomUUID(), insp1, f.id, f.fieldKey, val, inspectorId]);
      hInserted++;
    }
  }
  console.log('Hidrofor alan degerleri:', hInserted);

  // 7. Denetim alan degerleri - Boyler
  const [bFields] = await conn.query(`SELECT id, fieldKey, fieldType FROM form_fields WHERE templateId = ? AND fieldType != 'SECTION_HEADER' ORDER BY orderIndex LIMIT 25`, [ftBoyler]);
  const bValues = {
    unvan: 'ASTER OTELCILIK A.S.',
    adres: 'Seyitnizam, Mevlana Cd. No:79 Zeytinburnu/Istanbul',
    rapor_no: 'RPR-2026-0088-002',
    muayene_tarihi: '2026-04-01',
    marka: 'BAYMAK',
    seri: 'BYM-2021-55123',
    model: 'Aqua Kon Plus 300',
    hacim: '300 Lt',
  };
  let bInserted = 0;
  for (const f of bFields) {
    let val = null;
    for (const [k, v] of Object.entries(bValues)) {
      if (f.fieldKey.includes(k)) { val = v; break; }
    }
    if (!val && f.fieldType === 'CHECK_ITEM') val = 'Uygun';
    if (val) {
      await conn.query(`INSERT INTO inspection_field_values (id,inspectionId,fieldId,fieldKey,valueText,enteredById,enteredAt,createdAt,updatedAt) VALUES (?,?,?,?,?,?,NOW(),NOW(),NOW())`,
        [crypto.randomUUID(), insp2, f.id, f.fieldKey, val, inspectorId]);
      bInserted++;
    }
  }
  console.log('Boyler alan degerleri:', bInserted);

  // 8. Uygunsuzluk (Hidrofor)
  await conn.query(`INSERT INTO inspection_nonconformities (id,inspectionId,description,severity,recommendation,resolved,createdAt,updatedAt) VALUES (?,?,?,?,?,?,NOW(),NOW())`,
    [crypto.randomUUID(), insp1, 'Manometre cam yuzeyinde cizik mevcut, okunabilirligi azalmis.', 'minor', 'Manometrenin degistirilmesi onerilir.', 0]);

  // 9. Ekipman tarihlerini guncelle
  await conn.query(`UPDATE equipment SET lastControlDate = CURDATE(), nextControlDate = DATE_ADD(CURDATE(), INTERVAL 12 MONTH) WHERE id = ?`, [eqHidrofor]);
  await conn.query(`UPDATE equipment SET lastControlDate = CURDATE(), nextControlDate = DATE_ADD(CURDATE(), INTERVAL 12 MONTH) WHERE id = ?`, [eqBoyler]);

  console.log('\n=== TAMAMLANDI ===');
  console.log('Musteri: ASTER OTELCILIK A.S. (Tryp by Wyndham Istanbul Topkapi)');
  console.log('Sozlesme: SOZ-2026-0042');
  console.log('Is Emri: IE-2026-0088 (3 ekipman)');
  console.log('  1. Hidrofor/Genlesme Tanki: denetim devam ediyor (1 uygunsuzluk)');
  console.log('  2. Boyler/Akumulasyon Tanki: denetim tamamlandi, onaya sunuldu');
  console.log('  3. Yangin Pompasi: henuz baslanmadi');
  console.log('Denetci: Aylin ERGUL (aylin.ergul@perkont.com)');

  await conn.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });

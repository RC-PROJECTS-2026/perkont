/**
 * PerKont Test Data Seed Generator
 *
 * Hedef:
 * - 10.000 musteri
 * - ~45.000 lokasyon
 * - 500.000 ekipman
 * - 100.000 is emri
 * - 200.000 denetim
 * - 200.000 rapor
 * - 50.000 teklif
 * - 20.000 sozlesme
 * - 500 kullanici
 * - 30.000 satis firsati
 *
 * Kullanim:
 *   npx ts-node tests/seed/seed-generator.ts
 *
 * Gerekli:
 *   npm install @faker-js/faker uuid
 */

import { DataSource } from 'typeorm';
import { faker } from '@faker-js/faker/locale/tr';
import { v4 as uuidv4 } from 'uuid';
import * as bcrypt from 'bcrypt';

// ============================================================
// CONFIGURATION
// ============================================================

const CONFIG = {
  CUSTOMERS: 10_000,
  EQUIPMENT_TOTAL: 500_000,
  WORK_ORDERS: 100_000,
  INSPECTIONS: 200_000,
  REPORTS: 200_000,
  PROPOSALS: 50_000,
  CONTRACTS: 20_000,
  USERS: 500,
  SALES_OPPORTUNITIES: 30_000,
  EQUIPMENT_TYPES: 50,
  BATCH_SIZE: 1000, // SQL INSERT batch size
};

const ROLES = {
  sales: 80,
  planner: 60,
  inspector: 150,
  technical_manager: 40,
  finance: 30,
  admin: 20,
  executive: 20,
  customer: 100,
};

const EQUIPMENT_TYPE_NAMES = [
  'Vinc', 'Forklift', 'Asansor', 'Yuk Asansoru', 'Platform',
  'Caraskal', 'Transpalet', 'Istif Makinesi', 'Bant Konveyor', 'Kompressor',
  'Kazan', 'Basincli Kap', 'Boru Hatti', 'Tank', 'Silo',
  'Jenerator', 'Trafo', 'Pano', 'Topraklama', 'Paratoner',
  'Yangin Sondurme', 'Sprinkler', 'Alarm Sistemi', 'Duman Dedektoru', 'LPG Tesisati',
  'Dogalgaz Tesisati', 'Klima Santrali', 'Chiller', 'Sogutucu', 'Isitici',
  'Boyler', 'Pompa', 'Vana', 'Regulator', 'Manometre',
  'Termometre', 'Debi Olcer', 'Seviye Olcer', 'Basinc Olcer', 'Tartim',
  'Ceraskal Mobil', 'Oto Lift', 'Kaynak Makinesi', 'Torna', 'Freze',
  'CNC', 'Pres', 'Makas', 'Bükme', 'Kesme',
];

const SECTORS = [
  'Uretim', 'Insaat', 'Enerji', 'Kimya', 'Gida',
  'Tekstil', 'Otomotiv', 'Lojistik', 'Saglik', 'Madencilik',
  'Perakende', 'Telekom', 'Tarim', 'Celik', 'Plastik',
];

const CITIES = [
  'Istanbul', 'Ankara', 'Izmir', 'Bursa', 'Antalya',
  'Adana', 'Konya', 'Gaziantep', 'Kocaeli', 'Mersin',
  'Kayseri', 'Eskisehir', 'Denizli', 'Sakarya', 'Manisa',
];

const WO_STATUSES = ['draft', 'planned', 'assigned', 'in_progress', 'completed', 'report_pending', 'report_approved', 'invoiced', 'cancelled'];
const WO_STATUS_WEIGHTS = [5, 10, 5, 15, 25, 10, 15, 12, 3]; // %

const INSPECTION_STATUSES = ['draft', 'in_progress', 'completed', 'submitted', 'under_review', 'revision_requested', 'approved', 'rejected'];
const INSPECTION_STATUS_WEIGHTS = [3, 8, 10, 5, 5, 3, 55, 11]; // %

const REPORT_STATUSES = ['draft', 'under_review', 'revision_requested', 'approved', 'under_signing', 'signed', 'delivered'];
const REPORT_STATUS_WEIGHTS = [3, 5, 2, 8, 3, 15, 64]; // %

const PROPOSAL_STATUSES = ['draft', 'sent', 'accepted', 'rejected', 'revision_requested', 'expired', 'cancelled'];
const PROPOSAL_STATUS_WEIGHTS = [10, 25, 30, 10, 10, 10, 5]; // %

const CONTRACT_STATUSES = ['draft', 'sent', 'signed', 'active', 'archived'];
const CONTRACT_STATUS_WEIGHTS = [10, 10, 15, 55, 10]; // %

// ============================================================
// HELPERS
// ============================================================

function weightedRandom<T>(items: T[], weights: number[]): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let rand = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    rand -= weights[i];
    if (rand <= 0) return items[i];
  }
  return items[items.length - 1];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDate(start: Date, end: Date): Date {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

/** Customer size distribution */
function getLocationCount(): number {
  const rand = Math.random();
  if (rand < 0.60) return randomInt(1, 2);   // %60 kucuk
  if (rand < 0.90) return randomInt(3, 10);   // %30 orta
  return randomInt(11, 20);                    // %10 buyuk
}

/** Equipment count per location - heavily skewed */
function getEquipmentCountForLocation(isLargeCustomer: boolean): number {
  if (isLargeCustomer) {
    const rand = Math.random();
    if (rand < 0.3) return randomInt(50, 200);
    if (rand < 0.7) return randomInt(10, 50);
    return randomInt(200, 500);
  }
  return randomInt(1, 30);
}

// ============================================================
// DATA SOURCE
// ============================================================

const dataSource = new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  username: process.env.DB_USERNAME || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_DATABASE || 'perkont_test',
  charset: 'utf8mb4',
  logging: false,
});

// ============================================================
// SEED FUNCTIONS
// ============================================================

async function seedUsers(qr: any): Promise<string[]> {
  console.log(`[SEED] Kullanici olusturuluyor: ${CONFIG.USERS}`);
  const passwordHash = await bcrypt.hash('Test1234!', 12);
  const companyId = uuidv4();
  const userIds: string[] = [];

  // Company
  await qr.query(`
    INSERT INTO companies (id, name, code, taxNumber, address, city, phone, email, isActive, createdAt, updatedAt)
    VALUES (?, 'PerKont Test A.S.', 'PERKONT', '1234567890', 'Test Adres', 'Istanbul', '02121234567', 'test@perkont.com', 1, NOW(), NOW())
  `, [companyId]);

  let roleIndex = 0;
  for (const [role, count] of Object.entries(ROLES)) {
    const users: any[] = [];
    for (let i = 0; i < count; i++) {
      const id = uuidv4();
      userIds.push(id);
      users.push([
        id,
        `${role}${roleIndex + i + 1}@perkont-test.com`,
        passwordHash,
        faker.person.firstName(),
        faker.person.lastName(),
        role,
        role, // roles (comma-separated)
        companyId,
        1, // isActive
        0, // failedLoginAttempts
        null, // lockedUntil
        0, // mfaEnabled
      ]);
    }
    roleIndex += count;

    for (const batch of chunk(users, CONFIG.BATCH_SIZE)) {
      const placeholders = batch.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(',');
      const values = batch.flat();
      await qr.query(`
        INSERT INTO users (id, email, password, firstName, lastName, role, roles, companyId, isActive, failedLoginAttempts, lockedUntil, mfaEnabled)
        VALUES ${placeholders}
      `, values);
    }
  }

  console.log(`[SEED] ${userIds.length} kullanici olusturuldu.`);
  return userIds;
}

async function seedEquipmentTypes(qr: any): Promise<string[]> {
  console.log(`[SEED] Ekipman tipleri olusturuluyor: ${CONFIG.EQUIPMENT_TYPES}`);
  const typeIds: string[] = [];

  const types = EQUIPMENT_TYPE_NAMES.map((name, i) => {
    const id = uuidv4();
    typeIds.push(id);
    return [
      id,
      `ET-${String(i + 1).padStart(3, '0')}`,
      name,
      `${name} periyodik kontrol`,
      randomInt(6, 24), // controlPeriodMonths
      1,
    ];
  });

  const placeholders = types.map(() => '(?, ?, ?, ?, ?, ?)').join(',');
  await qr.query(`
    INSERT INTO equipment_types (id, code, name, description, defaultControlPeriodMonths, isActive)
    VALUES ${placeholders}
  `, types.flat());

  console.log(`[SEED] ${typeIds.length} ekipman tipi olusturuldu.`);
  return typeIds;
}

async function seedCustomersAndLocations(qr: any, userIds: string[]): Promise<{ customerIds: string[], locationIds: string[], locationCustomerMap: Map<string, string> }> {
  console.log(`[SEED] Musteriler ve lokasyonlar olusturuluyor: ${CONFIG.CUSTOMERS}`);

  const customerIds: string[] = [];
  const locationIds: string[] = [];
  const locationCustomerMap = new Map<string, string>();
  const salesUserIds = userIds.slice(0, ROLES.sales); // First 80 are sales

  let totalLocations = 0;

  for (let batch = 0; batch < CONFIG.CUSTOMERS; batch += CONFIG.BATCH_SIZE) {
    const customerBatch: any[] = [];
    const locationBatch: any[] = [];
    const batchEnd = Math.min(batch + CONFIG.BATCH_SIZE, CONFIG.CUSTOMERS);

    for (let i = batch; i < batchEnd; i++) {
      const custId = uuidv4();
      customerIds.push(custId);
      const sector = SECTORS[randomInt(0, SECTORS.length - 1)];
      const city = CITIES[randomInt(0, CITIES.length - 1)];

      customerBatch.push([
        custId,
        `MUS-${String(i + 1).padStart(5, '0')}`,
        faker.company.name(),
        faker.string.numeric(10), // taxNumber
        faker.location.streetAddress(),
        city,
        faker.phone.number(),
        faker.internet.email(),
        sector,
        salesUserIds[i % salesUserIds.length], // salesRepId
        1,
      ]);

      // Lokasyonlar
      const locCount = getLocationCount();
      for (let j = 0; j < locCount; j++) {
        const locId = uuidv4();
        locationIds.push(locId);
        locationCustomerMap.set(locId, custId);
        totalLocations++;

        locationBatch.push([
          locId,
          custId,
          j === 0 ? 'Merkez' : `${CITIES[randomInt(0, CITIES.length - 1)]} Sube ${j}`,
          faker.location.streetAddress(),
          CITIES[randomInt(0, CITIES.length - 1)],
          faker.location.zipCode(),
          faker.person.fullName(),
          faker.phone.number(),
          faker.internet.email(),
          parseFloat((faker.location.latitude({ min: 36, max: 42 })).toFixed(6)),
          parseFloat((faker.location.longitude({ min: 26, max: 45 })).toFixed(6)),
          1,
        ]);
      }
    }

    // Insert customers
    if (customerBatch.length > 0) {
      const cp = customerBatch.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(',');
      await qr.query(`
        INSERT INTO customers (id, code, name, taxNumber, address, city, phone, email, sector, salesRepId, isActive)
        VALUES ${cp}
      `, customerBatch.flat());
    }

    // Insert locations in sub-batches
    for (const locBatch of chunk(locationBatch, CONFIG.BATCH_SIZE)) {
      const lp = locBatch.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(',');
      await qr.query(`
        INSERT INTO customer_locations (id, customerId, name, address, city, zipCode, contactPerson, contactPhone, contactEmail, latitude, longitude, isActive)
        VALUES ${lp}
      `, locBatch.flat());
    }

    if ((batch + CONFIG.BATCH_SIZE) % 5000 === 0 || batchEnd === CONFIG.CUSTOMERS) {
      console.log(`  [SEED] Musteriler: ${batchEnd}/${CONFIG.CUSTOMERS}, Lokasyonlar: ${totalLocations}`);
    }
  }

  console.log(`[SEED] ${customerIds.length} musteri, ${locationIds.length} lokasyon olusturuldu.`);
  return { customerIds, locationIds, locationCustomerMap };
}

async function seedEquipment(
  qr: any,
  locationIds: string[],
  locationCustomerMap: Map<string, string>,
  typeIds: string[],
): Promise<string[]> {
  console.log(`[SEED] Ekipmanlar olusturuluyor: ${CONFIG.EQUIPMENT_TOTAL}`);

  const equipmentIds: string[] = [];
  let created = 0;

  // Distribute equipment across locations
  // Large locations get more equipment
  const equipmentPerLocation: { locId: string; custId: string; count: number }[] = [];
  let totalPlanned = 0;

  for (const locId of locationIds) {
    const custId = locationCustomerMap.get(locId)!;
    // Rough distribution
    const isLarge = Math.random() < 0.1;
    const count = getEquipmentCountForLocation(isLarge);
    equipmentPerLocation.push({ locId, custId, count });
    totalPlanned += count;
  }

  // Scale to match target
  const scaleFactor = CONFIG.EQUIPMENT_TOTAL / totalPlanned;

  for (const loc of equipmentPerLocation) {
    const adjustedCount = Math.max(1, Math.round(loc.count * scaleFactor));
    const batch: any[] = [];

    for (let i = 0; i < adjustedCount && created < CONFIG.EQUIPMENT_TOTAL; i++) {
      const id = uuidv4();
      equipmentIds.push(id);
      created++;

      const typeId = typeIds[randomInt(0, typeIds.length - 1)];
      const firstUseDate = randomDate(new Date('2018-01-01'), new Date('2024-06-01'));
      const controlPeriod = randomInt(6, 24);
      const lastControlDate = randomDate(firstUseDate, new Date('2025-12-01'));
      const nextControlDate = new Date(lastControlDate);
      nextControlDate.setMonth(nextControlDate.getMonth() + controlPeriod);

      batch.push([
        id,
        `EQ-${String(created).padStart(7, '0')}`,
        EQUIPMENT_TYPE_NAMES[randomInt(0, EQUIPMENT_TYPE_NAMES.length - 1)],
        loc.custId,
        loc.locId,
        typeId,
        faker.string.alphanumeric(12).toUpperCase(), // serialNumber
        faker.company.name(), // manufacturer
        randomInt(2010, 2024).toString(), // modelYear
        controlPeriod,
        firstUseDate.toISOString().slice(0, 10),
        lastControlDate.toISOString().slice(0, 10),
        nextControlDate.toISOString().slice(0, 10),
        1,
      ]);

      if (batch.length >= CONFIG.BATCH_SIZE) {
        const p = batch.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(',');
        await qr.query(`
          INSERT INTO equipment (id, inventoryCode, name, customerId, locationId, equipmentTypeId, serialNumber, manufacturer, modelYear, controlPeriodMonths, firstUseDate, lastControlDate, nextControlDate, isActive)
          VALUES ${p}
        `, batch.flat());
        batch.length = 0;
      }
    }

    // Flush remaining
    if (batch.length > 0) {
      const p = batch.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(',');
      await qr.query(`
        INSERT INTO equipment (id, inventoryCode, name, customerId, locationId, equipmentTypeId, serialNumber, manufacturer, modelYear, controlPeriodMonths, firstUseDate, lastControlDate, nextControlDate, isActive)
        VALUES ${p}
      `, batch.flat());
    }

    if (created % 50000 === 0) {
      console.log(`  [SEED] Ekipmanlar: ${created}/${CONFIG.EQUIPMENT_TOTAL}`);
    }
  }

  console.log(`[SEED] ${created} ekipman olusturuldu.`);
  return equipmentIds;
}

async function seedWorkOrders(
  qr: any,
  customerIds: string[],
  equipmentIds: string[],
  userIds: string[],
): Promise<string[]> {
  console.log(`[SEED] Is emirleri olusturuluyor: ${CONFIG.WORK_ORDERS}`);
  const woIds: string[] = [];
  const inspectorIds = userIds.slice(ROLES.sales + ROLES.planner, ROLES.sales + ROLES.planner + ROLES.inspector);
  const plannerIds = userIds.slice(ROLES.sales, ROLES.sales + ROLES.planner);

  const batch: any[] = [];

  for (let i = 0; i < CONFIG.WORK_ORDERS; i++) {
    const id = uuidv4();
    woIds.push(id);
    const status = weightedRandom(WO_STATUSES, WO_STATUS_WEIGHTS);
    const customerId = customerIds[randomInt(0, customerIds.length - 1)];
    const inspectorId = inspectorIds[randomInt(0, inspectorIds.length - 1)];
    const plannerId = plannerIds[randomInt(0, plannerIds.length - 1)];
    const plannedDate = randomDate(new Date('2024-01-01'), new Date('2026-06-01'));
    const priority = weightedRandom(['normal', 'urgent', 'critical'], [70, 20, 10]);
    const noContractRisk = Math.random() < 0.15;

    batch.push([
      id,
      `IS-${new Date().getFullYear()}-${String(i + 1).padStart(5, '0')}`,
      customerId,
      inspectorId,
      plannerId,
      status,
      priority,
      plannedDate.toISOString().slice(0, 10),
      noContractRisk ? 1 : 0,
      faker.lorem.sentence(),
    ]);

    if (batch.length >= CONFIG.BATCH_SIZE) {
      const p = batch.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(',');
      await qr.query(`
        INSERT INTO work_orders (id, orderNumber, customerId, inspectorId, createdById, status, priority, plannedDate, noContractRisk, notes)
        VALUES ${p}
      `, batch.flat());
      batch.length = 0;
    }

    if ((i + 1) % 20000 === 0) {
      console.log(`  [SEED] Is emirleri: ${i + 1}/${CONFIG.WORK_ORDERS}`);
    }
  }

  if (batch.length > 0) {
    const p = batch.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(',');
    await qr.query(`
      INSERT INTO work_orders (id, orderNumber, customerId, inspectorId, createdById, status, priority, plannedDate, noContractRisk, notes)
      VALUES ${p}
    `, batch.flat());
  }

  console.log(`[SEED] ${woIds.length} is emri olusturuldu.`);
  return woIds;
}

async function seedInspections(
  qr: any,
  woIds: string[],
  equipmentIds: string[],
  userIds: string[],
): Promise<string[]> {
  console.log(`[SEED] Denetimler olusturuluyor: ${CONFIG.INSPECTIONS}`);
  const inspectionIds: string[] = [];
  const inspectorIds = userIds.slice(ROLES.sales + ROLES.planner, ROLES.sales + ROLES.planner + ROLES.inspector);
  const batch: any[] = [];

  for (let i = 0; i < CONFIG.INSPECTIONS; i++) {
    const id = uuidv4();
    inspectionIds.push(id);
    const status = weightedRandom(INSPECTION_STATUSES, INSPECTION_STATUS_WEIGHTS);
    const result = weightedRandom(['uygun', 'uygunsuz', 'kismi_uygun', 'uygulanamaz'], [60, 15, 20, 5]);
    const woId = woIds[randomInt(0, woIds.length - 1)];
    const equipId = equipmentIds[randomInt(0, equipmentIds.length - 1)];
    const inspectorId = inspectorIds[randomInt(0, inspectorIds.length - 1)];
    const inspectionDate = randomDate(new Date('2024-01-01'), new Date('2026-03-01'));

    batch.push([
      id,
      woId,
      equipId,
      inspectorId,
      status,
      result,
      JSON.stringify([{ fieldKey: 'genel_durum', value: 'Kontrol edildi' }]),
      inspectionDate.toISOString().slice(0, 19).replace('T', ' '),
      'synced',
    ]);

    if (batch.length >= CONFIG.BATCH_SIZE) {
      const p = batch.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?)').join(',');
      await qr.query(`
        INSERT INTO inspections (id, workOrderId, equipmentId, inspectorId, status, overallResult, fieldValues, inspectionDate, syncStatus)
        VALUES ${p}
      `, batch.flat());
      batch.length = 0;
    }

    if ((i + 1) % 50000 === 0) {
      console.log(`  [SEED] Denetimler: ${i + 1}/${CONFIG.INSPECTIONS}`);
    }
  }

  if (batch.length > 0) {
    const p = batch.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?)').join(',');
    await qr.query(`
      INSERT INTO inspections (id, workOrderId, equipmentId, inspectorId, status, overallResult, fieldValues, inspectionDate, syncStatus)
      VALUES ${p}
    `, batch.flat());
  }

  console.log(`[SEED] ${inspectionIds.length} denetim olusturuldu.`);
  return inspectionIds;
}

async function seedReports(qr: any, inspectionIds: string[], userIds: string[]): Promise<void> {
  console.log(`[SEED] Raporlar olusturuluyor: ${CONFIG.REPORTS}`);
  const batch: any[] = [];

  for (let i = 0; i < CONFIG.REPORTS; i++) {
    const id = uuidv4();
    const status = weightedRandom(REPORT_STATUSES, REPORT_STATUS_WEIGHTS);
    const inspectionId = inspectionIds[randomInt(0, inspectionIds.length - 1)];
    const createdDate = randomDate(new Date('2024-01-01'), new Date('2026-03-01'));

    batch.push([
      id,
      `R-${new Date().getFullYear()}-${String(i + 1).padStart(6, '0')}`,
      inspectionId,
      status,
      status === 'delivered' ? createdDate.toISOString().slice(0, 19).replace('T', ' ') : null,
      faker.string.hexadecimal({ length: 64, prefix: '' }),
      1,
    ]);

    if (batch.length >= CONFIG.BATCH_SIZE) {
      const p = batch.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(',');
      await qr.query(`
        INSERT INTO reports (id, reportNumber, inspectionId, status, deliveredAt, documentHash, version)
        VALUES ${p}
      `, batch.flat());
      batch.length = 0;
    }

    if ((i + 1) % 50000 === 0) {
      console.log(`  [SEED] Raporlar: ${i + 1}/${CONFIG.REPORTS}`);
    }
  }

  if (batch.length > 0) {
    const p = batch.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(',');
    await qr.query(`
      INSERT INTO reports (id, reportNumber, inspectionId, status, deliveredAt, documentHash, version)
      VALUES ${p}
    `, batch.flat());
  }

  console.log(`[SEED] ${CONFIG.REPORTS} rapor olusturuldu.`);
}

async function seedProposals(qr: any, customerIds: string[], userIds: string[]): Promise<void> {
  console.log(`[SEED] Teklifler olusturuluyor: ${CONFIG.PROPOSALS}`);
  const salesIds = userIds.slice(0, ROLES.sales);
  const batch: any[] = [];

  for (let i = 0; i < CONFIG.PROPOSALS; i++) {
    const id = uuidv4();
    const status = weightedRandom(PROPOSAL_STATUSES, PROPOSAL_STATUS_WEIGHTS);
    const customerId = customerIds[randomInt(0, customerIds.length - 1)];
    const createdDate = randomDate(new Date('2024-01-01'), new Date('2026-03-01'));
    const validUntil = new Date(createdDate);
    validUntil.setDate(validUntil.getDate() + 30);
    const subtotal = randomInt(1000, 500000);
    const kdvRate = 20;
    const kdvAmount = Math.round(subtotal * kdvRate / 100);
    const total = subtotal + kdvAmount;

    batch.push([
      id,
      `TEK-${new Date().getFullYear()}-${String(i + 1).padStart(5, '0')}`,
      customerId,
      salesIds[randomInt(0, salesIds.length - 1)],
      status,
      subtotal,
      0, // discountAmount
      kdvRate,
      kdvAmount,
      total,
      'TRY',
      validUntil.toISOString().slice(0, 10),
      1, // revision
    ]);

    if (batch.length >= CONFIG.BATCH_SIZE) {
      const p = batch.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(',');
      await qr.query(`
        INSERT INTO proposals (id, proposalNumber, customerId, createdById, status, subtotal, discountAmount, kdvRate, kdvAmount, grandTotal, currency, validUntil, revision)
        VALUES ${p}
      `, batch.flat());
      batch.length = 0;
    }

    if ((i + 1) % 10000 === 0) {
      console.log(`  [SEED] Teklifler: ${i + 1}/${CONFIG.PROPOSALS}`);
    }
  }

  if (batch.length > 0) {
    const p = batch.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(',');
    await qr.query(`
      INSERT INTO proposals (id, proposalNumber, customerId, createdById, status, subtotal, discountAmount, kdvRate, kdvAmount, grandTotal, currency, validUntil, revision)
      VALUES ${p}
    `, batch.flat());
  }

  console.log(`[SEED] ${CONFIG.PROPOSALS} teklif olusturuldu.`);
}

async function seedContracts(qr: any, customerIds: string[]): Promise<void> {
  console.log(`[SEED] Sozlesmeler olusturuluyor: ${CONFIG.CONTRACTS}`);
  const batch: any[] = [];

  for (let i = 0; i < CONFIG.CONTRACTS; i++) {
    const id = uuidv4();
    const status = weightedRandom(CONTRACT_STATUSES, CONTRACT_STATUS_WEIGHTS);
    const customerId = customerIds[randomInt(0, customerIds.length - 1)];
    const startDate = randomDate(new Date('2024-01-01'), new Date('2026-01-01'));
    const endDate = new Date(startDate);
    endDate.setFullYear(endDate.getFullYear() + 1);

    batch.push([
      id,
      `SOZ-${new Date().getFullYear()}-${String(i + 1).padStart(5, '0')}`,
      customerId,
      status,
      startDate.toISOString().slice(0, 10),
      endDate.toISOString().slice(0, 10),
      randomInt(10000, 1000000),
      'TRY',
    ]);

    if (batch.length >= CONFIG.BATCH_SIZE) {
      const p = batch.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(',');
      await qr.query(`
        INSERT INTO contracts (id, contractNumber, customerId, status, startDate, endDate, totalAmount, currency)
        VALUES ${p}
      `, batch.flat());
      batch.length = 0;
    }
  }

  if (batch.length > 0) {
    const p = batch.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(',');
    await qr.query(`
      INSERT INTO contracts (id, contractNumber, customerId, status, startDate, endDate, totalAmount, currency)
      VALUES ${p}
    `, batch.flat());
  }

  console.log(`[SEED] ${CONFIG.CONTRACTS} sozlesme olusturuldu.`);
}

async function seedSalesOpportunities(qr: any, customerIds: string[], userIds: string[]): Promise<void> {
  console.log(`[SEED] Satis firsatlari olusturuluyor: ${CONFIG.SALES_OPPORTUNITIES}`);
  const salesIds = userIds.slice(0, ROLES.sales);
  const statuses = ['new', 'contacted', 'proposal_sent', 'negotiation', 'won', 'lost'];
  const statusWeights = [15, 15, 15, 15, 30, 10];
  const batch: any[] = [];

  for (let i = 0; i < CONFIG.SALES_OPPORTUNITIES; i++) {
    const id = uuidv4();
    const status = weightedRandom(statuses, statusWeights);
    const probability = status === 'won' ? 100 : status === 'lost' ? 0 : randomInt(10, 90);

    batch.push([
      id,
      faker.lorem.words(3),
      customerIds[randomInt(0, customerIds.length - 1)],
      salesIds[randomInt(0, salesIds.length - 1)],
      status,
      probability,
      randomInt(5000, 500000),
    ]);

    if (batch.length >= CONFIG.BATCH_SIZE) {
      const p = batch.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(',');
      await qr.query(`
        INSERT INTO sales_opportunities (id, title, customerId, ownerId, status, probability, estimatedValue)
        VALUES ${p}
      `, batch.flat());
      batch.length = 0;
    }
  }

  if (batch.length > 0) {
    const p = batch.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(',');
    await qr.query(`
      INSERT INTO sales_opportunities (id, title, customerId, ownerId, status, probability, estimatedValue)
      VALUES ${p}
    `, batch.flat());
  }

  console.log(`[SEED] ${CONFIG.SALES_OPPORTUNITIES} satis firsati olusturuldu.`);
}

async function seedAuditLogs(qr: any, userIds: string[]): Promise<void> {
  console.log(`[SEED] Audit loglar olusturuluyor: ~100.000 (sampling)`);
  const actions = [
    'USER_LOGIN', 'USER_LOGOUT', 'CUSTOMER_CREATED', 'CUSTOMER_UPDATED',
    'EQUIPMENT_CREATED', 'WORK_ORDER_CREATED', 'WORK_ORDER_STATUS_CHANGED',
    'INSPECTION_CREATED', 'INSPECTION_COMPLETED', 'INSPECTION_APPROVED',
    'REPORT_GENERATED', 'REPORT_APPROVED', 'REPORT_SIGNED', 'REPORT_DELIVERED',
    'PROPOSAL_CREATED', 'PROPOSAL_SENT', 'PROPOSAL_ACCEPTED',
    'CONTRACT_SIGNED', 'CONTRACT_ACTIVATED',
  ];
  const batch: any[] = [];

  for (let i = 0; i < 100_000; i++) {
    const id = uuidv4();
    batch.push([
      id,
      actions[randomInt(0, actions.length - 1)],
      'work_order', // entityType
      uuidv4(), // entityId
      userIds[randomInt(0, userIds.length - 1)],
      '192.168.1.' + randomInt(1, 254),
      randomDate(new Date('2024-01-01'), new Date('2026-03-01')).toISOString().slice(0, 19).replace('T', ' '),
    ]);

    if (batch.length >= CONFIG.BATCH_SIZE) {
      const p = batch.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(',');
      await qr.query(`
        INSERT INTO audit_logs (id, action, entityType, entityId, userId, ipAddress, createdAt)
        VALUES ${p}
      `, batch.flat());
      batch.length = 0;
    }
  }

  if (batch.length > 0) {
    const p = batch.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(',');
    await qr.query(`
      INSERT INTO audit_logs (id, action, entityType, entityId, userId, ipAddress, createdAt)
      VALUES ${p}
    `, batch.flat());
  }

  console.log(`[SEED] 100.000 audit log olusturuldu.`);
}

// ============================================================
// ADD INDEXES FOR PERFORMANCE
// ============================================================

async function addPerformanceIndexes(qr: any): Promise<void> {
  console.log(`[SEED] Performans indexleri ekleniyor...`);

  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_customers_code ON customers(code)',
    'CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name)',
    'CREATE INDEX IF NOT EXISTS idx_customers_companyId ON customers(companyId)',
    'CREATE INDEX IF NOT EXISTS idx_equipment_customerId ON equipment(customerId)',
    'CREATE INDEX IF NOT EXISTS idx_equipment_locationId ON equipment(locationId)',
    'CREATE INDEX IF NOT EXISTS idx_equipment_nextControlDate ON equipment(nextControlDate)',
    'CREATE INDEX IF NOT EXISTS idx_equipment_inventoryCode ON equipment(inventoryCode)',
    'CREATE INDEX IF NOT EXISTS idx_equipment_typeId ON equipment(equipmentTypeId)',
    'CREATE INDEX IF NOT EXISTS idx_work_orders_customerId ON work_orders(customerId)',
    'CREATE INDEX IF NOT EXISTS idx_work_orders_inspectorId ON work_orders(inspectorId)',
    'CREATE INDEX IF NOT EXISTS idx_work_orders_status ON work_orders(status)',
    'CREATE INDEX IF NOT EXISTS idx_work_orders_plannedDate ON work_orders(plannedDate)',
    'CREATE INDEX IF NOT EXISTS idx_inspections_workOrderId ON inspections(workOrderId)',
    'CREATE INDEX IF NOT EXISTS idx_inspections_equipmentId ON inspections(equipmentId)',
    'CREATE INDEX IF NOT EXISTS idx_inspections_inspectorId ON inspections(inspectorId)',
    'CREATE INDEX IF NOT EXISTS idx_inspections_status ON inspections(status)',
    'CREATE INDEX IF NOT EXISTS idx_reports_inspectionId ON reports(inspectionId)',
    'CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status)',
    'CREATE INDEX IF NOT EXISTS idx_proposals_customerId ON proposals(customerId)',
    'CREATE INDEX IF NOT EXISTS idx_proposals_status ON proposals(status)',
    'CREATE INDEX IF NOT EXISTS idx_contracts_customerId ON contracts(customerId)',
    'CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status)',
    'CREATE INDEX IF NOT EXISTS idx_audit_logs_userId ON audit_logs(userId)',
    'CREATE INDEX IF NOT EXISTS idx_audit_logs_entityType_entityId ON audit_logs(entityType, entityId)',
    'CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action)',
    'CREATE INDEX IF NOT EXISTS idx_audit_logs_createdAt ON audit_logs(createdAt)',
    'CREATE INDEX IF NOT EXISTS idx_sales_opp_customerId ON sales_opportunities(customerId)',
    'CREATE INDEX IF NOT EXISTS idx_sales_opp_status ON sales_opportunities(status)',
    'CREATE INDEX IF NOT EXISTS idx_locations_customerId ON customer_locations(customerId)',
  ];

  for (const idx of indexes) {
    try {
      await qr.query(idx);
    } catch (e: any) {
      // Index already exists or table structure different - skip
      if (!e.message.includes('Duplicate')) {
        console.warn(`  [WARN] Index skip: ${e.message.slice(0, 80)}`);
      }
    }
  }

  console.log(`[SEED] ${indexes.length} index kontrol edildi.`);
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log('='.repeat(60));
  console.log('PerKont Test Data Seed Generator');
  console.log('='.repeat(60));
  console.log(`Hedef: ${CONFIG.CUSTOMERS} musteri, ${CONFIG.EQUIPMENT_TOTAL} ekipman`);
  console.log();

  await dataSource.initialize();
  console.log('[DB] Baglanti kuruldu.');

  const qr = dataSource.createQueryRunner();
  await qr.connect();

  try {
    console.log('[SEED] Mevcut test verisi temizleniyor...');
    // Truncate in reverse dependency order
    const tables = [
      'audit_logs', 'reports', 'inspections', 'work_order_equipment',
      'work_orders', 'sales_opportunities', 'proposals', 'proposal_items',
      'contracts', 'equipment', 'customer_locations', 'customers',
      'equipment_types', 'users', 'companies',
    ];
    for (const t of tables) {
      try {
        await qr.query(`SET FOREIGN_KEY_CHECKS = 0`);
        await qr.query(`TRUNCATE TABLE ${t}`);
        await qr.query(`SET FOREIGN_KEY_CHECKS = 1`);
      } catch (e: any) {
        console.warn(`  [WARN] Table ${t}: ${e.message.slice(0, 60)}`);
      }
    }

    const startTime = Date.now();

    // Phase 1: Base data
    const userIds = await seedUsers(qr);
    const typeIds = await seedEquipmentTypes(qr);

    // Phase 2: Customers & Locations
    const { customerIds, locationIds, locationCustomerMap } = await seedCustomersAndLocations(qr, userIds);

    // Phase 3: Equipment (biggest table)
    const equipmentIds = await seedEquipment(qr, locationIds, locationCustomerMap, typeIds);

    // Phase 4: Operations
    const woIds = await seedWorkOrders(qr, customerIds, equipmentIds, userIds);
    const inspectionIds = await seedInspections(qr, woIds, equipmentIds, userIds);
    await seedReports(qr, inspectionIds, userIds);

    // Phase 5: Sales
    await seedProposals(qr, customerIds, userIds);
    await seedContracts(qr, customerIds);
    await seedSalesOpportunities(qr, customerIds, userIds);

    // Phase 6: Audit
    await seedAuditLogs(qr, userIds);

    // Phase 7: Indexes
    await addPerformanceIndexes(qr);

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log();
    console.log('='.repeat(60));
    console.log(`SEED TAMAMLANDI - ${duration} saniye`);
    console.log('='.repeat(60));
    console.log(`Musteriler:      ${customerIds.length}`);
    console.log(`Lokasyonlar:     ${locationIds.length}`);
    console.log(`Ekipmanlar:      ${equipmentIds.length}`);
    console.log(`Is Emirleri:     ${woIds.length}`);
    console.log(`Denetimler:      ${inspectionIds.length}`);
    console.log(`Raporlar:        ${CONFIG.REPORTS}`);
    console.log(`Teklifler:       ${CONFIG.PROPOSALS}`);
    console.log(`Sozlesmeler:     ${CONFIG.CONTRACTS}`);
    console.log(`Kullanicilar:    ${userIds.length}`);
    console.log(`Audit Loglar:    100.000`);
    console.log();
    console.log('Test login bilgileri:');
    console.log('  Admin:    admin1@perkont-test.com / Test1234!');
    console.log('  Sales:    sales1@perkont-test.com / Test1234!');
    console.log('  Inspector: inspector1@perkont-test.com / Test1234!');

  } catch (error) {
    console.error('[SEED] HATA:', error);
    throw error;
  } finally {
    await qr.release();
    await dataSource.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

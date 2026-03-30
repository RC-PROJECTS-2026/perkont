/**
 * Quick Staging Seed — bypasses TypeORM, uses raw mysql2 for speed.
 * Run: cd backend && npx ts-node ../tests/seed/quick-seed.ts
 */
import * as mysql from 'mysql2/promise';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

const DB = {
  host: 'localhost',
  port: 3306,
  user: 'root',
  password: '',
  database: process.env.DB_DATABASE || 'perkont_staging',
  charset: 'utf8mb4',
};

const BATCH = 500;

function uuid() { return uuidv4(); }
function rand(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick<T>(arr: T[]): T { return arr[rand(0, arr.length - 1)]; }

const CITIES = ['Istanbul','Ankara','Izmir','Bursa','Antalya','Kocaeli','Konya','Gaziantep','Mersin','Adana','Kayseri','Denizli','Eskisehir','Sakarya','Manisa'];
const SECTORS = ['Uretim','Insaat','Enerji','Kimya','Gida','Tekstil','Otomotiv','Lojistik','Saglik','Madencilik'];
const EQ_TYPES = ['Vinc','Forklift','Asansor','Yuk Asansoru','Platform','Caraskal','Transpalet','Kompressor','Kazan','Basincli Kap','Jenerator','Trafo','Pano','Yangın Sondurme','LPG Tesisati','Klima','Pompa','CNC','Pres','Kaynak Makinesi'];
const ROLES = { admin: 20, sales: 80, planner: 60, inspector: 150, technical_manager: 40, finance: 30, executive: 20, customer: 100 };

async function main() {
  console.log('=== PerKont Quick Staging Seed ===');
  console.log(`DB: ${DB.database}`);
  const conn = await mysql.createConnection(DB);
  await conn.query('SET FOREIGN_KEY_CHECKS=0');
  const start = Date.now();

  // --- Company ---
  const companyId = uuid();
  const companyId2 = uuid(); // Second company for tenant isolation test
  await conn.query('DELETE FROM companies');
  await conn.query('INSERT INTO companies (id, name, code, taxNumber, address, city, phone, email, isActive, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,1,NOW(),NOW())', [companyId, 'PerKont Test A.S.', 'PERKONT', '1234567890', 'Test Cad. No:1', 'Istanbul', '02121234567', 'info@perkont-test.com']);
  await conn.query('INSERT INTO companies (id, name, code, taxNumber, address, city, phone, email, isActive, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,1,NOW(),NOW())', [companyId2, 'Diger Firma Ltd.', 'DIGER', '9876543210', 'Baska Cad. No:2', 'Ankara', '03121234567', 'info@diger-test.com']);
  console.log(`Companies: 2`);

  // --- Users ---
  const pwHash = '$2b$12$LJ3m5ZQh3xZPYVPWiR1iOOvTFqVqAyF9YvWz7xEqeRH4oLxYhS3C'; // Test1234!
  await conn.query('DELETE FROM users');
  const userIds: string[] = [];
  const userIds2: string[] = [];
  let ucount = 0;
  for (const [role, count] of Object.entries(ROLES)) {
    const batch: any[][] = [];
    for (let i = 0; i < count; i++) {
      const id = uuid();
      // First 80% go to company1, rest to company2
      const cid = i < Math.ceil(count * 0.8) ? companyId : companyId2;
      if (cid === companyId) userIds.push(id); else userIds2.push(id);
      batch.push([id, `${role}${ucount + i + 1}@perkont-test.com`, `Test ${role} ${i+1}`, pwHash, role, cid, 1, 0]);
    }
    ucount += count;
    for (let j = 0; j < batch.length; j += BATCH) {
      const slice = batch.slice(j, j + BATCH);
      const ph = slice.map(() => '(?,?,?,?,?,?,?,?)').join(',');
      await conn.query(`INSERT INTO users (id, email, fullName, passwordHash, roles, companyId, isActive, mfaEnabled) VALUES ${ph}`, slice.flat());
    }
  }
  console.log(`Users: ${ucount} (Company1: ${userIds.length}, Company2: ${userIds2.length})`);

  // --- Equipment Types ---
  await conn.query('DELETE FROM equipment_types');
  const eqTypeIds: string[] = [];
  for (let i = 0; i < EQ_TYPES.length; i++) {
    const id = uuid();
    eqTypeIds.push(id);
    await conn.query('INSERT INTO equipment_types (id, code, name, description, defaultControlPeriodMonths, isActive, createdAt, updatedAt) VALUES (?,?,?,?,?,1,NOW(),NOW())', [id, `ET-${String(i+1).padStart(3,'0')}`, EQ_TYPES[i], `${EQ_TYPES[i]} kontrolu`, rand(6,24)]);
  }
  console.log(`Equipment types: ${eqTypeIds.length}`);

  // --- Customers (10,000) + Locations ---
  await conn.query('DELETE FROM customer_locations');
  await conn.query('DELETE FROM customers');
  const custIds: string[] = [];
  const custIds2: string[] = [];
  const locIds: string[] = [];
  const locCustMap: Record<string, string> = {};
  let totalLocs = 0;

  for (let batch = 0; batch < 10000; batch += BATCH) {
    const cRows: any[][] = [];
    const lRows: any[][] = [];
    const end = Math.min(batch + BATCH, 10000);

    for (let i = batch; i < end; i++) {
      const cid = uuid();
      // 80% company1, 20% company2
      const compId = i < 8000 ? companyId : companyId2;
      if (compId === companyId) custIds.push(cid); else custIds2.push(cid);

      cRows.push([cid, `MUS-${String(i+1).padStart(5,'0')}`, `Musteri ${i+1} ${pick(SECTORS)} A.S.`, String(1000000000+i), pick(CITIES), pick(SECTORS), compId, 1]);

      // Locations: 60% get 1-2, 30% get 3-5, 10% get 6-15
      const r = Math.random();
      const locCount = r < 0.6 ? rand(1,2) : r < 0.9 ? rand(3,5) : rand(6,15);
      for (let j = 0; j < locCount; j++) {
        const lid = uuid();
        locIds.push(lid);
        locCustMap[lid] = cid;
        totalLocs++;
        lRows.push([lid, cid, j === 0 ? 'Merkez' : `Sube ${j}`, `${pick(CITIES)} Sanayi`, pick(CITIES), 1]);
      }
    }

    const cp = cRows.map(() => '(?,?,?,?,?,?,?,?)').join(',');
    await conn.query(`INSERT INTO customers (id, code, name, taxNumber, city, sector, companyId, isActive) VALUES ${cp}`, cRows.flat());

    for (let j = 0; j < lRows.length; j += BATCH) {
      const s = lRows.slice(j, j + BATCH);
      const lp = s.map(() => '(?,?,?,?,?,?)').join(',');
      await conn.query(`INSERT INTO customer_locations (id, customerId, name, address, city, isActive) VALUES ${lp}`, s.flat());
    }

    if (end % 2000 === 0) console.log(`  Customers: ${end}/10000, Locations: ${totalLocs}`);
  }
  console.log(`Customers: ${custIds.length + custIds2.length} (C1: ${custIds.length}, C2: ${custIds2.length}), Locations: ${totalLocs}`);

  // --- Equipment (500,000) ---
  await conn.query('DELETE FROM equipment');
  let eqCount = 0;
  const eqRows: any[][] = [];

  for (const lid of locIds) {
    if (eqCount >= 500000) break;
    const cid = locCustMap[lid];
    // More equipment for larger customers
    const count = rand(1, 25);
    for (let i = 0; i < count && eqCount < 500000; i++) {
      eqCount++;
      const tid = pick(eqTypeIds);
      const period = rand(6, 24);
      const lastCtrl = new Date(2024, rand(0,11), rand(1,28));
      const nextCtrl = new Date(lastCtrl);
      nextCtrl.setMonth(nextCtrl.getMonth() + period);

      eqRows.push([uuid(), cid, lid, tid, `EQ-${String(eqCount).padStart(7,'0')}`, pick(EQ_TYPES), `SN${rand(100000,999999)}`, period, lastCtrl.toISOString().slice(0,10), nextCtrl.toISOString().slice(0,10), 'active']);

      if (eqRows.length >= BATCH) {
        const ep = eqRows.map(() => '(?,?,?,?,?,?,?,?,?,?,?)').join(',');
        await conn.query(`INSERT INTO equipment (id, customerId, locationId, equipmentTypeId, inventoryCode, name, serialNumber, controlPeriodMonths, lastControlDate, nextControlDate, status) VALUES ${ep}`, eqRows.flat());
        eqRows.length = 0;
      }
    }
    if (eqCount % 50000 === 0) console.log(`  Equipment: ${eqCount}/500000`);
  }
  if (eqRows.length > 0) {
    const ep = eqRows.map(() => '(?,?,?,?,?,?,?,?,?,?,?)').join(',');
    await conn.query(`INSERT INTO equipment (id, customerId, locationId, equipmentTypeId, inventoryCode, name, serialNumber, controlPeriodMonths, lastControlDate, nextControlDate, status) VALUES ${ep}`, eqRows.flat());
  }
  console.log(`Equipment: ${eqCount}`);

  // --- Work Orders (50,000) ---
  await conn.query('DELETE FROM work_orders');
  const woStatuses = ['draft','planned','assigned','in_progress','completed','report_pending','report_approved','invoiced'];
  let woCount = 0;
  const woRows: any[][] = [];
  for (let i = 0; i < 50000; i++) {
    woCount++;
    const cust = pick(custIds);
    const status = pick(woStatuses);
    const planned = new Date(2025, rand(0,11), rand(1,28));
    const risk = Math.random() < 0.15 ? 1 : 0;
    woRows.push([uuid(), `IS-2025-${String(i+1).padStart(5,'0')}`, cust, status, planned.toISOString().slice(0,10), 'normal', risk]);
    if (woRows.length >= BATCH) {
      const wp = woRows.map(() => '(?,?,?,?,?,?,?)').join(',');
      await conn.query(`INSERT INTO work_orders (id, workOrderNumber, customerId, status, plannedDate, priority, noContractRisk) VALUES ${wp}`, woRows.flat());
      woRows.length = 0;
    }
    if (woCount % 10000 === 0) console.log(`  Work Orders: ${woCount}/50000`);
  }
  if (woRows.length > 0) {
    const wp = woRows.map(() => '(?,?,?,?,?,?,?)').join(',');
    await conn.query(`INSERT INTO work_orders (id, workOrderNumber, customerId, status, plannedDate, priority, noContractRisk) VALUES ${wp}`, woRows.flat());
  }
  console.log(`Work Orders: ${woCount}`);

  // --- Proposals (20,000) ---
  await conn.query('DELETE FROM proposals');
  const propStatuses = ['draft','sent','accepted','rejected','revision_requested','expired'];
  let propCount = 0;
  const propRows: any[][] = [];
  for (let i = 0; i < 20000; i++) {
    propCount++;
    propRows.push([uuid(), `TEK-2025-${String(i+1).padStart(5,'0')}`, pick(custIds), pick(propStatuses), rand(1000,500000), 'TRY', 1]);
    if (propRows.length >= BATCH) {
      const pp = propRows.map(() => '(?,?,?,?,?,?,?)').join(',');
      await conn.query(`INSERT INTO proposals (id, proposalNumber, customerId, status, totalAmount, currency, revision) VALUES ${pp}`, propRows.flat());
      propRows.length = 0;
    }
  }
  if (propRows.length > 0) {
    const pp = propRows.map(() => '(?,?,?,?,?,?,?)').join(',');
    await conn.query(`INSERT INTO proposals (id, proposalNumber, customerId, status, totalAmount, currency, revision) VALUES ${pp}`, propRows.flat());
  }
  console.log(`Proposals: ${propCount}`);

  // --- Audit Logs (100,000) ---
  await conn.query('DELETE FROM audit_logs');
  const actions = ['USER_LOGIN','CUSTOMER_CREATED','EQUIPMENT_CREATED','WORK_ORDER_CREATED','INSPECTION_COMPLETED','REPORT_APPROVED','PROPOSAL_SENT'];
  let auditCount = 0;
  const auditRows: any[][] = [];
  for (let i = 0; i < 100000; i++) {
    auditCount++;
    auditRows.push([uuid(), pick(actions), 'work_order', uuid(), pick(userIds), `192.168.1.${rand(1,254)}`]);
    if (auditRows.length >= BATCH) {
      const ap = auditRows.map(() => '(?,?,?,?,?,?)').join(',');
      await conn.query(`INSERT INTO audit_logs (id, action, entityType, entityId, userId, ipAddress) VALUES ${ap}`, auditRows.flat());
      auditRows.length = 0;
    }
  }
  if (auditRows.length > 0) {
    const ap = auditRows.map(() => '(?,?,?,?,?,?)').join(',');
    await conn.query(`INSERT INTO audit_logs (id, action, entityType, entityId, userId, ipAddress) VALUES ${ap}`, auditRows.flat());
  }
  console.log(`Audit Logs: ${auditCount}`);

  // --- Sales Opportunities (10,000) ---
  await conn.query('DELETE FROM sales_opportunities');
  const soStatuses = ['new','contacted','proposal_sent','negotiation','won','lost'];
  let soCount = 0;
  const soRows: any[][] = [];
  for (let i = 0; i < 10000; i++) {
    soCount++;
    soRows.push([uuid(), `Firsat ${i+1}`, pick(custIds), pick(soStatuses), rand(5000,500000), rand(10,100)]);
    if (soRows.length >= BATCH) {
      const sp = soRows.map(() => '(?,?,?,?,?,?)').join(',');
      await conn.query(`INSERT INTO sales_opportunities (id, title, customerId, status, estimatedValue, probability) VALUES ${sp}`, soRows.flat());
      soRows.length = 0;
    }
  }
  if (soRows.length > 0) {
    const sp = soRows.map(() => '(?,?,?,?,?,?)').join(',');
    await conn.query(`INSERT INTO sales_opportunities (id, title, customerId, status, estimatedValue, probability) VALUES ${sp}`, soRows.flat());
  }
  console.log(`Sales Opportunities: ${soCount}`);

  await conn.query('SET FOREIGN_KEY_CHECKS=1');
  const dur = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n=== SEED COMPLETED in ${dur}s ===`);
  console.log(`Company 1 (PerKont Test): ${companyId}`);
  console.log(`Company 2 (Diger Firma): ${companyId2}`);
  console.log(`\nLogin:\n  admin1@perkont-test.com / Test1234!\n  inspector1@perkont-test.com / Test1234!`);

  // Verify counts
  const [rows] = await conn.query(`
    SELECT
      (SELECT COUNT(*) FROM customers) as customers,
      (SELECT COUNT(*) FROM customer_locations) as locations,
      (SELECT COUNT(*) FROM equipment) as equipment,
      (SELECT COUNT(*) FROM work_orders) as work_orders,
      (SELECT COUNT(*) FROM proposals) as proposals,
      (SELECT COUNT(*) FROM users) as users,
      (SELECT COUNT(*) FROM audit_logs) as audit_logs,
      (SELECT COUNT(*) FROM sales_opportunities) as opportunities
  `) as any;
  console.log('\nVerification:', rows[0]);

  await conn.end();
}

main().catch(e => { console.error(e); process.exit(1); });

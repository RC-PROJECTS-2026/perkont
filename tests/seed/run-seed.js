const mysql = require('mysql2/promise');
const crypto = require('crypto');

function uuid() { return crypto.randomUUID(); }
function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr) { return arr[rand(0, arr.length - 1)]; }

const CITIES = ['Istanbul','Ankara','Izmir','Bursa','Antalya','Kocaeli','Konya','Gaziantep','Mersin','Adana'];
const EQ_TYPES = ['Vinc','Forklift','Asansor','Platform','Caraskal','Kompressor','Kazan','Basincli Kap','Jenerator','Trafo','Pano','Pompa','CNC','Pres','Kaynak'];
const BATCH = 500;

async function main() {
  console.log('=== Quick Staging Seed ===');
  const conn = await mysql.createConnection({host:'localhost',user:'root',password:'',database:process.env.DB_DATABASE||'perkont_staging',charset:'utf8mb4'});
  await conn.query('SET FOREIGN_KEY_CHECKS=0');
  const t0 = Date.now();

  const cid1 = uuid(), cid2 = uuid();
  await conn.query('DELETE FROM companies');
  await conn.query('INSERT INTO companies (id,name,taxNumber,address,city,phone,email,isActive) VALUES (?,?,?,?,?,?,?,1)', [cid1,'PerKont Test','1234567890','Test','Istanbul','021','a@b.com']);
  await conn.query('INSERT INTO companies (id,name,taxNumber,address,city,phone,email,isActive) VALUES (?,?,?,?,?,?,?,1)', [cid2,'Diger Firma','9876543210','Test2','Ankara','031','c@d.com']);
  console.log('Companies: 2');

  const pwHash = '$2b$12$LJ3m5ZQh3xZPYVPWiR1iOOvTFqVqAyF9YvWz7xEqeRH4oLxYhS3C';
  await conn.query('DELETE FROM users');
  const roles = {admin:20,sales:80,planner:60,inspector:150,technical_manager:40,finance:30,executive:20,customer:100};
  let ui=0;
  for (const [role, cnt] of Object.entries(roles)) {
    const batch = [];
    for (let i=0;i<cnt;i++) {
      const cid = i < Math.ceil(cnt*0.8) ? cid1 : cid2;
      batch.push([uuid(), role+(ui+i+1)+'@perkont-test.com', 'Test '+role+' '+(i+1), pwHash, role, cid, 1, 0]);
    }
    ui += cnt;
    for (let j=0;j<batch.length;j+=BATCH) {
      const s=batch.slice(j,j+BATCH);
      await conn.query('INSERT INTO users (id,email,fullName,passwordHash,roles,companyId,isActive,mfaEnabled) VALUES '+s.map(()=>'(?,?,?,?,?,?,?,?)').join(','), s.flat());
    }
  }
  console.log('Users:', ui);

  await conn.query('DELETE FROM equipment_types');
  const etIds=[];
  for (let i=0;i<EQ_TYPES.length;i++) {
    const id=uuid(); etIds.push(id);
    await conn.query('INSERT INTO equipment_types (id,code,name,description,defaultPeriodMonths,isActive,createdAt,updatedAt) VALUES (?,?,?,?,?,1,NOW(),NOW())', [id,'ET-'+String(i+1).padStart(3,'0'),EQ_TYPES[i],EQ_TYPES[i]+' kontrolu',rand(6,24)]);
  }
  console.log('Equipment Types:', etIds.length);

  await conn.query('DELETE FROM customer_locations');
  await conn.query('DELETE FROM customers');
  const locMap = {};
  let custCount=0, locCount=0;
  for (let b=0;b<10000;b+=BATCH) {
    const cr=[], lr=[];
    const end=Math.min(b+BATCH,10000);
    for (let i=b;i<end;i++) {
      const cust=uuid();
      const comp = i<8000?cid1:cid2;
      custCount++;
      cr.push([cust,'MUS-'+String(i+1).padStart(5,'0'),'Musteri '+(i+1)+' A.S.',String(1000000000+i),pick(CITIES),comp,1]);
      const lc = Math.random()<0.6?rand(1,2):Math.random()<0.75?rand(3,5):rand(6,12);
      for (let j=0;j<lc;j++) {
        const lid=uuid(); locCount++;
        locMap[lid]=cust;
        lr.push([lid,cust,j===0?'Merkez':'Sube '+j,pick(CITIES)+' Sanayi',pick(CITIES),1]);
      }
    }
    await conn.query('INSERT INTO customers (id,code,name,taxNumber,city,companyId,isActive) VALUES '+cr.map(()=>'(?,?,?,?,?,?,?)').join(','), cr.flat());
    for (let j=0;j<lr.length;j+=BATCH) {
      const s=lr.slice(j,j+BATCH);
      await conn.query('INSERT INTO customer_locations (id,customerId,name,address,city,isActive) VALUES '+s.map(()=>'(?,?,?,?,?,?)').join(','), s.flat());
    }
    if (end%2000===0) console.log('  Customers:',end,', Locations:',locCount);
  }
  console.log('Customers:',custCount,', Locations:',locCount);

  await conn.query('DELETE FROM equipment');
  let eqCount=0;
  const lids=Object.keys(locMap);
  let eqBuf=[];
  for (const lid of lids) {
    if (eqCount>=500000) break;
    const cnt=rand(1,20);
    for (let i=0;i<cnt&&eqCount<500000;i++) {
      eqCount++;
      const p=rand(6,24);
      const lc=new Date(2024,rand(0,11),rand(1,28));
      const nc=new Date(lc); nc.setMonth(nc.getMonth()+p);
      eqBuf.push([uuid(),locMap[lid],lid,pick(etIds),'EQ-'+String(eqCount).padStart(7,'0'),pick(EQ_TYPES),'SN'+rand(100000,999999),p,lc.toISOString().slice(0,10),nc.toISOString().slice(0,10),'active']);
      if (eqBuf.length>=BATCH) {
        await conn.query('INSERT INTO equipment (id,customerId,locationId,equipmentTypeId,inventoryCode,brand,serialNumber,controlPeriodMonths,lastControlDate,nextControlDate,status) VALUES '+eqBuf.map(()=>'(?,?,?,?,?,?,?,?,?,?,?)').join(','), eqBuf.flat());
        eqBuf=[];
      }
    }
    if (eqCount%100000===0) console.log('  Equipment:',eqCount);
  }
  if (eqBuf.length) await conn.query('INSERT INTO equipment (id,customerId,locationId,equipmentTypeId,inventoryCode,brand,serialNumber,controlPeriodMonths,lastControlDate,nextControlDate,status) VALUES '+eqBuf.map(()=>'(?,?,?,?,?,?,?,?,?,?,?)').join(','), eqBuf.flat());
  console.log('Equipment:',eqCount);

  await conn.query('DELETE FROM work_orders');
  const woSt=['draft','planned','assigned','in_progress','completed','report_pending','report_approved','invoiced'];
  const custIds=lids.slice(0,8000).map(l=>locMap[l]);
  let woBuf=[];
  for (let i=0;i<50000;i++) {
    woBuf.push([uuid(),'IS-2025-'+String(i+1).padStart(5,'0'),pick(custIds),pick(woSt),new Date(2025,rand(0,11),rand(1,28)).toISOString().slice(0,10),'normal',Math.random()<0.15?1:0]);
    if (woBuf.length>=BATCH) {
      await conn.query('INSERT INTO work_orders (id,workOrderNumber,customerId,status,plannedDate,priority,noContractRisk) VALUES '+woBuf.map(()=>'(?,?,?,?,?,?,?)').join(','), woBuf.flat());
      woBuf=[];
    }
  }
  if (woBuf.length) await conn.query('INSERT INTO work_orders (id,workOrderNumber,customerId,status,plannedDate,priority,noContractRisk) VALUES '+woBuf.map(()=>'(?,?,?,?,?,?,?)').join(','), woBuf.flat());
  console.log('Work Orders: 50000');

  await conn.query('DELETE FROM proposals');
  let prBuf=[];
  for (let i=0;i<20000;i++) {
    prBuf.push([uuid(),'TEK-2025-'+String(i+1).padStart(5,'0'),pick(custIds),pick(['draft','sent','accepted','rejected']),rand(1000,500000),'TRY',1]);
    if (prBuf.length>=BATCH) {
      await conn.query('INSERT INTO proposals (id,proposalNumber,customerId,status,totalAmount,currency,revision) VALUES '+prBuf.map(()=>'(?,?,?,?,?,?,?)').join(','), prBuf.flat());
      prBuf=[];
    }
  }
  if (prBuf.length) await conn.query('INSERT INTO proposals (id,proposalNumber,customerId,status,totalAmount,currency,revision) VALUES '+prBuf.map(()=>'(?,?,?,?,?,?,?)').join(','), prBuf.flat());
  console.log('Proposals: 20000');

  await conn.query('DELETE FROM audit_logs');
  let alBuf=[];
  for (let i=0;i<100000;i++) {
    alBuf.push([uuid(),pick(['USER_LOGIN','CUSTOMER_CREATED','WORK_ORDER_CREATED','REPORT_APPROVED']),'work_order',uuid(),uuid(),'192.168.1.'+rand(1,254)]);
    if (alBuf.length>=BATCH) {
      await conn.query('INSERT INTO audit_logs (id,action,entityType,entityId,userId,ipAddress) VALUES '+alBuf.map(()=>'(?,?,?,?,?,?)').join(','), alBuf.flat());
      alBuf=[];
    }
  }
  if (alBuf.length) await conn.query('INSERT INTO audit_logs (id,action,entityType,entityId,userId,ipAddress) VALUES '+alBuf.map(()=>'(?,?,?,?,?,?)').join(','), alBuf.flat());
  console.log('Audit Logs: 100000');

  await conn.query('SET FOREIGN_KEY_CHECKS=1');
  const [v] = await conn.query('SELECT (SELECT COUNT(*) FROM customers) c,(SELECT COUNT(*) FROM customer_locations) l,(SELECT COUNT(*) FROM equipment) e,(SELECT COUNT(*) FROM work_orders) w,(SELECT COUNT(*) FROM proposals) p,(SELECT COUNT(*) FROM users) u,(SELECT COUNT(*) FROM audit_logs) a');
  console.log('\n=== VERIFICATION ===');
  console.log(JSON.stringify(v[0], null, 2));
  console.log('Duration:', ((Date.now()-t0)/1000).toFixed(1)+'s');
  console.log('\nCompany 1:', cid1);
  console.log('Company 2:', cid2);
  await conn.end();
}
main().catch(e=>{console.error(e.message);process.exit(1)});

import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

/**
 * Initial seed — ilk admin kullanıcı ve temel ekipman tipleri
 * Çalıştırmak için: npm run seed
 */
export async function runSeeds(dataSource: DataSource): Promise<void> {
  console.log('🌱 Seed başlatılıyor...');

  // ─── Admin kullanıcı ──────────────────────────────────────────────────────
  const existingAdmin = await dataSource.query(
    `SELECT id FROM users WHERE email = 'admin@perkont.com'`,
  );

  if (existingAdmin.length === 0) {
    const passwordHash = await bcrypt.hash('Admin123!', 12);
    const adminId = uuidv4();

    await dataSource.query(`
      INSERT INTO users (id, email, full_name, role, password_hash, is_active, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())
    `, [adminId, 'admin@perkont.com', 'Sistem Yöneticisi', 'admin', passwordHash]);

    console.log('✅ Admin kullanıcı oluşturuldu: admin@perkont.com / Admin123!');
  }

  // ─── Teknik yönetici ──────────────────────────────────────────────────────
  const existingTm = await dataSource.query(
    `SELECT id FROM users WHERE email = 'teknikyon@perkont.com'`,
  );

  if (existingTm.length === 0) {
    const passwordHash = await bcrypt.hash('TechMgr123!', 12);
    await dataSource.query(`
      INSERT INTO users (id, email, full_name, role, password_hash, is_active, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())
    `, [uuidv4(), 'teknikyon@perkont.com', 'Teknik Yönetici', 'technical_manager', passwordHash]);
    console.log('✅ Teknik yönetici oluşturuldu: teknikyon@perkont.com / TechMgr123!');
  }

  // ─── Muayene elemanı ─────────────────────────────────────────────────────
  const existingInsp = await dataSource.query(
    `SELECT id FROM users WHERE email = 'muayene@perkont.com'`,
  );

  if (existingInsp.length === 0) {
    const passwordHash = await bcrypt.hash('Inspector123!', 12);
    await dataSource.query(`
      INSERT INTO users (id, email, full_name, role, password_hash, ekipnet_number, is_active, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, true, NOW(), NOW())
    `, [uuidv4(), 'muayene@perkont.com', 'Örnek Muayene Elemanı', 'inspector', passwordHash, 'EKN-12345']);
    console.log('✅ Muayene elemanı oluşturuldu: muayene@perkont.com / Inspector123!');
  }

  // ─── Ekipman Tipleri ─────────────────────────────────────────────────────
  const equipmentTypes = [
    {
      code: 'KIE',
      name: 'Kaldırma İletme Ekipmanları',
      standards: ['TS EN 13157', 'TS EN 13155', 'TS EN 14492'],
      period: 12,
    },
    {
      code: 'BK',
      name: 'Basınçlı Kaplar ve Kazanlar',
      standards: ['TS EN 13445', 'ASME', '97/23/EC PED'],
      period: 12,
    },
    {
      code: 'YE',
      name: 'Yangın Ekipmanları',
      standards: ['TS EN 671', 'TS ISO 11602'],
      period: 12,
    },
    {
      code: 'EK',
      name: 'Elektrik / Topraklama Kontrolleri',
      standards: ['TS HD 60364', 'IEC 60364'],
      period: 12,
    },
    {
      code: 'TES',
      name: 'Tesisat Kontrolleri',
      standards: ['TS EN 12828', 'TS ISO 1817'],
      period: 24,
    },
    {
      code: 'YAP',
      name: 'Yapı İskele ve Platformları',
      standards: ['TS EN 12810', 'TS EN 12811'],
      period: 6,
    },
  ];

  for (const type of equipmentTypes) {
    const existing = await dataSource.query(
      `SELECT id FROM equipment_types WHERE code = $1`, [type.code],
    );

    if (existing.length === 0) {
      await dataSource.query(`
        INSERT INTO equipment_types (id, code, name, applicable_standards, default_period_months, is_active, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())
      `, [uuidv4(), type.code, type.name, JSON.stringify(type.standards), type.period]);
      console.log(`✅ Ekipman tipi: ${type.name}`);
    }
  }

  // ─── Örnek Müşteri ────────────────────────────────────────────────────────
  const existingCustomer = await dataSource.query(
    `SELECT id FROM customers WHERE code = 'DEMO-001'`,
  );

  if (existingCustomer.length === 0) {
    const customerId = uuidv4();
    const adminRows = await dataSource.query(`SELECT id FROM users WHERE role = 'admin' LIMIT 1`);
    const adminId = adminRows[0]?.id;

    await dataSource.query(`
      INSERT INTO customers (id, code, name, tax_number, city, contact_email, contact_phone, is_active, created_by_id, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8, NOW(), NOW())
    `, [customerId, 'DEMO-001', 'Demo Fabrika A.Ş.', '1234567890', 'İstanbul', 'demo@fabrika.com', '02121234567', adminId]);

    // Lokasyon ekle
    await dataSource.query(`
      INSERT INTO customer_locations (id, customer_id, name, city, district, is_active, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())
    `, [uuidv4(), customerId, 'İstanbul Merkez Fabrika', 'İstanbul', 'Esenyurt']);

    console.log('✅ Demo müşteri oluşturuldu: Demo Fabrika A.Ş.');
  }

  // ─── Referans Dokümanlar ──────────────────────────────────────────────────
  const refDocs = [
    { code: 'ISO/IEC 17020:2012', title: 'Muayene Kuruluşlarının İşletimi için Genel Kriterler', revision: '2012' },
    { code: 'TS EN 13157', title: 'Kaldırma Ekipmanı - Elle Kullanılan Yük Asma Ekipmanı', revision: '2004' },
    { code: 'TS EN 13155', title: 'Kaldırma Ekipmanı - Yük Taşıma Aparatları', revision: '2003+A2:2009' },
    { code: '2009/104/EC', title: 'Çalışanların İş Ekipmanlarını Kullanmalarına İlişkin Direktif', revision: '2009' },
  ];

  for (const doc of refDocs) {
    const existing = await dataSource.query(
      `SELECT id FROM reference_documents WHERE code = $1`, [doc.code],
    ).catch(() => []);

    if (existing.length === 0) {
      await dataSource.query(`
        INSERT INTO reference_documents (id, code, title, revision, is_active, created_at, updated_at)
        VALUES ($1, $2, $3, $4, true, NOW(), NOW())
      `, [uuidv4(), doc.code, doc.title, doc.revision]).catch(() => {});
    }
  }

  console.log('\n🎉 Seed tamamlandı!');
  console.log('─────────────────────────────────────────');
  console.log('Kullanıcılar:');
  console.log('  admin@perkont.com / Admin123!');
  console.log('  teknikyon@perkont.com / TechMgr123!');
  console.log('  muayene@perkont.com / Inspector123!');
  console.log('─────────────────────────────────────────');
}

// Standalone çalıştırma
if (require.main === module) {
  const { createConnection } = require('typeorm');
  createConnection({
    type: 'postgres',
    host:     process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USERNAME || 'perkont',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE || 'perkont_db',
  }).then(async (conn: any) => {
    await runSeeds(conn);
    await conn.close();
    process.exit(0);
  }).catch((err: any) => {
    console.error('Seed hatası:', err);
    process.exit(1);
  });
}

// Migration: Bölüm 3'te tanımlanan 4 eksik tablo
// companies — şirket/tenant katmanı
// user_permissions — granüler kullanıcı izinleri
// report_reviews — rapor inceleme/onay geçmişi
// logo_invoices — LOGO ERP fatura eşleme

import { MigrationInterface, QueryRunner } from 'typeorm';

export class MissingTablesV4_1700000000003 implements MigrationInterface {
  name = 'MissingTablesV4_1700000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
      -- ================================================================
      -- COMPANIES (Şirket / Tenant katmanı)
      -- ================================================================
      CREATE TABLE IF NOT EXISTS companies (
        id                    VARCHAR(36) PRIMARY KEY ,
        name                  VARCHAR(255) NOT NULL,
        tax_number            VARCHAR(20) UNIQUE,
        accreditation_number  VARCHAR(100),
        accreditation_scope   JSON,
        logo_url              VARCHAR(500),
        address               TEXT,
        city                  VARCHAR(100),
        phone                 VARCHAR(50),
        email                 VARCHAR(255),
        website               VARCHAR(500),
        settings              JSON,
        is_active             TINYINT(1) DEFAULT 1,
        created_at            DATETIME DEFAULT NOW(),
        updated_at            DATETIME DEFAULT NOW()
      )
    `);
    // MySQL table comment
    await queryRunner.query(`
      ALTER TABLE companies COMMENT = 'Multi-tenant şirket katmanı'
    `);
    await queryRunner.query(`
      -- ================================================================
      -- USER_PERMISSIONS (Kullanıcı bazlı granüler izinler)
      -- ================================================================
      CREATE TABLE IF NOT EXISTS user_permissions (
        id          VARCHAR(36) PRIMARY KEY ,
        user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        module      VARCHAR(100) NOT NULL,
        action      VARCHAR(50)  NOT NULL,
        granted     TINYINT(1) DEFAULT 1,
        granted_by VARCHAR(36) REFERENCES users(id),
        expires_at  DATETIME,
        reason      TEXT,
        granted_at  DATETIME DEFAULT NOW(),
        UNIQUE (user_id, module, action)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_user_permissions_user ON user_permissions(user_id)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_user_permissions_module ON user_permissions(module, action)
    `);
    await queryRunner.query(`
      ALTER TABLE user_permissions COMMENT = 'Kullanıcı bazında granüler izinler'
    `);
    await queryRunner.query(`
      -- ================================================================
      -- REPORT_REVIEWS (Rapor inceleme / onay / iade geçmişi)
      -- ================================================================
      CREATE TABLE IF NOT EXISTS report_reviews (
        id          VARCHAR(36) PRIMARY KEY ,
        report_id VARCHAR(36) NOT NULL,
        reviewer_id VARCHAR(36) NOT NULL REFERENCES users(id),
        action      VARCHAR(50) NOT NULL,
        -- submitted | under_review | approved | revision_requested | rejected | signed | delivered
        comment     TEXT,
        metadata    JSON,
        created_at  DATETIME DEFAULT NOW()
        -- Bu tablo asla UPDATE veya DELETE almaz — append-only audit kaydı
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_report_reviews_report ON report_reviews(report_id)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_report_reviews_reviewer ON report_reviews(reviewer_id)
    `);
    await queryRunner.query(`
      ALTER TABLE report_reviews COMMENT = 'ISO 17020 rapor onay zinciri'
    `);
    await queryRunner.query(`
      -- report_reviews tablosuna UPDATE ve DELETE yetkisi sadece superuser
      -- MySQL: permissions managed at application level

      -- ================================================================
      -- LOGO_INVOICES (LOGO ERP fatura eşleme)
      -- ================================================================
      CREATE TABLE IF NOT EXISTS logo_invoices (
        id              VARCHAR(36) PRIMARY KEY ,
        work_order_id VARCHAR(36) NOT NULL REFERENCES work_orders(id),
        logo_invoice_id VARCHAR(100),
        logo_invoice_no VARCHAR(100),
        status          VARCHAR(50) DEFAULT 'pending',
        -- pending | sent | success | failed | cancelled
        amount          DECIMAL(12,2),
        vat_rate        DECIMAL(5,2),
        vat_amount      DECIMAL(12,2),
        total_with_vat  DECIMAL(12,2),
        invoice_date    DATE,
        logo_payload    JSON,
        logo_response   JSON,
        error_message   TEXT,
        created_by VARCHAR(36) REFERENCES users(id),
        sent_at         DATETIME,
        created_at      DATETIME DEFAULT NOW(),
        updated_at      DATETIME DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_logo_invoices_work_order ON logo_invoices(work_order_id)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_logo_invoices_status ON logo_invoices(status)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_logo_invoices_logo_no ON logo_invoices(logo_invoice_no)
    `);
    await queryRunner.query(`
      ALTER TABLE logo_invoices COMMENT = 'LOGO ERP fatura eşleme'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS = 0`);
    const tables = ['logo_invoices', 'report_reviews', 'user_permissions', 'companies'];
    for (const t of tables) {
      await queryRunner.query(`DROP TABLE IF EXISTS \`${t}\``);
    }
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS = 1`);
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

export class PricingAndInvoicePrep_1700000000004 implements MigrationInterface {
  name = 'PricingAndInvoicePrep_1700000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ================================================================
    // PRICE_LISTS (Fiyat listeleri)
    // ================================================================
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS price_lists (
        id                VARCHAR(36) PRIMARY KEY,
        equipment_type_id VARCHAR(36) NOT NULL,
        name              VARCHAR(255) NOT NULL,
        base_price        DECIMAL(10,2) NOT NULL,
        currency          VARCHAR(10) DEFAULT 'TRY',
        valid_from        DATE NOT NULL,
        valid_until       DATE DEFAULT NULL,
        discount_tiers    JSON DEFAULT NULL,
        is_active         TINYINT(1) DEFAULT 1,
        notes             TEXT DEFAULT NULL,
        created_by_id     VARCHAR(36) NOT NULL,
        created_at        DATETIME DEFAULT NOW(),
        updated_at        DATETIME DEFAULT NOW() ON UPDATE NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_price_lists_equipment_active ON price_lists(equipment_type_id, is_active)
    `);

    await queryRunner.query(`
      ALTER TABLE price_lists COMMENT = 'Ekipman tipi bazlı fiyat listeleri'
    `);

    // ================================================================
    // INVOICE_BATCHES (Fatura hazırlık batch kayıtları)
    // ================================================================
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS invoice_batches (
        id                  VARCHAR(36) PRIMARY KEY,
        batch_number        VARCHAR(50) NOT NULL UNIQUE,
        status              VARCHAR(20) DEFAULT 'draft',
        work_order_ids      JSON NOT NULL,
        customer_id         VARCHAR(36) NOT NULL,
        total_amount        DECIMAL(12,2) NOT NULL,
        vat_rate            DECIMAL(5,2) DEFAULT 20.00,
        vat_amount          DECIMAL(12,2) NOT NULL,
        total_with_vat      DECIMAL(12,2) NOT NULL,
        invoice_date        DATE NOT NULL,
        notes               TEXT DEFAULT NULL,
        prepared_by_id      VARCHAR(36) NOT NULL,
        prepared_at         DATETIME DEFAULT NULL,
        sent_to_logo_at     DATETIME DEFAULT NULL,
        logo_sync_queue_id  VARCHAR(36) DEFAULT NULL,
        created_at          DATETIME DEFAULT NOW(),
        updated_at          DATETIME DEFAULT NOW() ON UPDATE NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_invoice_batches_customer_status ON invoice_batches(customer_id, status)
    `);

    await queryRunner.query(`
      ALTER TABLE invoice_batches COMMENT = 'Fatura hazırlık batch kayıtları – LOGO entegrasyonu öncesi'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS invoice_batches`);
    await queryRunner.query(`DROP TABLE IF EXISTS price_lists`);
  }
}

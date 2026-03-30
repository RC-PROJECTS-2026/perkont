import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1700000000000 implements MigrationInterface {
  name = 'InitialSchema1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Users
        await queryRunner.query(`
      CREATE TABLE users (
        id VARCHAR(36) PRIMARY KEY ,
        email VARCHAR(255) UNIQUE NOT NULL,
        phone VARCHAR(20),
        full_name VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL,
        company_id VARCHAR(36),
        password_hash VARCHAR(255) NOT NULL,
        ekipnet_number VARCHAR(50),
        is_active TINYINT(1) DEFAULT 1,
        mfa_enabled TINYINT(1) DEFAULT 0,
        mfa_secret VARCHAR(255),
        avatar_url VARCHAR(500),
        last_login_at DATETIME,
        last_login_ip VARCHAR(50),
        refresh_token_hash VARCHAR(255),
        password_reset_token VARCHAR(255),
        password_reset_expires DATETIME,
        failed_login_attempts INT DEFAULT 0,
        locked_until DATETIME,
        created_at DATETIME DEFAULT NOW(),
        updated_at DATETIME DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_users_email ON users(email)
    `);

    // Customers
    await queryRunner.query(`
      CREATE TABLE customers (
        id VARCHAR(36) PRIMARY KEY ,
        code VARCHAR(50) UNIQUE NOT NULL,
        logo_cari_id VARCHAR(100),
        logo_cari_code VARCHAR(100),
        name VARCHAR(255) NOT NULL,
        tax_number VARCHAR(20) UNIQUE,
        tax_office VARCHAR(100),
        address TEXT,
        city VARCHAR(100),
        district VARCHAR(100),
        sector VARCHAR(100),
        contact_name VARCHAR(255),
        contact_email VARCHAR(255),
        contact_phone VARCHAR(50),
        invoice_email VARCHAR(255),
        invoice_contact_name VARCHAR(255),
        invoice_contact_phone VARCHAR(50),
        is_active TINYINT(1) DEFAULT 1,
        notes TEXT,
        created_by_id VARCHAR(36) REFERENCES users(id),
        assigned_sales_rep_id VARCHAR(36) REFERENCES users(id),
        created_at DATETIME DEFAULT NOW(),
        updated_at DATETIME DEFAULT NOW()
      );
    `);

    // Customer Locations
        await queryRunner.query(`
      CREATE TABLE customer_locations (
        id VARCHAR(36) PRIMARY KEY ,
        customer_id VARCHAR(36) NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        address TEXT,
        city VARCHAR(100),
        district VARCHAR(100),
        postal_code VARCHAR(20),
        latitude FLOAT,
        longitude FLOAT,
        contact_name VARCHAR(255),
        contact_phone VARCHAR(50),
        contact_email VARCHAR(255),
        notes TEXT,
        is_active TINYINT(1) DEFAULT 1,
        created_at DATETIME DEFAULT NOW(),
        updated_at DATETIME DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_customer_locations_customer ON customer_locations(customer_id)
    `);

    // Equipment Types
    await queryRunner.query(`
      CREATE TABLE equipment_types (
        id VARCHAR(36) PRIMARY KEY ,
        code VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        applicable_standards JSON,
        default_period_months INT,
        description TEXT,
        is_active TINYINT(1) DEFAULT 1,
        created_at DATETIME DEFAULT NOW(),
        updated_at DATETIME DEFAULT NOW()
      );
    `);

    // Equipment
        await queryRunner.query(`
      CREATE TABLE equipment (
        id VARCHAR(36) PRIMARY KEY ,
        customer_id VARCHAR(36) NOT NULL REFERENCES customers(id),
        location_id VARCHAR(36) REFERENCES customer_locations(id),
        equipment_type_id VARCHAR(36) NOT NULL REFERENCES equipment_types(id),
        inventory_code VARCHAR(100) UNIQUE NOT NULL,
        qr_code VARCHAR(255) UNIQUE,
        serial_number VARCHAR(255),
        brand VARCHAR(100),
        model VARCHAR(100),
        manufacture_year INT,
        capacity VARCHAR(100),
        capacity_unit VARCHAR(50),
        production_date DATE,
        first_use_date DATE,
        control_period_months INT,
        next_control_date DATE,
        last_control_date DATE,
        status VARCHAR(50) DEFAULT 'active',
        installation_location VARCHAR(255),
        photo_url VARCHAR(500),
        notes TEXT,
        created_by_id VARCHAR(36) REFERENCES users(id),
        created_at DATETIME DEFAULT NOW(),
        updated_at DATETIME DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_equipment_customer ON equipment(customer_id)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_equipment_next_control ON equipment(next_control_date)
    `);

    // Form Templates
    await queryRunner.query(`
            CREATE TABLE form_templates (
        id VARCHAR(36) PRIMARY KEY ,
        equipment_type_id VARCHAR(36) NOT NULL REFERENCES equipment_types(id),
        code VARCHAR(100) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        revision VARCHAR(20) NOT NULL,
        revision_date DATE,
        status VARCHAR(50) DEFAULT 'draft',
        superseded_by_id VARCHAR(36) REFERENCES form_templates(id),
        layout_config JSON NOT NULL DEFAULT '{}',
        output_template_url VARCHAR(500),
        output_template_object_name VARCHAR(500),
        description TEXT,
        created_by_id VARCHAR(36) REFERENCES users(id),
        approved_by_id VARCHAR(36) REFERENCES users(id),
        approved_at DATETIME,
        created_at DATETIME DEFAULT NOW(),
        updated_at DATETIME DEFAULT NOW()
      );
    `);

    // Form Fields
        await queryRunner.query(`
      CREATE TABLE form_fields (
        id VARCHAR(36) PRIMARY KEY ,
        template_id VARCHAR(36) NOT NULL REFERENCES form_templates(id) ON DELETE CASCADE,
        field_key VARCHAR(100) NOT NULL,
        label TEXT NOT NULL,
        field_type VARCHAR(50) NOT NULL,
        section VARCHAR(100),
        order_index INT DEFAULT 0,
        is_required TINYINT(1) DEFAULT 0,
        validation_rules JSON,
        options JSON,
        unit VARCHAR(50),
        db_mapping VARCHAR(255),
        pdf_coordinate JSON,
        is_conditional TINYINT(1) DEFAULT 0,
        condition_rule JSON,
        default_value VARCHAR(255),
        placeholder VARCHAR(255),
        check_items JSON,
        created_at DATETIME DEFAULT NOW(),
        updated_at DATETIME DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_form_fields_template ON form_fields(template_id, order_index)
    `);

    // Audit Logs — append-only
        await queryRunner.query(`
      CREATE TABLE audit_logs (
        id VARCHAR(36) PRIMARY KEY ,
        user_id VARCHAR(36),
        action VARCHAR(100) NOT NULL,
        entity_type VARCHAR(100) NOT NULL,
        entity_id VARCHAR(36),
        old_values JSON,
        new_values JSON,
        ip_address VARCHAR(50),
        device_info VARCHAR(255),
        session_id VARCHAR(255),
        description TEXT,
        timestamp DATETIME DEFAULT NOW() NOT NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_audit_user ON audit_logs(user_id, timestamp)
    `);
    await queryRunner.query(`
      -- audit_logs tablosuna UPDATE ve DELETE yetkisini kaldır (uygulama kullanıcısından)
      -- REVOKE UPDATE, DELETE ON audit_logs FROM perkont_app
    `);

    // Inspections ve diğer tablolar...
        await queryRunner.query(`
      CREATE TABLE inspections (
        id VARCHAR(36) PRIMARY KEY ,
        work_order_id VARCHAR(36),
        work_order_equipment_id VARCHAR(36),
        equipment_id VARCHAR(36) NOT NULL REFERENCES equipment(id),
        inspector_id VARCHAR(36) NOT NULL REFERENCES users(id),
        form_template_id VARCHAR(36) NOT NULL REFERENCES form_templates(id),
        form_template_revision VARCHAR(20) NOT NULL,
        status VARCHAR(50) DEFAULT 'draft',
        started_at DATETIME,
        completed_at DATETIME,
        submitted_at DATETIME,
        overall_result VARCHAR(50),
        inspector_notes TEXT,
        reviewer_notes TEXT,
        reviewed_by_id VARCHAR(36) REFERENCES users(id),
        reviewed_at DATETIME,
        offline_created TINYINT(1) DEFAULT 0,
        offline_device_id VARCHAR(255),
        device_timestamp DATETIME,
        server_timestamp DATETIME,
        sync_status VARCHAR(50) DEFAULT 'synced',
        local_uuid VARCHAR(255) UNIQUE,
        latitude FLOAT,
        longitude FLOAT,
        created_at DATETIME DEFAULT NOW(),
        updated_at DATETIME DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_inspections_inspector_status ON inspections(inspector_id, status)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_inspections_work_order ON inspections(work_order_id)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_inspections_sync ON inspections(sync_status)
    `);

    // Reports
        await queryRunner.query(`
      CREATE TABLE reports (
        id VARCHAR(36) PRIMARY KEY ,
        report_number VARCHAR(100) UNIQUE NOT NULL,
        inspection_id VARCHAR(36) NOT NULL REFERENCES inspections(id),
        work_order_id VARCHAR(36),
        customer_id VARCHAR(36) NOT NULL REFERENCES customers(id),
        equipment_id VARCHAR(36) NOT NULL REFERENCES equipment(id),
        version INT DEFAULT 1,
        status VARCHAR(50) DEFAULT 'draft',
        form_template_id VARCHAR(36) NOT NULL REFERENCES form_templates(id),
        form_template_revision VARCHAR(20) NOT NULL,
        pdf_url VARCHAR(500),
        pdf_object_name VARCHAR(500),
        signed_pdf_url VARCHAR(500),
        signed_pdf_object_name VARCHAR(500),
        document_hash VARCHAR(255),
        signed_document_hash VARCHAR(255),
        signature_data JSON,
        signed_by_id VARCHAR(36) REFERENCES users(id),
        signed_at DATETIME,
        delivered_at DATETIME,
        delivery_method VARCHAR(50),
        review_history JSON DEFAULT '[]',
        notes TEXT,
        created_by_id VARCHAR(36) REFERENCES users(id),
        created_at DATETIME DEFAULT NOW(),
        updated_at DATETIME DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_reports_status ON reports(status)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_reports_customer ON reports(customer_id)
    `);

    // LOGO Sync Queue
        await queryRunner.query(`
      CREATE TABLE logo_sync_queue (
        id VARCHAR(36) PRIMARY KEY ,
        entity_type VARCHAR(50) NOT NULL,
        entity_id VARCHAR(36),
        direction VARCHAR(20) NOT NULL,
        payload JSON NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        attempt_count INT DEFAULT 0,
        last_error TEXT,
        last_attempted_at DATETIME,
        next_retry_at DATETIME DEFAULT NOW(),
        completed_at DATETIME,
        logo_entity_id VARCHAR(100),
        logo_entity_ref VARCHAR(100),
        created_by_id VARCHAR(36) REFERENCES users(id),
        created_at DATETIME DEFAULT NOW(),
        updated_at DATETIME DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_logo_queue_status ON logo_sync_queue(status, attempt_count)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS = 0`);
    const tables = [
      'logo_sync_queue', 'reports', 'inspections', 'audit_logs',
      'form_fields', 'form_templates', 'equipment', 'equipment_types',
      'customer_locations', 'customers', 'users',
    ];
    for (const t of tables) {
      await queryRunner.query(`DROP TABLE IF EXISTS \`${t}\``);
    }
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS = 1`);
  }
}

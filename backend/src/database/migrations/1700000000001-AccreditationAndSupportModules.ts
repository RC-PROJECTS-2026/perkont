import { MigrationInterface, QueryRunner } from 'typeorm';

export class AccreditationAndSupportModules1700000000001 implements MigrationInterface {
  name = 'AccreditationAndSupportModules1700000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Work Orders ──────────────────────────────────────────────────────────
        await queryRunner.query(`
      CREATE TABLE work_orders (
        id VARCHAR(36) PRIMARY KEY ,
        work_order_number VARCHAR(50) UNIQUE NOT NULL,
        customer_id VARCHAR(36) NOT NULL REFERENCES customers(id),
        location_id VARCHAR(36) REFERENCES customer_locations(id),
        contract_id VARCHAR(36),
        status VARCHAR(50) DEFAULT 'draft',
        planned_date DATE,
        planned_time TIME,
        assigned_inspector_id VARCHAR(36) REFERENCES users(id),
        assigned_by_id VARCHAR(36) REFERENCES users(id),
        assigned_at DATETIME,
        completed_at DATETIME,
        priority VARCHAR(20) DEFAULT 'normal',
        notes TEXT,
        created_by_id VARCHAR(36) REFERENCES users(id),
        created_at DATETIME DEFAULT NOW(),
        updated_at DATETIME DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE work_order_equipment (
        id VARCHAR(36) PRIMARY KEY ,
        work_order_id VARCHAR(36) NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
        equipment_id VARCHAR(36) NOT NULL REFERENCES equipment(id),
        form_template_id VARCHAR(36) REFERENCES form_templates(id),
        status VARCHAR(20) DEFAULT 'pending',
        notes TEXT,
        unit_price DECIMAL(10,2),
        service_code VARCHAR(50),
        created_at DATETIME DEFAULT NOW(),
        updated_at DATETIME DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_work_orders_customer ON work_orders(customer_id)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_work_orders_inspector ON work_orders(assigned_inspector_id)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_work_orders_date ON work_orders(planned_date)
    `);

    // ── Inspections ───────────────────────────────────────────────────────────
        await queryRunner.query(`
      CREATE TABLE inspection_field_values (
        id VARCHAR(36) PRIMARY KEY ,
        inspection_id VARCHAR(36) NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
        field_id VARCHAR(36) REFERENCES form_fields(id),
        field_key VARCHAR(100) NOT NULL,
        value_text TEXT,
        value_number DECIMAL(15,6),
        value_boolean TINYINT(1),
        value_date DATE,
        value_json JSON,
        entered_by_id VARCHAR(36) REFERENCES users(id),
        entered_at DATETIME DEFAULT NOW(),
        created_at DATETIME DEFAULT NOW(),
        updated_at DATETIME DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE inspection_photos (
        id VARCHAR(36) PRIMARY KEY ,
        inspection_id VARCHAR(36) NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
        field_id VARCHAR(36),
        field_key VARCHAR(100),
        file_url VARCHAR(500),
        object_name VARCHAR(500),
        file_size INT,
        mime_type VARCHAR(100),
        taken_at DATETIME,
        latitude FLOAT,
        longitude FLOAT,
        caption TEXT,
        sync_status VARCHAR(50) DEFAULT 'synced',
        local_path VARCHAR(500),
        created_at DATETIME DEFAULT NOW(),
        updated_at DATETIME DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE inspection_nonconformities (
        id VARCHAR(36) PRIMARY KEY ,
        inspection_id VARCHAR(36) NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
        field_id VARCHAR(36),
        check_item_id VARCHAR(100),
        description TEXT NOT NULL,
        severity VARCHAR(20),
        photo_urls JSON,
        recommendation TEXT,
        resolved TINYINT(1) DEFAULT 0,
        created_at DATETIME DEFAULT NOW(),
        updated_at DATETIME DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE inspection_instruments (
        id VARCHAR(36) PRIMARY KEY ,
        inspection_id VARCHAR(36) NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
        instrument_id VARCHAR(36) NOT NULL,
        used_at DATETIME DEFAULT NOW(),
        created_at DATETIME DEFAULT NOW(),
        updated_at DATETIME DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_field_values_inspection ON inspection_field_values(inspection_id)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_photos_inspection ON inspection_photos(inspection_id)
    `);

    // ── Calibration ───────────────────────────────────────────────────────────
        await queryRunner.query(`
      CREATE TABLE measuring_instruments (
        id VARCHAR(36) PRIMARY KEY ,
        name VARCHAR(255) NOT NULL,
        inventory_code VARCHAR(100) UNIQUE NOT NULL,
        serial_number VARCHAR(100),
        brand VARCHAR(100),
        model VARCHAR(100),
        calibration_lab VARCHAR(255),
        last_calibration_date DATE,
        next_calibration_date DATE,
        certificate_url VARCHAR(500),
        certificate_number VARCHAR(100),
        status VARCHAR(50) DEFAULT 'active',
        notes TEXT,
        created_by_id VARCHAR(36) REFERENCES users(id),
        created_at DATETIME DEFAULT NOW(),
        updated_at DATETIME DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_instruments_next_cal ON measuring_instruments(next_calibration_date)
    `);

    // ── CAPA ──────────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE capa_records (
        id VARCHAR(36) PRIMARY KEY ,
        capa_number VARCHAR(50) UNIQUE NOT NULL,
        type VARCHAR(20) NOT NULL,
        status VARCHAR(30) DEFAULT 'open',
        severity VARCHAR(20) NOT NULL,
        nonconformity_description TEXT NOT NULL,
        source_type VARCHAR(50),
        source_id VARCHAR(36),
        root_cause_analysis TEXT,
        proposed_action TEXT,
        target_date DATE,
        assigned_to_id VARCHAR(36) REFERENCES users(id),
        implemented_action TEXT,
        implemented_at DATETIME,
        effectiveness_result TEXT,
        closed_at DATETIME,
        closed_by_id VARCHAR(36) REFERENCES users(id),
        attachments JSON,
        created_by_id VARCHAR(36) REFERENCES users(id),
        created_at DATETIME DEFAULT NOW(),
        updated_at DATETIME DEFAULT NOW()
      );
    `);

    // ── Complaints ────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE complaints (
        id VARCHAR(36) PRIMARY KEY ,
        complaint_number VARCHAR(50) UNIQUE NOT NULL,
        type VARCHAR(20) NOT NULL,
        status VARCHAR(30) DEFAULT 'received',
        customer_id VARCHAR(36) REFERENCES customers(id),
        report_id VARCHAR(36),
        inspection_id VARCHAR(36),
        subject VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        complainant_name VARCHAR(255),
        complainant_email VARCHAR(255),
        complainant_phone VARCHAR(50),
        assigned_to_id VARCHAR(36) REFERENCES users(id),
        investigation_notes TEXT,
        resolution TEXT,
        resolved_at DATETIME,
        closed_at DATETIME,
        closed_by_id VARCHAR(36) REFERENCES users(id),
        target_resolution_date DATE,
        attachments JSON,
        created_by_id VARCHAR(36) REFERENCES users(id),
        created_at DATETIME DEFAULT NOW(),
        updated_at DATETIME DEFAULT NOW()
      );
    `);

    // ── Internal Audit ────────────────────────────────────────────────────────
        await queryRunner.query(`
      CREATE TABLE internal_audit_plans (
        id VARCHAR(36) PRIMARY KEY ,
        audit_number VARCHAR(50) UNIQUE NOT NULL,
        title VARCHAR(255) NOT NULL,
        planned_date DATE NOT NULL,
        actual_date DATETIME,
        lead_auditor_id VARCHAR(36) REFERENCES users(id),
        audit_scope JSON,
        status VARCHAR(30) DEFAULT 'planned',
        objective TEXT,
        summary TEXT,
        created_by_id VARCHAR(36) REFERENCES users(id),
        created_at DATETIME DEFAULT NOW(),
        updated_at DATETIME DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE internal_audit_findings (
        id VARCHAR(36) PRIMARY KEY ,
        audit_plan_id VARCHAR(36) NOT NULL REFERENCES internal_audit_plans(id) ON DELETE CASCADE,
        finding_number VARCHAR(50) NOT NULL,
        severity VARCHAR(20) NOT NULL,
        status VARCHAR(20) DEFAULT 'open',
        clause VARCHAR(100),
        description TEXT NOT NULL,
        evidence_ref TEXT,
        corrective_action TEXT,
        target_date DATE,
        responsible_id VARCHAR(36) REFERENCES users(id),
        closed_at DATETIME,
        closed_by_id VARCHAR(36) REFERENCES users(id),
        created_at DATETIME DEFAULT NOW(),
        updated_at DATETIME DEFAULT NOW()
      )
    `);

    // ── Contracts + Quotations ────────────────────────────────────────────────
        await queryRunner.query(`
      CREATE TABLE contracts (
        id VARCHAR(36) PRIMARY KEY ,
        contract_number VARCHAR(50) UNIQUE NOT NULL,
        customer_id VARCHAR(36) NOT NULL REFERENCES customers(id),
        quotation_id UUID,
        version INT DEFAULT 1,
        status VARCHAR(20) DEFAULT 'draft',
        start_date DATE,
        end_date DATE,
        auto_renew TINYINT(1) DEFAULT 0,
        total_value DECIMAL(12,2),
        currency VARCHAR(10) DEFAULT 'TRY',
        document_url VARCHAR(500),
        signed_document_url VARCHAR(500),
        document_hash VARCHAR(255),
        customer_signed_at DATETIME,
        company_signed_at DATETIME,
        company_signed_by_id VARCHAR(36) REFERENCES users(id),
        notes TEXT,
        created_by_id VARCHAR(36) REFERENCES users(id),
        created_at DATETIME DEFAULT NOW(),
        updated_at DATETIME DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE quotations (
        id VARCHAR(36) PRIMARY KEY ,
        quote_number VARCHAR(50) UNIQUE NOT NULL,
        customer_id VARCHAR(36) NOT NULL REFERENCES customers(id),
        status VARCHAR(20) DEFAULT 'draft',
        valid_until DATE,
        total_amount DECIMAL(12,2) DEFAULT 0,
        currency VARCHAR(10) DEFAULT 'TRY',
        discount_rate DECIMAL(5,2) DEFAULT 0,
        sent_at DATETIME,
        accepted_at DATETIME,
        rejected_at DATETIME,
        rejection_reason TEXT,
        notes TEXT,
        created_by_id VARCHAR(36) REFERENCES users(id),
        created_at DATETIME DEFAULT NOW(),
        updated_at DATETIME DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE quotation_items (
        id VARCHAR(36) PRIMARY KEY ,
        quotation_id VARCHAR(36) NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
        equipment_type_id VARCHAR(36) REFERENCES equipment_types(id),
        description TEXT NOT NULL,
        quantity INT DEFAULT 1,
        unit_price DECIMAL(10,2) NOT NULL,
        discount_rate DECIMAL(5,2) DEFAULT 0,
        total_price DECIMAL(12,2) NOT NULL,
        service_code VARCHAR(50),
        created_at DATETIME DEFAULT NOW(),
        updated_at DATETIME DEFAULT NOW()
      )
    `);

    // ── Accreditation ─────────────────────────────────────────────────────────
        await queryRunner.query(`
      CREATE TABLE accreditation_scopes (
        id VARCHAR(36) PRIMARY KEY ,
        equipment_type_id VARCHAR(36) NOT NULL REFERENCES equipment_types(id),
        standard_code VARCHAR(50) NOT NULL,
        standard_name VARCHAR(255) NOT NULL,
        standard_revision VARCHAR(100),
        accredited_since DATE,
        valid_until DATE,
        is_active TINYINT(1) DEFAULT 1,
        accreditation_body_ref VARCHAR(100),
        created_at DATETIME DEFAULT NOW(),
        updated_at DATETIME DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE impartiality_declarations (
        id VARCHAR(36) PRIMARY KEY ,
        user_id VARCHAR(36) NOT NULL REFERENCES users(id),
        declaration_date DATE NOT NULL,
        conflicts_disclosed TEXT,
        has_conflict TINYINT(1) DEFAULT 0,
        document_url VARCHAR(500),
        created_at DATETIME DEFAULT NOW(),
        updated_at DATETIME DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE reference_documents (
        id VARCHAR(36) PRIMARY KEY ,
        code VARCHAR(100) NOT NULL,
        title VARCHAR(255) NOT NULL,
        revision VARCHAR(50) NOT NULL,
        published_date DATE,
        is_active TINYINT(1) DEFAULT 1,
        notes TEXT,
        created_at DATETIME DEFAULT NOW(),
        updated_at DATETIME DEFAULT NOW()
      )
    `);

    // ── Notifications + Inspector Qualifications ──────────────────────────────
        await queryRunner.query(`
      CREATE TABLE notifications (
        id VARCHAR(36) PRIMARY KEY ,
        recipient_id VARCHAR(36) REFERENCES users(id),
        customer_id VARCHAR(36) REFERENCES customers(id),
        type VARCHAR(100) NOT NULL,
        channel VARCHAR(20) NOT NULL,
        title VARCHAR(255) NOT NULL,
        body TEXT NOT NULL,
        metadata JSON,
        is_read TINYINT(1) DEFAULT 0,
        read_at DATETIME,
        status VARCHAR(20) DEFAULT 'pending',
        sent_at DATETIME,
        error_message TEXT,
        retry_count INT DEFAULT 0,
        created_at DATETIME DEFAULT NOW(),
        updated_at DATETIME DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_notifications_recipient ON notifications(recipient_id, is_read)
    `);
    await queryRunner.query(`
      CREATE TABLE inspector_qualifications (
        id VARCHAR(36) PRIMARY KEY ,
        user_id VARCHAR(36) NOT NULL REFERENCES users(id),
        equipment_type_id VARCHAR(36) REFERENCES equipment_types(id),
        certificate_name VARCHAR(255) NOT NULL,
        certificate_no VARCHAR(100),
        issuer VARCHAR(255),
        issue_date DATE,
        expiry_date DATE NOT NULL,
        document_url VARCHAR(500),
        status VARCHAR(20) DEFAULT 'active',
        created_at DATETIME DEFAULT NOW(),
        updated_at DATETIME DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_qual_user ON inspector_qualifications(user_id)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_qual_expiry ON inspector_qualifications(expiry_date)
    `);

    // ── Personnel + YGG ───────────────────────────────────────────────────────
        await queryRunner.query(`
      CREATE TABLE management_reviews (
        id VARCHAR(36) PRIMARY KEY ,
        review_number VARCHAR(50) UNIQUE NOT NULL,
        review_date DATE NOT NULL,
        attendees JSON,
        agenda TEXT,
        input_items TEXT,
        output_decisions TEXT,
        action_items JSON,
        minutes_document_url VARCHAR(500),
        created_by_id VARCHAR(36) REFERENCES users(id),
        created_at DATETIME DEFAULT NOW(),
        updated_at DATETIME DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE personnel_documents (
        id VARCHAR(36) PRIMARY KEY ,
        user_id VARCHAR(36) NOT NULL REFERENCES users(id),
        document_type VARCHAR(50) NOT NULL,
        document_name VARCHAR(255) NOT NULL,
        file_url VARCHAR(500),
        valid_until DATE,
        uploaded_by_id VARCHAR(36) REFERENCES users(id),
        created_at DATETIME DEFAULT NOW(),
        updated_at DATETIME DEFAULT NOW()
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS = 0`);
    const tables = [
      'personnel_documents', 'management_reviews',
      'inspector_qualifications', 'notifications',
      'reference_documents', 'impartiality_declarations', 'accreditation_scopes',
      'quotation_items', 'quotations', 'contracts',
      'internal_audit_findings', 'internal_audit_plans',
      'complaints', 'capa_records', 'measuring_instruments',
      'inspection_instruments', 'inspection_nonconformities',
      'inspection_photos', 'inspection_field_values',
      'work_order_equipment', 'work_orders',
    ];
    for (const t of tables) {
      await queryRunner.query(`DROP TABLE IF EXISTS \`${t}\``);
    }
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS = 1`);
  }
}

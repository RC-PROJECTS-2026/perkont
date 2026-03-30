import { MigrationInterface, QueryRunner } from 'typeorm';

export class NewModulesV31700000000002 implements MigrationInterface {
  name = 'NewModulesV31700000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
      -- ── Taşeron ──────────────────────────────────────────────────────────────
      CREATE TABLE subcontractors (
        id VARCHAR(36) PRIMARY KEY ,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(20) DEFAULT 'company',
        tax_number VARCHAR(20),
        contact_name VARCHAR(255),
        contact_email VARCHAR(255),
        contact_phone VARCHAR(50),
        city VARCHAR(100),
        qualifications JSON,
        certificates JSON,
        status VARCHAR(20) DEFAULT 'active',
        contract_start DATE,
        contract_end DATE,
        contract_url VARCHAR(500),
        notes TEXT,
        created_by_id VARCHAR(36) REFERENCES users(id),
        created_at DATETIME DEFAULT NOW(),
        updated_at DATETIME DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE subcontractor_assignments (
        id VARCHAR(36) PRIMARY KEY ,
        subcontractor_id VARCHAR(36) NOT NULL REFERENCES subcontractors(id),
        work_order_id VARCHAR(36) REFERENCES work_orders(id),
        inspection_id VARCHAR(36) REFERENCES inspections(id),
        status VARCHAR(20) DEFAULT 'planned',
        scope TEXT,
        agreed_amount DECIMAL(10,2),
        assigned_by_id VARCHAR(36) REFERENCES users(id),
        completed_at DATETIME,
        completion_notes TEXT,
        performance_score DECIMAL(3,1),
        created_at DATETIME DEFAULT NOW(),
        updated_at DATETIME DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_subcontractor_assignments_wo ON subcontractor_assignments(work_order_id)
    `);
    await queryRunner.query(`
      -- ── Risk Yönetimi ─────────────────────────────────────────────────────────
      CREATE TABLE risk_register (
        id VARCHAR(36) PRIMARY KEY ,
        risk_number VARCHAR(50) UNIQUE NOT NULL,
        category VARCHAR(30) NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        likelihood INT NOT NULL CHECK (likelihood BETWEEN 1 AND 5),
        impact INT NOT NULL CHECK (impact BETWEEN 1 AND 5),
        treatment VARCHAR(20),
        mitigation_plan TEXT,
        responsible_id VARCHAR(36) REFERENCES users(id),
        target_date DATE,
        residual_likelihood INT,
        residual_impact INT,
        status VARCHAR(20) DEFAULT 'open',
        review_date DATETIME,
        notes TEXT,
        created_by_id VARCHAR(36) REFERENCES users(id),
        created_at DATETIME DEFAULT NOW(),
        updated_at DATETIME DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_risk_category_status ON risk_register(category, status)
    `);
    await queryRunner.query(`
      -- ── SLA ───────────────────────────────────────────────────────────────────
      CREATE TABLE sla_definitions (
        id VARCHAR(36) PRIMARY KEY ,
        contract_id VARCHAR(36) REFERENCES contracts(id),
        customer_id VARCHAR(36) REFERENCES customers(id),
        name VARCHAR(255) NOT NULL,
        report_delivery_days INT DEFAULT 5,
        invoicing_days INT DEFAULT 10,
        revision_response_days INT DEFAULT 3,
        complaint_resolution_days INT DEFAULT 30,
        is_active TINYINT(1) DEFAULT 1,
        created_by_id VARCHAR(36) REFERENCES users(id),
        created_at DATETIME DEFAULT NOW(),
        updated_at DATETIME DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE sla_tracking (
        id VARCHAR(36) PRIMARY KEY ,
        sla_definition_id VARCHAR(36) REFERENCES sla_definitions(id),
        entity_type VARCHAR(50) NOT NULL,
        entity_id VARCHAR(36) NOT NULL,
        metric_name VARCHAR(50) NOT NULL,
        start_date DATETIME NOT NULL,
        due_date DATETIME NOT NULL,
        completed_date DATETIME,
        status VARCHAR(20) DEFAULT 'active',
        days_elapsed INT,
        days_remaining INT,
        notification_sent TINYINT(1) DEFAULT 0,
        customer_id VARCHAR(36) REFERENCES customers(id),
        created_at DATETIME DEFAULT NOW(),
        updated_at DATETIME DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_sla_entity ON sla_tracking(entity_type, entity_id)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_sla_status ON sla_tracking(status)
    `);
    await queryRunner.query(`
      -- ── Depolama Kotası ───────────────────────────────────────────────────────
      CREATE TABLE storage_usage_snapshots (
        id VARCHAR(36) PRIMARY KEY ,
        bucket VARCHAR(100) NOT NULL,
        used_bytes BIGINT NOT NULL,
        quota_bytes BIGINT NOT NULL,
        usage_percent INT NOT NULL,
        file_count INT NOT NULL,
        snapshot_date DATE NOT NULL,
        notes TEXT,
        created_at DATETIME DEFAULT NOW(),
        updated_at DATETIME DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_storage_snapshot ON storage_usage_snapshots(bucket, snapshot_date)
    `);
    await queryRunner.query(`
      -- ── Cihaz Yönetimi ────────────────────────────────────────────────────────
      CREATE TABLE mobile_devices (
        id VARCHAR(36) PRIMARY KEY ,
        device_id VARCHAR(255) UNIQUE NOT NULL,
        user_id VARCHAR(36) NOT NULL REFERENCES users(id),
        device_name VARCHAR(255),
        device_model VARCHAR(255),
        platform VARCHAR(20) NOT NULL,
        os_version VARCHAR(50),
        app_version VARCHAR(20),
        build_number VARCHAR(20),
        push_token VARCHAR(500),
        status VARCHAR(20) DEFAULT 'active',
        last_seen_at DATETIME,
        last_sync_at DATETIME,
        ip_address VARCHAR(50),
        blocked_reason TEXT,
        blocked_at DATETIME,
        created_at DATETIME DEFAULT NOW(),
        updated_at DATETIME DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_mobile_devices_user ON mobile_devices(user_id)
    `);
    await queryRunner.query(`
      CREATE TABLE app_versions (
        id VARCHAR(36) PRIMARY KEY ,
        version VARCHAR(20) NOT NULL,
        build_number VARCHAR(20) NOT NULL,
        platform VARCHAR(20) NOT NULL,
        is_force_update TINYINT(1) DEFAULT 0,
        is_latest TINYINT(1) DEFAULT 0,
        release_notes TEXT,
        download_url VARCHAR(500),
        minimum_os_version VARCHAR(20),
        released_at DATETIME,
        created_at DATETIME DEFAULT NOW(),
        updated_at DATETIME DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE device_logs (
        id VARCHAR(36) PRIMARY KEY ,
        device_id VARCHAR(255) NOT NULL,
        action VARCHAR(100) NOT NULL,
        metadata JSON,
        error_message TEXT,
        created_at DATETIME DEFAULT NOW(),
        updated_at DATETIME DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_device_logs ON device_logs(device_id, created_at)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS = 0`);
    const tables = [
      'device_logs', 'app_versions', 'mobile_devices',
      'storage_usage_snapshots',
      'sla_tracking', 'sla_definitions',
      'risk_register',
      'subcontractor_assignments', 'subcontractors',
    ];
    for (const t of tables) {
      await queryRunner.query(`DROP TABLE IF EXISTS \`${t}\``);
    }
    await queryRunner.query(`SET FOREIGN_KEY_CHECKS = 1`);
  }
}

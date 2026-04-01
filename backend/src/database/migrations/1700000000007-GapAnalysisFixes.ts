import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Gap Analysis kapsaminda tespit edilen eksik alan ve tablolarin eklenmesi.
 *
 * Kapsam:
 * - Customer: ticaret sicil, NACE, KEP, MERSIS, risk, segment, imza sirkuleri
 * - Location: ulasim tarifi, guvenlik, saha sorumlusu, calisma saatleri, risk, tip
 * - Equipment: risk sinifi, CE, bakim, imalat belgesi, pasif nedeni
 * - Work Order: postponed status, musteri irtibat, erteleme bilgisi
 * - Inspection: denetlenemedi durumu, musteri teyit, sure, erteleme
 * - Report: teslim teyidi
 * - Yeni tablolar: contract_scope_items, pricing_tariffs, impartiality_declarations,
 *   management_reviews, personnel_authorizations, personnel_trainings,
 *   process_checklists, checklist_items, delivery_confirmations, contract_addendums,
 *   site_confirmations
 */
export class GapAnalysisFixes1700000000007 implements MigrationInterface {
  name = 'GapAnalysisFixes1700000000007';

  public async up(queryRunner: QueryRunner): Promise<void> {

    // ═══════════════════════════════════════════════════════════════
    // CUSTOMER — Eksik Alanlar
    // ═══════════════════════════════════════════════════════════════
    await queryRunner.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS tradeRegisterNo VARCHAR(100) NULL COMMENT 'Ticaret sicil numarasi'`);
    await queryRunner.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS naceCode VARCHAR(20) NULL COMMENT 'NACE faaliyet kodu'`);
    await queryRunner.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS kepAddress VARCHAR(255) NULL COMMENT 'KEP adresi'`);
    await queryRunner.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS mersisNo VARCHAR(50) NULL COMMENT 'MERSIS numarasi'`);
    await queryRunner.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS authorizedPersonTc VARCHAR(11) NULL COMMENT 'Yetkili kisi TC kimlik'`);
    await queryRunner.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS signatureCircularUrl VARCHAR(500) NULL COMMENT 'Imza sirkuleri dosya URL'`);
    await queryRunner.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS riskLevel VARCHAR(20) DEFAULT 'normal' COMMENT 'Ticari risk: low/normal/high'`);
    await queryRunner.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS segment VARCHAR(20) DEFAULT 'standard' COMMENT 'Musteri segmenti: enterprise/mid/standard/small'`);
    await queryRunner.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS customerType VARCHAR(50) NULL COMMENT 'Musteri turu: uretim/hizmet/insaat/enerji vb.'`);

    // ═══════════════════════════════════════════════════════════════
    // LOCATION — Eksik Alanlar
    // ═══════════════════════════════════════════════════════════════
    await queryRunner.query(`ALTER TABLE customer_locations ADD COLUMN IF NOT EXISTS directions TEXT NULL COMMENT 'Ulasim tarifi / yol tarifi'`);
    await queryRunner.query(`ALTER TABLE customer_locations ADD COLUMN IF NOT EXISTS securityProcedure TEXT NULL COMMENT 'Giris izni / guvenlik proseduru'`);
    await queryRunner.query(`ALTER TABLE customer_locations ADD COLUMN IF NOT EXISTS siteContactName VARCHAR(255) NULL COMMENT 'Saha sorumlusu adi'`);
    await queryRunner.query(`ALTER TABLE customer_locations ADD COLUMN IF NOT EXISTS siteContactPhone VARCHAR(50) NULL COMMENT 'Saha sorumlusu telefonu'`);
    await queryRunner.query(`ALTER TABLE customer_locations ADD COLUMN IF NOT EXISTS workingHours VARCHAR(100) NULL COMMENT 'Calisma/erisim saatleri'`);
    await queryRunner.query(`ALTER TABLE customer_locations ADD COLUMN IF NOT EXISTS riskNotes TEXT NULL COMMENT 'Ozel risk notlari (kimyasal, yukseklik vb.)'`);
    await queryRunner.query(`ALTER TABLE customer_locations ADD COLUMN IF NOT EXISTS locationType VARCHAR(50) DEFAULT 'factory' COMMENT 'Tip: factory/office/construction/mall/warehouse'`);
    await queryRunner.query(`ALTER TABLE customer_locations ADD COLUMN IF NOT EXISTS photoUrl VARCHAR(500) NULL COMMENT 'Lokasyon genel gorunum fotografi'`);

    // ═══════════════════════════════════════════════════════════════
    // EQUIPMENT — Eksik Alanlar
    // ═══════════════════════════════════════════════════════════════
    await queryRunner.query(`ALTER TABLE equipment ADD COLUMN IF NOT EXISTS riskClass VARCHAR(20) DEFAULT 'standard' COMMENT 'Risk sinifi: low/standard/high/critical'`);
    await queryRunner.query(`ALTER TABLE equipment ADD COLUMN IF NOT EXISTS ceDocumentUrl VARCHAR(500) NULL COMMENT 'CE belgesi dosya URL'`);
    await queryRunner.query(`ALTER TABLE equipment ADD COLUMN IF NOT EXISTS ceDocumentNo VARCHAR(100) NULL COMMENT 'CE belge numarasi'`);
    await queryRunner.query(`ALTER TABLE equipment ADD COLUMN IF NOT EXISTS hasMaintenanceContract TINYINT(1) DEFAULT 0 COMMENT 'Bakim sozlesmesi var mi'`);
    await queryRunner.query(`ALTER TABLE equipment ADD COLUMN IF NOT EXISTS maintenanceCompany VARCHAR(255) NULL COMMENT 'Bakimci firma'`);
    await queryRunner.query(`ALTER TABLE equipment ADD COLUMN IF NOT EXISTS lastMaintenanceDate DATE NULL COMMENT 'Son bakim tarihi'`);
    await queryRunner.query(`ALTER TABLE equipment ADD COLUMN IF NOT EXISTS manufacturingDocUrl VARCHAR(500) NULL COMMENT 'Imalat belgesi / tip onay URL'`);
    await queryRunner.query(`ALTER TABLE equipment ADD COLUMN IF NOT EXISTS deactivationReason TEXT NULL COMMENT 'Pasife alinma nedeni'`);
    await queryRunner.query(`ALTER TABLE equipment ADD COLUMN IF NOT EXISTS previousReportNo VARCHAR(100) NULL COMMENT 'Onceki kurulustan rapor numarasi'`);
    await queryRunner.query(`ALTER TABLE equipment ADD COLUMN IF NOT EXISTS floor VARCHAR(50) NULL COMMENT 'Kat / blok / daire bilgisi'`);
    await queryRunner.query(`ALTER TABLE equipment ADD COLUMN IF NOT EXISTS specialAccessNotes TEXT NULL COMMENT 'Erisim / ozel kosul notlari'`);

    // ═══════════════════════════════════════════════════════════════
    // WORK ORDER — Erteleme + Irtibat
    // ═══════════════════════════════════════════════════════════════
    await queryRunner.query(`ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS customerContactName VARCHAR(255) NULL COMMENT 'Sahada irtibat kisi'`);
    await queryRunner.query(`ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS customerContactPhone VARCHAR(50) NULL`);
    await queryRunner.query(`ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS postponedAt DATETIME NULL`);
    await queryRunner.query(`ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS postponeReason TEXT NULL`);
    await queryRunner.query(`ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS rescheduleDate DATE NULL`);
    await queryRunner.query(`ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS specialInstructions TEXT NULL COMMENT 'Sahaya ozel talimatlar'`);

    // ═══════════════════════════════════════════════════════════════
    // INSPECTION — Erteleme/iptal + saha teyit + sure
    // ═══════════════════════════════════════════════════════════════
    await queryRunner.query(`ALTER TABLE inspections ADD COLUMN IF NOT EXISTS postponeReason TEXT NULL`);
    await queryRunner.query(`ALTER TABLE inspections ADD COLUMN IF NOT EXISTS postponedAt DATETIME NULL`);
    await queryRunner.query(`ALTER TABLE inspections ADD COLUMN IF NOT EXISTS customerSignatureUrl VARCHAR(500) NULL COMMENT 'Musteri saha teyit imzasi'`);
    await queryRunner.query(`ALTER TABLE inspections ADD COLUMN IF NOT EXISTS customerSignedBy VARCHAR(255) NULL COMMENT 'Teyit imzalayan kisi'`);
    await queryRunner.query(`ALTER TABLE inspections ADD COLUMN IF NOT EXISTS customerSignedAt DATETIME NULL`);
    await queryRunner.query(`ALTER TABLE inspections ADD COLUMN IF NOT EXISTS durationMinutes INT NULL COMMENT 'Denetim suresi (dakika)'`);
    await queryRunner.query(`ALTER TABLE inspections ADD COLUMN IF NOT EXISTS startTime DATETIME NULL`);
    await queryRunner.query(`ALTER TABLE inspections ADD COLUMN IF NOT EXISTS endTime DATETIME NULL`);

    // ═══════════════════════════════════════════════════════════════
    // REPORT — Teslim teyidi
    // ═══════════════════════════════════════════════════════════════
    await queryRunner.query(`ALTER TABLE reports ADD COLUMN IF NOT EXISTS deliveryConfirmedAt DATETIME NULL`);
    await queryRunner.query(`ALTER TABLE reports ADD COLUMN IF NOT EXISTS deliveryConfirmedBy VARCHAR(255) NULL`);
    await queryRunner.query(`ALTER TABLE reports ADD COLUMN IF NOT EXISTS deliveryConfirmationMethod VARCHAR(50) NULL COMMENT 'email_confirm/portal_download/physical_signature'`);

    // ═══════════════════════════════════════════════════════════════
    // PROPOSALS — Ekipman eslesmesi
    // ═══════════════════════════════════════════════════════════════
    await queryRunner.query(`ALTER TABLE proposal_items ADD COLUMN IF NOT EXISTS equipmentIds JSON NULL COMMENT 'Bu kaleme ait ekipman ID listesi'`);
    await queryRunner.query(`ALTER TABLE proposal_items ADD COLUMN IF NOT EXISTS equipmentTypeId VARCHAR(36) NULL COMMENT 'Ekipman tipi referansi'`);

    // ═══════════════════════════════════════════════════════════════
    // CONTRACT — Ek sartname + kapsam
    // ═══════════════════════════════════════════════════════════════
    await queryRunner.query(`ALTER TABLE contract_documents ADD COLUMN IF NOT EXISTS specialTerms TEXT NULL COMMENT 'Ozel sartlar / ek protokol'`);
    await queryRunner.query(`ALTER TABLE contract_documents ADD COLUMN IF NOT EXISTS scopeDescription TEXT NULL COMMENT 'Kapsam aciklamasi'`);

    // ═══════════════════════════════════════════════════════════════
    // YENİ TABLO: contract_scope_items
    // ═══════════════════════════════════════════════════════════════
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS contract_scope_items (
        id VARCHAR(36) PRIMARY KEY,
        contractId VARCHAR(36) NOT NULL,
        equipmentTypeId VARCHAR(36) NOT NULL,
        locationId VARCHAR(36) NULL,
        equipmentCount INT DEFAULT 0 COMMENT 'Bu tip+lokasyondaki ekipman sayisi',
        unitPrice DECIMAL(12,2) DEFAULT 0 COMMENT 'Birim fiyat',
        currency VARCHAR(10) DEFAULT 'TRY',
        controlPeriodMonths INT NULL COMMENT 'Kontrol periyodu (ay)',
        notes TEXT NULL,
        createdAt DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
        updatedAt DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        INDEX idx_scope_contract (contractId),
        INDEX idx_scope_eqtype (equipmentTypeId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ═══════════════════════════════════════════════════════════════
    // YENİ TABLO: pricing_tariffs
    // ═══════════════════════════════════════════════════════════════
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS pricing_tariffs (
        id VARCHAR(36) PRIMARY KEY,
        equipmentTypeId VARCHAR(36) NOT NULL,
        name VARCHAR(255) NOT NULL,
        basePrice DECIMAL(12,2) NOT NULL COMMENT 'Temel birim fiyat',
        currency VARCHAR(10) DEFAULT 'TRY',
        validFrom DATE NOT NULL,
        validUntil DATE NULL,
        isActive TINYINT(1) DEFAULT 1,
        notes TEXT NULL,
        createdById VARCHAR(36) NULL,
        createdAt DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
        updatedAt DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        INDEX idx_tariff_type (equipmentTypeId, isActive),
        INDEX idx_tariff_valid (validFrom, validUntil)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ═══════════════════════════════════════════════════════════════
    // YENİ TABLO: impartiality_declarations
    // ═══════════════════════════════════════════════════════════════
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS impartiality_declarations (
        id VARCHAR(36) PRIMARY KEY,
        userId VARCHAR(36) NOT NULL,
        customerId VARCHAR(36) NULL COMMENT 'Belirli musteri icin NULL ise genel',
        declarationYear INT NOT NULL,
        status VARCHAR(20) DEFAULT 'pending' COMMENT 'pending/signed/expired',
        signedAt DATETIME NULL,
        documentUrl VARCHAR(500) NULL,
        notes TEXT NULL,
        createdAt DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
        updatedAt DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        UNIQUE KEY uk_user_year (userId, declarationYear, customerId),
        INDEX idx_imp_user (userId),
        INDEX idx_imp_status (status, declarationYear)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ═══════════════════════════════════════════════════════════════
    // YENİ TABLO: management_reviews (YGG)
    // ═══════════════════════════════════════════════════════════════
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS management_reviews (
        id VARCHAR(36) PRIMARY KEY,
        reviewNumber VARCHAR(50) NOT NULL UNIQUE,
        reviewDate DATE NOT NULL,
        meetingDate DATE NULL,
        status VARCHAR(20) DEFAULT 'draft' COMMENT 'draft/completed/approved',
        period VARCHAR(50) NOT NULL COMMENT 'Donem: 2025-H1, 2025-Q3 vb.',
        attendees JSON NULL COMMENT '[{name, role, present}]',
        agendaItems JSON NULL COMMENT '[{title, notes, decision}]',
        inputData JSON NULL COMMENT 'Girdi verileri: sikayet, CAPA, tetkik, performans',
        decisions JSON NULL COMMENT '[{description, responsible, deadline, status}]',
        actionItems JSON NULL COMMENT '[{description, assignee, dueDate, completedAt}]',
        minutesDocUrl VARCHAR(500) NULL COMMENT 'Toplanti tutanagi dosyasi',
        approvedById VARCHAR(36) NULL,
        approvedAt DATETIME NULL,
        createdById VARCHAR(36) NOT NULL,
        createdAt DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
        updatedAt DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        INDEX idx_ygg_status (status),
        INDEX idx_ygg_date (reviewDate)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ═══════════════════════════════════════════════════════════════
    // YENİ TABLO: personnel_authorizations
    // ═══════════════════════════════════════════════════════════════
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS personnel_authorizations (
        id VARCHAR(36) PRIMARY KEY,
        userId VARCHAR(36) NOT NULL,
        equipmentTypeId VARCHAR(36) NOT NULL,
        authorizationLevel VARCHAR(20) DEFAULT 'authorized' COMMENT 'trainee/authorized/senior',
        grantedById VARCHAR(36) NOT NULL,
        grantedAt DATE NOT NULL,
        expiresAt DATE NULL,
        isActive TINYINT(1) DEFAULT 1,
        documentUrl VARCHAR(500) NULL COMMENT 'Yetkilendirme karar belgesi',
        notes TEXT NULL,
        createdAt DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
        updatedAt DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        UNIQUE KEY uk_user_eqtype (userId, equipmentTypeId),
        INDEX idx_auth_user (userId, isActive),
        INDEX idx_auth_type (equipmentTypeId, isActive)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ═══════════════════════════════════════════════════════════════
    // YENİ TABLO: personnel_trainings
    // ═══════════════════════════════════════════════════════════════
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS personnel_trainings (
        id VARCHAR(36) PRIMARY KEY,
        userId VARCHAR(36) NOT NULL,
        trainingType VARCHAR(50) NOT NULL COMMENT 'internal/external/onthejob/certification',
        title VARCHAR(255) NOT NULL,
        provider VARCHAR(255) NULL,
        startDate DATE NOT NULL,
        endDate DATE NULL,
        durationHours DECIMAL(5,1) NULL,
        result VARCHAR(20) DEFAULT 'completed' COMMENT 'completed/failed/ongoing',
        certificateUrl VARCHAR(500) NULL,
        certificateNo VARCHAR(100) NULL,
        notes TEXT NULL,
        createdById VARCHAR(36) NULL,
        createdAt DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
        updatedAt DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        INDEX idx_train_user (userId),
        INDEX idx_train_type (trainingType)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ═══════════════════════════════════════════════════════════════
    // YENİ TABLO: process_checklists (genel checklist sistemi)
    // ═══════════════════════════════════════════════════════════════
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS process_checklists (
        id VARCHAR(36) PRIMARY KEY,
        entityType VARCHAR(50) NOT NULL COMMENT 'work_order/contract/invoice_batch/report/inspection',
        entityId VARCHAR(36) NOT NULL,
        checklistType VARCHAR(50) NOT NULL COMMENT 'handover/pre_field/post_inspection/pre_report/pre_invoice/accreditation',
        status VARCHAR(20) DEFAULT 'open' COMMENT 'open/completed/blocked',
        completedAt DATETIME NULL,
        completedById VARCHAR(36) NULL,
        notes TEXT NULL,
        createdAt DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
        updatedAt DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        INDEX idx_cl_entity (entityType, entityId),
        INDEX idx_cl_type (checklistType, status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS checklist_items (
        id VARCHAR(36) PRIMARY KEY,
        checklistId VARCHAR(36) NOT NULL,
        label VARCHAR(500) NOT NULL,
        isRequired TINYINT(1) DEFAULT 1,
        isChecked TINYINT(1) DEFAULT 0,
        checkedAt DATETIME NULL,
        checkedById VARCHAR(36) NULL,
        notes TEXT NULL,
        orderIndex INT DEFAULT 0,
        createdAt DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
        INDEX idx_ci_checklist (checklistId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ═══════════════════════════════════════════════════════════════
    // YENİ TABLO: delivery_confirmations
    // ═══════════════════════════════════════════════════════════════
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS delivery_confirmations (
        id VARCHAR(36) PRIMARY KEY,
        reportId VARCHAR(36) NOT NULL,
        customerId VARCHAR(36) NOT NULL,
        method VARCHAR(50) NOT NULL COMMENT 'email_link/portal_download/physical/courier',
        confirmedAt DATETIME NULL,
        confirmedBy VARCHAR(255) NULL COMMENT 'Teslim alan kisi',
        confirmedIp VARCHAR(50) NULL,
        signatureUrl VARCHAR(500) NULL COMMENT 'Fiziksel teslim imzasi',
        trackingInfo VARCHAR(255) NULL COMMENT 'Kargo takip no',
        notes TEXT NULL,
        createdAt DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
        INDEX idx_dc_report (reportId),
        INDEX idx_dc_customer (customerId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ═══════════════════════════════════════════════════════════════
    // YENİ TABLO: site_confirmations (musteri saha teyit)
    // ═══════════════════════════════════════════════════════════════
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS site_confirmations (
        id VARCHAR(36) PRIMARY KEY,
        workOrderId VARCHAR(36) NOT NULL,
        inspectorId VARCHAR(36) NOT NULL,
        customerId VARCHAR(36) NOT NULL,
        customerRepName VARCHAR(255) NOT NULL COMMENT 'Musteri temsilcisi adi',
        customerRepTitle VARCHAR(100) NULL COMMENT 'Unvani',
        signatureUrl VARCHAR(500) NULL COMMENT 'Dijital imza',
        confirmedAt DATETIME NOT NULL,
        equipmentInspected INT DEFAULT 0 COMMENT 'Denetlenen ekipman sayisi',
        equipmentPostponed INT DEFAULT 0 COMMENT 'Ertelenen ekipman sayisi',
        notes TEXT NULL,
        createdAt DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
        INDEX idx_sc_wo (workOrderId),
        INDEX idx_sc_customer (customerId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ═══════════════════════════════════════════════════════════════
    // YENİ TABLO: contract_addendums (ek sartname/protokol)
    // ═══════════════════════════════════════════════════════════════
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS contract_addendums (
        id VARCHAR(36) PRIMARY KEY,
        contractId VARCHAR(36) NOT NULL,
        title VARCHAR(255) NOT NULL,
        type VARCHAR(50) NOT NULL COMMENT 'amendment/addendum/protocol/special_terms',
        content TEXT NULL,
        documentUrl VARCHAR(500) NULL,
        effectiveDate DATE NULL,
        signedAt DATETIME NULL,
        status VARCHAR(20) DEFAULT 'draft' COMMENT 'draft/signed/cancelled',
        createdById VARCHAR(36) NULL,
        createdAt DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
        updatedAt DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        INDEX idx_ca_contract (contractId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ═══════════════════════════════════════════════════════════════
    // YENİ TABLO: document_control (dokuman kontrol proseduru)
    // ═══════════════════════════════════════════════════════════════
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS controlled_documents (
        id VARCHAR(36) PRIMARY KEY,
        code VARCHAR(50) NOT NULL UNIQUE COMMENT 'PR-01, TL-05, FR-12',
        title VARCHAR(255) NOT NULL,
        type VARCHAR(50) NOT NULL COMMENT 'procedure/instruction/form/record/policy',
        currentRevision VARCHAR(20) NOT NULL DEFAULT 'Rev.00',
        revisionDate DATE NOT NULL,
        status VARCHAR(20) DEFAULT 'draft' COMMENT 'draft/active/superseded/cancelled',
        scope TEXT NULL COMMENT 'Kapsam aciklamasi',
        documentUrl VARCHAR(500) NULL,
        approvedById VARCHAR(36) NULL,
        approvedAt DATETIME NULL,
        supersededById VARCHAR(36) NULL,
        retentionYears INT DEFAULT 5,
        createdById VARCHAR(36) NOT NULL,
        createdAt DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
        updatedAt DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        INDEX idx_cd_status (status, type),
        INDEX idx_cd_code (code)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Inspection result'a "not_inspected" ekle
    await queryRunner.query(`ALTER TABLE inspections MODIFY COLUMN overallResult VARCHAR(50) NULL`);
    // not_inspected degerini kabul edebilmesi icin enum yerine varchar

    // WO status'a POSTPONED ekle — mevcut enum kontrolu uygulama seviyesinde
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Yeni tablolari kaldir
    const tables = [
      'controlled_documents', 'contract_addendums', 'site_confirmations',
      'delivery_confirmations', 'checklist_items', 'process_checklists',
      'personnel_trainings', 'personnel_authorizations', 'management_reviews',
      'impartiality_declarations', 'pricing_tariffs', 'contract_scope_items',
    ];
    for (const t of tables) {
      await queryRunner.query(`DROP TABLE IF EXISTS ${t}`);
    }
    // Kolon geri almalari burada yapilabilir ama riskli — production'da down migration calismaz
  }
}

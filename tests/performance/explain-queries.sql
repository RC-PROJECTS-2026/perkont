-- ============================================================
-- PerKont SQL Performance Checklist
-- ============================================================
-- Bu dosya buyuk veri altinda (10K musteri, 500K ekipman)
-- yavas calismasi beklenen tum kritik sorgulari EXPLAIN ile analiz eder.
--
-- Kullanim:
--   mysql -u root -p perkont_test < tests/performance/explain-queries.sql
--
-- Hedef: Her sorgu icin
--   - type: ALL (full table scan) OLMAMALI
--   - rows: gercek ihtiyactan 10x fazla OLMAMALI
--   - Extra: Using filesort veya Using temporary MINIMUM olmali
-- ============================================================

-- ============================================================
-- 1. MUSTERI SORGULARI
-- ============================================================

-- C09: Musteri listeleme (paginated)
EXPLAIN SELECT * FROM customers
WHERE isActive = 1
ORDER BY name ASC
LIMIT 20 OFFSET 0;

-- C05: Musteri arama (isim)
EXPLAIN SELECT * FROM customers
WHERE isActive = 1
  AND (name LIKE '%Metal%' OR code LIKE '%Metal%')
ORDER BY name ASC
LIMIT 20;

-- Tenant izolasyonu ile musteri listeleme
EXPLAIN SELECT * FROM customers
WHERE companyId = 'test-company-id'
  AND isActive = 1
ORDER BY name ASC
LIMIT 20;

-- ============================================================
-- 2. EKIPMAN SORGULARI
-- ============================================================

-- E06: Ekipman arama (500K kayit)
EXPLAIN SELECT e.*, et.name as typeName, c.name as customerName
FROM equipment e
LEFT JOIN equipment_types et ON e.equipmentTypeId = et.id
LEFT JOIN customers c ON e.customerId = c.id
WHERE e.isActive = 1
  AND (e.name LIKE '%Vinc%' OR e.inventoryCode LIKE '%Vinc%')
ORDER BY e.name ASC
LIMIT 20;

-- E07: Belirli musterinin ekipmanlari (WO olusturmada)
EXPLAIN SELECT e.* FROM equipment e
WHERE e.customerId = 'test-customer-id'
  AND e.isActive = 1
ORDER BY e.name ASC
LIMIT 50;

-- E08: Kontrol tarihi yaklasan ekipmanlar
EXPLAIN SELECT e.*, c.name as customerName, cl.name as locationName
FROM equipment e
JOIN customers c ON e.customerId = c.id
JOIN customer_locations cl ON e.locationId = cl.id
WHERE e.nextControlDate BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 60 DAY)
  AND e.isActive = 1
ORDER BY e.nextControlDate ASC
LIMIT 50;

-- Lokasyondaki ekipman sayisi
EXPLAIN SELECT locationId, COUNT(*) as cnt
FROM equipment
WHERE customerId = 'test-customer-id'
  AND isActive = 1
GROUP BY locationId;

-- ============================================================
-- 3. IS EMRI SORGULARI
-- ============================================================

-- W08: Is emri listeleme (100K kayit)
EXPLAIN SELECT wo.*, c.name as customerName
FROM work_orders wo
JOIN customers c ON wo.customerId = c.id
WHERE wo.status IN ('draft', 'planned', 'assigned')
ORDER BY wo.plannedDate ASC
LIMIT 20;

-- Inspector'un is emirleri
EXPLAIN SELECT wo.* FROM work_orders wo
WHERE wo.inspectorId = 'test-inspector-id'
  AND wo.status IN ('assigned', 'in_progress')
ORDER BY wo.plannedDate ASC;

-- N+1 KONTROL: Is emri detayi + ekipmanlar
EXPLAIN SELECT woe.*, e.name as equipmentName, e.inventoryCode
FROM work_order_equipment woe
JOIN equipment e ON woe.equipmentId = e.id
WHERE woe.workOrderId = 'test-wo-id';

-- ============================================================
-- 4. DENETIM SORGULARI
-- ============================================================

-- I12: Denetim listeleme (200K kayit)
EXPLAIN SELECT i.*, e.name as equipmentName, wo.orderNumber
FROM inspections i
JOIN equipment e ON i.equipmentId = e.id
JOIN work_orders wo ON i.workOrderId = wo.id
WHERE i.status = 'approved'
ORDER BY i.inspectionDate DESC
LIMIT 20;

-- Inspector'un denetimleri
EXPLAIN SELECT i.* FROM inspections i
WHERE i.inspectorId = 'test-inspector-id'
  AND i.status IN ('in_progress', 'completed')
ORDER BY i.inspectionDate DESC;

-- Acik denetim kontrolu (duplicate prevention)
EXPLAIN SELECT COUNT(*) FROM inspections
WHERE equipmentId = 'test-equipment-id'
  AND inspectorId = 'test-inspector-id'
  AND status = 'in_progress';

-- ============================================================
-- 5. RAPOR SORGULARI
-- ============================================================

-- R12: Rapor listeleme (200K kayit)
EXPLAIN SELECT r.*, i.overallResult, e.name as equipmentName
FROM reports r
JOIN inspections i ON r.inspectionId = i.id
JOIN equipment e ON i.equipmentId = e.id
WHERE r.status IN ('signed', 'delivered')
ORDER BY r.createdAt DESC
LIMIT 20;

-- Onay bekleyen raporlar (TM dashboard)
EXPLAIN SELECT r.* FROM reports r
WHERE r.status = 'under_review'
ORDER BY r.createdAt ASC
LIMIT 50;

-- ============================================================
-- 6. TEKLIF SORGULARI
-- ============================================================

-- Teklif listeleme
EXPLAIN SELECT p.*, c.name as customerName
FROM proposals p
JOIN customers c ON p.customerId = c.id
WHERE p.status IN ('draft', 'sent')
ORDER BY p.createdAt DESC
LIMIT 20;

-- ============================================================
-- 7. SOZLESME SORGULARI
-- ============================================================

-- S08: Sozlesme listeleme (20K kayit)
EXPLAIN SELECT ct.*, c.name as customerName
FROM contracts ct
JOIN customers c ON ct.customerId = c.id
WHERE ct.status = 'active'
ORDER BY ct.endDate ASC
LIMIT 20;

-- Suresi dolacak sozlesmeler
EXPLAIN SELECT ct.* FROM contracts ct
WHERE ct.status = 'active'
  AND ct.endDate BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 90 DAY)
ORDER BY ct.endDate ASC;

-- ============================================================
-- 8. DASHBOARD SORGULARI
-- ============================================================

-- D02: Dashboard count sorgulari (7 paralel)
EXPLAIN SELECT COUNT(*) FROM work_orders WHERE status IN ('draft', 'planned', 'assigned', 'in_progress');
EXPLAIN SELECT COUNT(*) FROM inspections WHERE status IN ('submitted', 'under_review');
EXPLAIN SELECT COUNT(*) FROM reports WHERE status = 'under_review';
EXPLAIN SELECT COUNT(*) FROM proposals WHERE status = 'sent';
EXPLAIN SELECT COUNT(*) FROM contracts WHERE status = 'active';
EXPLAIN SELECT COUNT(*) FROM work_orders WHERE noContractRisk = 1 AND status NOT IN ('cancelled', 'invoiced');

-- ============================================================
-- 9. AUDIT LOG SORGULARI
-- ============================================================

-- Audit log listeleme (2M+ kayit)
EXPLAIN SELECT al.* FROM audit_logs al
WHERE al.entityType = 'work_order'
  AND al.entityId = 'test-entity-id'
ORDER BY al.createdAt DESC
LIMIT 50;

-- Tarih bazli audit
EXPLAIN SELECT al.* FROM audit_logs al
WHERE al.createdAt BETWEEN '2026-01-01' AND '2026-03-31'
  AND al.action = 'REPORT_APPROVED'
ORDER BY al.createdAt DESC
LIMIT 100;

-- ============================================================
-- 10. SATIS FIRSATI SORGULARI
-- ============================================================

-- Renewal opportunity kontrolu
EXPLAIN SELECT e.id, e.customerId, e.nextControlDate
FROM equipment e
WHERE e.nextControlDate BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 60 DAY)
  AND e.isActive = 1
  AND e.customerId NOT IN (
    SELECT DISTINCT so.customerId
    FROM sales_opportunities so
    WHERE so.status IN ('new', 'contacted', 'proposal_sent', 'negotiation')
  );

-- ============================================================
-- 11. CUSTOMER 360 SORGULARI
-- ============================================================

-- Customer 360: Musteri + iliskili tum veriler
EXPLAIN SELECT * FROM customers WHERE id = 'test-customer-id';

EXPLAIN SELECT * FROM customer_locations
WHERE customerId = 'test-customer-id' AND isActive = 1;

EXPLAIN SELECT COUNT(*) FROM equipment
WHERE customerId = 'test-customer-id' AND isActive = 1;

EXPLAIN SELECT * FROM work_orders
WHERE customerId = 'test-customer-id'
ORDER BY createdAt DESC LIMIT 10;

EXPLAIN SELECT * FROM proposals
WHERE customerId = 'test-customer-id'
ORDER BY createdAt DESC LIMIT 10;

EXPLAIN SELECT * FROM contracts
WHERE customerId = 'test-customer-id'
ORDER BY createdAt DESC LIMIT 10;

-- ============================================================
-- 12. INDEX KONTROL
-- ============================================================

-- Mevcut indexleri listele
SELECT TABLE_NAME, INDEX_NAME, COLUMN_NAME, SEQ_IN_INDEX, NON_UNIQUE
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX;

-- Tablo boyutlari
SELECT TABLE_NAME,
       TABLE_ROWS,
       ROUND(DATA_LENGTH / 1024 / 1024, 2) AS data_mb,
       ROUND(INDEX_LENGTH / 1024 / 1024, 2) AS index_mb
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = DATABASE()
ORDER BY TABLE_ROWS DESC;

-- ============================================================
-- 13. EKSIK INDEX ONERILERI
-- ============================================================

-- Asagidaki indexler YOKSA eklenmeli:

-- Musteri aramalari icin
-- CREATE INDEX idx_customers_name ON customers(name);
-- CREATE INDEX idx_customers_code ON customers(code);
-- CREATE INDEX idx_customers_companyId ON customers(companyId);

-- Ekipman performansi icin
-- CREATE INDEX idx_equipment_customerId_isActive ON equipment(customerId, isActive);
-- CREATE INDEX idx_equipment_locationId ON equipment(locationId);
-- CREATE INDEX idx_equipment_nextControlDate ON equipment(nextControlDate);
-- CREATE INDEX idx_equipment_inventoryCode ON equipment(inventoryCode);
-- CREATE INDEX idx_equipment_typeId_isActive ON equipment(equipmentTypeId, isActive);

-- Is emri performansi icin
-- CREATE INDEX idx_wo_customerId_status ON work_orders(customerId, status);
-- CREATE INDEX idx_wo_inspectorId_status ON work_orders(inspectorId, status);
-- CREATE INDEX idx_wo_status_plannedDate ON work_orders(status, plannedDate);

-- Denetim performansi icin
-- CREATE INDEX idx_inspections_inspectorId_status ON inspections(inspectorId, status);
-- CREATE INDEX idx_inspections_equipmentId_status ON inspections(equipmentId, status);
-- CREATE INDEX idx_inspections_workOrderId ON inspections(workOrderId);
-- CREATE INDEX idx_inspections_status_date ON inspections(status, inspectionDate);

-- Rapor performansi icin
-- CREATE INDEX idx_reports_status_createdAt ON reports(status, createdAt);
-- CREATE INDEX idx_reports_inspectionId ON reports(inspectionId);

-- Teklif performansi icin
-- CREATE INDEX idx_proposals_customerId_status ON proposals(customerId, status);
-- CREATE INDEX idx_proposals_status_createdAt ON proposals(status, createdAt);

-- Sozlesme performansi icin
-- CREATE INDEX idx_contracts_customerId_status ON contracts(customerId, status);
-- CREATE INDEX idx_contracts_status_endDate ON contracts(status, endDate);

-- Audit log performansi icin (2M+ kayit)
-- CREATE INDEX idx_audit_entityType_entityId ON audit_logs(entityType, entityId);
-- CREATE INDEX idx_audit_action_createdAt ON audit_logs(action, createdAt);
-- CREATE INDEX idx_audit_userId_createdAt ON audit_logs(userId, createdAt);

-- Satis firsati performansi icin
-- CREATE INDEX idx_sales_opp_customerId_status ON sales_opportunities(customerId, status);

-- ============================================================
-- 14. N+1 SORGU TESPITI
-- ============================================================

-- MySQL slow query log'u aktif et (test ortami):
-- SET GLOBAL slow_query_log = 'ON';
-- SET GLOBAL long_query_time = 0.1;
-- SET GLOBAL log_queries_not_using_indexes = 'ON';

-- Sonra uygulamayi kullan ve slow query log'u analiz et:
-- mysqldumpslow /var/log/mysql/slow.log

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Performance indexes for large dataset operations.
 * Optimized for 10K customers, 500K equipment, 200K inspections, 100 concurrent users.
 */
export class PerformanceIndexes1700000000006 implements MigrationInterface {
  name = 'PerformanceIndexes1700000000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Inspection queries (dashboard, listings, status filters)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_inspections_status_completed ON inspections(status, completedAt)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_inspections_inspector_status ON inspections(inspectorId, status)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_inspections_equipment_status ON inspections(equipmentId, status)`);

    // Work order queries (dashboard, planner, inspector)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_work_orders_status_risk ON work_orders(status, noContractRisk)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_work_orders_inspector_status ON work_orders(assignedInspectorId, status)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_work_orders_customer_status ON work_orders(customerId, status)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_work_orders_planned_status ON work_orders(plannedDate, status)`);

    // Report queries (TM dashboard, listings)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_reports_status_created ON reports(status, createdAt)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_reports_customer_status ON reports(customerId, status)`);

    // Equipment queries (control schedule, search)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_equipment_next_control_status ON equipment(nextControlDate, status)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_equipment_customer_active ON equipment(customerId, isActive)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_equipment_type_active ON equipment(equipmentTypeId, isActive)`);

    // Customer queries (search, tenant)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_customers_company ON customers(companyId)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name)`);

    // Proposal queries
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_proposals_customer_status ON proposals(customerId, status)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_proposals_status_created ON proposals(status, createdAt)`);

    // Contract queries
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_contracts_customer_status ON contracts(customerId, status)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_contracts_status_enddate ON contracts(status, endDate)`);

    // Audit log queries (high volume table)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entityType, entityId)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_audit_action_date ON audit_logs(action, createdAt)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_audit_user_date ON audit_logs(userId, createdAt)`);

    // Sales pipeline
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_sales_opp_customer_status ON sales_opportunities(customerId, status)`);

    // Location queries
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_locations_customer_active ON customer_locations(customerId, isActive)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const indexes = [
      'idx_inspections_status_completed', 'idx_inspections_inspector_status', 'idx_inspections_equipment_status',
      'idx_work_orders_status_risk', 'idx_work_orders_inspector_status', 'idx_work_orders_customer_status', 'idx_work_orders_planned_status',
      'idx_reports_status_created', 'idx_reports_customer_status',
      'idx_equipment_next_control_status', 'idx_equipment_customer_active', 'idx_equipment_type_active',
      'idx_customers_company', 'idx_customers_name',
      'idx_proposals_customer_status', 'idx_proposals_status_created',
      'idx_contracts_customer_status', 'idx_contracts_status_enddate',
      'idx_audit_entity', 'idx_audit_action_date', 'idx_audit_user_date',
      'idx_sales_opp_customer_status',
      'idx_locations_customer_active',
    ];

    const tables: Record<string, string> = {
      idx_inspections_status_completed: 'inspections', idx_inspections_inspector_status: 'inspections', idx_inspections_equipment_status: 'inspections',
      idx_work_orders_status_risk: 'work_orders', idx_work_orders_inspector_status: 'work_orders', idx_work_orders_customer_status: 'work_orders', idx_work_orders_planned_status: 'work_orders',
      idx_reports_status_created: 'reports', idx_reports_customer_status: 'reports',
      idx_equipment_next_control_status: 'equipment', idx_equipment_customer_active: 'equipment', idx_equipment_type_active: 'equipment',
      idx_customers_company: 'customers', idx_customers_name: 'customers',
      idx_proposals_customer_status: 'proposals', idx_proposals_status_created: 'proposals',
      idx_contracts_customer_status: 'contracts', idx_contracts_status_enddate: 'contracts',
      idx_audit_entity: 'audit_logs', idx_audit_action_date: 'audit_logs', idx_audit_user_date: 'audit_logs',
      idx_sales_opp_customer_status: 'sales_opportunities',
      idx_locations_customer_active: 'customer_locations',
    };

    for (const idx of indexes) {
      try {
        await queryRunner.query(`DROP INDEX ${idx} ON ${tables[idx]}`);
      } catch { /* index may not exist */ }
    }
  }
}

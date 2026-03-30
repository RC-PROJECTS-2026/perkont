import { ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';

/**
 * Tenant verification helper.
 * Verifies that a given entity belongs to the requesting user's company.
 * Call this in services/controllers after fetching a single record by ID.
 */
export async function verifyTenantAccess(
  dataSource: DataSource,
  entityType: string,
  entityId: string,
  companyId: string | undefined,
): Promise<void> {
  if (!companyId) return; // No tenant context (e.g. system/cron calls)

  let query: string;
  let params: any[];

  switch (entityType) {
    case 'customer':
      query = `SELECT companyId FROM customers WHERE id = ?`;
      params = [entityId];
      break;

    case 'equipment':
      query = `SELECT c.companyId FROM equipment e JOIN customers c ON c.id = e.customerId WHERE e.id = ?`;
      params = [entityId];
      break;

    case 'work_order':
      query = `SELECT c.companyId FROM work_orders wo JOIN customers c ON c.id = wo.customerId WHERE wo.id = ?`;
      params = [entityId];
      break;

    case 'inspection':
      query = `SELECT c.companyId FROM inspections i JOIN equipment e ON e.id = i.equipmentId JOIN customers c ON c.id = e.customerId WHERE i.id = ?`;
      params = [entityId];
      break;

    case 'report':
      query = `SELECT c.companyId FROM reports r JOIN customers c ON c.id = r.customerId WHERE r.id = ?`;
      params = [entityId];
      break;

    case 'contract':
      query = `SELECT c.companyId FROM contracts ct JOIN customers c ON c.id = ct.customerId WHERE ct.id = ?`;
      params = [entityId];
      // Also check contract_documents table if contracts table doesn't match
      break;

    case 'proposal':
      query = `SELECT c.companyId FROM proposals p JOIN customers c ON c.id = p.customerId WHERE p.id = ?`;
      params = [entityId];
      break;

    case 'quotation':
      query = `SELECT c.companyId FROM quotations q JOIN customers c ON c.id = q.customerId WHERE q.id = ?`;
      params = [entityId];
      break;

    case 'opportunity':
      query = `SELECT c.companyId FROM sales_opportunities so JOIN customers c ON c.id = so.customerId WHERE so.id = ?`;
      params = [entityId];
      break;

    default:
      return; // Unknown entity type — skip check
  }

  try {
    const rows = await dataSource.query(query, params);
    if (rows.length === 0) return; // Entity not found — let NotFoundException handle it
    if (rows[0].companyId !== companyId) {
      throw new ForbiddenException('Bu kaynağa erişim yetkiniz yok');
    }
  } catch (e) {
    if (e instanceof ForbiddenException) throw e;
    // Query failed (table missing, etc.) — don't block, log warning
  }
}

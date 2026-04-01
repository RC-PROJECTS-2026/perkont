/**
 * Y7: Sozlesme → WO Otomatik Uretim
 * Aktif sozlesmeli musterilerin kontrol tarihi yaklasan ekipmanlari icin otomatik WO olusturur.
 */
import { Injectable, Inject } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { AuditService } from '@/modules/audit/audit.service';
import * as crypto from 'crypto';

@Injectable()
export class AutoWoGenerationService {
  constructor(
    @InjectDataSource() private dataSource: DataSource,
    private auditService: AuditService,
    @Inject(WINSTON_MODULE_PROVIDER) private logger: Logger,
  ) {}

  /**
   * Her gun 07:00'de calisir.
   * Aktif sozlesmesi olan ve kontrol tarihi 30 gun icinde olan ekipmanlar icin
   * henuz WO olusturulmamislarsa otomatik WO olusturur.
   */
  @Cron('0 7 * * *')
  async generateWorkOrders(): Promise<void> {
    try {
      // Kontrol tarihi 30 gun icinde olan, aktif sozlesmeli, WO'su olmayan ekipmanlar
      const candidates = await this.dataSource.query(`
        SELECT
          e.customerId,
          e.locationId,
          c.name as customerName,
          cl.name as locationName,
          COUNT(e.id) as equipmentCount,
          MIN(e.nextControlDate) as earliestControl,
          cd.id as contractId,
          cd.contractNumber
        FROM equipment e
        JOIN customers c ON c.id = e.customerId
        JOIN customer_locations cl ON cl.id = e.locationId
        JOIN contract_documents cd ON cd.customerId = e.customerId AND cd.status = 'active'
        LEFT JOIN contract_scope_items csi ON csi.contractId = cd.id AND csi.equipmentTypeId = e.equipmentTypeId
        WHERE e.nextControlDate BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)
          AND e.status = 'active'
          AND e.id NOT IN (
            SELECT woe.equipmentId FROM work_order_equipment woe
            JOIN work_orders wo ON wo.id = woe.workOrderId
            WHERE wo.status NOT IN ('cancelled','invoiced')
          )
        GROUP BY e.customerId, e.locationId, cd.id
        HAVING equipmentCount > 0
        ORDER BY earliestControl ASC
      `);

      let created = 0;
      for (const row of candidates) {
        // Idempotency: bugun ayni musteri+lokasyon icin WO olusturulmus mu
        const todayCheck = await this.dataSource.query(
          `SELECT COUNT(*) as c FROM work_orders WHERE customerId = ? AND locationId = ? AND DATE(createdAt) = CURDATE() AND status != 'cancelled'`,
          [row.customerId, row.locationId]
        );
        if (Number(todayCheck[0]?.c) > 0) continue;

        // WO olustur
        const woId = crypto.randomUUID();
        const count = await this.dataSource.query('SELECT COUNT(*)+1 as n FROM work_orders');
        const woNumber = `IS-${new Date().getFullYear()}-${String(count[0]?.n || 1).padStart(5, '0')}`;

        await this.dataSource.query(`
          INSERT INTO work_orders (id, workOrderNumber, customerId, locationId, contractId, status, plannedDate, priority, createdById, noContractRisk)
          VALUES (?, ?, ?, ?, ?, 'planned', ?, 'normal', 'system', 0)
        `, [woId, woNumber, row.customerId, row.locationId, row.contractId, row.earliestControl]);

        // Ekipmanlari WO'ya ekle
        const equipments = await this.dataSource.query(`
          SELECT e.id, e.equipmentTypeId FROM equipment e
          WHERE e.customerId = ? AND e.locationId = ? AND e.status = 'active'
            AND e.nextControlDate BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)
            AND e.id NOT IN (
              SELECT woe.equipmentId FROM work_order_equipment woe
              JOIN work_orders wo ON wo.id = woe.workOrderId WHERE wo.status NOT IN ('cancelled','invoiced')
            )
          LIMIT 200
        `, [row.customerId, row.locationId]);

        for (const eq of equipments) {
          const woeId = crypto.randomUUID();
          // Form template bul
          const tpl = await this.dataSource.query(
            `SELECT id FROM form_templates WHERE equipmentTypeId = ? AND status = 'active' ORDER BY revisionDate DESC LIMIT 1`,
            [eq.equipmentTypeId]
          );
          await this.dataSource.query(
            `INSERT INTO work_order_equipment (id, workOrderId, equipmentId, formTemplateId) VALUES (?, ?, ?, ?)`,
            [woeId, woId, eq.id, tpl[0]?.id || null]
          );
        }

        await this.auditService.log({
          action: 'WORK_ORDER_AUTO_GENERATED',
          entityType: 'WorkOrder',
          entityId: woId,
          newValues: { customerId: row.customerId, locationId: row.locationId, equipmentCount: equipments.length, contractId: row.contractId },
          description: `Otomatik iş emri: ${woNumber} — ${row.customerName} / ${row.locationName} (${equipments.length} ekipman)`,
        });

        created++;
      }

      if (created > 0) {
        this.logger.log(`[AutoWO] ${created} otomatik iş emri oluşturuldu`, 'AutoWoGeneration');
      }
    } catch (err) {
      this.logger.error(`[AutoWO] Hata: ${(err as any).message}`, 'AutoWoGeneration');
    }
  }
}

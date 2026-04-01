/**
 * Y2: Ekipman Toplu Import (Excel/CSV)
 */
import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AuditService } from '@/modules/audit/audit.service';
import * as crypto from 'crypto';

interface ImportRow {
  inventoryCode: string;
  equipmentTypeCode: string;
  locationName?: string;
  serialNumber?: string;
  brand?: string;
  model?: string;
  capacity?: string;
  capacityUnit?: string;
  manufactureYear?: number;
  controlPeriodMonths?: number;
  floor?: string;
  riskClass?: string;
}

export interface ImportResult {
  total: number;
  success: number;
  failed: number;
  errors: Array<{ row: number; code: string; error: string }>;
}

@Injectable()
export class EquipmentImportService {
  constructor(
    @InjectDataSource() private dataSource: DataSource,
    private auditService: AuditService,
  ) {}

  async importFromJson(
    customerId: string,
    rows: ImportRow[],
    userId: string,
  ): Promise<ImportResult> {
    if (!rows || rows.length === 0) throw new BadRequestException('Import verisi boş');
    if (rows.length > 5000) throw new BadRequestException('Tek seferde en fazla 5000 satır yüklenebilir');

    // Pre-load equipment types and locations for fast lookup
    const [types, locations] = await Promise.all([
      this.dataSource.query('SELECT id, code FROM equipment_types WHERE isActive = 1'),
      this.dataSource.query('SELECT id, name FROM customer_locations WHERE customerId = ?', [customerId]),
    ]);

    const typeMap = new Map<string, string>(types.map((t: any) => [t.code, t.id]));
    const locMap = new Map<string, string>(locations.map((l: any) => [l.name.toLowerCase().trim(), l.id]));

    const result: ImportResult = { total: rows.length, success: 0, failed: 0, errors: [] };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        if (!row.inventoryCode) throw new Error('Envanter kodu zorunlu');
        if (!row.equipmentTypeCode) throw new Error('Ekipman tip kodu zorunlu');

        const typeId = typeMap.get(row.equipmentTypeCode);
        if (!typeId) throw new Error(`Ekipman tipi bulunamadı: ${row.equipmentTypeCode}`);

        // Location matching
        let locationId: string | null = null;
        if (row.locationName) {
          locationId = locMap.get(row.locationName.toLowerCase().trim()) || null;
          if (!locationId) throw new Error(`Lokasyon bulunamadı: ${row.locationName}`);
        } else if (locations.length === 1) {
          locationId = locations[0].id; // Single location → auto-assign
        } else {
          throw new Error('Lokasyon belirtilmeli (birden fazla lokasyon var)');
        }

        // Check duplicate
        const existing = await this.dataSource.query(
          'SELECT id FROM equipment WHERE inventoryCode = ? LIMIT 1', [row.inventoryCode]
        );
        if (existing.length > 0) throw new Error(`Envanter kodu zaten mevcut: ${row.inventoryCode}`);

        const id = crypto.randomUUID();
        await this.dataSource.query(`
          INSERT INTO equipment (id, customerId, locationId, equipmentTypeId, inventoryCode,
            serialNumber, brand, model, capacity, capacityUnit, manufactureYear,
            controlPeriodMonths, floor, riskClass, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
        `, [
          id, customerId, locationId, typeId, row.inventoryCode,
          row.serialNumber || null, row.brand || null, row.model || null,
          row.capacity || null, row.capacityUnit || null, row.manufactureYear || null,
          row.controlPeriodMonths || null, row.floor || null, row.riskClass || 'standard',
        ]);

        result.success++;
      } catch (e) {
        result.failed++;
        result.errors.push({ row: i + 1, code: row.inventoryCode || `ROW-${i+1}`, error: (e as any).message });
      }
    }

    await this.auditService.log({
      userId,
      action: 'EQUIPMENT_BULK_IMPORT',
      entityType: 'Equipment',
      entityId: customerId,
      newValues: { total: result.total, success: result.success, failed: result.failed },
      description: `${result.success}/${result.total} ekipman toplu import edildi`,
    });

    return result;
  }
}

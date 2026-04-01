/**
 * Portal Genisletme: Kontrol talebi, fatura durumu, uygunsuzluk takibi
 */
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class PortalExtendedService {
  constructor(@InjectDataSource() private dataSource: DataSource) {}

  /** Musteri kontrol talebi olustur — sales_opportunities'e yeni kayit */
  async createControlRequest(customerId: string, data: {
    description: string;
    locationId?: string;
    equipmentTypeId?: string;
    preferredDate?: string;
    contactName: string;
    contactPhone: string;
  }) {
    const crypto = require('crypto');
    const id = crypto.randomUUID();
    await this.dataSource.query(`
      INSERT INTO sales_opportunities (id, customerId, title, source, status, estimatedValue, probability, contactName, contactPhone, notes, createdById)
      VALUES (?, ?, ?, 'customer_request', 'new', 0, 80, ?, ?, ?, ?)
    `, [id, customerId, `Müşteri Kontrol Talebi: ${data.description}`, data.contactName, data.contactPhone, `Tercih edilen tarih: ${data.preferredDate || 'Belirtilmedi'}\nAçıklama: ${data.description}`, customerId]);
    return { id, message: 'Kontrol talebiniz alınmıştır. En kısa sürede sizinle iletişime geçilecektir.' };
  }

  /** Musteri fatura durumlarini gor */
  async getInvoiceStatus(customerId: string) {
    return this.dataSource.query(`
      SELECT ib.id, ib.batchNumber, ib.status, ib.totalWithVat, ib.invoiceDate,
             ib.paymentStatus, ib.paidAmount, ib.notes
      FROM invoice_batches ib
      WHERE ib.customerId = ?
      ORDER BY ib.invoiceDate DESC
      LIMIT 50
    `, [customerId]);
  }

  /** Musteri uygunsuzluk takibi — ekipmanlarindaki uygunsuzluklar */
  async getNonconformities(customerId: string) {
    return this.dataSource.query(`
      SELECT inc.id, inc.description, inc.severity, inc.status,
             e.inventoryCode, e.brand, e.model,
             i.completedAt as inspectionDate,
             r.reportNumber
      FROM inspection_nonconformities inc
      JOIN inspections i ON i.id = inc.inspectionId
      JOIN equipment e ON e.id = i.equipmentId
      LEFT JOIN reports r ON r.inspectionId = i.id
      WHERE e.customerId = ?
      ORDER BY i.completedAt DESC
      LIMIT 100
    `, [customerId]);
  }

  /** Musteri yaklasan kontrol tarihlerini gor */
  async getUpcomingControls(customerId: string) {
    return this.dataSource.query(`
      SELECT e.id, e.inventoryCode, e.brand, e.model, e.nextControlDate,
             et.name as equipmentTypeName, cl.name as locationName,
             DATEDIFF(e.nextControlDate, CURDATE()) as daysRemaining
      FROM equipment e
      JOIN equipment_types et ON et.id = e.equipmentTypeId
      JOIN customer_locations cl ON cl.id = e.locationId
      WHERE e.customerId = ? AND e.status = 'active' AND e.nextControlDate IS NOT NULL
      ORDER BY e.nextControlDate ASC
      LIMIT 100
    `, [customerId]);
  }
}

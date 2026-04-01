/**
 * Harita Bazli Lokasyon + Rota Gruplama Servisi
 * Koordinat bazli yakinlik hesabi ve rota optimizasyonu
 */
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class LocationMapService {
  constructor(@InjectDataSource() private dataSource: DataSource) {}

  /** Tum lokasyonlari koordinat ile getir (harita gorunumu) */
  async getLocationsWithCoordinates(companyId?: string): Promise<any[]> {
    const filter = companyId ? `AND c.companyId = ?` : '';
    const params = companyId ? [companyId] : [];
    return this.dataSource.query(`
      SELECT cl.id, cl.name, cl.city, cl.district, cl.address,
             cl.latitude, cl.longitude, cl.locationType,
             c.id as customerId, c.name as customerName, c.code as customerCode,
             (SELECT COUNT(*) FROM equipment e WHERE e.locationId = cl.id AND e.status = 'active') as equipmentCount,
             (SELECT COUNT(*) FROM work_orders wo WHERE wo.locationId = cl.id AND wo.status IN ('planned','assigned')) as pendingWoCount
      FROM customer_locations cl
      JOIN customers c ON c.id = cl.customerId
      WHERE cl.isActive = 1 AND cl.latitude IS NOT NULL AND cl.longitude IS NOT NULL ${filter}
      ORDER BY c.name, cl.name
    `, params);
  }

  /** Belirli lokasyona yakin diger lokasyonlar (rota gruplama) */
  async getNearbyLocations(locationId: string, radiusKm = 10): Promise<any[]> {
    // Haversine formula ile yakinlik
    const loc = await this.dataSource.query(
      `SELECT latitude, longitude FROM customer_locations WHERE id = ?`, [locationId]
    );
    if (!loc[0]?.latitude) return [];

    const lat = loc[0].latitude;
    const lng = loc[0].longitude;

    return this.dataSource.query(`
      SELECT cl.id, cl.name, cl.city, cl.address, cl.latitude, cl.longitude,
             c.name as customerName,
             (6371 * acos(
               cos(radians(?)) * cos(radians(cl.latitude)) *
               cos(radians(cl.longitude) - radians(?)) +
               sin(radians(?)) * sin(radians(cl.latitude))
             )) AS distanceKm,
             (SELECT COUNT(*) FROM work_orders wo WHERE wo.locationId = cl.id AND wo.status IN ('planned','assigned')) as pendingWoCount
      FROM customer_locations cl
      JOIN customers c ON c.id = cl.customerId
      WHERE cl.id != ? AND cl.isActive = 1 AND cl.latitude IS NOT NULL
      HAVING distanceKm <= ?
      ORDER BY distanceKm
      LIMIT 20
    `, [lat, lng, lat, locationId, radiusKm]);
  }

  /** Gunun planlanan islerini harita uzerinde goster */
  async getDailyRouteMap(date: string, inspectorId?: string): Promise<any[]> {
    let query = `
      SELECT wo.id, wo.workOrderNumber, wo.plannedDate, wo.status, wo.priority,
             cl.name as locationName, cl.city, cl.latitude, cl.longitude, cl.address,
             c.name as customerName,
             u.fullName as inspectorName,
             (SELECT COUNT(*) FROM work_order_equipment woe WHERE woe.workOrderId = wo.id) as equipmentCount
      FROM work_orders wo
      JOIN customer_locations cl ON cl.id = wo.locationId
      JOIN customers c ON c.id = wo.customerId
      LEFT JOIN users u ON u.id = wo.assignedInspectorId
      WHERE wo.plannedDate = ? AND wo.status NOT IN ('cancelled','invoiced')
    `;
    const params: any[] = [date];
    if (inspectorId) {
      query += ` AND wo.assignedInspectorId = ?`;
      params.push(inspectorId);
    }
    query += ` ORDER BY u.fullName, cl.city`;
    return this.dataSource.query(query, params);
  }
}

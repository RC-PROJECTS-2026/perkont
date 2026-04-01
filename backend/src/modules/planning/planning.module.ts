/**
 * Y1: Planlama / Takvim Modulu
 * Denetci musaitlik, kapasite, takvim gorunumu, otomatik planlama onerisi
 */
import { Entity, Column, Index, Repository, DataSource, Between, LessThanOrEqual } from 'typeorm';
import { AbstractEntity } from '@/common/entities/abstract.entity';
import {
  Injectable, BadRequestException,
  Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Module,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '@/common/decorators/roles.decorator';
import { RolesGuard } from '@/common/guards/roles.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { UserRole } from '@/common/enums/user-role.enum';
import { addDays, startOfDay, endOfDay, format } from 'date-fns';

// ─── Entity: Inspector Availability ────────────────────────────────────────────

@Entity('inspector_availability')
@Index(['inspectorId', 'date'])
export class InspectorAvailability extends AbstractEntity {
  @Column({ type: 'varchar', length: 36 }) inspectorId: string;
  @Column({ type: 'date' }) date: Date;
  @Column({ type: 'varchar', length: 20, default: 'available' }) status: string; // available/leave/sick/training/field
  @Column({ type: 'text', nullable: true }) notes: string;
  @Column({ type: 'int', default: 8 }) capacityHours: number;
}

// ─── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class PlanningService {
  constructor(
    @InjectRepository(InspectorAvailability) private availRepo: Repository<InspectorAvailability>,
    @InjectDataSource() private dataSource: DataSource,
  ) {}

  // ── Takvim Gorunumu ──────────────────────────────────────────────────

  async getCalendar(startDate: string, endDate: string): Promise<any[]> {
    const rows = await this.dataSource.query(`
      SELECT wo.id, wo.workOrderNumber, wo.plannedDate, wo.status, wo.priority,
             wo.assignedInspectorId, u.fullName as inspectorName,
             c.name as customerName, cl.name as locationName, cl.city
      FROM work_orders wo
      LEFT JOIN users u ON u.id = wo.assignedInspectorId
      LEFT JOIN customers c ON c.id = wo.customerId
      LEFT JOIN customer_locations cl ON cl.id = wo.locationId
      WHERE wo.plannedDate BETWEEN ? AND ?
        AND wo.status NOT IN ('cancelled', 'invoiced')
      ORDER BY wo.plannedDate, u.fullName
    `, [startDate, endDate]);
    return rows;
  }

  // ── Denetci Musaitlik ────────────────────────────────────────────────

  async getAvailability(inspectorId: string, startDate: string, endDate: string): Promise<InspectorAvailability[]> {
    return this.availRepo.find({
      where: { inspectorId, date: Between(new Date(startDate), new Date(endDate)) as any },
      order: { date: 'ASC' },
    });
  }

  async setAvailability(inspectorId: string, date: string, status: string, notes?: string): Promise<InspectorAvailability> {
    let record = await this.availRepo.findOne({ where: { inspectorId, date: new Date(date) as any } });
    if (record) {
      await this.availRepo.update(record.id, { status, notes });
      return this.availRepo.findOne({ where: { id: record.id } });
    }
    return this.availRepo.save(this.availRepo.create({ inspectorId, date: new Date(date), status, notes }));
  }

  // ── Kapasite Gorunumu ────────────────────────────────────────────────

  async getCapacityOverview(date: string): Promise<any[]> {
    const rows = await this.dataSource.query(`
      SELECT u.id as inspectorId, u.fullName,
             COALESCE(ia.status, 'available') as availabilityStatus,
             COALESCE(ia.capacityHours, 8) as capacityHours,
             COUNT(wo.id) as assignedWoCount,
             GROUP_CONCAT(wo.workOrderNumber SEPARATOR ', ') as assignedWos
      FROM users u
      LEFT JOIN inspector_availability ia ON ia.inspectorId = u.id AND ia.date = ?
      LEFT JOIN work_orders wo ON wo.assignedInspectorId = u.id AND wo.plannedDate = ? AND wo.status NOT IN ('cancelled','invoiced','completed','report_approved')
      WHERE u.roles LIKE '%inspector%' AND u.isActive = 1
      GROUP BY u.id
      ORDER BY u.fullName
    `, [date, date]);
    return rows;
  }

  // ── Geciken Isler ────────────────────────────────────────────────────

  async getOverdueWorkOrders(): Promise<any[]> {
    return this.dataSource.query(`
      SELECT wo.id, wo.workOrderNumber, wo.plannedDate, wo.status, wo.priority,
             c.name as customerName, u.fullName as inspectorName,
             DATEDIFF(NOW(), wo.plannedDate) as daysOverdue
      FROM work_orders wo
      LEFT JOIN customers c ON c.id = wo.customerId
      LEFT JOIN users u ON u.id = wo.assignedInspectorId
      WHERE wo.plannedDate < CURDATE()
        AND wo.status IN ('draft','planned','assigned')
      ORDER BY wo.plannedDate ASC
      LIMIT 100
    `);
  }

  // ── Planlama Onerisi ─────────────────────────────────────────────────

  async getSuggestedPlan(date: string): Promise<any[]> {
    // Kontrol tarihi yaklasan ama henuz WO olusturulmamis ekipmanlar
    return this.dataSource.query(`
      SELECT e.customerId, c.name as customerName, cl.id as locationId, cl.name as locationName, cl.city,
             COUNT(e.id) as equipmentCount, MIN(e.nextControlDate) as earliestControl,
             et.name as equipmentTypeName
      FROM equipment e
      JOIN customers c ON c.id = e.customerId
      JOIN customer_locations cl ON cl.id = e.locationId
      JOIN equipment_types et ON et.id = e.equipmentTypeId
      WHERE e.nextControlDate BETWEEN ? AND DATE_ADD(?, INTERVAL 30 DAY)
        AND e.status = 'active'
        AND e.id NOT IN (
          SELECT woe.equipmentId FROM work_order_equipment woe
          JOIN work_orders wo ON wo.id = woe.workOrderId
          WHERE wo.status NOT IN ('cancelled','invoiced')
        )
      GROUP BY e.customerId, cl.id, e.equipmentTypeId
      ORDER BY MIN(e.nextControlDate) ASC
      LIMIT 50
    `, [date, date]);
  }

  // ── Haftalik Ozet ────────────────────────────────────────────────────

  async getWeeklySummary(weekStartDate: string): Promise<any> {
    const start = weekStartDate;
    const end = format(addDays(new Date(weekStartDate), 6), 'yyyy-MM-dd');
    const [planned, completed, overdue] = await Promise.all([
      this.dataSource.query(`SELECT COUNT(*) as c FROM work_orders WHERE plannedDate BETWEEN ? AND ? AND status NOT IN ('cancelled')`, [start, end]),
      this.dataSource.query(`SELECT COUNT(*) as c FROM work_orders WHERE completedAt BETWEEN ? AND ? AND status IN ('completed','report_pending','report_approved','invoiced')`, [start, end]),
      this.dataSource.query(`SELECT COUNT(*) as c FROM work_orders WHERE plannedDate < ? AND status IN ('draft','planned','assigned')`, [start]),
    ]);
    return {
      weekStart: start, weekEnd: end,
      planned: Number(planned[0]?.c || 0),
      completed: Number(completed[0]?.c || 0),
      overdue: Number(overdue[0]?.c || 0),
    };
  }
}

// ─── Controller ────────────────────────────────────────────────────────────────

@ApiTags('planning')
@ApiBearerAuth('JWT')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('planning')
export class PlanningController {
  constructor(private service: PlanningService) {}

  @Get('calendar')
  @Roles(UserRole.ADMIN, UserRole.PLANNER, UserRole.EXECUTIVE)
  getCalendar(@Query('start') start: string, @Query('end') end: string) {
    return this.service.getCalendar(start, end);
  }

  @Get('capacity')
  @Roles(UserRole.ADMIN, UserRole.PLANNER)
  getCapacity(@Query('date') date: string) {
    return this.service.getCapacityOverview(date || format(new Date(), 'yyyy-MM-dd'));
  }

  @Get('overdue')
  @Roles(UserRole.ADMIN, UserRole.PLANNER, UserRole.EXECUTIVE)
  getOverdue() { return this.service.getOverdueWorkOrders(); }

  @Get('suggestions')
  @Roles(UserRole.ADMIN, UserRole.PLANNER)
  getSuggestions(@Query('date') date: string) {
    return this.service.getSuggestedPlan(date || format(new Date(), 'yyyy-MM-dd'));
  }

  @Get('weekly')
  @Roles(UserRole.ADMIN, UserRole.PLANNER, UserRole.EXECUTIVE)
  getWeekly(@Query('weekStart') start: string) { return this.service.getWeeklySummary(start); }

  @Get('availability/:inspectorId')
  @Roles(UserRole.ADMIN, UserRole.PLANNER)
  getAvailability(@Param('inspectorId') id: string, @Query('start') s: string, @Query('end') e: string) {
    return this.service.getAvailability(id, s, e);
  }

  @Post('availability/:inspectorId')
  @Roles(UserRole.ADMIN, UserRole.PLANNER)
  setAvailability(@Param('inspectorId') id: string, @Body() body: any) {
    return this.service.setAvailability(id, body.date, body.status, body.notes);
  }
}

// ─── Map Controller ────────────────────────────────────────────────────────────

import { LocationMapService } from './location-map.service';

@ApiTags('planning')
@ApiBearerAuth('JWT')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('planning/map')
export class LocationMapController {
  constructor(private mapService: LocationMapService) {}

  @Get('locations')
  @Roles(UserRole.ADMIN, UserRole.PLANNER, UserRole.EXECUTIVE)
  getLocations(@Query('companyId') companyId?: string) {
    return this.mapService.getLocationsWithCoordinates(companyId);
  }

  @Get('nearby/:locationId')
  @Roles(UserRole.ADMIN, UserRole.PLANNER)
  getNearby(@Param('locationId') id: string, @Query('radius') radius?: number) {
    return this.mapService.getNearbyLocations(id, radius || 10);
  }

  @Get('daily-route')
  @Roles(UserRole.ADMIN, UserRole.PLANNER, UserRole.INSPECTOR)
  getDailyRoute(@Query('date') date: string, @Query('inspectorId') inspectorId?: string) {
    return this.mapService.getDailyRouteMap(date, inspectorId);
  }
}

// ─── Module ────────────────────────────────────────────────────────────────────

@Module({
  imports: [TypeOrmModule.forFeature([InspectorAvailability])],
  providers: [PlanningService, LocationMapService],
  controllers: [PlanningController, LocationMapController],
  exports: [PlanningService, LocationMapService],
})
export class PlanningModule {}

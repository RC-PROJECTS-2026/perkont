import { Injectable, Inject, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThan, LessThanOrEqual, MoreThanOrEqual, DataSource } from 'typeorm';
import { addDays, startOfDay, endOfDay, startOfMonth, endOfMonth } from 'date-fns';
import { Inspection, InspectionStatus } from '@/modules/inspections/entities/inspection.entity';
import { Report, ReportStatus } from '@/modules/reports/entities/report.entity';
import { WorkOrder, WorkOrderStatus } from '@/modules/work-orders/entities/work-order.entity';
import { Equipment } from '@/modules/equipment/entities/equipment.entity';
import { LogoSyncQueue, LogoSyncStatus } from '@/modules/logo/entities/logo-sync-queue.entity';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

const DASHBOARD_CACHE_TTL = 30; // seconds

@Injectable()
export class DashboardService {
  private redis: Redis | null = null;

  constructor(
    @InjectRepository(Inspection) private inspectionRepo: Repository<Inspection>,
    @InjectRepository(Report) private reportRepo: Repository<Report>,
    @InjectRepository(WorkOrder) private workOrderRepo: Repository<WorkOrder>,
    @InjectRepository(Equipment) private equipmentRepo: Repository<Equipment>,
    @InjectRepository(LogoSyncQueue) private logoQueueRepo: Repository<LogoSyncQueue>,
    private dataSource: DataSource,
    @Optional() private configService?: ConfigService,
  ) {
    // Initialize Redis for caching (graceful — dashboard works without Redis)
    try {
      const host = this.configService?.get('REDIS_HOST');
      if (host) {
        this.redis = new Redis({
          host,
          port: this.configService?.get<number>('REDIS_PORT', 6379),
          password: this.configService?.get('REDIS_PASSWORD') || undefined,
          db: this.configService?.get<number>('REDIS_DB', 0),
          lazyConnect: true,
          maxRetriesPerRequest: 1,
        });
        this.redis.connect().catch(() => { this.redis = null; });
      }
    } catch {
      this.redis = null;
    }
  }

  private async getCached<T>(key: string): Promise<T | null> {
    if (!this.redis) return null;
    try {
      const val = await this.redis.get(key);
      // Track cache hit/miss for monitoring
      try {
        const { counters } = require('@/modules/monitoring/monitoring.module');
        if (val) counters.recordCacheHit(); else counters.recordCacheMiss();
      } catch { /* monitoring not loaded yet */ }
      return val ? JSON.parse(val) : null;
    } catch {
      return null;
    }
  }

  private async setCache(key: string, data: any, ttl = DASHBOARD_CACHE_TTL): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.setex(key, ttl, JSON.stringify(data));
    } catch { /* ignore cache errors */ }
  }

  async getMainDashboard(companyId?: string) {
    // Check cache first
    const cacheKey = `dashboard:main:${companyId || 'global'}`;
    const cached = await this.getCached(cacheKey);
    if (cached) return cached;

    const today = new Date();
    const todayStart = startOfDay(today);
    const todayEnd = endOfDay(today);
    const next30Days = addDays(today, 30);

    // Build tenant-aware count queries using queryBuilder for proper filtering
    const woQb = (status: WorkOrderStatus | WorkOrderStatus[]) => {
      const qb = this.workOrderRepo.createQueryBuilder('wo');
      if (companyId) {
        qb.innerJoin('wo.customer', 'c').andWhere('c.companyId = :companyId', { companyId });
      }
      if (Array.isArray(status)) {
        qb.andWhere('wo.status IN (:...statuses)', { statuses: status });
      } else {
        qb.andWhere('wo.status = :status', { status });
      }
      return qb;
    };

    const [
      todayWorkOrders,
      completedToday,
      pendingApproval,
      overdueReports,
      upcomingControls,
      uninvoiced,
      logoFailed,
    ] = await Promise.all([
      // Bugünkü iş emirleri
      woQb(WorkOrderStatus.ASSIGNED)
        .andWhere('wo.plannedDate BETWEEN :start AND :end', { start: todayStart, end: todayEnd })
        .getCount(),
      // Bugün tamamlanan denetimler
      (() => {
        const qb = this.inspectionRepo.createQueryBuilder('i')
          .where('i.completedAt BETWEEN :start AND :end', { start: todayStart, end: todayEnd });
        if (companyId) {
          qb.innerJoin('i.equipment', 'eq').innerJoin('eq.customer', 'c')
            .andWhere('c.companyId = :companyId', { companyId });
        }
        return qb.getCount();
      })(),
      // Onay bekleyen raporlar
      (() => {
        const qb = this.reportRepo.createQueryBuilder('r')
          .where('r.status = :status', { status: ReportStatus.UNDER_REVIEW });
        if (companyId) {
          qb.innerJoin('customers', 'c', 'c.id = r.customerId')
            .andWhere('c.companyId = :companyId', { companyId });
        }
        return qb.getCount();
      })(),
      // 7 günden fazla bekleyen raporlar
      (() => {
        const qb = this.reportRepo.createQueryBuilder('r')
          .where('r.status = :status', { status: ReportStatus.UNDER_REVIEW })
          .andWhere('r.createdAt < :cutoff', { cutoff: addDays(today, -7) });
        if (companyId) {
          qb.innerJoin('customers', 'c', 'c.id = r.customerId')
            .andWhere('c.companyId = :companyId', { companyId });
        }
        return qb.getCount();
      })(),
      // Önümüzdeki 30 günde kontrol edilecek ekipmanlar
      (() => {
        const qb = this.equipmentRepo.createQueryBuilder('e')
          .where('e.nextControlDate <= :future', { future: next30Days })
          .andWhere("e.status = 'active'");
        if (companyId) {
          qb.innerJoin('e.customer', 'c').andWhere('c.companyId = :companyId', { companyId });
        }
        return qb.getCount();
      })(),
      // Faturalanmamış tamamlanmış işler
      woQb(WorkOrderStatus.REPORT_APPROVED).getCount(),
      // Başarısız LOGO entegrasyonları
      this.logoQueueRepo.count({
        where: { status: LogoSyncStatus.FAILED },
      }),
    ]);

    // Sözleşmesiz iş emirleri
    let noContractRiskCount = 0;
    try {
      const companyFilter = companyId
        ? `AND wo.customerId IN (SELECT id FROM customers WHERE companyId = ?)`
        : '';
      const params = companyId ? [companyId] : [];
      const riskRows = await this.dataSource.query(
        `SELECT COUNT(*) as c FROM work_orders wo WHERE wo.noContractRisk = 1 AND wo.status NOT IN ('cancelled', 'invoiced') ${companyFilter}`,
        params,
      );
      noContractRiskCount = Number(riskRows[0]?.c || 0);
    } catch { /* column may not exist yet */ }

    const result = {
      today: {
        workOrders: todayWorkOrders,
        completedInspections: completedToday,
      },
      pending: {
        reportApprovals: pendingApproval,
        overdueReports,
        uninvoicedWorkOrders: uninvoiced,
        logoSyncFailed: logoFailed,
        noContractRiskOrders: noContractRiskCount,
      },
      upcoming: {
        equipmentControls30Days: upcomingControls,
      },
    };

    // Cache the result for 30 seconds
    await this.setCache(cacheKey, result);
    return result;
  }

  async getInspectorDashboard(inspectorId: string) {
    const today = new Date();
    const todayStart = startOfDay(today);
    const todayEnd = endOfDay(today);

    const [myToday, myPending, myCompleted] = await Promise.all([
      this.workOrderRepo.count({
        where: {
          assignedInspectorId: inspectorId,
          plannedDate: Between(todayStart, todayEnd) as any,
        },
      }),
      this.workOrderRepo.count({
        where: {
          assignedInspectorId: inspectorId,
          status: WorkOrderStatus.ASSIGNED,
        },
      }),
      this.inspectionRepo.count({
        where: {
          inspectorId,
          status: InspectionStatus.COMPLETED,
          completedAt: Between(startOfMonth(today), endOfMonth(today)) as any,
        },
      }),
    ]);

    return {
      todayWorkOrders: myToday,
      pendingWorkOrders: myPending,
      completedThisMonth: myCompleted,
    };
  }

  async getTechnicalManagerDashboard() {
    const [pendingReview, approved, signed, avgReviewTime] = await Promise.all([
      this.reportRepo.count({ where: { status: ReportStatus.UNDER_REVIEW } }),
      this.reportRepo.count({ where: { status: ReportStatus.APPROVED } }),
      this.reportRepo.count({ where: { status: ReportStatus.SIGNED } }),
      this.getAvgReviewTime(),
    ]);

    return {
      pendingReview,
      approved,
      signed,
      avgReviewTimeHours: avgReviewTime,
    };
  }

  async getFinanceDashboard() {
    const [readyForInvoice, logoQueueStats] = await Promise.all([
      this.workOrderRepo.count({ where: { status: WorkOrderStatus.REPORT_APPROVED } }),
      this.logoQueueRepo
        .createQueryBuilder('q')
        .select('q.status, COUNT(*) as count')
        .groupBy('q.status')
        .getRawMany(),
    ]);

    return {
      readyForInvoice,
      logoQueue: logoQueueStats.reduce(
        (acc: any, r: any) => ({ ...acc, [r.q_status]: parseInt(r.count) }),
        {},
      ),
    };
  }

  async getEquipmentControlTimeline(days = 90, companyId?: string) {
    const future = addDays(new Date(), days);
    const qb = this.equipmentRepo
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.customer', 'customer')
      .leftJoinAndSelect('e.equipmentType', 'et')
      .where('e.nextControlDate <= :future', { future })
      .andWhere("e.status = 'active'");

    if (companyId) {
      qb.andWhere('customer.companyId = :companyId', { companyId });
    }

    return qb
      .orderBy('e.nextControlDate', 'ASC')
      .take(1000)
      .getMany();
  }

  async getMonthlyInspectionStats(months = 12) {
    return this.dataSource.query(
      `SELECT DATE_FORMAT(completedAt, '%Y-%m') as month,
              COUNT(*) as total,
              SUM(CASE WHEN overallResult = 'uygun' THEN 1 ELSE 0 END) as compliant,
              SUM(CASE WHEN overallResult = 'uygunsuz' THEN 1 ELSE 0 END) as nonCompliant
       FROM inspections
       WHERE completedAt >= DATE_SUB(NOW(), INTERVAL ? MONTH)
       AND completedAt IS NOT NULL
       GROUP BY month ORDER BY month ASC`,
      [months],
    );
  }

  async getExpiringCertificates(): Promise<number> {
    const result = await this.dataSource.query(
      `SELECT COUNT(*) as count FROM inspector_qualifications
       WHERE expiryDate BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 60 DAY)
       AND status = 'active'`,
    );
    return parseInt(result[0]?.count || '0', 10);
  }

  async getSalesPerformance(): Promise<{ total: number; accepted: number; revenue: number }> {
    const result = await this.dataSource.query(
      `SELECT COUNT(*) as total,
              SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END) as accepted,
              SUM(CASE WHEN status = 'accepted' THEN totalAmount ELSE 0 END) as revenue
       FROM quotations
       WHERE createdAt >= DATE_FORMAT(NOW(), '%Y-%m-01')`,
    );
    return {
      total: parseInt(result[0]?.total || '0', 10),
      accepted: parseInt(result[0]?.accepted || '0', 10),
      revenue: parseFloat(result[0]?.revenue || '0'),
    };
  }

  async getPlanningLoad(): Promise<{ inspectorId: string; count: number }[]> {
    const result = await this.dataSource.query(
      `SELECT assignedInspectorId as inspectorId, COUNT(*) as count
       FROM work_orders
       WHERE plannedDate BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 7 DAY)
       GROUP BY assignedInspectorId`,
    );
    return result.map((r: any) => ({
      inspectorId: r.inspectorId,
      count: parseInt(r.count, 10),
    }));
  }

  async getTechManagerWorkload(): Promise<number> {
    const result = await this.dataSource.query(
      `SELECT COUNT(*) as count FROM reports
       WHERE status IN ('under_review', 'revision_requested')`,
    );
    return parseInt(result[0]?.count || '0', 10);
  }

  async getCustomerVolume(): Promise<{ name: string; orderCount: number }[]> {
    const result = await this.dataSource.query(
      `SELECT c.name, COUNT(wo.id) as orderCount
       FROM work_orders wo
       JOIN customers c ON wo.customerId = c.id
       WHERE wo.createdAt >= DATE_FORMAT(NOW(), '%Y-01-01')
       GROUP BY c.id, c.name
       ORDER BY orderCount DESC
       LIMIT 10`,
    );
    return result.map((r: any) => ({
      name: r.name,
      orderCount: parseInt(r.orderCount, 10),
    }));
  }

  async getEquipmentTypeStats(): Promise<{ name: string; inspectionCount: number }[]> {
    const result = await this.dataSource.query(
      `SELECT et.name, COUNT(i.id) as inspectionCount
       FROM inspections i
       JOIN equipment e ON i.equipmentId = e.id
       JOIN equipment_types et ON e.equipmentTypeId = et.id
       GROUP BY et.id, et.name
       ORDER BY inspectionCount DESC`,
    );
    return result.map((r: any) => ({
      name: r.name,
      inspectionCount: parseInt(r.inspectionCount, 10),
    }));
  }

  async getExtendedDashboard(companyId?: string) {
    const [
      mainDashboard,
      expiringCertificates,
      salesPerformance,
      planningLoad,
      techManagerWorkload,
      customerVolume,
      equipmentTypeStats,
    ] = await Promise.all([
      this.getMainDashboard(companyId),
      this.getExpiringCertificates(),
      this.getSalesPerformance(),
      this.getPlanningLoad(),
      this.getTechManagerWorkload(),
      this.getCustomerVolume(),
      this.getEquipmentTypeStats(),
    ]);

    return {
      ...(mainDashboard as Record<string, any>),
      expiringCertificates,
      salesPerformance,
      planningLoad,
      techManagerWorkload,
      customerVolume,
      equipmentTypeStats,
    };
  }

  private async getAvgReviewTime(): Promise<number> {
    const result = await this.reportRepo
      .createQueryBuilder('r')
      .select('AVG(TIMESTAMPDIFF(HOUR, r.createdAt, r.updatedAt))', 'avgHours')
      .where("r.status IN ('approved', 'signed', 'delivered')")
      .getRawOne();
    return Math.round(result?.avgHours || 0);
  }
}

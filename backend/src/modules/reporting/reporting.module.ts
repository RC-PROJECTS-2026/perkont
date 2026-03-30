import { Injectable, Controller, Get, Post, Body, Query, UseGuards, Module, StreamableFile } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AuthGuard } from '@nestjs/passport';
import { Cron } from '@nestjs/schedule';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '@/common/decorators/roles.decorator';
import { RolesGuard } from '@/common/guards/roles.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { UserRole } from '@/common/enums/user-role.enum';
import { NotificationsModule } from '@/modules/notifications/notifications.module';
import { NotificationsService } from '@/modules/notifications/notifications.service';

// Güvenli sorgu beyaz listesi
const ALLOWED_METRICS = [
  'inspections_by_period',
  'inspections_by_result',
  'inspections_by_inspector',
  'equipment_control_compliance',
  'report_delivery_time',
  'work_order_completion_rate',
  'customer_activity',
  'nonconformity_analysis',
  'logo_sync_success_rate',
  'sla_compliance',
] as const;

type MetricName = typeof ALLOWED_METRICS[number];

@Injectable()
export class ReportingService {
  constructor(
    @InjectDataSource() private dataSource: DataSource,
    private notificationsService: NotificationsService,
  ) {}

  async getMetric(metric: MetricName, params: any): Promise<any> {
    const queries: Record<MetricName, string> = {
      inspections_by_period: `
        SELECT
          CASE
            WHEN ? = 'year'    THEN DATE_FORMAT(completedAt, '%Y-01-01')
            WHEN ? = 'quarter' THEN CONCAT(YEAR(completedAt), '-', LPAD((QUARTER(completedAt)-1)*3+1, 2, '0'), '-01')
            ELSE DATE_FORMAT(completedAt, '%Y-%m-01')
          END AS period,
          COUNT(*)                     AS total,
          SUM(CASE WHEN overallResult = 'uygun' THEN 1 ELSE 0 END)       AS compliant,
          SUM(CASE WHEN overallResult = 'uygunsuz' THEN 1 ELSE 0 END)    AS non_compliant,
          SUM(CASE WHEN overallResult = 'kismi_uygun' THEN 1 ELSE 0 END) AS partial
        FROM inspections
        WHERE completedAt BETWEEN ? AND ?
          AND status = 'completed'
        GROUP BY period ORDER BY period
      `,
      inspections_by_result: `
        SELECT overallResult, COUNT(*) AS count
        FROM inspections
        WHERE completedAt BETWEEN ? AND ? AND status = 'completed'
        GROUP BY overallResult
      `,
      inspections_by_inspector: `
        SELECT u.fullName, COUNT(i.id) AS total,
               SUM(CASE WHEN i.overallResult = 'uygun' THEN 1 ELSE 0 END) AS compliant
        FROM inspections i
        JOIN users u ON u.id = i.inspectorId
        WHERE i.completedAt BETWEEN ? AND ?
        GROUP BY u.id, u.fullName ORDER BY total DESC LIMIT 20
      `,
      equipment_control_compliance: `
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN nextControlDate >= NOW() THEN 1 ELSE 0 END) AS on_time,
          SUM(CASE WHEN nextControlDate < NOW() THEN 1 ELSE 0 END)  AS overdue,
          ROUND(100.0 * SUM(CASE WHEN nextControlDate >= NOW() THEN 1 ELSE 0 END) / NULLIF(COUNT(*),0), 1) AS compliance_rate
        FROM equipment WHERE status = 'active'
      `,
      report_delivery_time: `
        SELECT
          ROUND(AVG(DATEDIFF(deliveredAt, createdAt)), 1) AS avg_days,
          ROUND(MIN(DATEDIFF(deliveredAt, createdAt)), 1) AS min_days,
          ROUND(MAX(DATEDIFF(deliveredAt, createdAt)), 1) AS max_days,
          COUNT(*) AS total
        FROM reports
        WHERE deliveredAt IS NOT NULL AND createdAt BETWEEN ? AND ?
      `,
      work_order_completion_rate: `
        SELECT
          DATE_FORMAT(createdAt, '%Y-%m-01') AS month,
          COUNT(*) AS total,
          SUM(CASE WHEN status IN ('completed','invoiced','report_approved') THEN 1 ELSE 0 END) AS completed,
          ROUND(100.0 * SUM(CASE WHEN status IN ('completed','invoiced','report_approved') THEN 1 ELSE 0 END) / NULLIF(COUNT(*),0),1) AS rate
        FROM work_orders
        WHERE createdAt BETWEEN ? AND ?
        GROUP BY month ORDER BY month
      `,
      customer_activity: `
        SELECT c.name, COUNT(DISTINCT wo.id) AS work_orders, COUNT(DISTINCT r.id) AS reports
        FROM customers c
        LEFT JOIN work_orders wo ON wo.customerId = c.id AND wo.createdAt BETWEEN ? AND ?
        LEFT JOIN reports r ON r.customerId = c.id AND r.createdAt BETWEEN ? AND ?
        GROUP BY c.id, c.name ORDER BY work_orders DESC LIMIT 20
      `,
      nonconformity_analysis: `
        SELECT n.severity, COUNT(*) AS count,
               ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER(),1) AS pct
        FROM inspection_nonconformities n
        JOIN inspections i ON i.id = n.inspectionId
        WHERE i.completedAt BETWEEN ? AND ?
        GROUP BY n.severity ORDER BY count DESC
      `,
      logo_sync_success_rate: `
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS success,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END)  AS failed,
          ROUND(100.0 * SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) / NULLIF(COUNT(*),0),1) AS rate
        FROM logo_sync_queue
        WHERE createdAt BETWEEN ? AND ?
      `,
      sla_compliance: `
        SELECT metricName,
               COUNT(*) AS total,
               SUM(CASE WHEN status = 'met' THEN 1 ELSE 0 END)     AS met,
               SUM(CASE WHEN status = 'breached' THEN 1 ELSE 0 END) AS breached,
               ROUND(100.0 * SUM(CASE WHEN status = 'met' THEN 1 ELSE 0 END) / NULLIF(COUNT(*),0),1) AS rate
        FROM sla_tracking
        WHERE completedDate BETWEEN ? AND ?
        GROUP BY metricName
      `,
    };

    const sql = queries[metric];
    if (!sql) throw new Error('Tanımsız metrik');

    const startDate = params.startDate || new Date(Date.now() - 30 * 86400000);
    const endDate   = params.endDate   || new Date();
    const period    = params.period || 'month';

    // inspections_by_period needs: period, period, startDate, endDate
    // customer_activity needs: startDate, endDate, startDate, endDate (two JOINs)
    // equipment_control_compliance needs no date params
    // all other queries need: startDate, endDate
    let bindParams: any[];
    if (metric === 'inspections_by_period') {
      bindParams = [period, period, startDate, endDate];
    } else if (metric === 'customer_activity') {
      bindParams = [startDate, endDate, startDate, endDate];
    } else if (metric === 'equipment_control_compliance') {
      bindParams = [];
    } else {
      bindParams = [startDate, endDate];
    }

    return this.dataSource.query(sql, bindParams);
  }

  // ─── CSV Export ────────────────────────────────────────────────────────────
  async exportCsv(metric: MetricName, params: any): Promise<Buffer> {
    const rows = await this.getMetric(metric, params);
    if (!rows.length) return Buffer.from('');

    const headers = Object.keys(rows[0]).join(',');
    const body    = rows.map((r: any) => Object.values(r).map((v) => `"${v ?? ''}"`).join(',')).join('\n');
    return Buffer.from(`${headers}\n${body}`, 'utf-8');
  }

  // ─── KPI Özet (Dashboard için) ─────────────────────────────────────────────
  async getKpiSummary(period: 'month' | 'quarter' | 'year' = 'month'): Promise<any> {
    const since = period === 'month'
      ? new Date(new Date().setMonth(new Date().getMonth() - 1))
      : period === 'quarter'
      ? new Date(new Date().setMonth(new Date().getMonth() - 3))
      : new Date(new Date().setFullYear(new Date().getFullYear() - 1));

    const now = new Date();
    const p   = { startDate: since, endDate: now };

    const [delivery, compliance, sla] = await Promise.all([
      this.getMetric('report_delivery_time',       p),
      this.getMetric('equipment_control_compliance', p),
      this.getMetric('sla_compliance',              p),
    ]);

    return { period, reportDelivery: delivery[0], equipmentCompliance: compliance[0], slaCompliance: sla };
  }

  // ─── Haftalık otomatik rapor — Her pazartesi 09:00 ─────────────────────────
  @Cron('0 9 * * 1')
  async sendWeeklyReport(): Promise<void> {
    const kpi = await this.getKpiSummary('month');
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@perkont.com';

    await this.notificationsService.sendEmail({
      to:       adminEmail,
      subject:  `📊 PerKont Haftalık KPI Raporu — ${new Date().toLocaleDateString('tr-TR')}`,
      template: 'weekly-kpi-report',
      context:  { kpi, generatedAt: new Date().toISOString() },
    });
  }
}

@ApiTags('reporting') @ApiBearerAuth('JWT') @UseGuards(AuthGuard('jwt'), RolesGuard) @Controller('reporting')
export class ReportingController {
  constructor(private service: ReportingService) {}

  @Get('metrics')
  @Roles(UserRole.ADMIN, UserRole.EXECUTIVE, UserRole.TECHNICAL_MANAGER)
  getMetric(
    @Query('metric') metric: MetricName,
    @Query('startDate') startDate?: string,
    @Query('endDate')   endDate?: string,
    @Query('period')    period?: string,
  ) {
    return this.service.getMetric(metric, { startDate, endDate, period });
  }

  @Get('kpi')
  @Roles(UserRole.ADMIN, UserRole.EXECUTIVE, UserRole.TECHNICAL_MANAGER, UserRole.FINANCE)
  getKpi(@Query('period') period?: 'month' | 'quarter' | 'year') {
    return this.service.getKpiSummary(period || 'month');
  }

  @Get('export/csv')
  @Roles(UserRole.ADMIN, UserRole.EXECUTIVE)
  async exportCsv(
    @Query('metric') metric: MetricName,
    @Query('startDate') startDate?: string,
    @Query('endDate')   endDate?: string,
  ) {
    const csv = await this.service.exportCsv(metric, { startDate, endDate });
    return new StreamableFile(csv, {
      type: 'text/csv; charset=utf-8',
      disposition: `attachment; filename="${metric}_${new Date().toISOString().split('T')[0]}.csv"`,
    });
  }

  @Get('available-metrics')
  getAvailableMetrics() {
    return ALLOWED_METRICS.map((m) => ({ key: m, label: m.replace(/_/g, ' ') }));
  }
}

@Module({
  imports: [NotificationsModule],
  providers: [ReportingService],
  controllers: [ReportingController],
  exports: [ReportingService],
})
export class ReportingModule {}

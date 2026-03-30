import { Injectable, Controller, Get, UseGuards, Module } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Roles } from '@/common/decorators/roles.decorator';
import { RolesGuard } from '@/common/guards/roles.guard';
import { UserRole } from '@/common/enums/user-role.enum';

@Injectable()
export class MetricsService {
  constructor(@InjectDataSource() private ds: DataSource) {}

  async getPrometheusMetrics(): Promise<string> {
    const lines: string[] = [];
    const now = Date.now();

    try {
      // DB connection pool
      const pool = (this.ds.driver as any)?.pool;
      if (pool) {
        lines.push(`# HELP perkont_db_pool_total Total DB connections`);
        lines.push(`# TYPE perkont_db_pool_total gauge`);
        lines.push(`perkont_db_pool_total ${pool.totalCount || 0}`);
        lines.push(`# HELP perkont_db_pool_idle Idle DB connections`);
        lines.push(`# TYPE perkont_db_pool_idle gauge`);
        lines.push(`perkont_db_pool_idle ${pool.idleCount || 0}`);
      }

      // Uygulama metrikleri
      const [inspCount, reportCount, workOrderCount, pendingSync, logoQueue] = await Promise.all([
        this.ds.query(`SELECT COUNT(*) as c FROM inspections WHERE status = 'in_progress'`),
        this.ds.query(`SELECT COUNT(*) as c FROM reports WHERE status IN ('under_review','approved')`),
        this.ds.query(`SELECT COUNT(*) as c FROM work_orders WHERE status IN ('assigned','in_progress')`),
        this.ds.query(`SELECT COUNT(*) as c FROM inspections WHERE sync_status = 'pending'`),
        this.ds.query(`SELECT COUNT(*) as c FROM logo_sync_queue WHERE status = 'pending'`),
      ]);

      lines.push(`# HELP perkont_active_inspections Inspections in progress`);
      lines.push(`# TYPE perkont_active_inspections gauge`);
      lines.push(`perkont_active_inspections ${inspCount[0]?.c || 0}`);

      lines.push(`# HELP perkont_pending_reports Reports awaiting review or signing`);
      lines.push(`# TYPE perkont_pending_reports gauge`);
      lines.push(`perkont_pending_reports ${reportCount[0]?.c || 0}`);

      lines.push(`# HELP perkont_active_work_orders Active work orders`);
      lines.push(`# TYPE perkont_active_work_orders gauge`);
      lines.push(`perkont_active_work_orders ${workOrderCount[0]?.c || 0}`);

      lines.push(`# HELP perkont_offline_sync_pending Inspections pending sync`);
      lines.push(`# TYPE perkont_offline_sync_pending gauge`);
      lines.push(`perkont_offline_sync_pending ${pendingSync[0]?.c || 0}`);

      lines.push(`# HELP perkont_logo_queue_pending LOGO queue pending items`);
      lines.push(`# TYPE perkont_logo_queue_pending gauge`);
      lines.push(`perkont_logo_queue_pending ${logoQueue[0]?.c || 0}`);

      // Process metrics
      lines.push(`# HELP perkont_process_uptime_seconds Process uptime in seconds`);
      lines.push(`# TYPE perkont_process_uptime_seconds gauge`);
      lines.push(`perkont_process_uptime_seconds ${process.uptime()}`);

      lines.push(`# HELP perkont_process_memory_bytes Process memory usage`);
      lines.push(`# TYPE perkont_process_memory_bytes gauge`);
      const mem = process.memoryUsage();
      lines.push(`perkont_process_memory_bytes{type="rss"} ${mem.rss}`);
      lines.push(`perkont_process_memory_bytes{type="heap_used"} ${mem.heapUsed}`);
      lines.push(`perkont_process_memory_bytes{type="heap_total"} ${mem.heapTotal}`);
    } catch (err) {
      lines.push(`# SCRAPE_ERROR ${(err as any).message}`);
    }

    return lines.join('\n');
  }
}

@ApiTags('metrics') @Controller('metrics')
export class MetricsController {
  constructor(private service: MetricsService) {}

  // Prometheus scrape endpoint — IP whitelist ile korunmalı, token gerekmez
  @Get()
  async getMetrics() {
    const metrics = await this.service.getPrometheusMetrics();
    return metrics; // text/plain döner
  }
}

@Module({
  providers: [MetricsService],
  controllers: [MetricsController],
  exports: [MetricsService],
})
export class MetricsModule {}

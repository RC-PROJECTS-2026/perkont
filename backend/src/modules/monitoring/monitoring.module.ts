/**
 * PerKont Production Monitoring & Incident Management Module
 *
 * Features:
 * - Request correlation ID (X-Request-Id)
 * - Endpoint-level latency tracking (p95/p99 per route)
 * - Queue-level metrics (logo, notification, report, esign)
 * - MinIO upload/download latency
 * - DB slow query tracking with source endpoint
 * - Business metrics (WO/inspection/report counts, stuck states)
 * - Alert escalation (5m → 15m → 30m)
 * - Alert ownership (backend/devops/finance)
 * - Operational dashboard API
 */

import {
  Injectable, Module, Controller, Get, UseGuards, Query,
  NestInterceptor, ExecutionContext, CallHandler,
  Inject, Optional, OnModuleInit,
} from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '@/common/decorators/roles.decorator';
import { RolesGuard } from '@/common/guards/roles.guard';
import { UserRole } from '@/common/enums/user-role.enum';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { Observable, tap } from 'rxjs';
import * as crypto from 'crypto';
import * as os from 'os';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface AlertThreshold {
  metric: string;
  operator: '>' | '<' | '>=' | '<=';
  value: number;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  owner: 'backend' | 'devops' | 'finance' | 'all';
  cooldownMinutes: number;
}

interface AlertEvent {
  id: string;
  timestamp: string;
  severity: 'critical' | 'warning' | 'info';
  metric: string;
  value: number;
  threshold: number;
  message: string;
  owner: string;
  escalationLevel: number; // 0=initial, 1=followup, 2=critical escalation
  acknowledged: boolean;
}

interface EndpointMetric {
  route: string;
  method: string;
  count: number;
  errorCount: number;
  latencies: number[];
  p95: number;
  p99: number;
  avg: number;
}

interface MetricSnapshot {
  timestamp: string;
  requestId?: string;

  api: {
    totalRequests: number;
    errorCount: number;
    errorRate: number;
    avgLatencyMs: number;
    p95LatencyMs: number;
    p99LatencyMs: number;
    slowRequests: number;
    topEndpoints: EndpointMetric[];
    errorsByStatus: Record<number, number>;
  };

  redis: {
    connected: boolean;
    cacheHits: number;
    cacheMisses: number;
    hitRate: number;
    memoryUsedMb: number;
  };

  queues: {
    logo: { pending: number; failed: number; stuck: number; completed: number };
    notifications: { pending: number; failed: number };
    total: { pending: number; failed: number; stuck: number };
  };

  minio: {
    connected: boolean;
    uploadErrors: number;
    downloadErrors: number;
    avgUploadLatencyMs: number;
    avgDownloadLatencyMs: number;
    fileNotFoundCount: number;
  };

  db: {
    connected: boolean;
    activeConnections: number;
    poolSize: number;
    slowQueryCount: number;
    recentSlowQueries: Array<{ query: string; durationMs: number; endpoint: string; timestamp: string }>;
  };

  business: {
    lastHour: {
      workOrders: number;
      inspections: number;
      reports: number;
      proposals: number;
    };
    stuckStates: {
      underSigning: number;
      revisionRequested: number;
      pendingSync: number;
      logoFailed: number;
    };
  };

  system: {
    uptimeSeconds: number;
    memoryUsedMb: number;
    memoryTotalMb: number;
    memoryPercent: number;
    cpuPercent: number;
    loadAvg: number[];
  };

  alerts: AlertEvent[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// COUNTERS — in-memory, thread-safe singleton
// ═══════════════════════════════════════════════════════════════════════════════

class MonitoringCounters {
  // Global API
  totalRequests = 0;
  errorCount = 0;
  errorsByStatus: Record<number, number> = {};

  // Endpoint-level tracking
  endpoints: Map<string, { count: number; errors: number; latencies: number[] }> = new Map();

  // Redis cache
  cacheHits = 0;
  cacheMisses = 0;

  // MinIO
  uploadErrors = 0;
  downloadErrors = 0;
  uploadLatencies: number[] = [];
  downloadLatencies: number[] = [];
  fileNotFoundCount = 0;

  // DB
  slowQueries: Array<{ query: string; durationMs: number; endpoint: string; timestamp: string }> = [];

  // ── Record Methods ────────────────────────────────────────────────────

  recordRequest(route: string, method: string, latencyMs: number, statusCode: number) {
    this.totalRequests++;
    const isError = statusCode >= 400;
    if (isError) {
      this.errorCount++;
      this.errorsByStatus[statusCode] = (this.errorsByStatus[statusCode] || 0) + 1;
    }

    // Endpoint-level
    const key = `${method} ${route}`;
    let ep = this.endpoints.get(key);
    if (!ep) {
      ep = { count: 0, errors: 0, latencies: [] };
      this.endpoints.set(key, ep);
    }
    ep.count++;
    if (isError) ep.errors++;
    ep.latencies.push(latencyMs);
    if (ep.latencies.length > 2000) ep.latencies = ep.latencies.slice(-1000);
  }

  recordCacheHit() { this.cacheHits++; }
  recordCacheMiss() { this.cacheMisses++; }
  recordUploadError() { this.uploadErrors++; }
  recordDownloadError() { this.downloadErrors++; }
  recordUploadLatency(ms: number) { this.uploadLatencies.push(ms); if (this.uploadLatencies.length > 1000) this.uploadLatencies = this.uploadLatencies.slice(-500); }
  recordDownloadLatency(ms: number) { this.downloadLatencies.push(ms); if (this.downloadLatencies.length > 1000) this.downloadLatencies = this.downloadLatencies.slice(-500); }
  recordFileNotFound() { this.fileNotFoundCount++; }

  recordSlowQuery(query: string, durationMs: number, endpoint: string) {
    this.slowQueries.push({ query: query.slice(0, 200), durationMs, endpoint, timestamp: new Date().toISOString() });
    if (this.slowQueries.length > 50) this.slowQueries = this.slowQueries.slice(-30);
  }

  // ── Computed Metrics ──────────────────────────────────────────────────

  private percentile(arr: number[], p: number): number {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    return sorted[Math.min(Math.ceil((p / 100) * sorted.length) - 1, sorted.length - 1)];
  }

  private avg(arr: number[]): number {
    return arr.length === 0 ? 0 : Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
  }

  getAllLatencies(): number[] {
    const all: number[] = [];
    this.endpoints.forEach(ep => all.push(...ep.latencies));
    return all;
  }

  getErrorRate(): number {
    return this.totalRequests === 0 ? 0 : Math.round((this.errorCount / this.totalRequests) * 10000) / 100;
  }

  getCacheHitRate(): number {
    const total = this.cacheHits + this.cacheMisses;
    return total === 0 ? 0 : Math.round((this.cacheHits / total) * 10000) / 100;
  }

  getTopEndpoints(limit = 10): EndpointMetric[] {
    const results: EndpointMetric[] = [];
    this.endpoints.forEach((ep, key) => {
      const [method, ...routeParts] = key.split(' ');
      results.push({
        route: routeParts.join(' '),
        method,
        count: ep.count,
        errorCount: ep.errors,
        latencies: [],
        p95: this.percentile(ep.latencies, 95),
        p99: this.percentile(ep.latencies, 99),
        avg: this.avg(ep.latencies),
      });
    });
    return results.sort((a, b) => b.count - a.count).slice(0, limit);
  }

  getGlobalP95(): number { return this.percentile(this.getAllLatencies(), 95); }
  getGlobalP99(): number { return this.percentile(this.getAllLatencies(), 99); }
  getGlobalAvg(): number { return this.avg(this.getAllLatencies()); }
}

// Global singleton
export const counters = new MonitoringCounters();

// ═══════════════════════════════════════════════════════════════════════════════
// REQUEST INTERCEPTOR — Correlation ID + Endpoint Metrics
// ═══════════════════════════════════════════════════════════════════════════════

@Injectable()
export class MonitoringInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();

    // Skip internal endpoints
    const url: string = req.url || '';
    if (url.includes('/health') || url.includes('/metrics') || url.includes('/monitoring')) {
      return next.handle();
    }

    // Correlation ID
    const requestId = req.headers['x-request-id'] || crypto.randomUUID();
    req.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);

    const start = Date.now();

    // Normalize route (remove UUIDs for grouping)
    const route = this.normalizeRoute(url);
    const method = req.method || 'GET';

    return next.handle().pipe(
      tap({
        next: () => {
          const statusCode = res.statusCode || 200;
          counters.recordRequest(route, method, Date.now() - start, statusCode);
        },
        error: (err) => {
          const statusCode = err?.status || err?.statusCode || 500;
          counters.recordRequest(route, method, Date.now() - start, statusCode);
        },
      }),
    );
  }

  private normalizeRoute(url: string): string {
    // /api/v1/customers/abc-123-def → /customers/:id
    return url
      .replace(/\/api\/v1/, '')
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
      .replace(/\?.*$/, '')
      .replace(/\/+$/, '') || '/';
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MONITORING SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

@Injectable()
export class MonitoringService implements OnModuleInit {
  private redis: any = null;
  private alertHistory: AlertEvent[] = [];
  private lastAlertTimes: Map<string, number> = new Map();
  private alertCounts: Map<string, number> = new Map(); // For escalation
  private snapshots: MetricSnapshot[] = [];
  private previousCpuUsage = process.cpuUsage();
  private previousCpuTime = Date.now();

  private readonly thresholds: AlertThreshold[] = [
    // API
    { metric: 'api.errorRate', operator: '>', value: 1, severity: 'critical', message: 'API hata orani %1 uzerinde', owner: 'backend', cooldownMinutes: 5 },
    { metric: 'api.errorRate', operator: '>', value: 0.5, severity: 'warning', message: 'API hata orani %0.5 uzerinde', owner: 'backend', cooldownMinutes: 15 },
    { metric: 'api.p95LatencyMs', operator: '>', value: 2000, severity: 'critical', message: 'API p95 latency 2s uzerinde', owner: 'backend', cooldownMinutes: 5 },
    { metric: 'api.p95LatencyMs', operator: '>', value: 1000, severity: 'warning', message: 'API p95 latency 1s uzerinde', owner: 'backend', cooldownMinutes: 15 },

    // Redis
    { metric: 'redis.connected', operator: '<', value: 1, severity: 'critical', message: 'Redis DOWN — cache devre disi, dashboard yavaslayacak', owner: 'devops', cooldownMinutes: 2 },
    { metric: 'redis.hitRate', operator: '<', value: 50, severity: 'warning', message: 'Cache hit rate dusuk — DB yuku artabilir', owner: 'backend', cooldownMinutes: 30 },

    // Queue
    { metric: 'queues.total.pending', operator: '>', value: 100, severity: 'critical', message: 'Queue backlog 100+ — islem birikimi', owner: 'devops', cooldownMinutes: 5 },
    { metric: 'queues.total.pending', operator: '>', value: 50, severity: 'warning', message: 'Queue backlog 50+ — izlenmeli', owner: 'devops', cooldownMinutes: 15 },
    { metric: 'queues.total.failed', operator: '>', value: 10, severity: 'critical', message: '10+ basarisiz queue job', owner: 'backend', cooldownMinutes: 5 },
    { metric: 'queues.total.stuck', operator: '>', value: 0, severity: 'critical', message: 'Stuck job tespit edildi — manuel mudahale gerekli', owner: 'devops', cooldownMinutes: 10 },
    { metric: 'queues.logo.failed', operator: '>', value: 5, severity: 'warning', message: 'LOGO sync basarisiz — muhasebe etkilenir', owner: 'finance', cooldownMinutes: 15 },

    // MinIO
    { metric: 'minio.connected', operator: '<', value: 1, severity: 'critical', message: 'MinIO DOWN — dosya upload/download devre disi', owner: 'devops', cooldownMinutes: 2 },
    { metric: 'minio.uploadErrors', operator: '>', value: 5, severity: 'critical', message: 'Dosya upload hatalari artisti', owner: 'devops', cooldownMinutes: 10 },
    { metric: 'minio.downloadErrors', operator: '>', value: 5, severity: 'warning', message: 'Dosya download hatalari artisti', owner: 'backend', cooldownMinutes: 10 },

    // DB
    { metric: 'db.connected', operator: '<', value: 1, severity: 'critical', message: 'VERITABANI DOWN — sistem kullanimi durduruldu', owner: 'devops', cooldownMinutes: 1 },
    { metric: 'db.activeConnections', operator: '>', value: 45, severity: 'critical', message: 'DB pool %90 dolu — yeni istekler bloklanabilir', owner: 'devops', cooldownMinutes: 5 },
    { metric: 'db.slowQueryCount', operator: '>', value: 10, severity: 'warning', message: 'Yavas sorgu sayisi artisti', owner: 'backend', cooldownMinutes: 15 },

    // Business
    { metric: 'business.stuckStates.underSigning', operator: '>', value: 5, severity: 'warning', message: '5+ rapor UNDER_SIGNING stuck — e-imza servisi kontrol edilmeli', owner: 'backend', cooldownMinutes: 30 },
    { metric: 'business.stuckStates.logoFailed', operator: '>', value: 10, severity: 'warning', message: '10+ LOGO sync basarisiz — muhasebe etkileniyor', owner: 'finance', cooldownMinutes: 30 },
    { metric: 'business.stuckStates.pendingSync', operator: '>', value: 20, severity: 'warning', message: '20+ offline inspection sync bekliyor', owner: 'backend', cooldownMinutes: 30 },

    // System
    { metric: 'system.memoryPercent', operator: '>', value: 85, severity: 'critical', message: 'Memory %85+ — OOM riski', owner: 'devops', cooldownMinutes: 5 },
    { metric: 'system.memoryPercent', operator: '>', value: 75, severity: 'warning', message: 'Memory %75+ — izlenmeli', owner: 'devops', cooldownMinutes: 15 },
    { metric: 'system.cpuPercent', operator: '>', value: 90, severity: 'critical', message: 'CPU %90+ — performans degradasyonu', owner: 'devops', cooldownMinutes: 5 },
    { metric: 'system.cpuPercent', operator: '>', value: 80, severity: 'warning', message: 'CPU %80+ — yuk artisi', owner: 'devops', cooldownMinutes: 15 },
  ];

  constructor(
    @InjectDataSource() private dataSource: DataSource,
    @Optional() private configService?: ConfigService,
    @Optional() @Inject(WINSTON_MODULE_PROVIDER) private logger?: Logger,
  ) {}

  async onModuleInit() {
    try {
      const Redis = require('ioredis');
      const host = this.configService?.get('REDIS_HOST');
      if (host) {
        this.redis = new Redis({ host, port: this.configService?.get<number>('REDIS_PORT', 6379), password: this.configService?.get('REDIS_PASSWORD') || undefined, lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 3000 });
        await this.redis.connect().catch(() => { this.redis = null; });
      }
    } catch { this.redis = null; }
  }

  // ─── Snapshot Collection ────────────────────────────────────────────────

  async collectSnapshot(): Promise<MetricSnapshot> {
    const [redisStatus, queueStatus, minioStatus, dbStatus, businessMetrics] = await Promise.all([
      this.checkRedis(),
      this.checkQueues(),
      this.checkMinio(),
      this.checkDb(),
      this.collectBusinessMetrics(),
    ]);

    const snapshot: MetricSnapshot = {
      timestamp: new Date().toISOString(),
      api: {
        totalRequests: counters.totalRequests,
        errorCount: counters.errorCount,
        errorRate: counters.getErrorRate(),
        avgLatencyMs: counters.getGlobalAvg(),
        p95LatencyMs: counters.getGlobalP95(),
        p99LatencyMs: counters.getGlobalP99(),
        slowRequests: counters.getAllLatencies().filter(l => l > 2000).length,
        topEndpoints: counters.getTopEndpoints(10),
        errorsByStatus: { ...counters.errorsByStatus },
      },
      redis: redisStatus,
      queues: queueStatus,
      minio: minioStatus,
      db: dbStatus,
      business: businessMetrics,
      system: this.collectSystemMetrics(),
      alerts: [],
    };

    const alerts = this.evaluateThresholds(snapshot);
    snapshot.alerts = alerts;

    this.snapshots.push(snapshot);
    if (this.snapshots.length > 1440) this.snapshots = this.snapshots.slice(-1440);

    for (const alert of alerts) {
      const level = alert.severity === 'critical' ? 'error' : 'warn';
      this.logger?.[level](`[ALERT][${alert.owner}] ${alert.message} (${alert.metric}=${alert.value}, escalation=${alert.escalationLevel})`, 'Monitoring');
    }

    return snapshot;
  }

  // ─── Health Checks ──────────────────────────────────────────────────────

  private async checkRedis(): Promise<MetricSnapshot['redis']> {
    const base = { cacheHits: counters.cacheHits, cacheMisses: counters.cacheMisses, hitRate: counters.getCacheHitRate() };
    try {
      if (!this.redis) return { ...base, connected: false, memoryUsedMb: 0 };
      await this.redis.ping();
      let memMb = 0;
      try {
        const info = await this.redis.info('memory');
        const match = info.match(/used_memory:(\d+)/);
        if (match) memMb = Math.round(parseInt(match[1]) / 1024 / 1024);
      } catch { /* ignore */ }
      return { ...base, connected: true, memoryUsedMb: memMb };
    } catch {
      return { ...base, connected: false, memoryUsedMb: 0 };
    }
  }

  private async checkQueues(): Promise<MetricSnapshot['queues']> {
    try {
      const rows = await this.dataSource.query(`
        SELECT
          SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) as failed,
          SUM(CASE WHEN status IN ('success','partial_success') THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN status='pending' AND lastAttemptedAt < DATE_SUB(NOW(), INTERVAL 30 MINUTE) THEN 1 ELSE 0 END) as stuck
        FROM logo_sync_queue
      `);
      const logo = {
        pending: Number(rows[0]?.pending || 0),
        failed: Number(rows[0]?.failed || 0),
        stuck: Number(rows[0]?.stuck || 0),
        completed: Number(rows[0]?.completed || 0),
      };

      // Notification queue (from notifications table)
      let notifPending = 0, notifFailed = 0;
      try {
        const nrows = await this.dataSource.query(`SELECT COUNT(*) as c FROM notifications WHERE status='pending'`);
        notifPending = Number(nrows[0]?.c || 0);
      } catch { /* table may not exist */ }

      return {
        logo,
        notifications: { pending: notifPending, failed: notifFailed },
        total: { pending: logo.pending + notifPending, failed: logo.failed + notifFailed, stuck: logo.stuck },
      };
    } catch {
      return {
        logo: { pending: 0, failed: 0, stuck: 0, completed: 0 },
        notifications: { pending: 0, failed: 0 },
        total: { pending: 0, failed: 0, stuck: 0 },
      };
    }
  }

  private async checkMinio(): Promise<MetricSnapshot['minio']> {
    try {
      const Minio = require('minio');
      const client = new Minio.Client({
        endPoint: this.configService?.get('MINIO_ENDPOINT') || 'localhost',
        port: parseInt(this.configService?.get('MINIO_PORT') || '9000'),
        useSSL: this.configService?.get('MINIO_USE_SSL') === 'true',
        accessKey: this.configService?.get('MINIO_ACCESS_KEY') || 'minioadmin',
        secretKey: this.configService?.get('MINIO_SECRET_KEY') || 'minioadmin',
      });
      await client.listBuckets();
      return {
        connected: true,
        uploadErrors: counters.uploadErrors,
        downloadErrors: counters.downloadErrors,
        avgUploadLatencyMs: counters.uploadLatencies.length > 0 ? Math.round(counters.uploadLatencies.reduce((a, b) => a + b, 0) / counters.uploadLatencies.length) : 0,
        avgDownloadLatencyMs: counters.downloadLatencies.length > 0 ? Math.round(counters.downloadLatencies.reduce((a, b) => a + b, 0) / counters.downloadLatencies.length) : 0,
        fileNotFoundCount: counters.fileNotFoundCount,
      };
    } catch {
      return { connected: false, uploadErrors: counters.uploadErrors, downloadErrors: counters.downloadErrors, avgUploadLatencyMs: 0, avgDownloadLatencyMs: 0, fileNotFoundCount: counters.fileNotFoundCount };
    }
  }

  private async checkDb(): Promise<MetricSnapshot['db']> {
    try {
      await this.dataSource.query('SELECT 1');
      const pool = (this.dataSource.driver as any)?.pool;
      return {
        connected: true,
        activeConnections: pool?._allConnections?.length || pool?.totalCount || 0,
        poolSize: 50,
        slowQueryCount: counters.slowQueries.length,
        recentSlowQueries: counters.slowQueries.slice(-10),
      };
    } catch {
      return { connected: false, activeConnections: 0, poolSize: 50, slowQueryCount: 0, recentSlowQueries: [] };
    }
  }

  private async collectBusinessMetrics(): Promise<MetricSnapshot['business']> {
    try {
      const [hourly, stuck] = await Promise.all([
        this.dataSource.query(`
          SELECT
            (SELECT COUNT(*) FROM work_orders WHERE createdAt >= DATE_SUB(NOW(), INTERVAL 1 HOUR)) as wo,
            (SELECT COUNT(*) FROM inspections WHERE createdAt >= DATE_SUB(NOW(), INTERVAL 1 HOUR)) as insp,
            (SELECT COUNT(*) FROM reports WHERE createdAt >= DATE_SUB(NOW(), INTERVAL 1 HOUR)) as rpt,
            (SELECT COUNT(*) FROM proposals WHERE createdAt >= DATE_SUB(NOW(), INTERVAL 1 HOUR)) as prop
        `),
        this.dataSource.query(`
          SELECT
            (SELECT COUNT(*) FROM reports WHERE status='under_signing') as underSigning,
            (SELECT COUNT(*) FROM inspections WHERE status='revision_requested') as revisionRequested,
            (SELECT COUNT(*) FROM inspections WHERE syncStatus='pending') as pendingSync,
            (SELECT COUNT(*) FROM logo_sync_queue WHERE status='failed') as logoFailed
        `),
      ]);
      return {
        lastHour: {
          workOrders: Number(hourly[0]?.wo || 0),
          inspections: Number(hourly[0]?.insp || 0),
          reports: Number(hourly[0]?.rpt || 0),
          proposals: Number(hourly[0]?.prop || 0),
        },
        stuckStates: {
          underSigning: Number(stuck[0]?.underSigning || 0),
          revisionRequested: Number(stuck[0]?.revisionRequested || 0),
          pendingSync: Number(stuck[0]?.pendingSync || 0),
          logoFailed: Number(stuck[0]?.logoFailed || 0),
        },
      };
    } catch {
      return { lastHour: { workOrders: 0, inspections: 0, reports: 0, proposals: 0 }, stuckStates: { underSigning: 0, revisionRequested: 0, pendingSync: 0, logoFailed: 0 } };
    }
  }

  private collectSystemMetrics(): MetricSnapshot['system'] {
    const mem = process.memoryUsage();
    const totalMem = os.totalmem();
    const now = Date.now();
    const currentCpu = process.cpuUsage(this.previousCpuUsage);
    const elapsed = (now - this.previousCpuTime) * 1000; // microseconds
    const cpuPercent = elapsed > 0 ? Math.min(100, Math.round(((currentCpu.user + currentCpu.system) / elapsed) * 100)) : 0;
    this.previousCpuUsage = process.cpuUsage();
    this.previousCpuTime = now;

    return {
      uptimeSeconds: Math.round(process.uptime()),
      memoryUsedMb: Math.round(mem.rss / 1024 / 1024),
      memoryTotalMb: Math.round(totalMem / 1024 / 1024),
      memoryPercent: Math.round((mem.rss / totalMem) * 100),
      cpuPercent,
      loadAvg: os.loadavg().map(l => Math.round(l * 100) / 100),
    };
  }

  // ─── Alert Evaluation with Escalation ───────────────────────────────────

  private evaluateThresholds(snapshot: MetricSnapshot): AlertEvent[] {
    const alerts: AlertEvent[] = [];
    const now = Date.now();

    for (const threshold of this.thresholds) {
      const value = this.getNestedValue(snapshot, threshold.metric);
      if (value === undefined) continue;

      let triggered = false;
      switch (threshold.operator) {
        case '>':  triggered = value > threshold.value; break;
        case '<':  triggered = value < threshold.value; break;
        case '>=': triggered = value >= threshold.value; break;
        case '<=': triggered = value <= threshold.value; break;
      }

      if (!triggered) {
        // Reset escalation counter when metric recovers
        this.alertCounts.delete(threshold.metric);
        continue;
      }

      // Cooldown check
      const lastAlert = this.lastAlertTimes.get(threshold.metric) || 0;
      if (now - lastAlert < threshold.cooldownMinutes * 60 * 1000) continue;

      // Escalation: count consecutive triggers
      const prevCount = this.alertCounts.get(threshold.metric) || 0;
      const escalationLevel = prevCount >= 3 ? 2 : prevCount >= 1 ? 1 : 0;
      this.alertCounts.set(threshold.metric, prevCount + 1);
      this.lastAlertTimes.set(threshold.metric, now);

      const alert: AlertEvent = {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        severity: escalationLevel === 2 ? 'critical' : threshold.severity,
        metric: threshold.metric,
        value,
        threshold: threshold.value,
        message: escalationLevel === 2 ? `[ESCALATED] ${threshold.message}` : threshold.message,
        owner: threshold.owner,
        escalationLevel,
        acknowledged: false,
      };

      alerts.push(alert);
      this.alertHistory.push(alert);
    }

    if (this.alertHistory.length > 1000) this.alertHistory = this.alertHistory.slice(-1000);
    return alerts;
  }

  private getNestedValue(obj: any, path: string): number | undefined {
    let current = obj;
    for (const part of path.split('.')) {
      if (current === undefined || current === null) return undefined;
      current = current[part];
    }
    return typeof current === 'number' ? current : typeof current === 'boolean' ? (current ? 1 : 0) : undefined;
  }

  // ─── Cron ───────────────────────────────────────────────────────────────

  @Cron('* * * * *')
  async collectMetrics() {
    try {
      const snapshot = await this.collectSnapshot();
      const criticals = snapshot.alerts.filter(a => a.severity === 'critical');
      if (criticals.length > 0) await this.sendAlertEmail(criticals);
      // Warning escalation: if same warning 3+ times, send email too
      const escalated = snapshot.alerts.filter(a => a.escalationLevel >= 2 && a.severity === 'warning');
      if (escalated.length > 0) await this.sendAlertEmail(escalated);
    } catch (err) {
      this.logger?.error(`Monitoring failed: ${(err as any).message}`, 'Monitoring');
    }
  }

  private async sendAlertEmail(alerts: AlertEvent[]) {
    try {
      const nodemailer = require('nodemailer');
      const transporter = nodemailer.createTransport({
        host: this.configService?.get('SMTP_HOST'),
        port: this.configService?.get<number>('SMTP_PORT', 587),
        auth: { user: this.configService?.get('SMTP_USER'), pass: this.configService?.get('SMTP_PASS') },
      });

      const owners = [...new Set(alerts.map(a => a.owner))];
      const alertLines = alerts.map(a =>
        `[${a.severity.toUpperCase()}] ${a.message}\n  Metric: ${a.metric} = ${a.value} (limit: ${a.threshold})\n  Owner: ${a.owner}\n  Escalation: Level ${a.escalationLevel}\n  Time: ${a.timestamp}`
      ).join('\n\n');

      const escalationNote = alerts.some(a => a.escalationLevel >= 2)
        ? '\n\n⚠️ BU ALARM ESCALATE EDILMISTIR — onceki uyarilar cevaplanmadi.\n'
        : '';

      await transporter.sendMail({
        from: this.configService?.get('SMTP_FROM') || 'monitoring@perkont.com',
        to: this.configService?.get('ALERT_EMAIL') || 'admin@perkont.com',
        subject: `[PERKONT] ${alerts[0]?.severity?.toUpperCase()} — ${alerts.length} alarm (owners: ${owners.join(', ')})`,
        text: `PerKont Production Monitoring${escalationNote}\n\n${alertLines}\n\n---\nDashboard: /monitoring/dashboard\nOtomatik bildirim.`,
      });
    } catch (err) {
      this.logger?.error(`Alert email failed: ${(err as any).message}`, 'Monitoring');
    }
  }

  // ─── Public API ─────────────────────────────────────────────────────────

  getLatestSnapshot() { return this.snapshots.length > 0 ? this.snapshots[this.snapshots.length - 1] : null; }
  getHistory(minutes = 60) { const cutoff = new Date(Date.now() - minutes * 60 * 1000).toISOString(); return this.snapshots.filter(s => s.timestamp >= cutoff); }
  getAlertHistory(limit = 100) { return this.alertHistory.slice(-limit); }

  acknowledgeAlert(alertId: string): boolean {
    const alert = this.alertHistory.find(a => a.id === alertId);
    if (alert) { alert.acknowledged = true; return true; }
    return false;
  }

  getStatus(): { status: 'healthy' | 'degraded' | 'critical'; services: Record<string, boolean>; uptime: number; activeAlerts: number } {
    const latest = this.getLatestSnapshot();
    if (!latest) return { status: 'healthy', services: { db: true, redis: false, minio: false, queue: true }, uptime: process.uptime(), activeAlerts: 0 };

    const services = { db: latest.db.connected, redis: latest.redis.connected, minio: latest.minio.connected, queue: latest.queues.total.stuck === 0 };
    const criticalDown = !services.db;
    const degraded = !services.redis || !services.minio || !services.queue || latest.api.errorRate > 1;
    const unack = this.alertHistory.filter(a => !a.acknowledged && a.severity === 'critical').length;

    return { status: criticalDown ? 'critical' : degraded ? 'degraded' : 'healthy', services, uptime: process.uptime(), activeAlerts: unack };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTROLLER
// ═══════════════════════════════════════════════════════════════════════════════

@ApiTags('monitoring')
@ApiBearerAuth('JWT')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('monitoring')
export class MonitoringController {
  constructor(private service: MonitoringService) {}

  @Get('status')
  @Roles(UserRole.ADMIN, UserRole.EXECUTIVE)
  getStatus() { return this.service.getStatus(); }

  @Get('snapshot')
  @Roles(UserRole.ADMIN)
  async getSnapshot() { return this.service.collectSnapshot(); }

  @Get('history')
  @Roles(UserRole.ADMIN)
  getHistory(@Query('minutes') minutes?: number) { return this.service.getHistory(minutes || 60); }

  @Get('alerts')
  @Roles(UserRole.ADMIN, UserRole.EXECUTIVE)
  getAlerts(@Query('limit') limit?: number) { return this.service.getAlertHistory(limit || 100); }

  @Get('alerts/:id/acknowledge')
  @Roles(UserRole.ADMIN)
  ackAlert(@Query('id') id: string) { return { acknowledged: this.service.acknowledgeAlert(id) }; }

  @Get('dashboard')
  @Roles(UserRole.ADMIN, UserRole.EXECUTIVE)
  async getDashboard() {
    const snapshot = await this.service.collectSnapshot();
    const history = this.service.getHistory(60);
    const alerts = this.service.getAlertHistory(50);
    const status = this.service.getStatus();

    return {
      status,
      current: snapshot,
      trend: {
        errorRate: history.map(h => ({ t: h.timestamp, v: h.api.errorRate })),
        p95Latency: history.map(h => ({ t: h.timestamp, v: h.api.p95LatencyMs })),
        memoryPercent: history.map(h => ({ t: h.timestamp, v: h.system.memoryPercent })),
        cpuPercent: history.map(h => ({ t: h.timestamp, v: h.system.cpuPercent })),
        queueBacklog: history.map(h => ({ t: h.timestamp, v: h.queues.total.pending })),
        cacheHitRate: history.map(h => ({ t: h.timestamp, v: h.redis.hitRate })),
        businessVolume: history.map(h => ({ t: h.timestamp, wo: h.business.lastHour.workOrders, insp: h.business.lastHour.inspections })),
      },
      topEndpoints: snapshot.api.topEndpoints,
      slowQueries: snapshot.db.recentSlowQueries,
      stuckStates: snapshot.business.stuckStates,
      recentAlerts: alerts,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE
// ═══════════════════════════════════════════════════════════════════════════════

@Module({
  providers: [
    MonitoringService,
    { provide: APP_INTERCEPTOR, useClass: MonitoringInterceptor },
  ],
  controllers: [MonitoringController],
  exports: [MonitoringService],
})
export class MonitoringModule {}

import { Controller, Get, Module, Injectable } from '@nestjs/common';
import { HealthCheckService, TypeOrmHealthIndicator, HealthCheck, HealthIndicatorResult } from '@nestjs/terminus';
import { TerminusModule, HealthIndicator } from '@nestjs/terminus';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ApiTags } from '@nestjs/swagger';

@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  constructor(private configService: ConfigService) { super(); }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      const Redis = require('ioredis');
      const host = this.configService.get('REDIS_HOST');
      if (!host) return this.getStatus(key, false, { message: 'Redis not configured' });

      const redis = new Redis({ host, port: this.configService.get<number>('REDIS_PORT', 6379), connectTimeout: 2000, maxRetriesPerRequest: 1, lazyConnect: true });
      await redis.connect();
      const pong = await redis.ping();
      const info = await redis.info('memory');
      const usedMem = info.match(/used_memory_human:(\S+)/)?.[1] || 'unknown';
      await redis.quit();
      return this.getStatus(key, pong === 'PONG', { memory: usedMem });
    } catch (e) {
      return this.getStatus(key, false, { error: (e as any).message?.slice(0, 80) });
    }
  }
}

@Injectable()
export class MinioHealthIndicator extends HealthIndicator {
  constructor(private configService: ConfigService) { super(); }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      const Minio = require('minio');
      const client = new Minio.Client({
        endPoint: this.configService.get('MINIO_ENDPOINT') || 'localhost',
        port: parseInt(this.configService.get('MINIO_PORT') || '9000'),
        useSSL: this.configService.get('MINIO_USE_SSL') === 'true',
        accessKey: this.configService.get('MINIO_ACCESS_KEY') || 'minioadmin',
        secretKey: this.configService.get('MINIO_SECRET_KEY') || 'minioadmin',
      });
      const buckets = await client.listBuckets();
      return this.getStatus(key, true, { bucketCount: buckets.length });
    } catch (e) {
      return this.getStatus(key, false, { error: (e as any).message?.slice(0, 80) });
    }
  }
}

@Injectable()
export class QueueHealthIndicator extends HealthIndicator {
  constructor(@InjectDataSource() private ds: DataSource) { super(); }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      const [rows] = await this.ds.query(`
        SELECT
          SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) as failed,
          SUM(CASE WHEN status='pending' AND lastAttemptedAt < DATE_SUB(NOW(), INTERVAL 30 MINUTE) THEN 1 ELSE 0 END) as stuck
        FROM logo_sync_queue
      `);
      const pending = Number(rows?.pending || 0);
      const failed = Number(rows?.failed || 0);
      const stuck = Number(rows?.stuck || 0);
      return this.getStatus(key, stuck === 0, { pending, failed, stuck });
    } catch (e) {
      return this.getStatus(key, false, { error: (e as any).message?.slice(0, 80) });
    }
  }
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private db: TypeOrmHealthIndicator,
    private redisHealth: RedisHealthIndicator,
    private minioHealth: MinioHealthIndicator,
    private queueHealth: QueueHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.db.pingCheck('database'),
      () => this.redisHealth.isHealthy('redis'),
      () => this.minioHealth.isHealthy('minio'),
      () => this.queueHealth.isHealthy('queue'),
    ]);
  }

  @Get('ping')
  ping() {
    const mem = process.memoryUsage();
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
      version: process.env.npm_package_version || '1.0.0',
      memory: {
        rss: Math.round(mem.rss / 1024 / 1024) + 'MB',
        heapUsed: Math.round(mem.heapUsed / 1024 / 1024) + 'MB',
      },
    };
  }
}

@Module({
  imports: [TerminusModule],
  providers: [RedisHealthIndicator, MinioHealthIndicator, QueueHealthIndicator],
  controllers: [HealthController],
})
export class HealthModule {}

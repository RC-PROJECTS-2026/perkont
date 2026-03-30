import { Entity, Column, Index } from 'typeorm';
import { AbstractEntity } from '@/common/entities/abstract.entity';
import {
  Injectable, Controller, Get, Post, Body,
  Query, UseGuards, Module, Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Cron } from '@nestjs/schedule';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { Roles } from '@/common/decorators/roles.decorator';
import { RolesGuard } from '@/common/guards/roles.guard';
import { UserRole } from '@/common/enums/user-role.enum';
import { StorageService, StorageBucket } from '@/modules/storage/storage.service';
import { StorageModule } from '@/modules/storage/storage.module';
import { NotificationsModule } from '@/modules/notifications/notifications.module';
import { NotificationsService } from '@/modules/notifications/notifications.service';

// ─── Entity ───────────────────────────────────────────────────────────────────
@Entity('storage_usage_snapshots')
@Index(['bucket', 'snapshotDate'])
export class StorageUsageSnapshot extends AbstractEntity {
  @Column() bucket: string;                         // reports, photos, documents, archive
  @Column({ type: 'bigint' }) usedBytes: number;
  @Column({ type: 'bigint' }) quotaBytes: number;
  @Column({ type: 'int'    }) usagePercent: number;
  @Column({ type: 'int'    }) fileCount: number;
  @Column({ type: 'date'   }) snapshotDate: Date;
  @Column({ nullable: true }) notes: string;
}

// ─── Service ─────────────────────────────────────────────────────────────────
@Injectable()
export class StorageQuotaService {
  // Bucket bazlı kota limitleri (GB)
  private readonly QUOTA_GB: Record<string, number> = {
    [StorageBucket.REPORTS]:   50,
    [StorageBucket.PHOTOS]:    200,
    [StorageBucket.DOCUMENTS]: 20,
    [StorageBucket.ARCHIVE]:   500,
  };

  constructor(
    @InjectRepository(StorageUsageSnapshot) private snapshotRepo: Repository<StorageUsageSnapshot>,
    private storageService: StorageService,
    private notificationsService: NotificationsService,
    @Inject(WINSTON_MODULE_PROVIDER) private logger: Logger,
  ) {}

  async getUsageSummary() {
    const buckets = Object.values(StorageBucket);
    const summary: Record<string, any> = {};
    let totalUsedGB = 0;

    for (const bucket of buckets) {
      try {
        const stats = await this.storageService.getBucketStats(bucket);
        const quotaGB = this.QUOTA_GB[bucket] || 50;
        const usedGB  = stats.usedBytes / (1024 ** 3);
        const percent = Math.round((usedGB / quotaGB) * 100);
        totalUsedGB += usedGB;

        summary[bucket] = {
          bucket,
          usedBytes:     stats.usedBytes,
          usedGB:        usedGB.toFixed(2),
          quotaGB,
          usagePercent:  percent,
          fileCount:     stats.fileCount,
          status:        percent >= 90 ? 'critical' : percent >= 75 ? 'warning' : 'ok',
        };
      } catch (err) {
        summary[bucket] = { bucket, error: (err as any).message };
      }
    }

    return {
      buckets: summary,
      totalUsedGB:    totalUsedGB.toFixed(2),
      totalQuotaGB:   Object.values(this.QUOTA_GB).reduce((a, b) => a + b, 0),
      overallPercent: Math.round((totalUsedGB / Object.values(this.QUOTA_GB).reduce((a, b) => a + b, 0)) * 100),
    };
  }

  async getUsageHistory(bucket: string, days = 30): Promise<StorageUsageSnapshot[]> {
    const since = new Date();
    since.setDate(since.getDate() - days);
    return this.snapshotRepo.find({
      where: { bucket, snapshotDate: since as any },
      order: { snapshotDate: 'ASC' },
    });
  }

  async getLargestFiles(bucket: string, limit = 20): Promise<any[]> {
    return this.storageService.getLargestObjects(bucket, limit);
  }

  // ─── Her gece 02:00 snapshot al ──────────────────────────────────────────
  @Cron('0 2 * * *')
  async takeUsageSnapshot(): Promise<void> {
    this.logger.log('Depolama kullanım snapshot alınıyor...', 'StorageQuota');
    const buckets = Object.values(StorageBucket);

    for (const bucket of buckets) {
      try {
        const stats   = await this.storageService.getBucketStats(bucket);
        const quotaBytes = (this.QUOTA_GB[bucket] || 50) * (1024 ** 3);
        const percent = Math.round((stats.usedBytes / quotaBytes) * 100);

        await this.snapshotRepo.save(
          this.snapshotRepo.create({
            bucket,
            usedBytes:    stats.usedBytes,
            quotaBytes,
            usagePercent: percent,
            fileCount:    stats.fileCount,
            snapshotDate: new Date(),
          }),
        );

        // %90 üzeri kota uyarısı
        if (percent >= 90) {
          await this.notificationsService.sendEmail({
            to:       process.env.ADMIN_EMAIL || 'admin@perkont.com',
            subject:  `⚠️ Depolama Kotası Uyarısı: ${bucket} %${percent} dolu`,
            template: 'storage-quota-warning',
            context:  { bucket, usedGB: (stats.usedBytes / (1024 ** 3)).toFixed(1), percent },
          });
        }
      } catch (err: any) {
        this.logger.error(`Snapshot hatası (${bucket}): ${err.message}`, 'StorageQuota');
      }
    }
  }

  // Eski arşiv dosyalarını temizle (konfigürasyon gereği)
  async purgeOldFiles(bucket: string, olderThanDays: number): Promise<{ deleted: number }> {
    // Sadece geçici bucket'larda (photos/documents) çalışır, archive'a dokunmaz
    if (bucket === StorageBucket.ARCHIVE) {
      throw new Error('Arşiv bucket\'ı temizlenemez — akreditasyon zorunluluğu');
    }
    return this.storageService.deleteOlderThan(bucket, olderThanDays);
  }
}

// ─── Controller ──────────────────────────────────────────────────────────────
@ApiTags('storage-quota') @ApiBearerAuth('JWT') @UseGuards(AuthGuard('jwt'), RolesGuard) @Controller('storage-quota')
export class StorageQuotaController {
  constructor(private service: StorageQuotaService) {}

  @Get('summary')   @Roles(UserRole.ADMIN, UserRole.EXECUTIVE)
  getSummary() { return this.service.getUsageSummary(); }

  @Get('history')   @Roles(UserRole.ADMIN, UserRole.EXECUTIVE)
  getHistory(@Query('bucket') bucket: string, @Query('days') days?: number) {
    return this.service.getUsageHistory(bucket, days || 30);
  }

  @Get('largest')   @Roles(UserRole.ADMIN)
  getLargest(@Query('bucket') bucket: string, @Query('limit') limit?: number) {
    return this.service.getLargestFiles(bucket, limit || 20);
  }
}

// ─── Module ───────────────────────────────────────────────────────────────────
@Module({
  imports: [TypeOrmModule.forFeature([StorageUsageSnapshot]), StorageModule, NotificationsModule],
  providers: [StorageQuotaService],
  controllers: [StorageQuotaController],
  exports: [StorageQuotaService],
})
export class StorageQuotaModule {}

import { Entity, Column, Index } from 'typeorm';
import { AbstractEntity } from '@/common/entities/abstract.entity';
import {
  Injectable, Controller, Get, Post, Put, Patch,
  Body, Param, Query, UseGuards, Module,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { Roles } from '@/common/decorators/roles.decorator';
import { RolesGuard } from '@/common/guards/roles.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { UserRole } from '@/common/enums/user-role.enum';
import { PaginationDto, PaginatedResult } from '@/common/dto/pagination.dto';
import { AuditModule } from '@/modules/audit/audit.module';
import { AuditService } from '@/modules/audit/audit.service';

export enum DevicePlatform { IOS = 'ios', ANDROID = 'android' }
export enum DeviceStatus   { ACTIVE = 'active', INACTIVE = 'inactive', BLOCKED = 'blocked' }

// ─── Entities ─────────────────────────────────────────────────────────────────
@Entity('mobile_devices')
@Index(['userId'])
export class MobileDevice extends AbstractEntity {
  @Column({ unique: true }) deviceId: string;          // Cihazın expo/OS unique ID
  @Column() userId: string;                             // Sahibi
  @Column({ nullable: true }) deviceName: string;      // iPhone 14 Pro
  @Column({ nullable: true }) deviceModel: string;
  @Column({ type: 'enum', enum: DevicePlatform }) platform: DevicePlatform;
  @Column({ nullable: true }) osVersion: string;       // iOS 17.2
  @Column({ nullable: true }) appVersion: string;      // 1.0.5
  @Column({ nullable: true }) buildNumber: string;
  @Column({ nullable: true }) pushToken: string;       // FCM/APNS token
  @Column({ type: 'enum', enum: DeviceStatus, default: DeviceStatus.ACTIVE }) status: DeviceStatus;
  @Column({ nullable: true }) lastSeenAt: Date;
  @Column({ nullable: true }) lastSyncAt: Date;
  @Column({ nullable: true }) ipAddress: string;
  @Column({ nullable: true }) blockedReason: string;
  @Column({ nullable: true }) blockedAt: Date;
}

@Entity('app_versions')
export class AppVersion extends AbstractEntity {
  @Column() version: string;                           // 1.0.5
  @Column() buildNumber: string;
  @Column({ type: 'enum', enum: DevicePlatform }) platform: DevicePlatform;
  @Column({ default: false }) isForceUpdate: boolean; // Bu sürümün altındakiler zorla güncellenir
  @Column({ default: false }) isLatest: boolean;
  @Column({ nullable: true }) releaseNotes: string;
  @Column({ nullable: true }) downloadUrl: string;    // App Store / Play Store URL
  @Column({ nullable: true }) minimumOsVersion: string;
  @Column({ nullable: true }) releasedAt: Date;
}

@Entity('device_logs')
@Index(['deviceId', 'createdAt'])
export class DeviceLog extends AbstractEntity {
  @Column() deviceId: string;
  @Column() action: string;                            // sync_started, sync_completed, inspection_started vb.
  @Column({ type: 'json', nullable: true }) metadata: Record<string, any>;
  @Column({ nullable: true }) errorMessage: string;
}

// ─── Service ─────────────────────────────────────────────────────────────────
@Injectable()
export class DeviceManagementService {
  constructor(
    @InjectRepository(MobileDevice) private deviceRepo: Repository<MobileDevice>,
    @InjectRepository(AppVersion)   private versionRepo: Repository<AppVersion>,
    @InjectRepository(DeviceLog)    private logRepo: Repository<DeviceLog>,
    private auditService: AuditService,
  ) {}

  // ─── Cihaz kayıt / güncelleme (her login'de çağrılır) ────────────────────
  async registerOrUpdate(data: {
    deviceId: string; userId: string; deviceName?: string; deviceModel?: string;
    platform: DevicePlatform; osVersion?: string; appVersion?: string;
    buildNumber?: string; pushToken?: string; ipAddress?: string;
  }): Promise<{ device: MobileDevice; forceUpdate: boolean; latestVersion: string }> {
    let device = await this.deviceRepo.findOne({ where: { deviceId: data.deviceId } });

    if (!device) {
      device = this.deviceRepo.create({ ...data });
    } else {
      Object.assign(device, data, { lastSeenAt: new Date() });
    }

    if (device.status === DeviceStatus.BLOCKED) {
      throw new Error(`Bu cihaz bloke edilmiştir: ${device.blockedReason}`);
    }

    const saved = await this.deviceRepo.save(device);

    // Zorla güncelleme kontrolü
    const latestVersion = await this.versionRepo.findOne({
      where: { platform: data.platform, isLatest: true },
    });

    let forceUpdate = false;
    if (latestVersion?.isForceUpdate && data.appVersion) {
      forceUpdate = this.compareVersions(data.appVersion, latestVersion.version) < 0;
    }

    return {
      device: saved,
      forceUpdate,
      latestVersion: latestVersion?.version || '',
    };
  }

  async findAllDevices(
    filters: { userId?: string; platform?: string; status?: string },
    pagination: PaginationDto,
  ): Promise<PaginatedResult<MobileDevice>> {
    const qb = this.deviceRepo.createQueryBuilder('d');
    if (filters.userId)   qb.andWhere('d.userId = :uid', { uid: filters.userId });
    if (filters.platform) qb.andWhere('d.platform = :p', { p: filters.platform });
    if (filters.status)   qb.andWhere('d.status = :s', { s: filters.status });
    qb.orderBy('d.lastSeenAt', 'DESC').skip(pagination.skip).take(pagination.limit);
    const [data, total] = await qb.getManyAndCount();
    return new PaginatedResult(data, total, pagination.page, pagination.limit);
  }

  async blockDevice(deviceId: string, reason: string, userId: string): Promise<MobileDevice> {
    const device = await this.deviceRepo.findOneOrFail({ where: { id: deviceId } });
    await this.deviceRepo.update(deviceId, {
      status: DeviceStatus.BLOCKED, blockedReason: reason, blockedAt: new Date(),
    });
    await this.auditService.log({ userId, action: 'DEVICE_BLOCKED', entityType: 'MobileDevice', entityId: deviceId });
    return { ...device, status: DeviceStatus.BLOCKED } as MobileDevice;
  }

  async getDeviceStats() {
    const total   = await this.deviceRepo.count();
    const active  = await this.deviceRepo.count({ where: { status: DeviceStatus.ACTIVE } });
    const blocked = await this.deviceRepo.count({ where: { status: DeviceStatus.BLOCKED } });
    const ios     = await this.deviceRepo.count({ where: { platform: DevicePlatform.IOS, status: DeviceStatus.ACTIVE } });
    const android = await this.deviceRepo.count({ where: { platform: DevicePlatform.ANDROID, status: DeviceStatus.ACTIVE } });

    // Versiyon dağılımı
    const versions = await this.deviceRepo
      .createQueryBuilder('d')
      .select('d.appVersion, COUNT(*) as count')
      .where('d.status = :s', { s: DeviceStatus.ACTIVE })
      .groupBy('d.appVersion')
      .orderBy('count', 'DESC')
      .getRawMany();

    return { total, active, blocked, ios, android, versions };
  }

  async createVersion(data: Partial<AppVersion>): Promise<AppVersion> {
    if (data.isLatest) {
      await this.versionRepo.update({ platform: data.platform, isLatest: true }, { isLatest: false });
    }
    return this.versionRepo.save(this.versionRepo.create(data));
  }

  async logDeviceActivity(deviceId: string, action: string, metadata?: any): Promise<void> {
    await this.logRepo.save(this.logRepo.create({ deviceId, action, metadata }));
  }

  async getDeviceLogs(deviceId: string, limit = 50): Promise<DeviceLog[]> {
    return this.logRepo.find({
      where: { deviceId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  private compareVersions(v1: string, v2: string): number {
    const a = v1.split('.').map(Number);
    const b = v2.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      if ((a[i] || 0) < (b[i] || 0)) return -1;
      if ((a[i] || 0) > (b[i] || 0)) return 1;
    }
    return 0;
  }
}

// ─── Controller ──────────────────────────────────────────────────────────────
@ApiTags('device-management') @ApiBearerAuth('JWT') @UseGuards(AuthGuard('jwt'), RolesGuard) @Controller('device-management')
export class DeviceManagementController {
  constructor(private service: DeviceManagementService) {}

  @Post('register')
  @ApiOperation({ summary: 'Cihaz kayıt / güncelleme — her login\'de çağrılır' })
  register(@Body() body: any, @CurrentUser('id') userId: string) {
    return this.service.registerOrUpdate({ ...body, userId });
  }

  @Get()  @Roles(UserRole.ADMIN, UserRole.EXECUTIVE)
  findAll(@Query() p: PaginationDto, @Query('userId') userId?: string, @Query('platform') platform?: string, @Query('status') status?: string) {
    return this.service.findAllDevices({ userId, platform, status }, p);
  }

  @Get('stats') @Roles(UserRole.ADMIN, UserRole.EXECUTIVE)
  getStats() { return this.service.getDeviceStats(); }

  @Patch(':id/block') @Roles(UserRole.ADMIN)
  block(@Param('id') id: string, @Body('reason') reason: string, @CurrentUser('id') uid: string) {
    return this.service.blockDevice(id, reason, uid);
  }

  @Get(':deviceId/logs') @Roles(UserRole.ADMIN)
  getLogs(@Param('deviceId') deviceId: string, @Query('limit') limit?: number) {
    return this.service.getDeviceLogs(deviceId, limit || 50);
  }

  @Post('versions') @Roles(UserRole.ADMIN)
  createVersion(@Body() body: any) { return this.service.createVersion(body); }
}

// ─── Module ───────────────────────────────────────────────────────────────────
@Module({
  imports: [TypeOrmModule.forFeature([MobileDevice, AppVersion, DeviceLog]), AuditModule],
  providers: [DeviceManagementService],
  controllers: [DeviceManagementController],
  exports: [DeviceManagementService],
})
export class DeviceManagementModule {}

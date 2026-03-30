import { Entity, Column, Index } from 'typeorm';
import { AbstractEntity } from '@/common/entities/abstract.entity';
import {
  Injectable, NotFoundException, Controller, Get, Post, Put,
  Body, Param, Query, UseGuards, Module,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Cron } from '@nestjs/schedule';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '@/common/decorators/roles.decorator';
import { RolesGuard } from '@/common/guards/roles.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { UserRole } from '@/common/enums/user-role.enum';
import { PaginationDto, PaginatedResult } from '@/common/dto/pagination.dto';
import { AuditModule } from '@/modules/audit/audit.module';
import { AuditService } from '@/modules/audit/audit.service';
import { NotificationsModule } from '@/modules/notifications/notifications.module';
import { NotificationsService } from '@/modules/notifications/notifications.service';

export enum SlaStatus { ACTIVE = 'active', BREACHED = 'breached', AT_RISK = 'at_risk', MET = 'met' }

// ─── SLA Tanımı (kontrat bazlı) ───────────────────────────────────────────────
@Entity('sla_definitions')
export class SlaDefinition extends AbstractEntity {
  @Column({ nullable: true }) contractId: string;
  @Column({ nullable: true }) customerId: string;
  @Column() name: string;                                    // "Standart SLA", "Premium SLA"

  // Süreler (iş günü)
  @Column({ type: 'int', default: 5  }) reportDeliveryDays: number;   // Denetim→Rapor
  @Column({ type: 'int', default: 10 }) invoicingDays: number;        // Rapor→Fatura
  @Column({ type: 'int', default: 3  }) revisionResponseDays: number; // Revizyon→Cevap
  @Column({ type: 'int', default: 30 }) complaintResolutionDays: number;

  @Column({ default: true }) isActive: boolean;
  @Column({ nullable: true }) createdById: string;
}

// ─── SLA Takip Kaydı ──────────────────────────────────────────────────────────
@Entity('sla_tracking')
@Index(['entityType', 'entityId'])
@Index(['status'])
export class SlaTracking extends AbstractEntity {
  @Column() slaDefinitionId: string;
  @Column() entityType: string;      // work_order, report, complaint
  @Column() entityId: string;
  @Column() metricName: string;      // report_delivery, invoicing, complaint_resolution

  @Column() startDate: Date;
  @Column() dueDate: Date;           // SLA deadline
  @Column({ nullable: true }) completedDate: Date;

  @Column({ type: 'enum', enum: SlaStatus, default: SlaStatus.ACTIVE }) status: SlaStatus;
  @Column({ type: 'int', nullable: true }) daysElapsed: number;
  @Column({ type: 'int', nullable: true }) daysRemaining: number;
  @Column({ default: false }) notificationSent: boolean;

  @Column({ nullable: true }) customerId: string;
}

@Injectable()
export class SlaService {
  constructor(
    @InjectRepository(SlaDefinition) private defRepo: Repository<SlaDefinition>,
    @InjectRepository(SlaTracking)   private trackRepo: Repository<SlaTracking>,
    private auditService: AuditService,
    private notificationsService: NotificationsService,
  ) {}

  async createDefinition(data: Partial<SlaDefinition>, userId: string): Promise<SlaDefinition> {
    const def = this.defRepo.create({ ...data, createdById: userId });
    return this.defRepo.save(def);
  }

  async findAllDefinitions(): Promise<SlaDefinition[]> {
    return this.defRepo.find({ where: { isActive: true }, order: { name: 'ASC' } });
  }

  async startTracking(data: {
    slaDefinitionId: string;
    entityType: string;
    entityId: string;
    metricName: string;
    customerId?: string;
  }): Promise<SlaTracking> {
    const def = await this.defRepo.findOne({ where: { id: data.slaDefinitionId } });
    if (!def) throw new NotFoundException('SLA tanımı bulunamadı');

    const daysMap: Record<string, number> = {
      report_delivery:       def.reportDeliveryDays,
      invoicing:             def.invoicingDays,
      revision_response:     def.revisionResponseDays,
      complaint_resolution:  def.complaintResolutionDays,
    };

    const startDate = new Date();
    const dueDate   = this.addBusinessDays(startDate, daysMap[data.metricName] || 5);

    const tracking = this.trackRepo.create({ ...data, startDate, dueDate });
    return this.trackRepo.save(tracking);
  }

  async completeTracking(entityType: string, entityId: string, metricName: string): Promise<void> {
    const tracking = await this.trackRepo.findOne({ where: { entityType, entityId, metricName } });
    if (!tracking) return;

    const now      = new Date();
    const breached = now > tracking.dueDate;
    await this.trackRepo.update(tracking.id, {
      completedDate: now,
      status: breached ? SlaStatus.BREACHED : SlaStatus.MET,
    });
  }

  async getBreaches(filters: { customerId?: string }): Promise<SlaTracking[]> {
    const qb = this.trackRepo.createQueryBuilder('t')
      .where('t.status IN (:...s)', { s: [SlaStatus.BREACHED, SlaStatus.AT_RISK] });
    if (filters.customerId) qb.andWhere('t.customerId = :cid', { cid: filters.customerId });
    return qb.orderBy('t.dueDate', 'ASC').getMany();
  }

  async getDashboard() {
    const total    = await this.trackRepo.count({ where: { status: SlaStatus.ACTIVE } });
    const atRisk   = await this.trackRepo.count({ where: { status: SlaStatus.AT_RISK } });
    const breached = await this.trackRepo.count({ where: { status: SlaStatus.BREACHED } });
    const met      = await this.trackRepo.count({ where: { status: SlaStatus.MET } });
    const rate     = met + breached > 0 ? Math.round((met / (met + breached)) * 100) : 100;
    return { total, atRisk, breached, met, complianceRate: rate };
  }

  // ─── Her gece sla durumlarını güncelle ──────────────────────────────────────
  @Cron('0 1 * * *')
  async updateStatuses(): Promise<void> {
    const now    = new Date();
    const active = await this.trackRepo.find({ where: { status: SlaStatus.ACTIVE } });

    for (const t of active) {
      const remaining = Math.ceil((t.dueDate.getTime() - now.getTime()) / 86400000);
      const updates: Partial<SlaTracking> = { daysElapsed: Math.ceil((now.getTime() - t.startDate.getTime()) / 86400000), daysRemaining: remaining };

      if (now > t.dueDate) {
        updates.status = SlaStatus.BREACHED;
      } else if (remaining <= 1) {
        updates.status = SlaStatus.AT_RISK;
        if (!t.notificationSent) {
          updates.notificationSent = true;
          // Bildirim gönder (customerId üzerinden)
        }
      }
      await this.trackRepo.update(t.id, updates);
    }
  }

  private addBusinessDays(date: Date, days: number): Date {
    const result = new Date(date);
    let added = 0;
    while (added < days) {
      result.setDate(result.getDate() + 1);
      const dow = result.getDay();
      if (dow !== 0 && dow !== 6) added++;
    }
    return result;
  }
}

@ApiTags('sla') @ApiBearerAuth('JWT') @UseGuards(AuthGuard('jwt'), RolesGuard) @Controller('sla')
export class SlaController {
  constructor(private service: SlaService) {}

  @Post('definitions') @Roles(UserRole.ADMIN, UserRole.EXECUTIVE)
  createDefinition(@Body() body: any, @CurrentUser('id') uid: string) { return this.service.createDefinition(body, uid); }

  @Get('definitions')
  findAllDefinitions() { return this.service.findAllDefinitions(); }

  @Get('dashboard')
  getDashboard() { return this.service.getDashboard(); }

  @Get('breaches')
  getBreaches(@Query('customerId') customerId?: string) { return this.service.getBreaches({ customerId }); }
}

@Module({
  imports: [TypeOrmModule.forFeature([SlaDefinition, SlaTracking]), AuditModule, NotificationsModule],
  providers: [SlaService],
  controllers: [SlaController],
  exports: [SlaService],
})
export class SlaModule {}

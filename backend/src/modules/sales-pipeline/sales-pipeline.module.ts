import { Entity, Column, OneToMany, ManyToOne, JoinColumn, Index, CreateDateColumn, Repository, MoreThanOrEqual, DataSource } from 'typeorm';
import { AbstractEntity } from '@/common/entities/abstract.entity';
import {
  Injectable, NotFoundException,
  Controller, Get, Post, Put, Patch,
  Body, Param, Query, UseGuards, Module, Req,
} from '@nestjs/common';
import { verifyTenantAccess } from '@/common/guards/tenant-verify.helper';
import { InjectRepository } from '@nestjs/typeorm';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '@/common/decorators/roles.decorator';
import { RolesGuard } from '@/common/guards/roles.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { UserRole } from '@/common/enums/user-role.enum';
import { PaginationDto, PaginatedResult } from '@/common/dto/pagination.dto';
import { AuditModule } from '@/modules/audit/audit.module';
import { AuditService } from '@/modules/audit/audit.service';
import { Cron } from '@nestjs/schedule';

// ─── Entity: SalesOpportunity ─────────────────────────────────────────────────
@Entity('sales_opportunities')
@Index(['customerId', 'status'])
export class SalesOpportunity extends AbstractEntity {
  @Column({ type: 'varchar', length: 36 })
  customerId: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'varchar', length: 50 })
  source: string; // referral, website, cold_call, existing_customer, other

  @Column({ type: 'varchar', length: 30, default: 'new' })
  status: string; // new, contacted, proposal_sent, negotiation, won, lost

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  estimatedValue: number;

  @Column({ type: 'varchar', length: 10, default: 'TRY' })
  currency: string;

  @Column({ type: 'int', default: 50 })
  probability: number; // 0-100%

  @Column({ type: 'date', nullable: true })
  expectedCloseDate: Date;

  @Column({ type: 'varchar', length: 36, nullable: true })
  assignedToId: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  proposalId: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  contractId: string;

  @Column({ type: 'text', nullable: true })
  lostReason: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  contactName: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  contactPhone: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  contactEmail: string;

  @Column({ type: 'date', nullable: true })
  lastContactDate: Date;

  @Column({ type: 'date', nullable: true })
  nextFollowUpDate: Date;

  @Column({ type: 'json', nullable: true })
  tags: string[];

  @Column({ type: 'varchar', length: 36 })
  createdById: string;

  @OneToMany(() => SalesActivity, (a) => a.opportunity, { cascade: true })
  activities: SalesActivity[];
}

// ─── Entity: SalesActivity ────────────────────────────────────────────────────
@Entity('sales_activities')
@Index(['opportunityId'])
export class SalesActivity {
  @Column({ type: 'varchar', length: 36, primary: true, generated: 'uuid' })
  id: string;

  @Column({ type: 'varchar', length: 36 })
  opportunityId: string;

  @ManyToOne(() => SalesOpportunity, (o) => o.activities, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'opportunityId' })
  opportunity: SalesOpportunity;

  @Column({ type: 'varchar', length: 50 })
  activityType: string; // call, email, visit, meeting, note, proposal_sent, contract_sent

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  outcome: string; // positive, negative, neutral, follow_up

  @Column({ type: 'date', nullable: true })
  nextFollowUpDate: Date;

  @Column({ type: 'varchar', length: 36 })
  userId: string;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;
}

// ─── Service: SalesPipelineService ────────────────────────────────────────────
@Injectable()
export class SalesPipelineService {
  constructor(
    @InjectRepository(SalesOpportunity) private opportunityRepo: Repository<SalesOpportunity>,
    @InjectRepository(SalesActivity) private activityRepo: Repository<SalesActivity>,
    private auditService: AuditService,
    private dataSource: DataSource,
  ) {}

  // ── 1. Create Opportunity ─────────────────────────────────────────────────
  async create(data: Partial<SalesOpportunity>, userId: string): Promise<SalesOpportunity> {
    const opportunity = this.opportunityRepo.create({
      ...data,
      status: 'new',
      createdById: userId,
    });

    const saved = await this.opportunityRepo.save(opportunity);

    await this.auditService.log({
      userId,
      action: 'CREATE',
      entityType: 'SalesOpportunity',
      entityId: saved.id,
      newValues: { title: saved.title, customerId: saved.customerId, source: saved.source },
      description: `Satış fırsatı oluşturuldu: ${saved.title}`,
    });

    return saved;
  }

  // ── 2. Find All ───────────────────────────────────────────────────────────
  async findAll(
    filters: { status?: string; assignedToId?: string; customerId?: string; search?: string; companyId?: string },
    pagination: PaginationDto,
  ): Promise<PaginatedResult<SalesOpportunity>> {
    const qb = this.opportunityRepo.createQueryBuilder('o');

    // Tenant isolation
    if (filters.companyId) {
      qb.innerJoin('customers', 'cust', 'cust.id = o.customerId')
        .andWhere('cust.companyId = :companyId', { companyId: filters.companyId });
    }

    if (filters.status) {
      qb.andWhere('o.status = :status', { status: filters.status });
    }
    if (filters.assignedToId) {
      qb.andWhere('o.assignedToId = :assignedToId', { assignedToId: filters.assignedToId });
    }
    if (filters.customerId) {
      qb.andWhere('o.customerId = :customerId', { customerId: filters.customerId });
    }
    if (filters.search) {
      qb.andWhere('(o.title LIKE :s OR o.contactName LIKE :s OR o.notes LIKE :s)', { s: `%${filters.search}%` });
    }

    const sortBy = pagination.sortBy || 'o.createdAt';
    const sortField = sortBy.includes('.') ? sortBy : `o.${sortBy}`;
    qb.orderBy(sortField, pagination.sortOrder || 'DESC')
      .skip(pagination.skip)
      .take(pagination.limit);

    const [data, total] = await qb.getManyAndCount();
    return new PaginatedResult(data, total, pagination.page, pagination.limit);
  }

  // ── 3. Find One (with activities) ─────────────────────────────────────────
  async findOne(id: string): Promise<SalesOpportunity> {
    const opportunity = await this.opportunityRepo.findOne({
      where: { id },
      relations: ['activities'],
    });
    if (!opportunity) {
      throw new NotFoundException('Satış fırsatı bulunamadı');
    }
    return opportunity;
  }

  // ── 4. Update ─────────────────────────────────────────────────────────────
  async update(id: string, data: Partial<SalesOpportunity>, userId: string): Promise<SalesOpportunity> {
    const opportunity = await this.findOne(id);
    const oldStatus = opportunity.status;

    // Remove relations from update data
    delete (data as any).activities;

    Object.assign(opportunity, data);
    const saved = await this.opportunityRepo.save(opportunity);

    // Auto-log status change as activity
    if (data.status && data.status !== oldStatus) {
      const activity = this.activityRepo.create({
        opportunityId: id,
        activityType: 'note',
        description: `Durum değiştirildi: ${oldStatus} -> ${data.status}`,
        outcome: 'neutral',
        userId,
      });
      await this.activityRepo.save(activity);
    }

    await this.auditService.log({
      userId,
      action: 'UPDATE',
      entityType: 'SalesOpportunity',
      entityId: id,
      oldValues: { status: oldStatus },
      newValues: data,
      description: `Satış fırsatı güncellendi: ${opportunity.title}`,
    });

    return this.findOne(id);
  }

  // ── 5. Add Activity ───────────────────────────────────────────────────────
  async addActivity(
    opportunityId: string,
    activityData: Partial<SalesActivity>,
    userId: string,
  ): Promise<SalesActivity> {
    // Verify opportunity exists
    await this.findOne(opportunityId);

    const activity = this.activityRepo.create({
      ...activityData,
      opportunityId,
      userId,
    });

    const saved = await this.activityRepo.save(activity);

    // Update lastContactDate and nextFollowUpDate on opportunity
    const updateData: Partial<SalesOpportunity> = { lastContactDate: new Date() };
    if (activityData.nextFollowUpDate) {
      updateData.nextFollowUpDate = activityData.nextFollowUpDate;
    }
    await this.opportunityRepo.update(opportunityId, updateData);

    return saved;
  }

  // ── 6. Get Activities ─────────────────────────────────────────────────────
  async getActivities(opportunityId: string): Promise<SalesActivity[]> {
    // Verify opportunity exists
    await this.findOne(opportunityId);

    return this.activityRepo.find({
      where: { opportunityId },
      order: { createdAt: 'DESC' },
    });
  }

  // ── 7. Mark Won ───────────────────────────────────────────────────────────
  async markWon(id: string, proposalId: string, userId: string): Promise<SalesOpportunity> {
    const opportunity = await this.findOne(id);
    const oldStatus = opportunity.status;

    opportunity.status = 'won';
    opportunity.probability = 100;
    if (proposalId) {
      opportunity.proposalId = proposalId;
    }

    const saved = await this.opportunityRepo.save(opportunity);

    // Log activity
    const activity = this.activityRepo.create({
      opportunityId: id,
      activityType: 'note',
      description: `Fırsat kazanıldı${proposalId ? ` — Teklif: ${proposalId}` : ''}`,
      outcome: 'positive',
      userId,
    });
    await this.activityRepo.save(activity);

    await this.auditService.log({
      userId,
      action: 'STATUS_CHANGE',
      entityType: 'SalesOpportunity',
      entityId: id,
      oldValues: { status: oldStatus },
      newValues: { status: 'won', proposalId },
      description: `Satış fırsatı kazanıldı: ${opportunity.title}`,
    });

    return saved;
  }

  // ── 8. Mark Lost ──────────────────────────────────────────────────────────
  async markLost(id: string, reason: string, userId: string): Promise<SalesOpportunity> {
    const opportunity = await this.findOne(id);
    const oldStatus = opportunity.status;

    opportunity.status = 'lost';
    opportunity.probability = 0;
    opportunity.lostReason = reason;

    const saved = await this.opportunityRepo.save(opportunity);

    // Log activity
    const activity = this.activityRepo.create({
      opportunityId: id,
      activityType: 'note',
      description: `Fırsat kaybedildi — Sebep: ${reason}`,
      outcome: 'negative',
      userId,
    });
    await this.activityRepo.save(activity);

    await this.auditService.log({
      userId,
      action: 'STATUS_CHANGE',
      entityType: 'SalesOpportunity',
      entityId: id,
      oldValues: { status: oldStatus },
      newValues: { status: 'lost', lostReason: reason },
      description: `Satış fırsatı kaybedildi: ${opportunity.title}`,
    });

    return saved;
  }

  // ── 9. Pipeline Stats ─────────────────────────────────────────────────────
  async getPipelineStats(): Promise<{ countByStatus: Record<string, number>; valueByStatus: Record<string, number> }> {
    const results = await this.opportunityRepo
      .createQueryBuilder('o')
      .select('o.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(o.estimatedValue), 0)', 'totalValue')
      .groupBy('o.status')
      .getRawMany();

    const countByStatus: Record<string, number> = {};
    const valueByStatus: Record<string, number> = {};

    for (const row of results) {
      countByStatus[row.status] = parseInt(row.count, 10);
      valueByStatus[row.status] = parseFloat(row.totalValue);
    }

    return { countByStatus, valueByStatus };
  }

  // ── 10. Upcoming Follow-Ups ───────────────────────────────────────────────
  async getUpcomingFollowUps(userId?: string): Promise<SalesActivity[]> {
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    const qb = this.activityRepo.createQueryBuilder('a')
      .leftJoinAndSelect('a.opportunity', 'opportunity')
      .where('a.nextFollowUpDate IS NOT NULL')
      .andWhere('a.nextFollowUpDate <= :maxDate', { maxDate: sevenDaysFromNow.toISOString().split('T')[0] });

    if (userId) {
      qb.andWhere('a.userId = :userId', { userId });
    }

    qb.orderBy('a.nextFollowUpDate', 'ASC');

    return qb.getMany();
  }

  // ── 11. Renewal Opportunity Cron ──────────────────────────────────────────
  @Cron('0 6 * * *') // Every day at 06:00
  async createRenewalOpportunities(): Promise<void> {
    try {
      // Find equipment with nextControlDate within 60 days that don't have an open opportunity
      const results = await this.dataSource.query(`
        SELECT e.customerId, c.name as customerName, c.contactName, c.contactPhone, c.contactEmail,
               COUNT(e.id) as equipmentCount,
               MIN(e.nextControlDate) as earliestControlDate
        FROM equipment e
        JOIN customers c ON c.id = e.customerId
        WHERE e.nextControlDate BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 60 DAY)
          AND e.customerId NOT IN (
            SELECT customerId FROM sales_opportunities
            WHERE status NOT IN ('won', 'lost')
            AND source = 'existing_customer'
            AND createdAt > DATE_SUB(NOW(), INTERVAL 30 DAY)
          )
        GROUP BY e.customerId
      `);

      for (const row of results) {
        // Idempotency: ayni gun + ayni musteri icin tekrar oluşturma
        const todayDup = await this.opportunityRepo
          .createQueryBuilder('o')
          .where('o.customerId = :cid', { cid: row.customerId })
          .andWhere("o.source = 'existing_customer'")
          .andWhere('DATE(o.createdAt) = CURDATE()')
          .getCount();
        if (todayDup > 0) continue;

        await this.opportunityRepo.save(this.opportunityRepo.create({
          customerId: row.customerId,
          title: `${row.customerName} — Periyodik Kontrol Yenileme (${row.equipmentCount} ekipman)`,
          source: 'existing_customer',
          status: 'new',
          estimatedValue: 0,
          probability: 70,
          expectedCloseDate: row.earliestControlDate,
          contactName: row.contactName,
          contactPhone: row.contactPhone,
          contactEmail: row.contactEmail,
          notes: `${row.equipmentCount} ekipmanın kontrol tarihi yaklaşıyor. En erken: ${row.earliestControlDate}`,
          createdById: 'system',
        }));
      }

      if (results.length > 0) {
        console.log(`[SalesPipeline] ${results.length} yeni yenileme fırsatı oluşturuldu`);
      }
    } catch (e) {
      console.error('[SalesPipeline] Renewal opportunity creation failed:', e?.message);
    }
  }
}

// ─── Controller: SalesPipelineController ──────────────────────────────────────
@ApiTags('sales-pipeline')
@ApiBearerAuth('JWT')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('sales-pipeline')
export class SalesPipelineController {
  constructor(private readonly service: SalesPipelineService, private readonly dataSource: DataSource) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.CUSTOMER_REP)
  create(@Body() body: any, @CurrentUser('id') userId: string) {
    return this.service.create(body, userId);
  }

  @Get()
  findAll(
    @Query('status') status?: string,
    @Query('assignedToId') assignedToId?: string,
    @Query('customerId') customerId?: string,
    @Query('search') search?: string,
    @Query() pagination?: PaginationDto,
    @Req() req?: any,
  ) {
    return this.service.findAll({ status, assignedToId, customerId, search, companyId: req?.companyId }, pagination);
  }

  @Get('stats')
  getPipelineStats() {
    return this.service.getPipelineStats();
  }

  @Get('follow-ups')
  getUpcomingFollowUps(@Query('userId') userId?: string) {
    return this.service.getUpcomingFollowUps(userId);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Req() req?: any) {
    await verifyTenantAccess(this.dataSource, 'opportunity', id, req?.companyId);
    return this.service.findOne(id);
  }

  @Put(':id')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.CUSTOMER_REP)
  update(@Param('id') id: string, @Body() body: any, @CurrentUser('id') userId: string) {
    return this.service.update(id, body, userId);
  }

  @Post(':id/activities')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.CUSTOMER_REP)
  addActivity(@Param('id') id: string, @Body() body: any, @CurrentUser('id') userId: string) {
    return this.service.addActivity(id, body, userId);
  }

  @Get(':id/activities')
  getActivities(@Param('id') id: string) {
    return this.service.getActivities(id);
  }

  @Patch(':id/won')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.CUSTOMER_REP)
  markWon(@Param('id') id: string, @Body('proposalId') proposalId: string, @CurrentUser('id') userId: string) {
    return this.service.markWon(id, proposalId, userId);
  }

  @Patch(':id/lost')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.CUSTOMER_REP)
  markLost(@Param('id') id: string, @Body('reason') reason: string, @CurrentUser('id') userId: string) {
    return this.service.markLost(id, reason, userId);
  }
}

// ─── Module: SalesPipelineModule ──────────────────────────────────────────────
@Module({
  imports: [
    TypeOrmModule.forFeature([SalesOpportunity, SalesActivity]),
    AuditModule,
  ],
  providers: [SalesPipelineService],
  controllers: [SalesPipelineController],
  exports: [SalesPipelineService],
})
export class SalesPipelineModule {}

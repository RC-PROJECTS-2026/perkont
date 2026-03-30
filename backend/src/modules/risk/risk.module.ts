// ─── Entities ─────────────────────────────────────────────────────────────────
import { Entity, Column, Index } from 'typeorm';
import { AbstractEntity } from '@/common/entities/abstract.entity';

export enum RiskCategory   { IMPARTIALITY = 'impartiality', TECHNICAL = 'technical', OPERATIONAL = 'operational', FINANCIAL = 'financial', LEGAL = 'legal', REPUTATIONAL = 'reputational' }
export enum RiskLikelihood { RARE = 1, UNLIKELY = 2, POSSIBLE = 3, LIKELY = 4, ALMOST_CERTAIN = 5 }
export enum RiskImpact     { NEGLIGIBLE = 1, MINOR = 2, MODERATE = 3, MAJOR = 4, CATASTROPHIC = 5 }
export enum RiskTreatment  { ACCEPT = 'accept', MITIGATE = 'mitigate', TRANSFER = 'transfer', AVOID = 'avoid' }
export enum RiskStatus     { OPEN = 'open', MONITORING = 'monitoring', MITIGATED = 'mitigated', CLOSED = 'closed' }

@Entity('risk_register')
@Index(['category', 'status'])
export class RiskRecord extends AbstractEntity {
  @Column({ unique: true }) riskNumber: string;         // RSK-2024-001
  @Column({ type: 'enum', enum: RiskCategory }) category: RiskCategory;
  @Column() title: string;
  @Column({ type: 'text' }) description: string;

  // Risk değerlendirmesi
  @Column({ type: 'int' }) likelihood: number;           // 1-5
  @Column({ type: 'int' }) impact: number;               // 1-5
  @Column({ type: 'int', generatedType: 'STORED', asExpression: 'likelihood * impact', nullable: true })
  riskScore: number;                                     // Otomatik: 1-25

  // Tedavi
  @Column({ type: 'enum', enum: RiskTreatment, nullable: true }) treatment: RiskTreatment;
  @Column({ type: 'text', nullable: true }) mitigationPlan: string;
  @Column({ nullable: true }) responsibleId: string;
  @Column({ type: 'date', nullable: true }) targetDate: Date;

  // Artık risk (tedavi sonrası)
  @Column({ type: 'int', nullable: true }) residualLikelihood: number;
  @Column({ type: 'int', nullable: true }) residualImpact: number;

  @Column({ type: 'enum', enum: RiskStatus, default: RiskStatus.OPEN }) status: RiskStatus;
  @Column({ nullable: true }) reviewDate: Date;
  @Column({ type: 'text', nullable: true }) notes: string;
  @Column({ nullable: true }) createdById: string;
}

// ─── Service ─────────────────────────────────────────────────────────────────
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditService } from '@/modules/audit/audit.service';
import { PaginationDto, PaginatedResult } from '@/common/dto/pagination.dto';

@Injectable()
export class RiskService {
  constructor(
    @InjectRepository(RiskRecord) private riskRepo: Repository<RiskRecord>,
    private auditService: AuditService,
  ) {}

  private async generateRiskNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.riskRepo.count();
    return `RSK-${year}-${String(count + 1).padStart(3, '0')}`;
  }

  async create(data: Partial<RiskRecord>, userId: string): Promise<RiskRecord> {
    const riskNumber = await this.generateRiskNumber();
    const record = this.riskRepo.create({ ...data, riskNumber, createdById: userId });
    const saved = await this.riskRepo.save(record);
    await this.auditService.log({ userId, action: 'RISK_CREATED', entityType: 'RiskRecord', entityId: saved.id, newValues: { riskNumber, category: data.category, likelihood: data.likelihood, impact: data.impact } as any });
    return saved;
  }

  async findAll(filters: { status?: string; category?: string }, pagination: PaginationDto): Promise<PaginatedResult<RiskRecord>> {
    const qb = this.riskRepo.createQueryBuilder('r');
    if (filters.status)   qb.andWhere('r.status = :status', { status: filters.status });
    if (filters.category) qb.andWhere('r.category = :cat', { cat: filters.category });
    qb.orderBy('r.likelihood * r.impact', 'DESC').skip(pagination.skip).take(pagination.limit);
    const [data, total] = await qb.getManyAndCount();
    return new PaginatedResult(data, total, pagination.page, pagination.limit);
  }

  async findOne(id: string): Promise<RiskRecord> {
    const r = await this.riskRepo.findOne({ where: { id } });
    if (!r) throw new NotFoundException('Risk kaydı bulunamadı');
    return r;
  }

  async update(id: string, data: Partial<RiskRecord>, userId: string): Promise<RiskRecord> {
    await this.riskRepo.update(id, data);
    await this.auditService.log({ userId, action: 'RISK_UPDATED', entityType: 'RiskRecord', entityId: id, newValues: data as any });
    return this.findOne(id);
  }

  async getHeatmapData() {
    const risks = await this.riskRepo.find({ where: { status: RiskStatus.OPEN as any } });
    // 5x5 risk matrisi için veri
    const matrix: Record<string, number> = {};
    for (const r of risks) {
      const key = `${r.likelihood}-${r.impact}`;
      matrix[key] = (matrix[key] || 0) + 1;
    }
    return { matrix, total: risks.length, highRisks: risks.filter(r => (r.likelihood * r.impact) >= 15).length };
  }

  async getStats() {
    const total  = await this.riskRepo.count();
    const open   = await this.riskRepo.count({ where: { status: RiskStatus.OPEN } });
    const high   = await this.riskRepo.createQueryBuilder('r').where('r.likelihood * r.impact >= 15').getCount();
    return { total, open, high };
  }
}

// ─── Controller ──────────────────────────────────────────────────────────────
import { Controller, Get, Post, Put, Body, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '@/common/decorators/roles.decorator';
import { RolesGuard } from '@/common/guards/roles.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { UserRole } from '@/common/enums/user-role.enum';

@ApiTags('risk') @ApiBearerAuth('JWT') @UseGuards(AuthGuard('jwt'), RolesGuard) @Controller('risk')
export class RiskController {
  constructor(private service: RiskService) {}

  @Post()   @Roles(UserRole.ADMIN, UserRole.TECHNICAL_MANAGER, UserRole.EXECUTIVE)
  create(@Body() body: any, @CurrentUser('id') uid: string) { return this.service.create(body, uid); }

  @Get()    @Roles(UserRole.ADMIN, UserRole.TECHNICAL_MANAGER, UserRole.EXECUTIVE)
  findAll(@Query() p: PaginationDto, @Query('status') status?: string, @Query('category') category?: string) {
    return this.service.findAll({ status, category }, p);
  }

  @Get('heatmap') @Roles(UserRole.ADMIN, UserRole.TECHNICAL_MANAGER, UserRole.EXECUTIVE)
  getHeatmap() { return this.service.getHeatmapData(); }

  @Get('stats')
  getStats() { return this.service.getStats(); }

  @Get(':id')   findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @Put(':id')   @Roles(UserRole.ADMIN, UserRole.TECHNICAL_MANAGER, UserRole.EXECUTIVE)
  update(@Param('id') id: string, @Body() body: any, @CurrentUser('id') uid: string) { return this.service.update(id, body, uid); }
}

// ─── Module ───────────────────────────────────────────────────────────────────
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '@/modules/audit/audit.module';

@Module({
  imports: [TypeOrmModule.forFeature([RiskRecord]), AuditModule],
  providers: [RiskService],
  controllers: [RiskController],
  exports: [RiskService],
})
export class RiskModule {}

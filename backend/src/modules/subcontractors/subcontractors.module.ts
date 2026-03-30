// ─── Entities ─────────────────────────────────────────────────────────────────
import { Entity, Column, OneToMany, ManyToOne, JoinColumn, Index } from 'typeorm';
import { AbstractEntity } from '@/common/entities/abstract.entity';

export enum SubcontractorStatus { ACTIVE = 'active', PASSIVE = 'passive', BLACKLISTED = 'blacklisted' }
export enum SubcontractorType   { PERSON = 'person', COMPANY = 'company' }
export enum AssignmentStatus    { PLANNED = 'planned', IN_PROGRESS = 'in_progress', COMPLETED = 'completed', CANCELLED = 'cancelled' }

@Entity('subcontractors')
export class Subcontractor extends AbstractEntity {
  @Column() name: string;
  @Column({ type: 'enum', enum: SubcontractorType, default: SubcontractorType.COMPANY }) type: SubcontractorType;
  @Column({ nullable: true }) taxNumber: string;
  @Column({ nullable: true }) contactName: string;
  @Column({ nullable: true }) contactEmail: string;
  @Column({ nullable: true }) contactPhone: string;
  @Column({ nullable: true }) city: string;
  @Column({ type: 'json', nullable: true }) qualifications: string[];   // Hangi ekipman tiplerinde yetkili
  @Column({ type: 'json', nullable: true }) certificates: Array<{ name: string; validUntil: string; fileUrl: string }>;
  @Column({ type: 'enum', enum: SubcontractorStatus, default: SubcontractorStatus.ACTIVE }) status: SubcontractorStatus;
  @Column({ type: 'date', nullable: true }) contractStart: Date;
  @Column({ type: 'date', nullable: true }) contractEnd: Date;
  @Column({ nullable: true }) contractUrl: string;
  @Column({ type: 'text', nullable: true }) notes: string;
  @Column({ nullable: true }) createdById: string;

  @OneToMany(() => SubcontractorAssignment, (a) => a.subcontractor)
  assignments: SubcontractorAssignment[];
}

@Entity('subcontractor_assignments')
@Index(['workOrderId'])
export class SubcontractorAssignment extends AbstractEntity {
  @Column() subcontractorId: string;
  @ManyToOne(() => Subcontractor, (s) => s.assignments)
  @JoinColumn({ name: 'subcontractorId' })
  subcontractor: Subcontractor;

  @Column({ nullable: true }) workOrderId: string;
  @Column({ nullable: true }) inspectionId: string;
  @Column({ type: 'enum', enum: AssignmentStatus, default: AssignmentStatus.PLANNED }) status: AssignmentStatus;
  @Column({ type: 'text', nullable: true }) scope: string;           // Hangi işi yapacak
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true }) agreedAmount: number;
  @Column({ nullable: true }) assignedById: string;
  @Column({ nullable: true }) completedAt: Date;
  @Column({ type: 'text', nullable: true }) completionNotes: string;
  @Column({ type: 'decimal', precision: 3, scale: 1, nullable: true }) performanceScore: number; // 1-5
}

// ─── Service ─────────────────────────────────────────────────────────────────
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditService } from '@/modules/audit/audit.service';
import { PaginationDto, PaginatedResult } from '@/common/dto/pagination.dto';

@Injectable()
export class SubcontractorsService {
  constructor(
    @InjectRepository(Subcontractor) private repo: Repository<Subcontractor>,
    @InjectRepository(SubcontractorAssignment) private assignRepo: Repository<SubcontractorAssignment>,
    private auditService: AuditService,
  ) {}

  async create(data: Partial<Subcontractor>, userId: string): Promise<Subcontractor> {
    const record = this.repo.create({ ...data, createdById: userId });
    const saved = await this.repo.save(record);
    await this.auditService.log({ userId, action: 'SUBCONTRACTOR_CREATED', entityType: 'Subcontractor', entityId: saved.id });
    return saved;
  }

  async findAll(
    filters: { status?: string; search?: string },
    pagination: PaginationDto,
  ): Promise<PaginatedResult<Subcontractor>> {
    const qb = this.repo.createQueryBuilder('s');
    if (filters.status) qb.andWhere('s.status = :status', { status: filters.status });
    if (filters.search) qb.andWhere('(s.name LIKE :q OR s.contactEmail LIKE :q)', { q: `%${filters.search}%` });
    qb.orderBy('s.name', 'ASC').skip(pagination.skip).take(pagination.limit);
    const [data, total] = await qb.getManyAndCount();
    return new PaginatedResult(data, total, pagination.page, pagination.limit);
  }

  async findOne(id: string): Promise<Subcontractor> {
    const r = await this.repo.findOne({ where: { id }, relations: ['assignments'] });
    if (!r) throw new NotFoundException('Taşeron bulunamadı');
    return r;
  }

  async update(id: string, data: Partial<Subcontractor>, userId: string): Promise<Subcontractor> {
    await this.repo.update(id, data);
    await this.auditService.log({ userId, action: 'SUBCONTRACTOR_UPDATED', entityType: 'Subcontractor', entityId: id, newValues: data as any });
    return this.findOne(id);
  }

  async createAssignment(data: Partial<SubcontractorAssignment>, userId: string): Promise<SubcontractorAssignment> {
    const sub = await this.findOne(data.subcontractorId!);
    if (sub.status === SubcontractorStatus.BLACKLISTED)
      throw new BadRequestException('Kara listede olan taşerona atama yapılamaz');

    const assignment = this.assignRepo.create({ ...data, assignedById: userId });
    const saved = await this.assignRepo.save(assignment);
    await this.auditService.log({ userId, action: 'SUBCONTRACTOR_ASSIGNED', entityType: 'SubcontractorAssignment', entityId: saved.id });
    return saved;
  }

  async completeAssignment(
    id: string, notes: string, score: number, userId: string,
  ): Promise<SubcontractorAssignment> {
    await this.assignRepo.update(id, {
      status: AssignmentStatus.COMPLETED,
      completedAt: new Date(),
      completionNotes: notes,
      performanceScore: score,
    });
    await this.auditService.log({ userId, action: 'SUBCONTRACTOR_ASSIGNMENT_COMPLETED', entityType: 'SubcontractorAssignment', entityId: id });
    return this.assignRepo.findOneOrFail({ where: { id }, relations: ['subcontractor'] });
  }

  async getExpiringContracts(days = 60): Promise<Subcontractor[]> {
    const future = new Date();
    future.setDate(future.getDate() + days);
    return this.repo
      .createQueryBuilder('s')
      .where('s.contractEnd <= :future AND s.contractEnd >= NOW() AND s.status = :a', { future, a: SubcontractorStatus.ACTIVE })
      .orderBy('s.contractEnd', 'ASC')
      .getMany();
  }
}

// ─── Controller ──────────────────────────────────────────────────────────────
import { Controller, Get, Post, Put, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '@/common/decorators/roles.decorator';
import { RolesGuard } from '@/common/guards/roles.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { UserRole } from '@/common/enums/user-role.enum';

@ApiTags('subcontractors') @ApiBearerAuth('JWT') @UseGuards(AuthGuard('jwt'), RolesGuard) @Controller('subcontractors')
export class SubcontractorsController {
  constructor(private service: SubcontractorsService) {}

  @Post()         @Roles(UserRole.ADMIN, UserRole.TECHNICAL_MANAGER)
  create(@Body() body: any, @CurrentUser('id') uid: string) { return this.service.create(body, uid); }

  @Get()
  findAll(@Query() p: PaginationDto, @Query('status') status?: string, @Query('search') search?: string) {
    return this.service.findAll({ status, search }, p);
  }

  @Get('expiring-contracts')
  getExpiring(@Query('days') days?: number) { return this.service.getExpiringContracts(days || 60); }

  @Get(':id')     findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @Put(':id')     @Roles(UserRole.ADMIN, UserRole.TECHNICAL_MANAGER)
  update(@Param('id') id: string, @Body() body: any, @CurrentUser('id') uid: string) { return this.service.update(id, body, uid); }

  @Post('assignments') @Roles(UserRole.ADMIN, UserRole.TECHNICAL_MANAGER, UserRole.PLANNER)
  createAssignment(@Body() body: any, @CurrentUser('id') uid: string) { return this.service.createAssignment(body, uid); }

  @Patch('assignments/:id/complete') @Roles(UserRole.ADMIN, UserRole.TECHNICAL_MANAGER)
  completeAssignment(
    @Param('id') id: string,
    @Body('notes') notes: string,
    @Body('score') score: number,
    @CurrentUser('id') uid: string,
  ) { return this.service.completeAssignment(id, notes, score, uid); }
}

// ─── Module ───────────────────────────────────────────────────────────────────
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '@/modules/audit/audit.module';

@Module({
  imports: [TypeOrmModule.forFeature([Subcontractor, SubcontractorAssignment]), AuditModule],
  providers: [SubcontractorsService],
  controllers: [SubcontractorsController],
  exports: [SubcontractorsService, TypeOrmModule],
})
export class SubcontractorsModule {}

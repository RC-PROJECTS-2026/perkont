import { Entity, Column, Index } from 'typeorm';
import { AbstractEntity } from '@/common/entities/abstract.entity';
import { Injectable, NotFoundException, Controller, Get, Post, Put, Body, Param, Query, UseGuards, Module } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

export enum DocType { STANDARD = 'standard', REGULATION = 'regulation', PROCEDURE = 'procedure', FORM = 'form', GUIDELINE = 'guideline' }

@Entity('reference_documents')
@Index(['type', 'isActive'])
export class ReferenceDocument extends AbstractEntity {
  @Column() code: string;               // TS EN 13157, ISO 17020
  @Column() title: string;
  @Column() revision: string;           // 2022, +A1:2009
  @Column({ type: 'enum', enum: DocType, default: DocType.STANDARD }) type: DocType;
  @Column({ type: 'date', nullable: true }) publishedDate: Date;
  @Column({ type: 'date', nullable: true }) effectiveDate: Date;
  @Column({ type: 'date', nullable: true }) reviewDate: Date;
  @Column({ nullable: true }) documentUrl: string;
  @Column({ type: 'json', nullable: true }) applicableEquipmentTypes: string[];
  @Column({ default: true }) isActive: boolean;
  @Column({ type: 'text', nullable: true }) notes: string;
  @Column({ nullable: true }) createdById: string;
}

@Injectable()
export class ReferenceDocsService {
  constructor(
    @InjectRepository(ReferenceDocument) private repo: Repository<ReferenceDocument>,
    private auditService: AuditService,
  ) {}

  async create(data: Partial<ReferenceDocument>, userId: string): Promise<ReferenceDocument> {
    const doc = this.repo.create({ ...data, createdById: userId });
    const saved = await this.repo.save(doc);
    await this.auditService.log({ userId, action: 'REFERENCE_DOC_CREATED', entityType: 'ReferenceDocument', entityId: saved.id });
    return saved;
  }

  async findAll(
    filters: { type?: string; search?: string; active?: boolean },
    pagination: PaginationDto,
  ): Promise<PaginatedResult<ReferenceDocument>> {
    const qb = this.repo.createQueryBuilder('d');
    if (filters.type)   qb.andWhere('d.type = :t', { t: filters.type });
    if (filters.active !== undefined) qb.andWhere('d.isActive = :a', { a: filters.active });
    if (filters.search) qb.andWhere('(d.code LIKE :q OR d.title LIKE :q)', { q: `%${filters.search}%` });
    qb.orderBy('d.code', 'ASC').skip(pagination.skip).take(pagination.limit);
    const [data, total] = await qb.getManyAndCount();
    return new PaginatedResult(data, total, pagination.page, pagination.limit);
  }

  async findOne(id: string): Promise<ReferenceDocument> {
    const d = await this.repo.findOne({ where: { id } });
    if (!d) throw new NotFoundException('Referans doküman bulunamadı');
    return d;
  }

  async update(id: string, data: Partial<ReferenceDocument>, userId: string): Promise<ReferenceDocument> {
    await this.repo.update(id, data);
    await this.auditService.log({ userId, action: 'REFERENCE_DOC_UPDATED', entityType: 'ReferenceDocument', entityId: id, newValues: data as any });
    return this.findOne(id);
  }

  async getDueForReview(days = 60): Promise<ReferenceDocument[]> {
    const future = new Date();
    future.setDate(future.getDate() + days);
    return this.repo
      .createQueryBuilder('d')
      .where('d.reviewDate <= :future AND d.isActive = true', { future })
      .orderBy('d.reviewDate', 'ASC')
      .getMany();
  }
}

@ApiTags('reference-docs') @ApiBearerAuth('JWT') @UseGuards(AuthGuard('jwt'), RolesGuard) @Controller('reference-docs')
export class ReferenceDocsController {
  constructor(private service: ReferenceDocsService) {}

  @Post() @Roles(UserRole.ADMIN, UserRole.TECHNICAL_MANAGER)
  create(@Body() body: any, @CurrentUser('id') uid: string) { return this.service.create(body, uid); }

  @Get()
  findAll(@Query() p: PaginationDto, @Query('type') type?: string, @Query('search') search?: string) {
    return this.service.findAll({ type, search }, p);
  }

  @Get('due-review')
  getDueForReview(@Query('days') days?: number) { return this.service.getDueForReview(days || 60); }

  @Get(':id') findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @Put(':id') @Roles(UserRole.ADMIN, UserRole.TECHNICAL_MANAGER)
  update(@Param('id') id: string, @Body() body: any, @CurrentUser('id') uid: string) { return this.service.update(id, body, uid); }
}

@Module({
  imports: [TypeOrmModule.forFeature([ReferenceDocument]), AuditModule],
  providers: [ReferenceDocsService],
  controllers: [ReferenceDocsController],
  exports: [ReferenceDocsService, TypeOrmModule],
})
export class ReferenceDocsModule {}

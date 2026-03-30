import {
  Entity, Column, Index,
} from 'typeorm';
import { AbstractEntity } from '@/common/entities/abstract.entity';
import {
  Injectable, NotFoundException,
  Controller, Get, Post, Put, Param, Body, Query,
  UseGuards, Module,
} from '@nestjs/common';
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
import { AuditService } from '@/modules/audit/audit.service';
import { AuditModule } from '@/modules/audit/audit.module';

// ─── Entities ─────────────────────────────────────────────────────────────────
/** Akreditasyon kapsamı — hangi ekipman tipi, hangi standartla akredite */
@Entity('accreditation_scopes')
export class AccreditationScope extends AbstractEntity {
  @Column()
  equipmentTypeId: string;

  @Column()
  standardCode: string; // 'ISO 17020', 'TS EN 13157'

  @Column()
  standardName: string;

  @Column({ nullable: true })
  standardRevision: string; // 'EN 13157:2004+A1:2009'

  @Column({ type: 'date', nullable: true })
  accreditedSince: Date;

  @Column({ type: 'date', nullable: true })
  validUntil: Date;

  @Column({ default: true })
  isActive: boolean;

  @Column({ nullable: true })
  accreditationBodyRef: string; // TÜRKAK referans numarası
}

/** Tarafsızlık beyanı — ISO 17020 Madde 4 */
@Entity('impartiality_declarations')
@Index(['userId'])
export class ImpartialityDeclaration extends AbstractEntity {
  @Column()
  userId: string; // Beyan eden kişi

  @Column({ type: 'date' })
  declarationDate: Date;

  @Column({ type: 'text', nullable: true })
  conflictsDisclosed: string; // Açıklanan çıkar çatışması

  @Column({ default: false })
  hasConflict: boolean;

  @Column({ nullable: true })
  documentUrl: string;
}

/** Referans doküman — kullanılan standartlar */
@Entity('reference_documents')
export class ReferenceDocument extends AbstractEntity {
  @Column()
  code: string; // 'TS EN 13157'

  @Column()
  title: string;

  @Column()
  revision: string;

  @Column({ type: 'date', nullable: true })
  publishedDate: Date;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'text', nullable: true })
  notes: string;
}

// ─── Service ─────────────────────────────────────────────────────────────────
@Injectable()
export class AccreditationService {
  constructor(
    @InjectRepository(AccreditationScope) private scopeRepo: Repository<AccreditationScope>,
    @InjectRepository(ImpartialityDeclaration) private declarationRepo: Repository<ImpartialityDeclaration>,
    @InjectRepository(ReferenceDocument) private docRepo: Repository<ReferenceDocument>,
    private auditService: AuditService,
  ) {}

  // Akreditasyon kapsamları
  async createScope(data: Partial<AccreditationScope>, userId: string): Promise<AccreditationScope> {
    const scope = this.scopeRepo.create(data);
    const saved = await this.scopeRepo.save(scope);
    await this.auditService.log({ userId, action: 'ACCREDITATION_SCOPE_ADDED', entityType: 'AccreditationScope', entityId: saved.id });
    return saved;
  }

  async findAllScopes(): Promise<AccreditationScope[]> {
    return this.scopeRepo.find({ where: { isActive: true }, order: { equipmentTypeId: 'ASC' } });
  }

  // Tarafsızlık beyanları
  async createDeclaration(data: Partial<ImpartialityDeclaration>): Promise<ImpartialityDeclaration> {
    const dec = this.declarationRepo.create(data);
    return this.declarationRepo.save(dec);
  }

  async getUserDeclarations(userId: string): Promise<ImpartialityDeclaration[]> {
    return this.declarationRepo.find({ where: { userId }, order: { declarationDate: 'DESC' } });
  }

  async hasCurrentDeclaration(userId: string): Promise<boolean> {
    const currentYear = new Date().getFullYear();
    const declaration = await this.declarationRepo
      .createQueryBuilder('d')
      .where('d.userId = :userId', { userId })
      .andWhere("EXTRACT(YEAR FROM d.declarationDate) = :year", { year: currentYear })
      .getOne();
    return !!declaration;
  }

  // Referans dokümanlar
  async createReferenceDoc(data: Partial<ReferenceDocument>): Promise<ReferenceDocument> {
    return this.docRepo.save(this.docRepo.create(data));
  }

  async findAllReferenceDocs(): Promise<ReferenceDocument[]> {
    return this.docRepo.find({ where: { isActive: true }, order: { code: 'ASC' } });
  }
}

// ─── Controller ──────────────────────────────────────────────────────────────
@ApiTags('accreditation')
@ApiBearerAuth('JWT')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('accreditation')
export class AccreditationController {
  constructor(private service: AccreditationService) {}

  @Post('scopes')
  @Roles(UserRole.ADMIN, UserRole.TECHNICAL_MANAGER)
  createScope(@Body() body: any, @CurrentUser('id') userId: string) { return this.service.createScope(body, userId); }

  @Get('scopes')
  findAllScopes() { return this.service.findAllScopes(); }

  @Post('declarations')
  @Roles(UserRole.INSPECTOR, UserRole.TECHNICAL_MANAGER, UserRole.ADMIN)
  createDeclaration(@Body() body: any, @CurrentUser('id') userId: string) {
    return this.service.createDeclaration({ ...body, userId });
  }

  @Get('declarations/my')
  @Roles(UserRole.INSPECTOR, UserRole.TECHNICAL_MANAGER)
  getMyDeclarations(@CurrentUser('id') userId: string) { return this.service.getUserDeclarations(userId); }

  @Get('declarations/:userId')
  @Roles(UserRole.ADMIN, UserRole.TECHNICAL_MANAGER)
  getUserDeclarations(@Param('userId') userId: string) { return this.service.getUserDeclarations(userId); }

  @Get('declarations/:userId/current')
  @Roles(UserRole.ADMIN, UserRole.TECHNICAL_MANAGER)
  hasCurrent(@Param('userId') userId: string) { return this.service.hasCurrentDeclaration(userId); }

  @Post('reference-docs')
  @Roles(UserRole.ADMIN, UserRole.TECHNICAL_MANAGER)
  createReferenceDoc(@Body() body: any) { return this.service.createReferenceDoc(body); }

  @Get('reference-docs')
  findReferenceDocs() { return this.service.findAllReferenceDocs(); }
}

// ─── Module ───────────────────────────────────────────────────────────────────
@Module({
  imports: [
    TypeOrmModule.forFeature([AccreditationScope, ImpartialityDeclaration, ReferenceDocument]),
    AuditModule,
  ],
  providers: [AccreditationService],
  controllers: [AccreditationController],
  exports: [AccreditationService],
})
export class AccreditationModule {}

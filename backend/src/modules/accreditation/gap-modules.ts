/**
 * Y3: Saha Teyit, Y4: Tarafsizlik Beyani, Y5: YGG, Y6: Personel Yetkilendirme,
 * Y8: Teslim Teyit, Y9: Ek Sartname, Checklist Sistemi, Dokuman Kontrol, Egitim Takibi
 *
 * Tek dosyada tum akreditasyon/operasyonel gap modulleri
 */
import { Entity, Column, Index, Repository, DataSource } from 'typeorm';
import { AbstractEntity } from '@/common/entities/abstract.entity';
import {
  Injectable, NotFoundException, BadRequestException,
  Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, UseGuards, Module,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '@/common/decorators/roles.decorator';
import { RolesGuard } from '@/common/guards/roles.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { UserRole } from '@/common/enums/user-role.enum';
import { AuditModule } from '@/modules/audit/audit.module';
import { AuditService } from '@/modules/audit/audit.service';
import { PaginationDto, PaginatedResult } from '@/common/dto/pagination.dto';
import { Cron } from '@nestjs/schedule';

// ═══════════════════════════════════════════════════════════════════════════════
// ENTITY: Tarafsizlik Beyani
// ═══════════════════════════════════════════════════════════════════════════════

@Entity('impartiality_declarations')
export class ImpartialityDeclaration extends AbstractEntity {
  @Column({ type: 'varchar', length: 36 }) userId: string;
  @Column({ type: 'varchar', length: 36, nullable: true }) customerId: string;
  @Column({ type: 'int' }) declarationYear: number;
  @Column({ type: 'varchar', length: 20, default: 'pending' }) status: string;
  @Column({ type: 'datetime', nullable: true }) signedAt: Date;
  @Column({ type: 'varchar', length: 500, nullable: true }) documentUrl: string;
  @Column({ type: 'text', nullable: true }) notes: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENTITY: YGG (Yonetimin Gozden Gecirmesi)
// ═══════════════════════════════════════════════════════════════════════════════

@Entity('management_reviews')
export class ManagementReview extends AbstractEntity {
  @Column({ type: 'varchar', length: 50, unique: true }) reviewNumber: string;
  @Column({ type: 'date' }) reviewDate: Date;
  @Column({ type: 'date', nullable: true }) meetingDate: Date;
  @Column({ type: 'varchar', length: 20, default: 'draft' }) status: string;
  @Column({ type: 'varchar', length: 50 }) period: string;
  @Column({ type: 'json', nullable: true }) attendees: any[];
  @Column({ type: 'json', nullable: true }) agendaItems: any[];
  @Column({ type: 'json', nullable: true }) inputData: any;
  @Column({ type: 'json', nullable: true }) decisions: any[];
  @Column({ type: 'json', nullable: true }) actionItems: any[];
  @Column({ type: 'varchar', length: 500, nullable: true }) minutesDocUrl: string;
  @Column({ type: 'varchar', length: 36, nullable: true }) approvedById: string;
  @Column({ type: 'datetime', nullable: true }) approvedAt: Date;
  @Column({ type: 'varchar', length: 36 }) createdById: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENTITY: Personel Yetkilendirme
// ═══════════════════════════════════════════════════════════════════════════════

@Entity('personnel_authorizations')
export class PersonnelAuthorization extends AbstractEntity {
  @Column({ type: 'varchar', length: 36 }) userId: string;
  @Column({ type: 'varchar', length: 36 }) equipmentTypeId: string;
  @Column({ type: 'varchar', length: 20, default: 'authorized' }) authorizationLevel: string;
  @Column({ type: 'varchar', length: 36 }) grantedById: string;
  @Column({ type: 'date' }) grantedAt: Date;
  @Column({ type: 'date', nullable: true }) expiresAt: Date;
  @Column({ type: 'tinyint', default: 1 }) isActive: boolean;
  @Column({ type: 'varchar', length: 500, nullable: true }) documentUrl: string;
  @Column({ type: 'text', nullable: true }) notes: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENTITY: Personel Egitim
// ═══════════════════════════════════════════════════════════════════════════════

@Entity('personnel_trainings')
export class PersonnelTraining extends AbstractEntity {
  @Column({ type: 'varchar', length: 36 }) userId: string;
  @Column({ type: 'varchar', length: 50 }) trainingType: string;
  @Column({ type: 'varchar', length: 255 }) title: string;
  @Column({ type: 'varchar', length: 255, nullable: true }) provider: string;
  @Column({ type: 'date' }) startDate: Date;
  @Column({ type: 'date', nullable: true }) endDate: Date;
  @Column({ type: 'decimal', precision: 5, scale: 1, nullable: true }) durationHours: number;
  @Column({ type: 'varchar', length: 20, default: 'completed' }) result: string;
  @Column({ type: 'varchar', length: 500, nullable: true }) certificateUrl: string;
  @Column({ type: 'varchar', length: 100, nullable: true }) certificateNo: string;
  @Column({ type: 'text', nullable: true }) notes: string;
  @Column({ type: 'varchar', length: 36, nullable: true }) createdById: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENTITY: Process Checklists
// ═══════════════════════════════════════════════════════════════════════════════

@Entity('process_checklists')
export class ProcessChecklist extends AbstractEntity {
  @Column({ type: 'varchar', length: 50 }) entityType: string;
  @Column({ type: 'varchar', length: 36 }) entityId: string;
  @Column({ type: 'varchar', length: 50 }) checklistType: string;
  @Column({ type: 'varchar', length: 20, default: 'open' }) status: string;
  @Column({ type: 'datetime', nullable: true }) completedAt: Date;
  @Column({ type: 'varchar', length: 36, nullable: true }) completedById: string;
  @Column({ type: 'text', nullable: true }) notes: string;
}

@Entity('checklist_items')
export class ChecklistItem extends AbstractEntity {
  @Column({ type: 'varchar', length: 36 }) checklistId: string;
  @Column({ type: 'varchar', length: 500 }) label: string;
  @Column({ type: 'tinyint', default: 1 }) isRequired: boolean;
  @Column({ type: 'tinyint', default: 0 }) isChecked: boolean;
  @Column({ type: 'datetime', nullable: true }) checkedAt: Date;
  @Column({ type: 'varchar', length: 36, nullable: true }) checkedById: string;
  @Column({ type: 'text', nullable: true }) notes: string;
  @Column({ type: 'int', default: 0 }) orderIndex: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENTITY: Teslim Teyit
// ═══════════════════════════════════════════════════════════════════════════════

@Entity('delivery_confirmations')
export class DeliveryConfirmation extends AbstractEntity {
  @Column({ type: 'varchar', length: 36 }) reportId: string;
  @Column({ type: 'varchar', length: 36 }) customerId: string;
  @Column({ type: 'varchar', length: 50 }) method: string;
  @Column({ type: 'datetime', nullable: true }) confirmedAt: Date;
  @Column({ type: 'varchar', length: 255, nullable: true }) confirmedBy: string;
  @Column({ type: 'varchar', length: 50, nullable: true }) confirmedIp: string;
  @Column({ type: 'varchar', length: 500, nullable: true }) signatureUrl: string;
  @Column({ type: 'text', nullable: true }) notes: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENTITY: Saha Teyit
// ═══════════════════════════════════════════════════════════════════════════════

@Entity('site_confirmations')
export class SiteConfirmation extends AbstractEntity {
  @Column({ type: 'varchar', length: 36 }) workOrderId: string;
  @Column({ type: 'varchar', length: 36 }) inspectorId: string;
  @Column({ type: 'varchar', length: 36 }) customerId: string;
  @Column({ type: 'varchar', length: 255 }) customerRepName: string;
  @Column({ type: 'varchar', length: 100, nullable: true }) customerRepTitle: string;
  @Column({ type: 'varchar', length: 500, nullable: true }) signatureUrl: string;
  @Column({ type: 'datetime' }) confirmedAt: Date;
  @Column({ type: 'int', default: 0 }) equipmentInspected: number;
  @Column({ type: 'int', default: 0 }) equipmentPostponed: number;
  @Column({ type: 'text', nullable: true }) notes: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENTITY: Ek Sartname
// ═══════════════════════════════════════════════════════════════════════════════

@Entity('contract_addendums')
export class ContractAddendum extends AbstractEntity {
  @Column({ type: 'varchar', length: 36 }) contractId: string;
  @Column({ type: 'varchar', length: 255 }) title: string;
  @Column({ type: 'varchar', length: 50 }) type: string;
  @Column({ type: 'text', nullable: true }) content: string;
  @Column({ type: 'varchar', length: 500, nullable: true }) documentUrl: string;
  @Column({ type: 'date', nullable: true }) effectiveDate: Date;
  @Column({ type: 'datetime', nullable: true }) signedAt: Date;
  @Column({ type: 'varchar', length: 20, default: 'draft' }) status: string;
  @Column({ type: 'varchar', length: 36, nullable: true }) createdById: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENTITY: Dokuman Kontrol
// ═══════════════════════════════════════════════════════════════════════════════

@Entity('controlled_documents')
export class ControlledDocument extends AbstractEntity {
  @Column({ type: 'varchar', length: 50, unique: true }) code: string;
  @Column({ type: 'varchar', length: 255 }) title: string;
  @Column({ type: 'varchar', length: 50 }) type: string;
  @Column({ type: 'varchar', length: 20, default: 'Rev.00' }) currentRevision: string;
  @Column({ type: 'date' }) revisionDate: Date;
  @Column({ type: 'varchar', length: 20, default: 'draft' }) status: string;
  @Column({ type: 'text', nullable: true }) scope: string;
  @Column({ type: 'varchar', length: 500, nullable: true }) documentUrl: string;
  @Column({ type: 'varchar', length: 36, nullable: true }) approvedById: string;
  @Column({ type: 'datetime', nullable: true }) approvedAt: Date;
  @Column({ type: 'int', default: 5 }) retentionYears: number;
  @Column({ type: 'varchar', length: 36 }) createdById: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SERVICE: Tum Gap Modulleri
// ═══════════════════════════════════════════════════════════════════════════════

@Injectable()
export class GapModulesService {
  constructor(
    @InjectRepository(ImpartialityDeclaration) private impRepo: Repository<ImpartialityDeclaration>,
    @InjectRepository(ManagementReview) private yggRepo: Repository<ManagementReview>,
    @InjectRepository(PersonnelAuthorization) private authzRepo: Repository<PersonnelAuthorization>,
    @InjectRepository(PersonnelTraining) private trainRepo: Repository<PersonnelTraining>,
    @InjectRepository(ProcessChecklist) private clRepo: Repository<ProcessChecklist>,
    @InjectRepository(ChecklistItem) private ciRepo: Repository<ChecklistItem>,
    @InjectRepository(DeliveryConfirmation) private dcRepo: Repository<DeliveryConfirmation>,
    @InjectRepository(SiteConfirmation) private scRepo: Repository<SiteConfirmation>,
    @InjectRepository(ContractAddendum) private addRepo: Repository<ContractAddendum>,
    @InjectRepository(ControlledDocument) private docRepo: Repository<ControlledDocument>,
    @InjectDataSource() private dataSource: DataSource,
    private auditService: AuditService,
  ) {}

  // ── Tarafsizlik ──────────────────────────────────────────────────────

  async getDeclarations(userId?: string, year?: number) {
    const qb = this.impRepo.createQueryBuilder('d');
    if (userId) qb.andWhere('d.userId = :uid', { uid: userId });
    if (year) qb.andWhere('d.declarationYear = :y', { y: year });
    return qb.orderBy('d.declarationYear', 'DESC').getMany();
  }

  async createDeclaration(data: Partial<ImpartialityDeclaration>) {
    return this.impRepo.save(this.impRepo.create(data));
  }

  async signDeclaration(id: string, documentUrl: string) {
    await this.impRepo.update(id, { status: 'signed', signedAt: new Date(), documentUrl });
    return this.impRepo.findOne({ where: { id } });
  }

  async getMissingDeclarations(year: number): Promise<any[]> {
    return this.dataSource.query(`
      SELECT u.id, u.fullName, u.email FROM users u
      WHERE u.roles LIKE '%inspector%' AND u.isActive = 1
        AND u.id NOT IN (SELECT userId FROM impartiality_declarations WHERE declarationYear = ? AND status = 'signed')
    `, [year]);
  }

  // ── YGG ──────────────────────────────────────────────────────────────

  async getReviews() { return this.yggRepo.find({ order: { reviewDate: 'DESC' } }); }

  async createReview(data: Partial<ManagementReview>, userId: string) {
    const count = await this.yggRepo.count();
    const num = `YGG-${new Date().getFullYear()}-${String(count + 1).padStart(3, '0')}`;
    return this.yggRepo.save(this.yggRepo.create({ ...data, reviewNumber: num, createdById: userId }));
  }

  async approveReview(id: string, userId: string) {
    await this.yggRepo.update(id, { status: 'approved', approvedById: userId, approvedAt: new Date() });
    return this.yggRepo.findOne({ where: { id } });
  }

  async getReviewInputData(): Promise<any> {
    const [complaints, capas, audits, inspections] = await Promise.all([
      this.dataSource.query(`SELECT COUNT(*) as c, status FROM complaints GROUP BY status`),
      this.dataSource.query(`SELECT COUNT(*) as c, status FROM capa_records GROUP BY status`),
      this.dataSource.query(`SELECT COUNT(*) as c, status FROM internal_audits GROUP BY status`),
      this.dataSource.query(`SELECT COUNT(*) as c, overallResult FROM inspections WHERE completedAt >= DATE_SUB(NOW(), INTERVAL 6 MONTH) GROUP BY overallResult`),
    ]);
    return { complaints, capas, audits, inspections };
  }

  // ── Personel Yetkilendirme ───────────────────────────────────────────

  async getAuthorizations(userId?: string) {
    const qb = this.authzRepo.createQueryBuilder('a');
    if (userId) qb.where('a.userId = :uid', { uid: userId });
    return qb.orderBy('a.grantedAt', 'DESC').getMany();
  }

  async createAuthorization(data: Partial<PersonnelAuthorization>) {
    return this.authzRepo.save(this.authzRepo.create(data));
  }

  async isAuthorized(userId: string, equipmentTypeId: string): Promise<boolean> {
    const count = await this.authzRepo.count({
      where: { userId, equipmentTypeId, isActive: true as any },
    });
    return count > 0;
  }

  async getAuthorizationMatrix(): Promise<any[]> {
    return this.dataSource.query(`
      SELECT u.id as userId, u.fullName, et.id as equipmentTypeId, et.name as equipmentTypeName,
             pa.authorizationLevel, pa.grantedAt, pa.expiresAt
      FROM users u
      CROSS JOIN equipment_types et
      LEFT JOIN personnel_authorizations pa ON pa.userId = u.id AND pa.equipmentTypeId = et.id AND pa.isActive = 1
      WHERE u.roles LIKE '%inspector%' AND u.isActive = 1 AND et.isActive = 1
      ORDER BY u.fullName, et.name
    `);
  }

  // ── Egitim ───────────────────────────────────────────────────────────

  async getTrainings(userId?: string) {
    const qb = this.trainRepo.createQueryBuilder('t');
    if (userId) qb.where('t.userId = :uid', { uid: userId });
    return qb.orderBy('t.startDate', 'DESC').getMany();
  }

  async createTraining(data: Partial<PersonnelTraining>, userId: string) {
    return this.trainRepo.save(this.trainRepo.create({ ...data, createdById: userId }));
  }

  // ── Checklist Sistemi ────────────────────────────────────────────────

  private readonly CHECKLIST_TEMPLATES: Record<string, string[]> = {
    handover: [
      'Müşteri kartı eksiksiz (vergi no, iletişim, yetkili)',
      'Tüm lokasyonlar sisteme girildi',
      'Ekipman envanteri yüklendi',
      'Teklif kabul edildi',
      'Sözleşme imzalandı ve yüklendi',
      'Sözleşme kapsamı tanımlandı (ekipman tipleri + lokasyonlar)',
      'Birim fiyat listesi girildi',
      'Müşteriye özel talimatlar girildi',
      'Logo cari kart senkronize edildi',
    ],
    pre_field: [
      'İş emri atanmış denetçi doğru',
      'Denetçi bu ekipman tipinde yetkili',
      'Form şablonu atanmış',
      'Önceki denetim sonuçları incelendi',
      'Ölçüm aletleri kalibrasyonu geçerli',
      'Lokasyon erişim bilgisi mevcut',
      'Saha sorumlusu bilgisi var',
      'Müşteriye randevu bildirildi',
      'Özel risk / güvenlik notu kontrol edildi',
    ],
    pre_report: [
      'Tüm denetimler APPROVED durumda',
      'Tüm zorunlu fotoğraflar yüklendi',
      'Uygunsuzluklar doğru kategorize edildi',
      'Ölçüm sonuçları eksiksiz',
      'Kullanılan ölçüm aletleri kalibre',
      'Form şablonu doğru revision',
      'Müşteri ve ekipman bilgileri doğru',
      'Rapor numarası doğru',
    ],
    pre_invoice: [
      'Sözleşme aktif durumda',
      'İş emri REPORT_APPROVED durumda',
      'Rapor müşteriye teslim edildi',
      'Teslim teyidi alındı',
      'Birim fiyat tanımlı',
      'Ekipman sayısı doğrulanmış',
      'KDV oranı doğru',
      'Logo cari kart eşleşmiş',
    ],
    accreditation: [
      'Kalite el kitabı güncel',
      'Tüm prosedürler güncel ve onaylı',
      'Personel yetkinlik matrisi hazır',
      'Personel yetkilendirme kararları dosyada',
      'Tarafsızlık beyanları güncel',
      'Kalibrasyon sertifikaları güncel',
      'Son 12 ay iç tetkik raporu var',
      'Son YGG toplantı tutanağı var',
      'CAPA kayıtları güncel',
      'Şikayet kayıtları hazır',
      'Örnek muayene dosyaları (10 adet) hazır',
      'Form şablonları revizyonlu ve onaylı',
    ],
  };

  async createChecklist(entityType: string, entityId: string, checklistType: string, userId: string): Promise<ProcessChecklist> {
    const cl = await this.clRepo.save(this.clRepo.create({ entityType, entityId, checklistType }));
    const template = this.CHECKLIST_TEMPLATES[checklistType] || [];
    for (let i = 0; i < template.length; i++) {
      await this.ciRepo.save(this.ciRepo.create({ checklistId: cl.id, label: template[i], orderIndex: i }));
    }
    return cl;
  }

  async getChecklist(entityType: string, entityId: string, checklistType: string): Promise<{ checklist: ProcessChecklist; items: ChecklistItem[] } | null> {
    const cl = await this.clRepo.findOne({ where: { entityType, entityId, checklistType } });
    if (!cl) return null;
    const items = await this.ciRepo.find({ where: { checklistId: cl.id }, order: { orderIndex: 'ASC' } });
    return { checklist: cl, items };
  }

  async checkItem(itemId: string, userId: string, notes?: string) {
    await this.ciRepo.update(itemId, { isChecked: true as any, checkedAt: new Date(), checkedById: userId, notes });
    // Check if all required items are checked
    const item = await this.ciRepo.findOne({ where: { id: itemId } });
    if (item) {
      const unchecked = await this.ciRepo.count({ where: { checklistId: item.checklistId, isRequired: true as any, isChecked: false as any } });
      if (unchecked === 0) {
        await this.clRepo.update(item.checklistId, { status: 'completed', completedAt: new Date(), completedById: userId });
      }
    }
  }

  async uncheckItem(itemId: string) {
    const item = await this.ciRepo.findOne({ where: { id: itemId } });
    await this.ciRepo.update(itemId, { isChecked: false as any, checkedAt: null, checkedById: null });
    if (item) await this.clRepo.update(item.checklistId, { status: 'open', completedAt: null });
  }

  // ── Teslim Teyit ────────────────────────────────────────────────────

  async confirmDelivery(reportId: string, data: Partial<DeliveryConfirmation>) {
    return this.dcRepo.save(this.dcRepo.create({ ...data, reportId, confirmedAt: new Date() }));
  }

  async getDeliveryConfirmation(reportId: string) {
    return this.dcRepo.findOne({ where: { reportId } });
  }

  // ── Saha Teyit ──────────────────────────────────────────────────────

  async createSiteConfirmation(data: Partial<SiteConfirmation>) {
    return this.scRepo.save(this.scRepo.create({ ...data, confirmedAt: new Date() }));
  }

  async getSiteConfirmation(workOrderId: string) {
    return this.scRepo.findOne({ where: { workOrderId } });
  }

  // ── Ek Sartname ─────────────────────────────────────────────────────

  async getAddendums(contractId: string) {
    return this.addRepo.find({ where: { contractId }, order: { createdAt: 'ASC' } });
  }

  async createAddendum(data: Partial<ContractAddendum>, userId: string) {
    return this.addRepo.save(this.addRepo.create({ ...data, createdById: userId }));
  }

  // ── Dokuman Kontrol ─────────────────────────────────────────────────

  async getDocuments(type?: string) {
    const qb = this.docRepo.createQueryBuilder('d');
    if (type) qb.where('d.type = :t', { t: type });
    return qb.orderBy('d.code', 'ASC').getMany();
  }

  async createDocument(data: Partial<ControlledDocument>, userId: string) {
    return this.docRepo.save(this.docRepo.create({ ...data, createdById: userId }));
  }

  async approveDocument(id: string, userId: string) {
    await this.docRepo.update(id, { status: 'active', approvedById: userId, approvedAt: new Date() });
    return this.docRepo.findOne({ where: { id } });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTROLLERS
// ═══════════════════════════════════════════════════════════════════════════════

@ApiTags('impartiality')
@ApiBearerAuth('JWT')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('impartiality')
export class ImpartialityController {
  constructor(private service: GapModulesService) {}

  @Get() @Roles(UserRole.ADMIN, UserRole.EXECUTIVE)
  findAll(@Query('userId') uid?: string, @Query('year') year?: number) { return this.service.getDeclarations(uid, year); }

  @Get('missing') @Roles(UserRole.ADMIN)
  getMissing(@Query('year') year?: number) { return this.service.getMissingDeclarations(year || new Date().getFullYear()); }

  @Post() @Roles(UserRole.ADMIN)
  create(@Body() body: any) { return this.service.createDeclaration(body); }

  @Patch(':id/sign') @Roles(UserRole.ADMIN)
  sign(@Param('id') id: string, @Body('documentUrl') url: string) { return this.service.signDeclaration(id, url); }
}

@ApiTags('management-reviews')
@ApiBearerAuth('JWT')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('management-reviews')
export class ManagementReviewController {
  constructor(private service: GapModulesService) {}

  @Get() @Roles(UserRole.ADMIN, UserRole.EXECUTIVE)
  findAll() { return this.service.getReviews(); }

  @Get('input-data') @Roles(UserRole.ADMIN, UserRole.EXECUTIVE)
  getInputData() { return this.service.getReviewInputData(); }

  @Post() @Roles(UserRole.ADMIN, UserRole.EXECUTIVE)
  create(@Body() body: any, @CurrentUser('id') uid: string) { return this.service.createReview(body, uid); }

  @Patch(':id/approve') @Roles(UserRole.ADMIN, UserRole.EXECUTIVE)
  approve(@Param('id') id: string, @CurrentUser('id') uid: string) { return this.service.approveReview(id, uid); }
}

@ApiTags('personnel-auth')
@ApiBearerAuth('JWT')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('personnel-authorizations')
export class PersonnelAuthController {
  constructor(private service: GapModulesService) {}

  @Get() @Roles(UserRole.ADMIN, UserRole.TECHNICAL_MANAGER)
  findAll(@Query('userId') uid?: string) { return this.service.getAuthorizations(uid); }

  @Get('matrix') @Roles(UserRole.ADMIN, UserRole.TECHNICAL_MANAGER, UserRole.EXECUTIVE)
  getMatrix() { return this.service.getAuthorizationMatrix(); }

  @Get('check/:userId/:equipmentTypeId') @Roles(UserRole.ADMIN, UserRole.PLANNER)
  check(@Param('userId') uid: string, @Param('equipmentTypeId') etid: string) {
    return this.service.isAuthorized(uid, etid).then(ok => ({ authorized: ok }));
  }

  @Post() @Roles(UserRole.ADMIN, UserRole.TECHNICAL_MANAGER)
  create(@Body() body: any) { return this.service.createAuthorization(body); }
}

@ApiTags('trainings')
@ApiBearerAuth('JWT')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('personnel-trainings')
export class PersonnelTrainingController {
  constructor(private service: GapModulesService) {}

  @Get() @Roles(UserRole.ADMIN, UserRole.TECHNICAL_MANAGER)
  findAll(@Query('userId') uid?: string) { return this.service.getTrainings(uid); }

  @Post() @Roles(UserRole.ADMIN, UserRole.TECHNICAL_MANAGER)
  create(@Body() body: any, @CurrentUser('id') uid: string) { return this.service.createTraining(body, uid); }
}

@ApiTags('checklists')
@ApiBearerAuth('JWT')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('checklists')
export class ChecklistController {
  constructor(private service: GapModulesService) {}

  @Post() @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.PLANNER, UserRole.TECHNICAL_MANAGER, UserRole.FINANCE)
  create(@Body() body: { entityType: string; entityId: string; checklistType: string }, @CurrentUser('id') uid: string) {
    return this.service.createChecklist(body.entityType, body.entityId, body.checklistType, uid);
  }

  @Get(':entityType/:entityId/:checklistType')
  get(@Param('entityType') et: string, @Param('entityId') eid: string, @Param('checklistType') ct: string) {
    return this.service.getChecklist(et, eid, ct);
  }

  @Patch('items/:itemId/check') @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.PLANNER, UserRole.TECHNICAL_MANAGER, UserRole.FINANCE)
  check(@Param('itemId') id: string, @CurrentUser('id') uid: string, @Body('notes') notes?: string) {
    return this.service.checkItem(id, uid, notes);
  }

  @Patch('items/:itemId/uncheck') @Roles(UserRole.ADMIN)
  uncheck(@Param('itemId') id: string) { return this.service.uncheckItem(id); }
}

@ApiTags('delivery-confirmations')
@ApiBearerAuth('JWT')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('delivery-confirmations')
export class DeliveryConfirmationController {
  constructor(private service: GapModulesService) {}

  @Get(':reportId') @Roles(UserRole.ADMIN, UserRole.FINANCE, UserRole.EXECUTIVE)
  get(@Param('reportId') rid: string) { return this.service.getDeliveryConfirmation(rid); }

  @Post() @Roles(UserRole.ADMIN, UserRole.CUSTOMER_REP, UserRole.CUSTOMER)
  create(@Body() body: any) { return this.service.confirmDelivery(body.reportId, body); }
}

@ApiTags('site-confirmations')
@ApiBearerAuth('JWT')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('site-confirmations')
export class SiteConfirmationController {
  constructor(private service: GapModulesService) {}

  @Get(':workOrderId') @Roles(UserRole.ADMIN, UserRole.TECHNICAL_MANAGER, UserRole.PLANNER)
  get(@Param('workOrderId') woid: string) { return this.service.getSiteConfirmation(woid); }

  @Post() @Roles(UserRole.INSPECTOR, UserRole.ADMIN)
  create(@Body() body: any) { return this.service.createSiteConfirmation(body); }
}

@ApiTags('contract-addendums')
@ApiBearerAuth('JWT')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('contract-addendums')
export class ContractAddendumController {
  constructor(private service: GapModulesService) {}

  @Get(':contractId') @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.FINANCE)
  findAll(@Param('contractId') cid: string) { return this.service.getAddendums(cid); }

  @Post() @Roles(UserRole.ADMIN, UserRole.SALES)
  create(@Body() body: any, @CurrentUser('id') uid: string) { return this.service.createAddendum(body, uid); }
}

@ApiTags('document-control')
@ApiBearerAuth('JWT')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('document-control')
export class DocumentControlController {
  constructor(private service: GapModulesService) {}

  @Get() @Roles(UserRole.ADMIN, UserRole.EXECUTIVE)
  findAll(@Query('type') type?: string) { return this.service.getDocuments(type); }

  @Post() @Roles(UserRole.ADMIN)
  create(@Body() body: any, @CurrentUser('id') uid: string) { return this.service.createDocument(body, uid); }

  @Patch(':id/approve') @Roles(UserRole.ADMIN, UserRole.EXECUTIVE)
  approve(@Param('id') id: string, @CurrentUser('id') uid: string) { return this.service.approveDocument(id, uid); }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE
// ═══════════════════════════════════════════════════════════════════════════════

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ImpartialityDeclaration, ManagementReview, PersonnelAuthorization,
      PersonnelTraining, ProcessChecklist, ChecklistItem,
      DeliveryConfirmation, SiteConfirmation, ContractAddendum, ControlledDocument,
    ]),
    AuditModule,
  ],
  providers: [GapModulesService],
  controllers: [
    ImpartialityController, ManagementReviewController, PersonnelAuthController,
    PersonnelTrainingController, ChecklistController, DeliveryConfirmationController,
    SiteConfirmationController, ContractAddendumController, DocumentControlController,
  ],
  exports: [GapModulesService],
})
export class GapModulesModule {}

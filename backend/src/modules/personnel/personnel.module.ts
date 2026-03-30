/**
 * Personnel Module
 *
 * UsersModule zaten User entity ve InspectorQualification'ı barındırıyor.
 * Bu modül ek personel operasyonlarını ve YGG (Yönetimin Gözden Geçirmesi) kayıtlarını yönetir.
 */
import {
  Entity, Column, Index,
} from 'typeorm';
import { AbstractEntity } from '@/common/entities/abstract.entity';
import {
  Injectable,
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
import { AuditService } from '@/modules/audit/audit.service';
import { AuditModule } from '@/modules/audit/audit.module';
import { StorageService, StorageBucket } from '@/modules/storage/storage.service';
import { StorageModule } from '@/modules/storage/storage.module';

// ─── YGG (Yönetimin Gözden Geçirmesi) Entity ──────────────────────────────────
@Entity('management_reviews')
export class ManagementReview extends AbstractEntity {
  @Column({ unique: true })
  reviewNumber: string; // 'YGG-2024-01'

  @Column({ type: 'date' })
  reviewDate: Date;

  @Column({ type: 'json', nullable: true })
  attendees: string[]; // Katılımcı userId listesi

  @Column({ type: 'text', nullable: true })
  agenda: string;

  @Column({ type: 'text', nullable: true })
  inputItems: string; // Madde 8.7 girdi maddeleri

  @Column({ type: 'text', nullable: true })
  outputDecisions: string; // Alınan kararlar

  @Column({ type: 'json', nullable: true })
  actionItems: Array<{
    description: string;
    responsibleId: string;
    dueDate: string;
    status: string;
  }>;

  @Column({ nullable: true })
  minutesDocumentUrl: string; // Toplantı tutanağı PDF

  @Column({ nullable: true })
  createdById: string;
}

// ─── Personel Özlük Dosyası Entity ────────────────────────────────────────────
@Entity('personnel_documents')
@Index(['userId'])
export class PersonnelDocument extends AbstractEntity {
  @Column()
  userId: string;

  @Column()
  documentType: string; // 'cv', 'diploma', 'certificate', 'health', 'contract'

  @Column()
  documentName: string;

  @Column({ nullable: true })
  fileUrl: string;

  @Column({ type: 'date', nullable: true })
  validUntil: Date;

  @Column({ nullable: true })
  uploadedById: string;
}

// ─── Service ─────────────────────────────────────────────────────────────────
@Injectable()
export class PersonnelService {
  constructor(
    @InjectRepository(ManagementReview) private reviewRepo: Repository<ManagementReview>,
    @InjectRepository(PersonnelDocument) private docRepo: Repository<PersonnelDocument>,
    private auditService: AuditService,
    private storageService: StorageService,
  ) {}

  // YGG
  async createReview(data: Partial<ManagementReview>, userId: string): Promise<ManagementReview> {
    const year = new Date().getFullYear();
    const count = await this.reviewRepo.count();
    const reviewNumber = `YGG-${year}-${String(count + 1).padStart(2, '0')}`;
    const review = this.reviewRepo.create({ ...data, reviewNumber, createdById: userId });
    const saved = await this.reviewRepo.save(review);
    await this.auditService.log({ userId, action: 'MANAGEMENT_REVIEW_CREATED', entityType: 'ManagementReview', entityId: saved.id });
    return saved;
  }

  async findAllReviews(): Promise<ManagementReview[]> {
    return this.reviewRepo.find({ order: { reviewDate: 'DESC' } });
  }

  async findReview(id: string): Promise<ManagementReview | null> {
    return this.reviewRepo.findOne({ where: { id } });
  }

  async updateReview(id: string, data: Partial<ManagementReview>, userId: string): Promise<ManagementReview> {
    await this.reviewRepo.update(id, data);
    await this.auditService.log({ userId, action: 'MANAGEMENT_REVIEW_UPDATED', entityType: 'ManagementReview', entityId: id, newValues: data as any });
    return this.findReview(id);
  }

  // Personel özlük dosyaları
  async uploadDocument(
    userId: string, file: Buffer, originalName: string,
    documentType: string, validUntil: string | null, uploadedById: string,
  ): Promise<PersonnelDocument> {
    const { url } = await this.storageService.uploadFile(
      StorageBucket.DOCUMENTS, file, originalName, 'application/pdf',
      `personnel/${userId}`,
    );
    const doc = this.docRepo.create({
      userId, documentType,
      documentName: originalName,
      fileUrl: url,
      validUntil: validUntil ? new Date(validUntil) : null,
      uploadedById,
    });
    return this.docRepo.save(doc);
  }

  async getUserDocuments(userId: string): Promise<PersonnelDocument[]> {
    return this.docRepo.find({ where: { userId }, order: { createdAt: 'DESC' } });
  }
}

// ─── Controller ──────────────────────────────────────────────────────────────
@ApiTags('personnel')
@ApiBearerAuth('JWT')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('personnel')
export class PersonnelController {
  constructor(private service: PersonnelService) {}

  @Post('management-reviews')
  @Roles(UserRole.ADMIN, UserRole.EXECUTIVE)
  createReview(@Body() body: any, @CurrentUser('id') userId: string) { return this.service.createReview(body, userId); }

  @Get('management-reviews')
  @Roles(UserRole.ADMIN, UserRole.EXECUTIVE, UserRole.TECHNICAL_MANAGER)
  findAllReviews() { return this.service.findAllReviews(); }

  @Get('management-reviews/:id')
  findReview(@Param('id') id: string) { return this.service.findReview(id); }

  @Put('management-reviews/:id')
  @Roles(UserRole.ADMIN, UserRole.EXECUTIVE)
  updateReview(@Param('id') id: string, @Body() body: any, @CurrentUser('id') userId: string) {
    return this.service.updateReview(id, body, userId);
  }

  @Get(':userId/documents')
  @Roles(UserRole.ADMIN, UserRole.EXECUTIVE)
  getUserDocuments(@Param('userId') userId: string) { return this.service.getUserDocuments(userId); }
}

// ─── Module ───────────────────────────────────────────────────────────────────
@Module({
  imports: [
    TypeOrmModule.forFeature([ManagementReview, PersonnelDocument]),
    AuditModule, StorageModule,
  ],
  providers: [PersonnelService],
  controllers: [PersonnelController],
  exports: [PersonnelService],
})
export class PersonnelModule {}

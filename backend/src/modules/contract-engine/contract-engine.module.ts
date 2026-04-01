import {
  Entity, Column, Index, ManyToOne, OneToMany, JoinColumn,
  Repository, DataSource, CreateDateColumn,
} from 'typeorm';
import { AbstractEntity } from '@/common/entities/abstract.entity';
import {
  Injectable, NotFoundException, BadRequestException, Controller, Get, Post, Put, Patch,
  Body, Param, Query, UseGuards, Module, UseInterceptors, UploadedFile, Res, StreamableFile,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags, ApiConsumes, ApiOperation } from '@nestjs/swagger';
import { Roles } from '@/common/decorators/roles.decorator';
import { RolesGuard } from '@/common/guards/roles.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { UserRole } from '@/common/enums/user-role.enum';
import { PaginationDto, PaginatedResult } from '@/common/dto/pagination.dto';
import { AuditModule } from '@/modules/audit/audit.module';
import { AuditService } from '@/modules/audit/audit.service';
import { DocumentRenderService } from '@/modules/shared/document-render.service';
import { StorageModule } from '@/modules/storage/storage.module';
import { StorageService, StorageBucket } from '@/modules/storage/storage.service';
import { FileInterceptor } from '@nestjs/platform-express';
import * as crypto from 'crypto';
import { Response } from 'express';

// ═══════════════════════════════════════════════════════════════════════════════
// ENTITY: ContractTemplate
// ═══════════════════════════════════════════════════════════════════════════════
@Entity('contract_templates')
@Index(['status', 'type'])
export class ContractTemplate extends AbstractEntity {
  @Column({ type: 'varchar', length: 50, unique: true })
  code: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 50 })
  type: string; // 'genel' | 'yillik' | 'proje_bazli'

  @Column({ type: 'varchar', length: 20, default: 'Rev.01' })
  revision: string;

  @Column({ type: 'date', nullable: true })
  revisionDate: Date;

  @Column({ type: 'varchar', length: 20, default: 'draft' })
  status: string; // 'draft' | 'active' | 'superseded' | 'cancelled'

  @Column({ type: 'varchar', length: 36, nullable: true })
  supersededById: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  outputTemplateUrl: string;

  @Column({ type: 'json', nullable: true })
  layoutConfig: any;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'varchar', length: 36 })
  createdById: string;

  @OneToMany(() => ContractTemplateField, (f) => f.template, { cascade: true, eager: true })
  fields: ContractTemplateField[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENTITY: ContractTemplateField
// ═══════════════════════════════════════════════════════════════════════════════
@Entity('contract_template_fields')
@Index(['templateId', 'orderIndex'])
export class ContractTemplateField extends AbstractEntity {
  @Column({ type: 'varchar', length: 36 })
  templateId: string;

  @Column({ type: 'varchar', length: 100 })
  fieldKey: string;

  @Column({ type: 'varchar', length: 255 })
  label: string;

  @Column({ type: 'varchar', length: 30 })
  fieldType: string; // 'text' | 'number' | 'date' | 'currency' | 'table' | 'select' | 'signature_zone'

  @Column({ type: 'varchar', length: 100, nullable: true })
  section: string;

  @Column({ type: 'int', default: 0 })
  orderIndex: number;

  @Column({ type: 'json', nullable: true })
  pdfCoordinate: any;

  @Column({ type: 'tinyint', default: 0, transformer: { to: (v: boolean) => (v ? 1 : 0), from: (v: number) => !!v } })
  isRequired: boolean;

  @Column({ type: 'json', nullable: true })
  options: any;

  @Column({ type: 'tinyint', default: 0, transformer: { to: (v: boolean) => (v ? 1 : 0), from: (v: number) => !!v } })
  isConditional: boolean;

  @Column({ type: 'json', nullable: true })
  conditionRule: any;

  @Column({ type: 'tinyint', default: 0, transformer: { to: (v: boolean) => (v ? 1 : 0), from: (v: number) => !!v } })
  isRepeatable: boolean;

  @Column({ type: 'json', nullable: true })
  tableColumns: any;

  @ManyToOne(() => ContractTemplate, (t) => t.fields, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'templateId' })
  template: ContractTemplate;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENTITY: ContractDocument
// ═══════════════════════════════════════════════════════════════════════════════
@Entity('contract_documents')
@Index(['customerId', 'status'])
@Index(['templateId'])
@Index(['proposalId'])
export class ContractDocument extends AbstractEntity {
  @Column({ type: 'varchar', length: 50, unique: true })
  contractNumber: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  templateId: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  templateRevision: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  proposalId: string;

  @Column({ type: 'varchar', length: 36 })
  customerId: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  locationId: string; // Sözleşmenin bağlı olduğu lokasyon

  @Column({ type: 'varchar', length: 30, default: 'draft' })
  status: string; // 'draft' | 'generated' | 'sent' | 'customer_review' | 'signed' | 'active' | 'expired' | 'terminated'

  @Column({ type: 'int', default: 1 })
  version: number;

  @Column({ type: 'date' })
  startDate: Date;

  @Column({ type: 'date' })
  endDate: Date;

  @Column({ type: 'tinyint', default: 0, transformer: { to: (v: boolean) => (v ? 1 : 0), from: (v: number) => !!v } })
  autoRenew: boolean;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalValue: number;

  @Column({ type: 'varchar', length: 10, default: 'TRY' })
  currency: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  pdfUrl: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  pdfHash: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  signedPdfUrl: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  signedPdfHash: string;

  @Column({ type: 'datetime', nullable: true })
  signedAt: Date;

  @Column({ type: 'varchar', length: 36, nullable: true })
  signedById: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ type: 'text', nullable: true })
  specialTerms: string;

  @Column({ type: 'varchar', length: 36 })
  createdById: string;

  @OneToMany(() => ContractFile, (f) => f.contract)
  files: ContractFile[];

  @OneToMany(() => ContractStatusLog, (l) => l.contract)
  statusLogs: ContractStatusLog[];

  @ManyToOne(() => ContractTemplate)
  @JoinColumn({ name: 'templateId' })
  template: ContractTemplate;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENTITY: ContractFile
// ═══════════════════════════════════════════════════════════════════════════════
@Entity('contract_files')
@Index(['contractId', 'fileType'])
export class ContractFile extends AbstractEntity {
  @Column({ type: 'varchar', length: 36 })
  contractId: string;

  @Column({ type: 'varchar', length: 30 })
  fileType: string; // 'draft_pdf' | 'signed_pdf' | 'amendment' | 'attachment'

  @Column({ type: 'varchar', length: 255 })
  fileName: string;

  @Column({ type: 'varchar', length: 500 })
  fileUrl: string;

  @Column({ type: 'varchar', length: 128 })
  fileHash: string;

  @Column({ type: 'int', default: 0 })
  fileSize: number;

  @Column({ type: 'int', default: 1 })
  version: number;

  @Column({ type: 'varchar', length: 36 })
  uploadedById: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @ManyToOne(() => ContractDocument, (c) => c.files, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contractId' })
  contract: ContractDocument;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENTITY: ContractStatusLog
// ═══════════════════════════════════════════════════════════════════════════════
@Entity('contract_status_logs')
@Index(['contractId', 'createdAt'])
export class ContractStatusLog {
  @Column({ type: 'varchar', length: 36, primary: true, generated: 'uuid' })
  id: string;

  @Column({ type: 'varchar', length: 36 })
  contractId: string;

  @Column({ type: 'varchar', length: 30 })
  fromStatus: string;

  @Column({ type: 'varchar', length: 30 })
  toStatus: string;

  @Column({ type: 'varchar', length: 36 })
  userId: string;

  @Column({ type: 'text', nullable: true })
  reason: string;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;

  @ManyToOne(() => ContractDocument, (c) => c.statusLogs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contractId' })
  contract: ContractDocument;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SERVICE: ContractEngineService
// ═══════════════════════════════════════════════════════════════════════════════
@Injectable()
export class ContractEngineService {
  constructor(
    @InjectRepository(ContractTemplate) private templateRepo: Repository<ContractTemplate>,
    @InjectRepository(ContractTemplateField) private fieldRepo: Repository<ContractTemplateField>,
    @InjectRepository(ContractDocument) private contractRepo: Repository<ContractDocument>,
    @InjectRepository(ContractFile) private fileRepo: Repository<ContractFile>,
    @InjectRepository(ContractStatusLog) private statusLogRepo: Repository<ContractStatusLog>,
    private dataSource: DataSource,
    private auditService: AuditService,
    private storageService: StorageService,
    private documentRenderService: DocumentRenderService,
  ) {}

  // ─── Contract Number Generation ─────────────────────────────────────────
  async generateContractNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `SZL-${year}-`;
    const last = await this.contractRepo
      .createQueryBuilder('c')
      .where('c.contractNumber LIKE :prefix', { prefix: `${prefix}%` })
      .orderBy('c.contractNumber', 'DESC')
      .getOne();

    let seq = 1;
    if (last) {
      const lastSeq = parseInt(last.contractNumber.replace(prefix, ''), 10);
      if (!isNaN(lastSeq)) seq = lastSeq + 1;
    }
    return `${prefix}${String(seq).padStart(5, '0')}`;
  }

  // ─── Template CRUD ──────────────────────────────────────────────────────
  async createTemplate(data: Partial<ContractTemplate> & { fields?: Partial<ContractTemplateField>[] }, userId: string): Promise<ContractTemplate> {
    const existing = await this.templateRepo.findOne({ where: { code: data.code } });
    if (existing) throw new BadRequestException(`Bu kodla bir şablon zaten mevcut: ${data.code}`);

    const template = this.templateRepo.create({
      ...data,
      createdById: userId,
      revisionDate: data.revisionDate ? new Date(data.revisionDate as any) : new Date(),
      status: 'draft',
    });

    if (data.fields && data.fields.length > 0) {
      template.fields = data.fields.map((f, idx) =>
        this.fieldRepo.create({ ...f, orderIndex: f.orderIndex ?? idx }),
      );
    }

    const saved = await this.templateRepo.save(template);
    await this.auditService.log({
      userId, action: 'CREATE', entityType: 'contract_template', entityId: saved.id,
      newValues: { code: saved.code, name: saved.name, type: saved.type },
      description: `Sözleşme şablonu oluşturuldu: ${saved.code} - ${saved.name}`,
    });
    return saved;
  }

  async findAllTemplates(
    filters: { status?: string; type?: string; search?: string },
    pagination: PaginationDto,
  ): Promise<PaginatedResult<ContractTemplate>> {
    const qb = this.templateRepo.createQueryBuilder('t');

    if (filters.status) qb.andWhere('t.status = :status', { status: filters.status });
    if (filters.type) qb.andWhere('t.type = :type', { type: filters.type });
    if (filters.search) {
      qb.andWhere('(t.code LIKE :s OR t.name LIKE :s)', { s: `%${filters.search}%` });
    }

    qb.orderBy('t.createdAt', 'DESC').skip(pagination.skip).take(pagination.limit);
    const [data, total] = await qb.getManyAndCount();
    return new PaginatedResult(data, total, pagination.page, pagination.limit);
  }

  async findOneTemplate(id: string): Promise<ContractTemplate> {
    const template = await this.templateRepo.findOne({
      where: { id },
      relations: ['fields'],
    });
    if (!template) throw new NotFoundException('Sözleşme şablonu bulunamadı');
    return template;
  }

  async activateTemplate(id: string, userId: string): Promise<ContractTemplate> {
    const template = await this.findOneTemplate(id);
    if (template.status === 'active') throw new BadRequestException('Şablon zaten aktif durumda');
    if (template.status === 'cancelled') throw new BadRequestException('İptal edilmiş şablon aktifleştirilemez');

    // Aynı koddaki mevcut aktif şablonu superseded yap
    const activeWithSameCode = await this.templateRepo.findOne({
      where: { code: template.code, status: 'active' },
    });
    if (activeWithSameCode && activeWithSameCode.id !== id) {
      activeWithSameCode.status = 'superseded';
      activeWithSameCode.supersededById = id;
      await this.templateRepo.save(activeWithSameCode);
    }

    template.status = 'active';
    const saved = await this.templateRepo.save(template);
    await this.auditService.log({
      userId, action: 'ACTIVATE', entityType: 'contract_template', entityId: id,
      newValues: { status: 'active' },
      description: `Sözleşme şablonu aktifleştirildi: ${template.code}`,
    });
    return saved;
  }

  // ─── Contract Create ────────────────────────────────────────────────────
  async create(data: Partial<ContractDocument>, userId: string): Promise<ContractDocument> {
    if (!data.customerId) throw new BadRequestException('Müşteri seçilmelidir');
    if (!data.startDate || !data.endDate) throw new BadRequestException('Başlangıç ve bitiş tarihi zorunludur');

    let template = null;
    if (data.templateId) {
      template = await this.templateRepo.findOne({ where: { id: data.templateId, status: 'active' } });
      if (!template) throw new BadRequestException('Seçilen şablon aktif değil veya bulunamadı');
    }

    const contractNumber = await this.generateContractNumber();
    const contract = this.contractRepo.create({
      ...data,
      contractNumber,
      templateRevision: template?.revision || null,
      templateId: template?.id || null,
      status: 'draft',
      createdById: userId,
      startDate: new Date(data.startDate as any),
      endDate: new Date(data.endDate as any),
    });

    const saved = await this.contractRepo.save(contract);
    await this.logStatusChange(saved.id, null, 'draft', userId, 'Sözleşme oluşturuldu');
    await this.auditService.log({
      userId, action: 'CREATE', entityType: 'contract_document', entityId: saved.id,
      newValues: { contractNumber, templateId: data.templateId, customerId: data.customerId },
      description: `Sözleşme oluşturuldu: ${contractNumber}`,
    });
    return saved;
  }

  // ─── Create from Proposal ──────────────────────────────────────────────
  async createFromProposal(proposalId: string, data: Partial<ContractDocument>, userId: string): Promise<ContractDocument> {
    // Teklif bilgilerini al
    const proposalRows = await this.dataSource.query(
      `SELECT q.*, c.id as cust_id, c.name as cust_name
       FROM proposals q
       LEFT JOIN customers c ON c.id = q.customerId
       WHERE q.id = ? AND q.status IN ('accepted', 'approved')`,
      [proposalId],
    );
    if (!proposalRows.length) throw new NotFoundException('Teklif bulunamadı veya uygun durumda değil');

    const proposal = proposalRows[0];

    // Aynı teklifle zaten oluşturulmuş aktif sözleşme kontrolü
    const existingContract = await this.contractRepo.findOne({
      where: { proposalId, status: 'active' },
    });
    if (existingContract) {
      throw new BadRequestException(
        `Bu teklif için zaten aktif bir sözleşme mevcut: ${existingContract.contractNumber}`,
      );
    }

    let template = null;
    if (data.templateId) {
      template = await this.templateRepo.findOne({ where: { id: data.templateId, status: 'active' } });
    }

    const contractNumber = await this.generateContractNumber();
    const contract = this.contractRepo.create({
      contractNumber,
      templateId: data.templateId || template?.id || null,
      templateRevision: template?.revision || null,
      proposalId,
      customerId: proposal.customerId || proposal.cust_id,
      status: 'draft',
      version: 1,
      startDate: data.startDate ? new Date(data.startDate as any) : new Date(),
      endDate: data.endDate ? new Date(data.endDate as any) : new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
      autoRenew: data.autoRenew ?? false,
      totalValue: data.totalValue ?? Number(proposal.totalAmount || 0),
      currency: data.currency ?? 'TRY',
      notes: data.notes || null,
      specialTerms: data.specialTerms || null,
      createdById: userId,
    });

    const saved = await this.contractRepo.save(contract);
    await this.logStatusChange(saved.id, null, 'draft', userId, `Tekliften oluşturuldu: ${proposalId}`);
    await this.auditService.log({
      userId, action: 'CREATE_FROM_PROPOSAL', entityType: 'contract_document', entityId: saved.id,
      newValues: { contractNumber, proposalId, customerId: contract.customerId },
      description: `Sözleşme tekliften oluşturuldu: ${contractNumber} (Teklif: ${proposalId})`,
    });
    return saved;
  }

  // ─── Find All ──────────────────────────────────────────────────────────
  async findAll(
    filters: { status?: string; customerId?: string; search?: string; templateId?: string },
    pagination: PaginationDto,
  ): Promise<PaginatedResult<ContractDocument>> {
    const qb = this.contractRepo.createQueryBuilder('c')
      .leftJoinAndSelect('c.template', 'template');

    if (filters.status) qb.andWhere('c.status = :status', { status: filters.status });
    if (filters.customerId) qb.andWhere('c.customerId = :cid', { cid: filters.customerId });
    if (filters.templateId) qb.andWhere('c.templateId = :tid', { tid: filters.templateId });
    if (filters.search) {
      qb.andWhere('(c.contractNumber LIKE :s OR c.notes LIKE :s)', { s: `%${filters.search}%` });
    }

    qb.orderBy('c.createdAt', 'DESC').skip(pagination.skip).take(pagination.limit);
    const [data, total] = await qb.getManyAndCount();
    return new PaginatedResult(data, total, pagination.page, pagination.limit);
  }

  // ─── Find One ──────────────────────────────────────────────────────────
  async findOne(id: string): Promise<ContractDocument> {
    const contract = await this.contractRepo.findOne({
      where: { id },
      relations: ['files', 'statusLogs', 'template'],
    });
    if (!contract) throw new NotFoundException('Sözleşme bulunamadı');
    return contract;
  }

  // ─── Update ────────────────────────────────────────────────────────────
  async update(id: string, data: Partial<ContractDocument>, userId: string): Promise<ContractDocument> {
    const contract = await this.findOne(id);
    if (contract.status !== 'draft') {
      throw new BadRequestException('Sadece taslak durumundaki sözleşmeler düzenlenebilir');
    }

    const oldValues = { ...contract };
    // Güvenli alanlar - status ve contractNumber değiştirilemesin
    delete (data as any).status;
    delete (data as any).contractNumber;
    delete (data as any).id;

    if (data.startDate) data.startDate = new Date(data.startDate as any) as any;
    if (data.endDate) data.endDate = new Date(data.endDate as any) as any;

    Object.assign(contract, data);
    const saved = await this.contractRepo.save(contract);
    await this.auditService.log({
      userId, action: 'UPDATE', entityType: 'contract_document', entityId: id,
      oldValues: { totalValue: oldValues.totalValue, notes: oldValues.notes },
      newValues: data,
      description: `Sözleşme güncellendi: ${contract.contractNumber}`,
    });
    return saved;
  }

  // ─── Generate PDF ──────────────────────────────────────────────────────
  async generatePdf(id: string): Promise<Buffer> {
    const contract = await this.contractRepo.findOne({
      where: { id },
      relations: ['template'],
    });
    if (!contract) throw new NotFoundException('Sözleşme bulunamadı');

    // Müşteri bilgilerini al
    const customerRows = await this.dataSource.query(
      'SELECT * FROM customers WHERE id = ?',
      [contract.customerId],
    );
    const customer = customerRows[0] || {};

    // Şablon alanlarını al
    const fields = await this.fieldRepo.find({
      where: { templateId: contract.templateId },
      order: { orderIndex: 'ASC' },
    });

    // Check if template has an uploaded PDF to overlay onto
    let templatePdfBuffer: Buffer | null = null;
    if (contract.template?.outputTemplateUrl) {
      try {
        // Try to load template PDF from storage
        templatePdfBuffer = await this.storageService.getFileByUrl(
          contract.template.outputTemplateUrl,
        );
      } catch (err) {
        console.error('Template PDF yüklenemedi, programatik PDF oluşturulacak:', err?.message);
      }
    }

    let pdfBuffer: Buffer;
    let pdfHash: string;

    if (templatePdfBuffer && fields.length > 0) {
      // OVERLAY MODE: Render data onto the uploaded template PDF
      const formatDate = (d: any) => {
        if (!d) return '-';
        return new Date(d).toLocaleDateString('tr-TR');
      };

      const values: Record<string, any> = {
        contractNumber: contract.contractNumber,
        templateRevision: contract.templateRevision,
        date: new Date().toLocaleDateString('tr-TR'),
        status: contract.status.toUpperCase(),
        customerName: customer.name || customer.companyName || '',
        customerAddress: customer.address || '',
        customerTaxNumber: customer.taxNumber || '',
        customerContactName: customer.contactName || '',
        customerPhone: customer.contactPhone || customer.phone || '',
        startDate: formatDate(contract.startDate),
        endDate: formatDate(contract.endDate),
        autoRenew: contract.autoRenew ? 'Evet' : 'Hayir',
        totalValue: contract.totalValue,
        currency: contract.currency,
        version: String(contract.version),
        notes: contract.notes,
        specialTerms: contract.specialTerms,
      };

      const result = await this.documentRenderService.renderWithTemplate(
        templatePdfBuffer, fields, values,
      );
      pdfBuffer = result.buffer;
      pdfHash = result.hash;
    } else {
      // PROGRAMMATIC FALLBACK: Generate PDF from scratch using shared service
      const templateName = contract.template?.name || 'HIZMET SOZLESMESI';
      const formatDate = (d: any) => {
        if (!d) return '-';
        return new Date(d).toLocaleDateString('tr-TR');
      };

      const result = await this.documentRenderService.renderProgrammatic({
        title: templateName.toUpperCase(),
        documentNumber: contract.contractNumber,
        date: new Date().toLocaleDateString('tr-TR'),
        customer: {
          name: customer.name || customer.companyName || '',
          address: customer.address,
          taxNumber: customer.taxNumber,
          contactName: customer.contactName,
          phone: customer.contactPhone || customer.phone,
          email: customer.contactEmail || customer.email,
        },
        totals: {
          subtotal: Number(contract.totalValue),
          grandTotal: Number(contract.totalValue),
          currency: contract.currency || 'TL',
        },
        notes: [
          contract.notes,
          contract.specialTerms ? `Ozel Sartlar: ${contract.specialTerms}` : null,
          `Baslangic: ${formatDate(contract.startDate)} | Bitis: ${formatDate(contract.endDate)}`,
          `Otomatik Yenileme: ${contract.autoRenew ? 'Evet' : 'Hayir'} | Versiyon: ${contract.version}`,
        ].filter(Boolean).join('\n'),
        footer: `${contract.contractNumber} | Rev: ${contract.templateRevision}`,
        signatureZones: [
          { label: 'HIZMET SAGLAYICI', x: 50, y: 120 },
          { label: 'MUSTERI', x: 350, y: 120 },
        ],
      });
      pdfBuffer = result.buffer;
      pdfHash = result.hash;
    }

    // PDF'i MinIO'ya kaydet
    try {
      const uploadResult = await this.storageService.uploadFile(
        StorageBucket.DOCUMENTS,
        pdfBuffer,
        `${contract.contractNumber}.pdf`,
        'application/pdf',
        'contracts',
      );

      // Sözleşme üzerindeki PDF bilgilerini güncelle
      contract.pdfUrl = uploadResult.url;
      contract.pdfHash = uploadResult.hash || pdfHash;
      if (contract.status === 'draft') {
        contract.status = 'generated';
        await this.logStatusChange(contract.id, 'draft', 'generated', contract.createdById, 'PDF oluşturuldu');
      }
      await this.contractRepo.save(contract);

      // Dosya kaydını oluştur
      const fileRecord = this.fileRepo.create({
        contractId: contract.id,
        fileType: 'draft_pdf',
        fileName: `${contract.contractNumber}.pdf`,
        fileUrl: uploadResult.url,
        fileHash: uploadResult.hash || pdfHash,
        fileSize: pdfBuffer.length,
        version: contract.version,
        uploadedById: contract.createdById,
        notes: 'Otomatik oluşturulan PDF',
      });
      await this.fileRepo.save(fileRecord);
    } catch (err) {
      // Storage hatası PDF üretimini engellemesin
      console.error('PDF storage hatası:', err?.message);
    }

    return pdfBuffer;
  }

  // ─── Mark Sent ──────────────────────────────────────────────────────────
  async markSent(id: string, userId: string): Promise<ContractDocument> {
    const contract = await this.findOne(id);
    if (!['draft', 'generated'].includes(contract.status)) {
      throw new BadRequestException('Sadece taslak veya oluşturulmuş sözleşmeler gönderilebilir');
    }

    const fromStatus = contract.status;
    contract.status = 'sent';
    const saved = await this.contractRepo.save(contract);
    await this.logStatusChange(id, fromStatus, 'sent', userId, 'Sözleşme müşteriye gönderildi');
    await this.auditService.log({
      userId, action: 'SEND', entityType: 'contract_document', entityId: id,
      newValues: { status: 'sent' },
      description: `Sözleşme gönderildi: ${contract.contractNumber}`,
    });
    return saved;
  }

  async getDocumentBuffer(url: string): Promise<Buffer> {
    return this.storageService.getFileByUrl(url);
  }

  // ─── Upload Contract Document (Word/PDF) ────────────────────────────────
  async uploadDocument(id: string, file: Express.Multer.File, userId: string) {
    const contract = await this.findOne(id);
    const ext = file.originalname.toLowerCase().split('.').pop();
    const mimeTypes: Record<string, string> = {
      pdf: 'application/pdf',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      doc: 'application/msword',
    };
    const mimeType = mimeTypes[ext || ''] || 'application/octet-stream';

    let fileUrl = `local://contracts/${contract.contractNumber}.${ext}`;
    try {
      const result = await this.storageService.uploadFile(
        StorageBucket.DOCUMENTS, file.buffer, file.originalname, mimeType, `contracts/${id}`,
      );
      fileUrl = result.url;
    } catch {
      const fs = require('fs');
      const path = require('path');
      const dir = path.resolve(process.cwd(), 'storage', 'contracts');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${contract.contractNumber}.${ext}`), file.buffer);
    }

    contract.pdfUrl = fileUrl;
    const saved = await this.contractRepo.save(contract);

    await this.auditService.log({
      userId, action: 'CONTRACT_DOCUMENT_UPLOADED', entityType: 'Contract', entityId: id,
      newValues: { fileName: file.originalname, mimeType, size: file.size },
    });

    // Dosya kaydi
    const fileRecord = this.fileRepo.create({
      contractId: id, fileType: 'contract_document',
      fileUrl, fileName: file.originalname,
      fileHash: require('crypto').createHash('sha256').update(file.buffer).digest('hex'),
      uploadedById: userId,
    });
    await this.fileRepo.save(fileRecord);

    return saved;
  }

  // ─── Upload Signed Document ─────────────────────────────────────────────
  async uploadSignedDocument(
    id: string,
    file: Express.Multer.File,
    userId: string,
  ): Promise<ContractFile> {
    const contract = await this.findOne(id);
    if (!['sent', 'customer_review', 'generated'].includes(contract.status)) {
      throw new BadRequestException('Bu durumdaki sözleşmeye imzalı belge yüklenemez. Sözleşme önce gönderilmiş olmalıdır.');
    }

    if (!file || !file.buffer) throw new BadRequestException('Dosya yüklenemedi. Lütfen PDF formatında bir dosya seçin.');

    const fileHash = crypto.createHash('sha256').update(file.buffer).digest('hex');

    // MinIO'ya yükle
    let fileUrl = '';
    try {
      const uploadResult = await this.storageService.uploadFile(
        StorageBucket.DOCUMENTS,
        file.buffer,
        file.originalname || `${contract.contractNumber}-signed.pdf`,
        file.mimetype || 'application/pdf',
        'contracts/signed',
      );
      fileUrl = uploadResult.url;
    } catch (err) {
      throw new BadRequestException(`Dosya yüklenemedi. Lütfen PDF formatında bir dosya seçin. Detay: ${err?.message}`);
    }

    // Dosya kaydı
    const fileRecord = this.fileRepo.create({
      contractId: id,
      fileType: 'signed_pdf',
      fileName: file.originalname || `${contract.contractNumber}-signed.pdf`,
      fileUrl,
      fileHash,
      fileSize: file.size || file.buffer.length,
      version: contract.version,
      uploadedById: userId,
    });
    const savedFile = await this.fileRepo.save(fileRecord);

    // Sözleşme güncelle
    contract.signedPdfUrl = fileUrl;
    contract.signedPdfHash = fileHash;
    await this.contractRepo.save(contract);

    await this.auditService.log({
      userId, action: 'UPLOAD_SIGNED', entityType: 'contract_document', entityId: id,
      newValues: { signedPdfUrl: fileUrl, signedPdfHash: fileHash },
      description: `İmzalı sözleşme yüklendi: ${contract.contractNumber}`,
    });
    return savedFile;
  }

  // ─── Mark Signed ────────────────────────────────────────────────────────
  async markSigned(id: string, userId: string): Promise<ContractDocument> {
    const contract = await this.findOne(id);
    if (!contract.signedPdfUrl) {
      throw new BadRequestException('İmzalamak için önce imzalı PDF\'i yüklemelisiniz.');
    }

    const fromStatus = contract.status;
    contract.status = 'signed';
    contract.signedAt = new Date();
    contract.signedById = userId;
    const saved = await this.contractRepo.save(contract);
    await this.logStatusChange(id, fromStatus, 'signed', userId, 'Sözleşme imzalandı');
    await this.auditService.log({
      userId, action: 'SIGN', entityType: 'contract_document', entityId: id,
      newValues: { status: 'signed', signedAt: contract.signedAt },
      description: `Sözleşme imzalandı: ${contract.contractNumber}`,
    });
    return saved;
  }

  // ─── Activate ──────────────────────────────────────────────────────────
  async activate(id: string, userId: string): Promise<ContractDocument> {
    const contract = await this.findOne(id);
    if (contract.status !== 'signed') {
      throw new BadRequestException('Sözleşme aktif edilemez. Önce imzalanmalıdır.');
    }

    const fromStatus = contract.status;
    contract.status = 'active';
    const saved = await this.contractRepo.save(contract);
    await this.logStatusChange(id, fromStatus, 'active', userId, 'Sözleşme aktifleştirildi');
    await this.auditService.log({
      userId, action: 'ACTIVATE', entityType: 'contract_document', entityId: id,
      newValues: { status: 'active' },
      description: `Sözleşme aktifleştirildi: ${contract.contractNumber}`,
    });
    return saved;
  }

  // ─── Get Files ──────────────────────────────────────────────────────────
  async getFiles(contractId: string): Promise<ContractFile[]> {
    const contract = await this.contractRepo.findOne({ where: { id: contractId } });
    if (!contract) throw new NotFoundException('Sözleşme bulunamadı');

    return this.fileRepo.find({
      where: { contractId },
      order: { createdAt: 'DESC' },
    });
  }

  // ─── Get Status Log ────────────────────────────────────────────────────
  async getStatusLog(contractId: string): Promise<ContractStatusLog[]> {
    const contract = await this.contractRepo.findOne({ where: { id: contractId } });
    if (!contract) throw new NotFoundException('Sözleşme bulunamadı');

    return this.statusLogRepo.find({
      where: { contractId },
      order: { createdAt: 'ASC' },
    });
  }

  // ─── Log Status Change ─────────────────────────────────────────────────
  async logStatusChange(
    contractId: string,
    from: string | null,
    to: string,
    userId: string,
    reason?: string,
  ): Promise<ContractStatusLog> {
    const log = this.statusLogRepo.create({
      contractId,
      fromStatus: from || '',
      toStatus: to,
      userId,
      reason: reason || null,
    });
    return this.statusLogRepo.save(log);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTROLLER: ContractEngineController
// ═══════════════════════════════════════════════════════════════════════════════
@ApiTags('contract-engine')
@ApiBearerAuth('JWT')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('contract-engine')
export class ContractEngineController {
  constructor(private readonly service: ContractEngineService) {}

  // ── Template Endpoints ──────────────────────────────────────────────────
  @Post('templates')
  @Roles(UserRole.ADMIN, UserRole.TECHNICAL_MANAGER)
  createTemplate(@Body() body: any, @CurrentUser('id') uid: string) {
    return this.service.createTemplate(body, uid);
  }

  @Get('templates')
  @Roles(UserRole.ADMIN, UserRole.TECHNICAL_MANAGER, UserRole.SALES, UserRole.EXECUTIVE)
  findAllTemplates(
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('search') search?: string,
    @Query() pagination?: PaginationDto,
  ) {
    return this.service.findAllTemplates({ status, type, search }, pagination);
  }

  @Get('templates/:id')
  @Roles(UserRole.ADMIN, UserRole.TECHNICAL_MANAGER, UserRole.SALES, UserRole.EXECUTIVE)
  findOneTemplate(@Param('id') id: string) {
    return this.service.findOneTemplate(id);
  }

  @Patch('templates/:id/activate')
  @Roles(UserRole.ADMIN, UserRole.TECHNICAL_MANAGER)
  activateTemplate(@Param('id') id: string, @CurrentUser('id') uid: string) {
    return this.service.activateTemplate(id, uid);
  }

  // ── Contract Endpoints ──────────────────────────────────────────────────
  @Post()
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.TECHNICAL_MANAGER)
  create(@Body() body: any, @CurrentUser('id') uid: string) {
    return this.service.create(body, uid);
  }

  @Post('from-proposal/:proposalId')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.TECHNICAL_MANAGER)
  createFromProposal(
    @Param('proposalId') proposalId: string,
    @Body() body: any,
    @CurrentUser('id') uid: string,
  ) {
    return this.service.createFromProposal(proposalId, body, uid);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.TECHNICAL_MANAGER, UserRole.FINANCE, UserRole.EXECUTIVE)
  findAll(
    @Query('status') status?: string,
    @Query('customerId') customerId?: string,
    @Query('templateId') templateId?: string,
    @Query('search') search?: string,
    @Query() pagination?: PaginationDto,
  ) {
    return this.service.findAll({ status, customerId, templateId, search }, pagination);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.TECHNICAL_MANAGER, UserRole.FINANCE, UserRole.EXECUTIVE)
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Put(':id')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.TECHNICAL_MANAGER)
  update(@Param('id') id: string, @Body() body: any, @CurrentUser('id') uid: string) {
    return this.service.update(id, body, uid);
  }

  @Get(':id/pdf')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.TECHNICAL_MANAGER, UserRole.FINANCE, UserRole.EXECUTIVE)
  async downloadPdf(@Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    const pdfBuffer = await this.service.generatePdf(id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="sozlesme-${id}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    return new StreamableFile(pdfBuffer);
  }

  @Get(':id/document')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.TECHNICAL_MANAGER, UserRole.FINANCE, UserRole.EXECUTIVE, UserRole.CUSTOMER_REP)
  @ApiOperation({ summary: 'Yuklenen sozlesme belgesini indir' })
  async downloadDocument(@Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    const contract = await this.service.findOne(id);
    if (!contract.pdfUrl) throw new NotFoundException('Belge yuklenmemis');
    const buffer = await this.service.getDocumentBuffer(contract.pdfUrl);
    const ext = contract.pdfUrl.split('.').pop() || 'pdf';
    const mime = ext === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : ext === 'doc' ? 'application/msword' : 'application/pdf';
    res.set({
      'Content-Type': mime,
      'Content-Disposition': `inline; filename="sozlesme-${contract.contractNumber}.${ext}"`,
      'Content-Length': buffer.length,
    });
    return new StreamableFile(buffer);
  }

  @Patch(':id/send')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.TECHNICAL_MANAGER)
  markSent(@Param('id') id: string, @CurrentUser('id') uid: string) {
    return this.service.markSent(id, uid);
  }

  @Post(':id/upload')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.TECHNICAL_MANAGER, UserRole.CUSTOMER_REP)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Sozlesme belgesi yukle (Word/PDF)' })
  uploadDocument(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('id') uid: string,
  ) {
    return this.service.uploadDocument(id, file, uid);
  }

  @Post(':id/upload-signed')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.TECHNICAL_MANAGER)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  uploadSigned(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('id') uid: string,
  ) {
    return this.service.uploadSignedDocument(id, file, uid);
  }

  @Patch(':id/sign')
  @Roles(UserRole.ADMIN, UserRole.TECHNICAL_MANAGER)
  markSigned(@Param('id') id: string, @CurrentUser('id') uid: string) {
    return this.service.markSigned(id, uid);
  }

  @Patch(':id/activate')
  @Roles(UserRole.ADMIN, UserRole.TECHNICAL_MANAGER)
  activate(@Param('id') id: string, @CurrentUser('id') uid: string) {
    return this.service.activate(id, uid);
  }

  @Get(':id/files')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.TECHNICAL_MANAGER, UserRole.FINANCE, UserRole.EXECUTIVE)
  getFiles(@Param('id') id: string) {
    return this.service.getFiles(id);
  }

  @Get(':id/status-log')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.TECHNICAL_MANAGER, UserRole.FINANCE, UserRole.EXECUTIVE)
  getStatusLog(@Param('id') id: string) {
    return this.service.getStatusLog(id);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE: ContractEngineModule
// ═══════════════════════════════════════════════════════════════════════════════
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ContractTemplate,
      ContractTemplateField,
      ContractDocument,
      ContractFile,
      ContractStatusLog,
    ]),
    AuditModule,
    StorageModule,
  ],
  providers: [ContractEngineService],
  controllers: [ContractEngineController],
  exports: [ContractEngineService],
})
export class ContractEngineModule {}

import { Entity, Column, ManyToOne, OneToMany, JoinColumn, Index, CreateDateColumn, UpdateDateColumn, Repository, DataSource } from 'typeorm';
import { AbstractEntity } from '@/common/entities/abstract.entity';
import {
  Injectable, NotFoundException, BadRequestException, ConflictException,
  Controller, Get, Post, Put, Patch, Delete,
  Body, Param, Query, UseGuards, Module, Res, Req, StreamableFile,
} from '@nestjs/common';
import { verifyTenantAccess } from '@/common/guards/tenant-verify.helper';
import * as crypto from 'crypto';
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
import { DocumentRenderService } from '@/modules/shared/document-render.service';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { Response } from 'express';

// ─── Entity: ProposalTemplate ───────────────────────────────────────────────────
@Entity('proposal_templates')
@Index(['type', 'status'])
export class ProposalTemplate extends AbstractEntity {
  @Column({ type: 'varchar', length: 50, unique: true })
  code: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 50 })
  type: string; // asansor, basinc, karma, elektrik, yangin

  @Column({ type: 'varchar', length: 20, default: 'Rev.01' })
  revision: string;

  @Column({ type: 'date' })
  revisionDate: Date;

  @Column({ type: 'varchar', length: 20, default: 'draft' })
  status: string; // draft | active | superseded | cancelled

  @Column({ type: 'varchar', length: 36, nullable: true })
  supersededById: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  outputTemplateUrl: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  outputTemplateObjectName: string;

  @Column({ type: 'json', nullable: true })
  layoutConfig: Record<string, any>;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'varchar', length: 36 })
  createdById: string;

  @OneToMany(() => ProposalTemplateField, (f) => f.template, { cascade: true })
  fields: ProposalTemplateField[];
}

// ─── Entity: ProposalTemplateField ──────────────────────────────────────────────
@Entity('proposal_template_fields')
@Index(['templateId', 'orderIndex'])
export class ProposalTemplateField extends AbstractEntity {
  @Column({ type: 'varchar', length: 36 })
  templateId: string;

  @ManyToOne(() => ProposalTemplate, (t) => t.fields, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'templateId' })
  template: ProposalTemplate;

  @Column({ type: 'varchar', length: 100 })
  fieldKey: string;

  @Column({ type: 'varchar', length: 255 })
  label: string;

  @Column({ type: 'varchar', length: 50 })
  fieldType: string; // text, number, date, table, currency, select, conditional, image, signature

  @Column({ type: 'varchar', length: 100, nullable: true })
  section: string;

  @Column({ type: 'int', default: 0 })
  orderIndex: number;

  @Column({ type: 'tinyint', default: 0, transformer: { to: (v: boolean) => (v ? 1 : 0), from: (v: number) => !!v } })
  isRequired: boolean;

  @Column({ type: 'json', nullable: true })
  pdfCoordinate: { page: number; x: number; y: number; width: number; height: number; fontSize: number };

  @Column({ type: 'json', nullable: true })
  options: any;

  @Column({ type: 'tinyint', default: 0, transformer: { to: (v: boolean) => (v ? 1 : 0), from: (v: number) => !!v } })
  isConditional: boolean;

  @Column({ type: 'json', nullable: true })
  conditionRule: Record<string, any>;

  @Column({ type: 'varchar', length: 500, nullable: true })
  defaultValue: string;

  @Column({ type: 'tinyint', default: 0, transformer: { to: (v: boolean) => (v ? 1 : 0), from: (v: number) => !!v } })
  isRepeatable: boolean;

  @Column({ type: 'json', nullable: true })
  tableColumns: Array<{ key: string; label: string; type: string; width?: number }>;
}

// ─── Entity: Proposal ───────────────────────────────────────────────────────────
@Entity('proposals')
@Index(['customerId', 'status'])
@Index(['templateId'])
@Index(['status', 'validUntil'])
export class Proposal extends AbstractEntity {
  @Column({ type: 'varchar', length: 50, unique: true })
  proposalNumber: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  templateId: string;

  @ManyToOne(() => ProposalTemplate, { nullable: true })
  @JoinColumn({ name: 'templateId' })
  template: ProposalTemplate;

  @Column({ type: 'varchar', length: 20, nullable: true })
  templateRevision: string;

  @Column({ type: 'varchar', length: 36 })
  customerId: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  locationId: string;

  @Column({ type: 'varchar', length: 30, default: 'draft' })
  status: string; // draft | sent | revision_requested | accepted | rejected | expired

  @Column({ type: 'int', default: 1 })
  revision: number;

  @Column({ type: 'varchar', length: 36, nullable: true })
  parentProposalId: string;

  @ManyToOne(() => Proposal, { nullable: true })
  @JoinColumn({ name: 'parentProposalId' })
  parentProposal: Proposal;

  @Column({ type: 'date' })
  validUntil: Date;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalAmount: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  discountRate: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  discountAmount: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  finalAmount: number;

  @Column({ type: 'varchar', length: 10, default: 'TRY' })
  currency: string;

  @Column({ type: 'tinyint', default: 0, transformer: { to: (v: boolean) => (v ? 1 : 0), from: (v: number) => !!v } })
  kdvIncluded: boolean;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 20 })
  kdvRate: number;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  pdfUrl: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  pdfHash: string;

  @Column({ type: 'datetime', nullable: true })
  sentAt: Date;

  @Column({ type: 'varchar', length: 36, nullable: true })
  sentById: string;

  @Column({ type: 'datetime', nullable: true })
  acceptedAt: Date;

  @Column({ type: 'datetime', nullable: true })
  rejectedAt: Date;

  @Column({ type: 'text', nullable: true })
  rejectionReason: string;

  @Column({ type: 'varchar', length: 36 })
  createdById: string;

  @OneToMany(() => ProposalItem, (i) => i.proposal, { cascade: true })
  items: ProposalItem[];
}

// ─── Entity: ProposalItem ───────────────────────────────────────────────────────
@Entity('proposal_items')
@Index(['proposalId', 'orderIndex'])
export class ProposalItem extends AbstractEntity {
  @Column({ type: 'varchar', length: 36 })
  proposalId: string;

  @ManyToOne(() => Proposal, (p) => p.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'proposalId' })
  proposal: Proposal;

  @Column({ type: 'varchar', length: 36, nullable: true })
  equipmentTypeId: string;

  @Column({ type: 'varchar', length: 500 })
  description: string;

  @Column({ type: 'int', default: 1 })
  quantity: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  unitPrice: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  discountRate: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  totalPrice: number;

  @Column({ type: 'varchar', length: 50, nullable: true })
  serviceCode: string;

  @Column({ type: 'int', default: 0 })
  orderIndex: number;
}

// ─── Entity: ProposalStatusLog ──────────────────────────────────────────────────
@Entity('proposal_status_logs')
@Index(['proposalId', 'createdAt'])
export class ProposalStatusLog {
  @Column({ type: 'varchar', length: 36, primary: true, generated: 'uuid' })
  id: string;

  @Column({ type: 'varchar', length: 36 })
  proposalId: string;

  @ManyToOne(() => Proposal, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'proposalId' })
  proposal: Proposal;

  @Column({ type: 'varchar', length: 30 })
  fromStatus: string;

  @Column({ type: 'varchar', length: 30 })
  toStatus: string;

  @Column({ type: 'varchar', length: 36 })
  userId: string;

  @Column({ type: 'text', nullable: true })
  reason: string;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;
}

// ─── Entity: ProposalSendLog ─────────────────────────────────────────────────
@Entity('proposal_send_logs')
export class ProposalSendLog extends AbstractEntity {
  @Column({ type: 'varchar', length: 36 })
  proposalId: string;

  @ManyToOne(() => Proposal, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'proposalId' })
  proposal: Proposal;

  @Column({ type: 'varchar', length: 30 })
  sentVia: string; // email, whatsapp, hand_delivery, portal

  @Column({ type: 'varchar', length: 255, nullable: true })
  sentToEmail: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  sentToPhone: string;

  @Column({ type: 'varchar', length: 36 })
  sentById: string;

  @CreateDateColumn({ type: 'datetime' })
  sentAt: Date;

  @Column({ type: 'datetime', nullable: true })
  viewedAt: Date;

  @Column({ type: 'varchar', length: 64, nullable: true, unique: true })
  viewToken: string;

  @Column({ type: 'text', nullable: true })
  notes: string;
}

// ─── Valid Status Transitions ───────────────────────────────────────────────────
const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ['sent', 'cancelled'],
  sent: ['accepted', 'rejected', 'revision_requested', 'expired'],
  revision_requested: ['draft'],
  accepted: [],
  rejected: [],
  expired: ['draft'],
  cancelled: [],
};

// ─── Service: ProposalsService ──────────────────────────────────────────────────
@Injectable()
export class ProposalsService {
  constructor(
    @InjectRepository(Proposal) private proposalRepo: Repository<Proposal>,
    @InjectRepository(ProposalItem) private itemRepo: Repository<ProposalItem>,
    @InjectRepository(ProposalStatusLog) private statusLogRepo: Repository<ProposalStatusLog>,
    @InjectRepository(ProposalTemplate) private templateRepo: Repository<ProposalTemplate>,
    @InjectRepository(ProposalTemplateField) private templateFieldRepo: Repository<ProposalTemplateField>,
    @InjectRepository(ProposalSendLog) private sendLogRepo: Repository<ProposalSendLog>,
    private dataSource: DataSource,
    private auditService: AuditService,
    private documentRenderService: DocumentRenderService,
  ) {}

  // ── Proposal Number Generation ──────────────────────────────────────────────
  async generateProposalNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `TKL-${year}-`;

    const lastProposal = await this.proposalRepo
      .createQueryBuilder('p')
      .where('p.proposalNumber LIKE :prefix', { prefix: `${prefix}%` })
      .orderBy('p.proposalNumber', 'DESC')
      .getOne();

    let nextNumber = 1;
    if (lastProposal) {
      const lastNumStr = lastProposal.proposalNumber.replace(prefix, '');
      nextNumber = parseInt(lastNumStr, 10) + 1;
    }

    return `${prefix}${String(nextNumber).padStart(5, '0')}`;
  }

  // ── Create Proposal ────────────────────────────────────────────────────────
  async create(data: Partial<Proposal> & { items?: Partial<ProposalItem>[] }, userId: string): Promise<Proposal> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Validate customer
      if (!data.customerId) {
        throw new BadRequestException('Müşteri seçimi zorunludur');
      }

      // Validate template
      if (data.templateId) {
        const template = await this.templateRepo.findOne({ where: { id: data.templateId } });
        if (!template) {
          throw new NotFoundException('Teklif şablonu bulunamadı');
        }
        if (template.status !== 'active' && template.status !== 'draft') {
          throw new BadRequestException('Seçilen şablon aktif değil');
        }
        data.templateRevision = data.templateRevision || template.revision;
      }

      // Generate proposal number
      const proposalNumber = await this.generateProposalNumber();

      // Set defaults
      if (!data.validUntil) {
        const validDate = new Date();
        validDate.setDate(validDate.getDate() + 30);
        data.validUntil = validDate;
      }

      const items = data.items || [];
      delete data.items;

      const proposal = queryRunner.manager.create(Proposal, {
        ...data,
        proposalNumber,
        status: 'draft',
        revision: 1,
        createdById: userId,
      });

      const savedProposal = await queryRunner.manager.save(Proposal, proposal);

      // Save items
      if (items.length > 0) {
        const proposalItems = items.map((item, index) => {
          const unitPrice = Number(item.unitPrice) || 0;
          const quantity = Number(item.quantity) || 1;
          const discountRate = Number(item.discountRate) || 0;
          const discountedUnit = unitPrice * (1 - discountRate / 100);
          const totalPrice = discountedUnit * quantity;

          return queryRunner.manager.create(ProposalItem, {
            ...item,
            proposalId: savedProposal.id,
            unitPrice,
            quantity,
            discountRate,
            totalPrice,
            orderIndex: item.orderIndex ?? index,
          });
        });
        await queryRunner.manager.save(ProposalItem, proposalItems);
      }

      // Recalculate totals
      await this.recalculateTotalsWithManager(queryRunner.manager, savedProposal.id);

      // Log status
      await queryRunner.manager.save(ProposalStatusLog, {
        proposalId: savedProposal.id,
        fromStatus: '',
        toStatus: 'draft',
        userId,
      });

      await queryRunner.commitTransaction();

      await this.auditService.log({
        userId,
        action: 'CREATE',
        entityType: 'proposal',
        entityId: savedProposal.id,
        newValues: { proposalNumber, customerId: data.customerId, templateId: data.templateId },
        description: `Teklif oluşturuldu: ${proposalNumber}`,
      });

      return this.findOne(savedProposal.id);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // ── Find All Proposals ──────────────────────────────────────────────────────
  async findAll(
    filters: { status?: string; customerId?: string; search?: string; templateId?: string; createdById?: string; companyId?: string },
    pagination: PaginationDto,
  ): Promise<PaginatedResult<Proposal>> {
    const qb = this.proposalRepo.createQueryBuilder('p')
      .leftJoinAndSelect('p.items', 'items')
      .leftJoinAndSelect('p.template', 'template');

    // Tenant isolation
    if (filters.companyId) {
      qb.innerJoin('customers', 'cust', 'cust.id = p.customerId')
        .andWhere('cust.companyId = :companyId', { companyId: filters.companyId });
    }

    if (filters.status) {
      qb.andWhere('p.status = :status', { status: filters.status });
    }
    if (filters.customerId) {
      qb.andWhere('p.customerId = :customerId', { customerId: filters.customerId });
    }
    if (filters.templateId) {
      qb.andWhere('p.templateId = :templateId', { templateId: filters.templateId });
    }
    if (filters.createdById) {
      qb.andWhere('p.createdById = :createdById', { createdById: filters.createdById });
    }
    if (filters.search) {
      qb.andWhere('(p.proposalNumber LIKE :s OR p.notes LIKE :s)', { s: `%${filters.search}%` });
    }

    const sortBy = pagination.sortBy || 'p.createdAt';
    const sortField = sortBy.includes('.') ? sortBy : `p.${sortBy}`;
    qb.orderBy(sortField, pagination.sortOrder || 'DESC')
      .skip(pagination.skip)
      .take(pagination.limit);

    const [data, total] = await qb.getManyAndCount();
    return new PaginatedResult(data, total, pagination.page, pagination.limit);
  }

  // ── Find One Proposal ───────────────────────────────────────────────────────
  async findOne(id: string): Promise<Proposal> {
    const proposal = await this.proposalRepo.findOne({
      where: { id },
      relations: ['items', 'template', 'parentProposal'],
    });
    if (!proposal) {
      throw new NotFoundException('Teklif bulunamadı');
    }
    return proposal;
  }

  // ── Update Proposal ─────────────────────────────────────────────────────────
  async update(id: string, data: Partial<Proposal>, userId: string): Promise<Proposal> {
    const proposal = await this.findOne(id);

    if (proposal.status !== 'draft') {
      throw new BadRequestException('Yalnızca taslak durumundaki teklifler güncellenebilir');
    }

    const oldValues = { ...proposal };
    // Remove relations from update data
    delete data.items;
    delete (data as any).template;
    delete (data as any).parentProposal;

    // Use transaction to ensure save + recalculate are atomic
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      Object.assign(proposal, data);
      await queryRunner.manager.save(proposal);

      // If discount changed, recalculate within same transaction
      if (data.discountRate !== undefined || data.kdvRate !== undefined || data.kdvIncluded !== undefined) {
        await this.recalculateTotalsWithManager(queryRunner.manager, id);
      }

      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }

    const saved = await this.findOne(id);

    await this.auditService.log({
      userId,
      action: 'UPDATE',
      entityType: 'proposal',
      entityId: id,
      oldValues: { status: oldValues.status, totalAmount: oldValues.totalAmount },
      newValues: data,
      description: `Teklif güncellendi: ${proposal.proposalNumber}`,
    });

    return this.findOne(id);
  }

  // ── Add Item ────────────────────────────────────────────────────────────────
  async addItem(proposalId: string, itemData: Partial<ProposalItem>): Promise<ProposalItem> {
    const proposal = await this.findOne(proposalId);

    if (proposal.status !== 'draft') {
      throw new BadRequestException('Yalnızca taslak durumundaki tekliflere kalem eklenebilir');
    }

    const unitPrice = Number(itemData.unitPrice) || 0;
    const quantity = Number(itemData.quantity) || 1;
    const discountRate = Number(itemData.discountRate) || 0;
    const discountedUnit = unitPrice * (1 - discountRate / 100);
    const totalPrice = discountedUnit * quantity;

    // Determine order index
    const maxOrder = await this.itemRepo
      .createQueryBuilder('i')
      .select('MAX(i.orderIndex)', 'maxIdx')
      .where('i.proposalId = :pid', { pid: proposalId })
      .getRawOne();

    const orderIndex = itemData.orderIndex ?? ((maxOrder?.maxIdx ?? -1) + 1);

    const item = this.itemRepo.create({
      ...itemData,
      proposalId,
      unitPrice,
      quantity,
      discountRate,
      totalPrice,
      orderIndex,
    });

    const saved = await this.itemRepo.save(item);
    await this.recalculateTotals(proposalId);

    return saved;
  }

  // ── Remove Item ─────────────────────────────────────────────────────────────
  async removeItem(proposalId: string, itemId: string): Promise<void> {
    const proposal = await this.findOne(proposalId);

    if (proposal.status !== 'draft') {
      throw new BadRequestException('Yalnızca taslak durumundaki tekliflerden kalem silinebilir');
    }

    const item = await this.itemRepo.findOne({ where: { id: itemId, proposalId } });
    if (!item) {
      throw new NotFoundException('Teklif kalemi bulunamadı');
    }

    await this.itemRepo.remove(item);
    await this.recalculateTotals(proposalId);
  }

  // ── Recalculate Totals ──────────────────────────────────────────────────────
  async recalculateTotals(proposalId: string): Promise<Proposal> {
    const proposal = await this.proposalRepo.findOne({ where: { id: proposalId } });
    if (!proposal) throw new NotFoundException('Teklif bulunamadı');

    const items = await this.itemRepo.find({ where: { proposalId } });

    const totalAmount = items.reduce((sum, item) => sum + Number(item.totalPrice), 0);
    const discountRate = Number(proposal.discountRate) || 0;
    const discountAmount = totalAmount * (discountRate / 100);
    const subtotal = totalAmount - discountAmount;

    let finalAmount = subtotal;
    if (!proposal.kdvIncluded) {
      const kdvRate = Number(proposal.kdvRate) || 20;
      finalAmount = subtotal * (1 + kdvRate / 100);
    }

    proposal.totalAmount = Math.round(totalAmount * 100) / 100;
    proposal.discountAmount = Math.round(discountAmount * 100) / 100;
    proposal.finalAmount = Math.round(finalAmount * 100) / 100;

    return this.proposalRepo.save(proposal);
  }

  private async recalculateTotalsWithManager(manager: any, proposalId: string): Promise<void> {
    const proposal = await manager.findOne(Proposal, { where: { id: proposalId } });
    if (!proposal) return;

    const items = await manager.find(ProposalItem, { where: { proposalId } });

    const totalAmount = items.reduce((sum: number, item: ProposalItem) => sum + Number(item.totalPrice), 0);
    const discountRate = Number(proposal.discountRate) || 0;
    const discountAmount = totalAmount * (discountRate / 100);
    const subtotal = totalAmount - discountAmount;

    let finalAmount = subtotal;
    if (!proposal.kdvIncluded) {
      const kdvRate = Number(proposal.kdvRate) || 20;
      finalAmount = subtotal * (1 + kdvRate / 100);
    }

    proposal.totalAmount = Math.round(totalAmount * 100) / 100;
    proposal.discountAmount = Math.round(discountAmount * 100) / 100;
    proposal.finalAmount = Math.round(finalAmount * 100) / 100;

    await manager.save(Proposal, proposal);
  }

  // ── Create Revision ─────────────────────────────────────────────────────────
  async createRevision(id: string, userId: string): Promise<Proposal> {
    const original = await this.findOne(id);

    if (original.status === 'draft') {
      throw new BadRequestException('Taslak durumundaki teklifin revizyonu oluşturulamaz');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const newProposalNumber = await this.generateProposalNumber();
      const newRevision = original.revision + 1;

      const newProposal = queryRunner.manager.create(Proposal, {
        proposalNumber: newProposalNumber,
        templateId: original.templateId,
        templateRevision: original.templateRevision,
        customerId: original.customerId,
        locationId: original.locationId,
        status: 'draft',
        revision: newRevision,
        parentProposalId: original.id,
        validUntil: (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d; })(),
        totalAmount: 0,
        discountRate: original.discountRate,
        discountAmount: 0,
        finalAmount: 0,
        currency: original.currency,
        kdvIncluded: original.kdvIncluded,
        kdvRate: original.kdvRate,
        notes: original.notes,
        createdById: userId,
      });

      const savedProposal = await queryRunner.manager.save(Proposal, newProposal);

      // Clone items
      if (original.items && original.items.length > 0) {
        const clonedItems = original.items.map((item) =>
          queryRunner.manager.create(ProposalItem, {
            proposalId: savedProposal.id,
            equipmentTypeId: item.equipmentTypeId,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discountRate: item.discountRate,
            totalPrice: item.totalPrice,
            serviceCode: item.serviceCode,
            orderIndex: item.orderIndex,
          }),
        );
        await queryRunner.manager.save(ProposalItem, clonedItems);
      }

      // Recalculate totals
      await this.recalculateTotalsWithManager(queryRunner.manager, savedProposal.id);

      // Log status
      await queryRunner.manager.save(ProposalStatusLog, {
        proposalId: savedProposal.id,
        fromStatus: '',
        toStatus: 'draft',
        userId,
        metadata: { parentProposalId: original.id, revision: newRevision },
      });

      await queryRunner.commitTransaction();

      await this.auditService.log({
        userId,
        action: 'CREATE_REVISION',
        entityType: 'proposal',
        entityId: savedProposal.id,
        newValues: { parentProposalId: original.id, revision: newRevision, proposalNumber: newProposalNumber },
        description: `Teklif revizyonu oluşturuldu: ${newProposalNumber} (Rev.${newRevision})`,
      });

      return this.findOne(savedProposal.id);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // ── Mark Sent ───────────────────────────────────────────────────────────────
  async markSent(id: string, userId: string): Promise<Proposal> {
    const proposal = await this.findOne(id);
    this.validateTransition(proposal.status, 'sent');

    if (!proposal.items || proposal.items.length === 0) {
      throw new BadRequestException('Teklif gönderilemedi: En az bir kalem eklemelisiniz.');
    }

    const oldStatus = proposal.status;
    proposal.status = 'sent';
    proposal.sentAt = new Date();
    proposal.sentById = userId;
    const saved = await this.proposalRepo.save(proposal);

    await this.logStatusChange(id, oldStatus, 'sent', userId);
    await this.auditService.log({
      userId,
      action: 'STATUS_CHANGE',
      entityType: 'proposal',
      entityId: id,
      oldValues: { status: oldStatus },
      newValues: { status: 'sent' },
      description: `Teklif gönderildi: ${proposal.proposalNumber}`,
    });

    return saved;
  }

  // ── Mark Accepted ───────────────────────────────────────────────────────────
  async markAccepted(id: string, userId: string): Promise<Proposal> {
    const proposal = await this.findOne(id);
    this.validateTransition(proposal.status, 'accepted');

    // Check expiry
    if (new Date() > new Date(proposal.validUntil)) {
      throw new BadRequestException('Bu teklif süresi dolmuş. Yeni bir revizyon oluşturun.');
    }

    const oldStatus = proposal.status;
    proposal.status = 'accepted';
    proposal.acceptedAt = new Date();
    const saved = await this.proposalRepo.save(proposal);

    await this.logStatusChange(id, oldStatus, 'accepted', userId);
    await this.auditService.log({
      userId,
      action: 'STATUS_CHANGE',
      entityType: 'proposal',
      entityId: id,
      oldValues: { status: oldStatus },
      newValues: { status: 'accepted' },
      description: `Teklif kabul edildi: ${proposal.proposalNumber}`,
    });

    // Auto-create contract from accepted proposal
    try {
      const contractRows = await this.dataSource.query(
        `SELECT COUNT(*) as c FROM contract_documents WHERE proposalId = ?`, [id]
      );
      if (Number(contractRows[0]?.c) === 0) {
        const contractNumber = `SZL-${new Date().getFullYear()}-${String(await this.dataSource.query('SELECT COUNT(*)+1 as n FROM contract_documents').then(r => r[0]?.n || 1)).padStart(5, '0')}`;
        await this.dataSource.query(
          `INSERT INTO contract_documents (id, contractNumber, proposalId, customerId, status, version, totalValue, currency, startDate, endDate, createdById, createdAt, updatedAt)
           VALUES (UUID(), ?, ?, ?, 'draft', 1, ?, ?, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 1 YEAR), ?, NOW(), NOW())`,
          [contractNumber, id, proposal.customerId, proposal.finalAmount || 0, proposal.currency || 'TRY', userId]
        );
      }
    } catch (e) {
      // Don't block proposal acceptance if contract auto-creation fails
      console.warn('Auto-contract creation failed:', e?.message);
    }

    // Update opportunity — link proposal + auto-created contract
    try {
      const newContract = await this.dataSource.query(
        `SELECT id FROM contract_documents WHERE proposalId = ? LIMIT 1`, [id]
      );
      const contractId = newContract?.[0]?.id || null;
      await this.dataSource.query(
        `UPDATE sales_opportunities SET status = 'won', probability = 100, proposalId = ?, contractId = ? WHERE proposalId = ? OR (customerId = ? AND status NOT IN ('won','lost'))`,
        [id, contractId, id, proposal.customerId]
      );
    } catch { /* ignore */ }

    return saved;
  }

  // ── Mark Rejected ───────────────────────────────────────────────────────────
  async markRejected(id: string, reason: string, userId: string): Promise<Proposal> {
    const proposal = await this.findOne(id);
    this.validateTransition(proposal.status, 'rejected');

    const oldStatus = proposal.status;
    proposal.status = 'rejected';
    proposal.rejectedAt = new Date();
    proposal.rejectionReason = reason;
    const saved = await this.proposalRepo.save(proposal);

    await this.logStatusChange(id, oldStatus, 'rejected', userId, reason);
    await this.auditService.log({
      userId,
      action: 'STATUS_CHANGE',
      entityType: 'proposal',
      entityId: id,
      oldValues: { status: oldStatus },
      newValues: { status: 'rejected', rejectionReason: reason },
      description: `Teklif reddedildi: ${proposal.proposalNumber}`,
    });

    return saved;
  }

  // ── Status Transition Validation ────────────────────────────────────────────
  private validateTransition(currentStatus: string, targetStatus: string): void {
    const allowed = VALID_TRANSITIONS[currentStatus];
    if (!allowed || !allowed.includes(targetStatus)) {
      throw new BadRequestException(
        `Bu işlem şu an yapılamaz. Teklifin mevcut durumu "${currentStatus}" iken "${targetStatus}" durumuna geçilemez.`,
      );
    }
  }

  // ── Log Status Change ───────────────────────────────────────────────────────
  async logStatusChange(
    proposalId: string,
    fromStatus: string,
    toStatus: string,
    userId: string,
    reason?: string,
  ): Promise<ProposalStatusLog> {
    const log = this.statusLogRepo.create({
      proposalId,
      fromStatus,
      toStatus,
      userId,
      reason,
    });
    return this.statusLogRepo.save(log);
  }

  // ── Get Status Log ──────────────────────────────────────────────────────────
  async getStatusLog(proposalId: string): Promise<ProposalStatusLog[]> {
    // Verify proposal exists
    await this.findOne(proposalId);

    return this.statusLogRepo.find({
      where: { proposalId },
      order: { createdAt: 'ASC' },
    });
  }

  // ── Generate PDF ────────────────────────────────────────────────────────────
  async generatePdf(id: string): Promise<Buffer> {
    const proposal = await this.findOne(id);
    const items = proposal.items || [];

    // Fetch customer info from DB
    const customerRows = await this.dataSource.query(
      'SELECT * FROM customers WHERE id = ?',
      [proposal.customerId],
    );
    const customer = customerRows[0] || {};

    // Check if template has an uploaded PDF to overlay onto
    let templatePdfBuffer: Buffer | null = null;
    if (proposal.template?.outputTemplateUrl) {
      try {
        // Load template fields for overlay mode
        const templateFields = await this.templateFieldRepo.find({
          where: { templateId: proposal.templateId },
          order: { orderIndex: 'ASC' },
        });

        // Build values map from proposal data
        const values: Record<string, any> = {
          proposalNumber: proposal.proposalNumber,
          revision: `v${proposal.revision}`,
          status: proposal.status,
          currency: proposal.currency,
          validUntil: proposal.validUntil ? new Date(proposal.validUntil).toLocaleDateString('tr-TR') : '-',
          date: new Date().toLocaleDateString('tr-TR'),
          customerName: customer.name || customer.companyName || '',
          customerAddress: customer.address || '',
          customerTaxNumber: customer.taxNumber || '',
          customerContactName: customer.contactName || '',
          customerPhone: customer.contactPhone || customer.phone || '',
          customerEmail: customer.contactEmail || customer.email || '',
          totalAmount: proposal.totalAmount,
          discountRate: proposal.discountRate,
          discountAmount: proposal.discountAmount,
          finalAmount: proposal.finalAmount,
          kdvRate: proposal.kdvRate,
          notes: proposal.notes,
          items: items.map((i: any) => ({
            description: i.description,
            quantity: i.quantity,
            unitPrice: Number(i.unitPrice),
            discountRate: Number(i.discountRate) || 0,
            totalPrice: Number(i.totalPrice),
          })),
        };

        // TODO: Load actual template PDF from storage when available
        // templatePdfBuffer = await this.storageService.downloadFile(proposal.template.outputTemplateUrl);

        if (templatePdfBuffer) {
          const result = await this.documentRenderService.renderWithTemplate(
            templatePdfBuffer, templateFields as any, values,
          );
          await this.proposalRepo.update(id, { pdfUrl: 'generated', pdfHash: result.hash });
          return result.buffer;
        }
      } catch (err) {
        // Fall through to programmatic render
        console.error('Template overlay failed, falling back to programmatic PDF:', err?.message);
      }
    }

    // Programmatic fallback
    const { buffer, hash } = await this.documentRenderService.renderProgrammatic({
      title: 'FIYAT TEKLIFI',
      documentNumber: proposal.proposalNumber,
      date: new Date().toLocaleDateString('tr-TR'),
      customer: {
        name: customer.name || customer.companyName || '',
        address: customer.address,
        taxNumber: customer.taxNumber,
        contactName: customer.contactName,
        phone: customer.contactPhone || customer.phone,
        email: customer.contactEmail || customer.email,
      },
      items: items.map((i: any) => ({
        description: i.description,
        quantity: i.quantity,
        unitPrice: Number(i.unitPrice),
        discountRate: Number(i.discountRate) || 0,
        totalPrice: Number(i.totalPrice),
      })),
      totals: {
        subtotal: items.reduce((s: number, i: any) => s + Number(i.totalPrice), 0),
        discount: Number(proposal.discountAmount) || 0,
        kdv: proposal.kdvIncluded ? 0 : (Number(proposal.finalAmount) - items.reduce((s: number, i: any) => s + Number(i.totalPrice), 0) + Number(proposal.discountAmount)),
        grandTotal: Number(proposal.finalAmount),
        currency: proposal.currency || 'TL',
      },
      notes: proposal.notes,
      footer: `Gecerlilik: ${proposal.validUntil ? new Date(proposal.validUntil).toLocaleDateString('tr-TR') : '-'} | Revizyon: v${proposal.revision}`,
    });

    await this.proposalRepo.update(id, { pdfUrl: 'generated', pdfHash: hash });
    return buffer;
  }

  // ── Generate DOCX from template ─────────────────────────────────────────────
  async generateDocx(id: string): Promise<Buffer> {
    const proposal = await this.findOne(id);
    const items = proposal.items || [];

    const customerRows = await this.dataSource.query('SELECT * FROM customers WHERE id = ?', [proposal.customerId]);
    const customer = customerRows[0] || {};

    // DOCX şablon dosyasını bul
    const templatePath = require('path').join(__dirname, '..', '..', '..', 'PERKONT_FORMLAR', 'TEKLIF_SOZLESME', 'TEKLIF_SOZLESME_SABLON.docx');
    const fs = require('fs');

    if (fs.existsSync(templatePath)) {
      const { DocxRenderService } = require('@/modules/shared/docx-render.service');
      const docxService = new DocxRenderService();
      const data = docxService.buildProposalData(proposal, customer, items);
      const { buffer, hash } = await docxService.renderDocx(templatePath, data);
      await this.proposalRepo.update(id, { pdfHash: hash });
      return buffer;
    }

    throw new BadRequestException('DOCX şablon dosyası bulunamadı. Lütfen PERKONT_FORMLAR/TEKLIF_SOZLESME klasörüne şablonu yükleyin.');
  }

  // ─── Template Management ──────────────────────────────────────────────────────

  // ── Create Template ─────────────────────────────────────────────────────────
  async createTemplate(
    data: Partial<ProposalTemplate> & { fields?: Partial<ProposalTemplateField>[] },
    userId: string,
  ): Promise<ProposalTemplate> {
    // Check code uniqueness
    if (data.code) {
      const existing = await this.templateRepo.findOne({ where: { code: data.code } });
      if (existing) {
        throw new ConflictException(`Bu şablon kodu zaten kullanımda: ${data.code}`);
      }
    }

    const fields = data.fields || [];
    delete data.fields;

    const template = this.templateRepo.create({
      ...data,
      status: 'draft',
      revisionDate: data.revisionDate || new Date(),
      createdById: userId,
    });

    const savedTemplate = await this.templateRepo.save(template);

    // Save fields
    if (fields.length > 0) {
      const templateFields = fields.map((field, index) =>
        this.templateFieldRepo.create({
          ...field,
          templateId: savedTemplate.id,
          orderIndex: field.orderIndex ?? index,
        }),
      );
      await this.templateFieldRepo.save(templateFields);
    }

    await this.auditService.log({
      userId,
      action: 'CREATE',
      entityType: 'proposal_template',
      entityId: savedTemplate.id,
      newValues: { code: savedTemplate.code, name: savedTemplate.name, type: savedTemplate.type },
      description: `Teklif şablonu oluşturuldu: ${savedTemplate.name}`,
    });

    return this.findTemplate(savedTemplate.id);
  }

  // ── Find All Templates ──────────────────────────────────────────────────────
  async findAllTemplates(
    filters: { type?: string; status?: string; search?: string },
    pagination?: PaginationDto,
  ): Promise<PaginatedResult<ProposalTemplate>> {
    const qb = this.templateRepo.createQueryBuilder('t');

    if (filters.type) {
      qb.andWhere('t.type = :type', { type: filters.type });
    }
    if (filters.status) {
      qb.andWhere('t.status = :status', { status: filters.status });
    }
    if (filters.search) {
      qb.andWhere('(t.name LIKE :s OR t.code LIKE :s)', { s: `%${filters.search}%` });
    }

    const page = pagination?.page || 1;
    const limit = pagination?.limit || 20;
    const skip = (page - 1) * limit;

    qb.orderBy('t.createdAt', 'DESC').skip(skip).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return new PaginatedResult(data, total, page, limit);
  }

  // ── Find Template ───────────────────────────────────────────────────────────
  async findTemplate(id: string): Promise<ProposalTemplate> {
    const template = await this.templateRepo.findOne({
      where: { id },
      relations: ['fields'],
    });
    if (!template) {
      throw new NotFoundException('Teklif şablonu bulunamadı');
    }
    return template;
  }

  // ── Activate Template ───────────────────────────────────────────────────────
  async activateTemplate(id: string, userId: string): Promise<ProposalTemplate> {
    const template = await this.findTemplate(id);

    if (template.status !== 'draft') {
      throw new BadRequestException('Yalnızca taslak durumundaki şablonlar aktifleştirilebilir');
    }

    // Supersede existing active templates of same type
    const activeTemplates = await this.templateRepo.find({
      where: { type: template.type, status: 'active' },
    });

    if (activeTemplates.length > 0) {
      for (const active of activeTemplates) {
        active.status = 'superseded';
        active.supersededById = id;
        await this.templateRepo.save(active);
      }
    }

    template.status = 'active';
    const saved = await this.templateRepo.save(template);

    await this.auditService.log({
      userId,
      action: 'ACTIVATE',
      entityType: 'proposal_template',
      entityId: id,
      newValues: { status: 'active', supersededCount: activeTemplates.length },
      description: `Teklif şablonu aktifleştirildi: ${template.name}`,
    });

    return saved;
  }

  // ── Create Template Revision ────────────────────────────────────────────────
  async createTemplateRevision(
    id: string,
    revision: string,
    userId: string,
  ): Promise<ProposalTemplate> {
    const original = await this.findTemplate(id);

    // Parse next revision code
    const newRevision = revision || (() => {
      const match = original.revision.match(/Rev\.(\d+)/);
      const num = match ? parseInt(match[1], 10) + 1 : 2;
      return `Rev.${String(num).padStart(2, '0')}`;
    })();

    // Generate new code
    const newCode = `${original.code}-${newRevision.replace(/\./g, '')}`;

    // Check code uniqueness
    const existingCode = await this.templateRepo.findOne({ where: { code: newCode } });
    if (existingCode) {
      throw new ConflictException(`Bu revizyon kodu zaten mevcut: ${newCode}`);
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const newTemplate = queryRunner.manager.create(ProposalTemplate, {
        code: newCode,
        name: original.name,
        type: original.type,
        revision: newRevision,
        revisionDate: new Date(),
        status: 'draft',
        layoutConfig: original.layoutConfig,
        description: original.description,
        outputTemplateUrl: original.outputTemplateUrl,
        outputTemplateObjectName: original.outputTemplateObjectName,
        createdById: userId,
      });

      const savedTemplate = await queryRunner.manager.save(ProposalTemplate, newTemplate);

      // Clone fields
      if (original.fields && original.fields.length > 0) {
        const clonedFields = original.fields.map((field) =>
          queryRunner.manager.create(ProposalTemplateField, {
            templateId: savedTemplate.id,
            fieldKey: field.fieldKey,
            label: field.label,
            fieldType: field.fieldType,
            section: field.section,
            orderIndex: field.orderIndex,
            isRequired: field.isRequired,
            pdfCoordinate: field.pdfCoordinate,
            options: field.options,
            isConditional: field.isConditional,
            conditionRule: field.conditionRule,
            defaultValue: field.defaultValue,
            isRepeatable: field.isRepeatable,
            tableColumns: field.tableColumns,
          }),
        );
        await queryRunner.manager.save(ProposalTemplateField, clonedFields);
      }

      await queryRunner.commitTransaction();

      await this.auditService.log({
        userId,
        action: 'CREATE_REVISION',
        entityType: 'proposal_template',
        entityId: savedTemplate.id,
        newValues: { originalTemplateId: id, revision: newRevision, code: newCode },
        description: `Şablon revizyonu oluşturuldu: ${newCode} (${newRevision})`,
      });

      return this.findTemplate(savedTemplate.id);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // ─── Send Tracking ──────────────────────────────────────────────────────────

  // ── Log Send ──────────────────────────────────────────────────────────────
  async logSend(
    proposalId: string,
    data: { sentVia: string; sentToEmail?: string; sentToPhone?: string; notes?: string },
    userId: string,
  ): Promise<ProposalSendLog> {
    const viewToken = crypto.randomBytes(16).toString('hex');
    const log = this.sendLogRepo.create({
      proposalId,
      sentVia: data.sentVia,
      sentToEmail: data.sentToEmail,
      sentToPhone: data.sentToPhone,
      sentById: userId,
      viewToken,
      notes: data.notes,
    });
    await this.sendLogRepo.save(log);

    await this.auditService.log({
      userId,
      action: 'PROPOSAL_SEND_LOGGED',
      entityType: 'Proposal',
      entityId: proposalId,
      newValues: { sentVia: data.sentVia, sentToEmail: data.sentToEmail },
    });

    return log;
  }

  // ── Mark Viewed ───────────────────────────────────────────────────────────
  async markViewed(viewToken: string): Promise<void> {
    await this.sendLogRepo.update(
      { viewToken },
      { viewedAt: new Date() },
    );
  }

  // ── Get Send Logs ─────────────────────────────────────────────────────────
  async getSendLogs(proposalId: string): Promise<ProposalSendLog[]> {
    return this.sendLogRepo.find({
      where: { proposalId },
      order: { sentAt: 'DESC' },
    });
  }
}

// ─── Controller: ProposalsController ──────────────────────────────────────────
@ApiTags('proposals')
@ApiBearerAuth('JWT')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('proposals')
export class ProposalsController {
  constructor(private readonly service: ProposalsService, private readonly dataSource: DataSource) {}

  // ── Proposal CRUD ─────────────────────────────────────────────────────────

  @Post()
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.CUSTOMER_REP)
  create(@Body() body: any, @CurrentUser('id') userId: string) {
    return this.service.create(body, userId);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.CUSTOMER_REP, UserRole.FINANCE, UserRole.EXECUTIVE)
  findAll(
    @Query('status') status?: string,
    @Query('customerId') customerId?: string,
    @Query('search') search?: string,
    @Query('templateId') templateId?: string,
    @Query('createdById') createdById?: string,
    @Query() pagination?: PaginationDto,
    @Req() req?: any,
  ) {
    return this.service.findAll({ status, customerId, search, templateId, createdById, companyId: req?.companyId }, pagination);
  }

  @Get('templates')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.CUSTOMER_REP)
  findAllTemplatesMain(
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.service.findAllTemplates({ type, status, search });
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.CUSTOMER_REP, UserRole.FINANCE, UserRole.EXECUTIVE)
  async findOne(@Param('id') id: string, @Req() req?: any) {
    await verifyTenantAccess(this.dataSource, 'proposal', id, req?.companyId);
    return this.service.findOne(id);
  }

  @Put(':id')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.CUSTOMER_REP)
  update(@Param('id') id: string, @Body() body: any, @CurrentUser('id') userId: string) {
    return this.service.update(id, body, userId);
  }

  // ── Items ─────────────────────────────────────────────────────────────────

  @Post(':id/items')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.CUSTOMER_REP)
  addItem(@Param('id') proposalId: string, @Body() body: any) {
    return this.service.addItem(proposalId, body);
  }

  @Delete(':id/items/:itemId')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.CUSTOMER_REP)
  removeItem(@Param('id') proposalId: string, @Param('itemId') itemId: string) {
    return this.service.removeItem(proposalId, itemId);
  }

  // ── Revision ──────────────────────────────────────────────────────────────

  @Post(':id/revision')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.CUSTOMER_REP)
  createRevision(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.createRevision(id, userId);
  }

  // ── Status Actions ────────────────────────────────────────────────────────

  @Patch(':id/send')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.CUSTOMER_REP)
  markSent(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.markSent(id, userId);
  }

  @Patch(':id/accept')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.CUSTOMER_REP, UserRole.CUSTOMER)
  markAccepted(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.markAccepted(id, userId);
  }

  @Patch(':id/reject')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.CUSTOMER_REP, UserRole.CUSTOMER)
  markRejected(@Param('id') id: string, @Body('reason') reason: string, @CurrentUser('id') userId: string) {
    if (!reason || reason.trim().length === 0) {
      throw new BadRequestException('Red gerekçesi zorunludur');
    }
    return this.service.markRejected(id, reason, userId);
  }

  // ── PDF ───────────────────────────────────────────────────────────────────

  @Get(':id/pdf')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.CUSTOMER_REP, UserRole.FINANCE, UserRole.EXECUTIVE, UserRole.CUSTOMER)
  async downloadPdf(@Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    const pdfBuffer = await this.service.generatePdf(id);
    const proposal = await this.service.findOne(id);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="Teklif_${proposal.proposalNumber}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });

    return new StreamableFile(pdfBuffer);
  }

  // ── DOCX ──────────────────────────────────────────────────────────────────

  @Get(':id/docx')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.CUSTOMER_REP)
  async downloadDocx(@Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    const docxBuffer = await this.service.generateDocx(id);
    const proposal = await this.service.findOne(id);

    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="Teklif_${proposal.proposalNumber}.docx"`,
      'Content-Length': docxBuffer.length,
    });

    return new StreamableFile(docxBuffer);
  }

  // ── Status Log ────────────────────────────────────────────────────────────

  @Get(':id/status-log')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.CUSTOMER_REP, UserRole.FINANCE, UserRole.EXECUTIVE)
  getStatusLog(@Param('id') proposalId: string) {
    return this.service.getStatusLog(proposalId);
  }

  // ── Template Endpoints ────────────────────────────────────────────────────

  @Post('templates')
  @Roles(UserRole.ADMIN)
  createTemplate(@Body() body: any, @CurrentUser('id') userId: string) {
    return this.service.createTemplate(body, userId);
  }

  @Get('templates')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.CUSTOMER_REP)
  findAllTemplates(
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query() pagination?: PaginationDto,
  ) {
    return this.service.findAllTemplates({ type, status, search }, pagination);
  }

  @Get('templates/:id')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.CUSTOMER_REP)
  findTemplate(@Param('id') id: string) {
    return this.service.findTemplate(id);
  }

  @Patch('templates/:id/activate')
  @Roles(UserRole.ADMIN)
  activateTemplate(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.activateTemplate(id, userId);
  }

  @Post('templates/:id/revise')
  @Roles(UserRole.ADMIN)
  createTemplateRevision(
    @Param('id') id: string,
    @Body('revision') revision: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.createTemplateRevision(id, revision, userId);
  }

  // ── Send Tracking ──────────────────────────────────────────────────────────

  @Post(':id/send-log')
  @Roles(UserRole.ADMIN, UserRole.SALES)
  logSend(@Param('id') id: string, @Body() body: any, @CurrentUser('id') userId: string) {
    return this.service.logSend(id, body, userId);
  }

  @Get(':id/send-logs')
  getSendLogs(@Param('id') id: string) {
    return this.service.getSendLogs(id);
  }
}

// ─── Controller: ProposalTrackController (public) ─────────────────────────────
@ApiTags('proposals')
@Controller('proposals')
export class ProposalTrackController {
  constructor(private readonly service: ProposalsService) {}

  // Public endpoint - no auth needed
  @Get('track/:viewToken')
  async trackView(@Param('viewToken') viewToken: string) {
    await this.service.markViewed(viewToken);
    // Return a 1x1 transparent pixel acknowledgment
    return { viewed: true };
  }
}

// ─── Module: ProposalsModule ────────────────────────────────────────────────────
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProposalTemplate,
      ProposalTemplateField,
      Proposal,
      ProposalItem,
      ProposalStatusLog,
      ProposalSendLog,
    ]),
    AuditModule,
  ],
  providers: [ProposalsService],
  controllers: [ProposalsController, ProposalTrackController],
  exports: [ProposalsService],
})
export class ProposalsModule {}

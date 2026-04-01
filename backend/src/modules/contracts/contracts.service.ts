import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { addDays } from 'date-fns';
import { Contract, ContractStatus } from './entities/contract.entity';
import { AuditService } from '@/modules/audit/audit.service';
import { StorageService, StorageBucket } from '@/modules/storage/storage.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { PaginationDto, PaginatedResult } from '@/common/dto/pagination.dto';

// ─── Contract State Machine ────────────────────────────────────────────────────
const VALID_CONTRACT_TRANSITIONS: Record<string, string[]> = {
  [ContractStatus.DRAFT]:      [ContractStatus.SENT, ContractStatus.SIGNED, ContractStatus.TERMINATED],
  [ContractStatus.SENT]:       [ContractStatus.SIGNED, ContractStatus.DRAFT, ContractStatus.TERMINATED],
  [ContractStatus.SIGNED]:     [ContractStatus.ACTIVE, ContractStatus.TERMINATED],
  [ContractStatus.ACTIVE]:     [ContractStatus.EXPIRED, ContractStatus.TERMINATED],
  [ContractStatus.EXPIRED]:    [],
  [ContractStatus.TERMINATED]: [],
};

@Injectable()
export class ContractsService {
  constructor(
    @InjectRepository(Contract) private contractRepo: Repository<Contract>,
    private auditService: AuditService,
    private storageService: StorageService,
    private notificationsService: NotificationsService,
  ) {}

  private validateTransition(currentStatus: string, newStatus: string): void {
    const allowed = VALID_CONTRACT_TRANSITIONS[currentStatus];
    if (!allowed || !allowed.includes(newStatus)) {
      throw new BadRequestException(
        `Sözleşme durumu '${currentStatus}' -> '${newStatus}' geçişi yapılamaz. İzin verilen: ${allowed?.join(', ') || 'yok'}`,
      );
    }
  }

  private async generateContractNumber(): Promise<string> {
    const year  = new Date().getFullYear();
    const count = await this.contractRepo.count();
    return `SZL-${year}-${String(count + 1).padStart(4, '0')}`;
  }

  async create(data: Partial<Contract>, userId: string): Promise<Contract> {
    const contractNumber = await this.generateContractNumber();
    const contract = this.contractRepo.create({ ...data, contractNumber, createdById: userId });
    const saved = await this.contractRepo.save(contract);

    await this.auditService.log({
      userId,
      action: 'CONTRACT_CREATED',
      entityType: 'Contract',
      entityId: saved.id,
      newValues: { contractNumber } as any,
    });
    return saved;
  }

  async findAll(
    filters: { status?: string; customerId?: string; companyId?: string },
    pagination: PaginationDto,
  ): Promise<PaginatedResult<Contract>> {
    const qb = this.contractRepo.createQueryBuilder('c');
    if (filters.status)     qb.andWhere('c.status = :status', { status: filters.status });
    if (filters.customerId) qb.andWhere('c.customerId = :cid', { cid: filters.customerId });

    // Tenant isolation
    if (filters.companyId) {
      qb.innerJoin('customers', 'cust', 'cust.id = c.customerId')
        .andWhere('cust.companyId = :companyId', { companyId: filters.companyId });
    }

    qb.orderBy('c.createdAt', 'DESC').skip(pagination.skip).take(pagination.limit);
    const [data, total] = await qb.getManyAndCount();
    return new PaginatedResult(data, total, pagination.page, pagination.limit);
  }

  async findOne(id: string): Promise<Contract> {
    const c = await this.contractRepo.findOne({ where: { id } });
    if (!c) throw new NotFoundException('Sözleşme bulunamadı');
    return c;
  }

  async update(id: string, data: Partial<Contract>, userId: string): Promise<Contract> {
    const old = await this.findOne(id);

    // Validate status transition if status is being changed
    if (data.status && data.status !== old.status) {
      this.validateTransition(old.status, data.status);
    }

    await this.contractRepo.update(id, data);
    await this.auditService.log({
      userId,
      action: 'CONTRACT_UPDATED',
      entityType: 'Contract',
      entityId: id,
      oldValues: { status: old.status } as any,
      newValues: data as any,
    });
    return this.findOne(id);
  }

  async uploadDocument(
    id: string, file: Buffer, originalName: string, userId: string,
  ): Promise<Contract> {
    const hash = crypto.createHash('sha256').update(file).digest('hex');
    const ext = originalName.toLowerCase().split('.').pop();
    const mimeTypes: Record<string, string> = {
      pdf: 'application/pdf',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      doc: 'application/msword',
    };
    const mimeType = mimeTypes[ext || ''] || 'application/octet-stream';
    const { url } = await this.storageService.uploadFile(
      StorageBucket.DOCUMENTS, file, originalName, mimeType, `contracts/${id}`,
    );
    await this.contractRepo.update(id, { documentUrl: url, documentHash: hash });
    await this.auditService.log({
      userId, action: 'CONTRACT_DOCUMENT_UPLOADED', entityType: 'Contract', entityId: id,
    });
    return this.findOne(id);
  }

  async markSigned(
    id: string, signedBy: 'customer' | 'company', userId: string,
  ): Promise<Contract> {
    const contract = await this.findOne(id);
    const updates: Partial<Contract> = {};

    if (signedBy === 'customer') updates.customerSignedAt = new Date();
    else { updates.companySignedAt = new Date(); updates.companySignedById = userId; }

    const fullySign =
      (signedBy === 'customer' && contract.companySignedAt) ||
      (signedBy === 'company'  && contract.customerSignedAt);

    if (fullySign) {
      this.validateTransition(contract.status, ContractStatus.SIGNED);
      updates.status = ContractStatus.SIGNED;
    }

    await this.contractRepo.update(id, updates);
    await this.auditService.log({
      userId, action: `CONTRACT_SIGNED_BY_${signedBy.toUpperCase()}`,
      entityType: 'Contract', entityId: id,
    });

    // Auto-activate: both parties signed → immediately active
    if (fullySign) {
      return this.activate(id, userId);
    }

    return this.findOne(id);
  }

  async activate(id: string, userId: string): Promise<Contract> {
    const contract = await this.findOne(id);

    if (contract.status === ContractStatus.ACTIVE) return contract;
    this.validateTransition(contract.status, ContractStatus.ACTIVE);

    // Kapsam kontrolu: en az 1 scope item olmali
    const scopeCount = await this.contractRepo.manager.query(
      `SELECT COUNT(*) as c FROM contract_scope_items WHERE contractId = ?`, [id]
    );
    if (Number(scopeCount[0]?.c) === 0) {
      throw new BadRequestException('Sözleşme kapsamı tanımlanmadan aktif edilemez. Önce ekipman tipleri ve birim fiyatları girin.');
    }

    await this.contractRepo.update(id, { status: ContractStatus.ACTIVE });

    await this.auditService.log({
      userId,
      action: 'CONTRACT_ACTIVATED',
      entityType: 'Contract',
      entityId: id,
      oldValues: { status: contract.status } as any,
      newValues: { status: ContractStatus.ACTIVE } as any,
      description: `Sözleşme ${contract.contractNumber} aktif edildi`,
    });

    return this.findOne(id);
  }

  async acceptByCustomer(id: string, userId: string): Promise<Contract> {
    const contract = await this.findOne(id);
    const updates: Partial<Contract> = {
      customerSignedAt: new Date(),
    };

    // If company already signed, mark as fully signed
    if (contract.companySignedAt) {
      updates.status = ContractStatus.SIGNED;
    }

    await this.contractRepo.update(id, updates);

    await this.auditService.log({
      userId,
      action: 'CONTRACT_ACCEPTED_BY_CUSTOMER',
      entityType: 'Contract',
      entityId: id,
      newValues: updates as any,
    });

    await this.notificationsService.createInAppNotification({
      type: 'CONTRACT_ACCEPTED' as any,
      channel: 'in_app' as any,
      title: 'Sözleşme müşteri tarafından kabul edildi',
      body: `${contract.contractNumber} numaralı sözleşme müşteri tarafından kabul edildi.`,
    });

    return this.findOne(id);
  }

  async rejectByCustomer(id: string, reason: string, userId: string): Promise<Contract> {
    const contract = await this.findOne(id);
    const updates: Partial<Contract> = {
      status: ContractStatus.DRAFT,
      notes: reason,
    };

    await this.contractRepo.update(id, updates);

    await this.auditService.log({
      userId,
      action: 'CONTRACT_REJECTED_BY_CUSTOMER',
      entityType: 'Contract',
      entityId: id,
      oldValues: { status: contract.status } as any,
      newValues: { status: ContractStatus.DRAFT, rejectionReason: reason } as any,
    });

    await this.notificationsService.createInAppNotification({
      type: 'CONTRACT_REJECTED' as any,
      channel: 'in_app' as any,
      title: 'Sözleşme müşteri tarafından reddedildi',
      body: `${contract.contractNumber} numaralı sözleşme reddedildi. Sebep: ${reason}`,
    });

    return this.findOne(id);
  }

  async getExpiringContracts(days = 60): Promise<Contract[]> {
    const future = addDays(new Date(), days);
    return this.contractRepo
      .createQueryBuilder('c')
      .where('c.status = :s', { s: ContractStatus.ACTIVE })
      .andWhere('c.endDate <= :future', { future })
      .andWhere('c.endDate >= :now', { now: new Date() })
      .orderBy('c.endDate', 'ASC')
      .getMany();
  }
}

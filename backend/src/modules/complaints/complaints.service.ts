import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Complaint, ComplaintType, ComplaintStatus } from './entities/complaint.entity';
import { AuditService } from '@/modules/audit/audit.service';
import { PaginationDto, PaginatedResult } from '@/common/dto/pagination.dto';

@Injectable()
export class ComplaintsService {
  constructor(@InjectRepository(Complaint) private repo: Repository<Complaint>, private auditService: AuditService) {}

  private async generateNumber(type: ComplaintType): Promise<string> {
    const prefix = type === ComplaintType.APPEAL ? 'ITR' : 'SIK';
    const year = new Date().getFullYear();
    const count = await this.repo.count({ where: { type } });
    return `${prefix}-${year}-${String(count + 1).padStart(4, '0')}`;
  }

  async create(data: Partial<Complaint>, userId: string): Promise<Complaint> {
    const number = await this.generateNumber(data.type!);
    const record = this.repo.create({ ...data, complaintNumber: number, createdById: userId });
    const saved = await this.repo.save(record);
    await this.auditService.log({ userId, action: `${data.type?.toUpperCase()}_RECEIVED`, entityType: 'Complaint', entityId: saved.id, newValues: { number, subject: data.subject } as any });
    return saved;
  }

  async findAll(filters: { status?: string; type?: string; customerId?: string }, pagination: PaginationDto): Promise<PaginatedResult<Complaint>> {
    const qb = this.repo.createQueryBuilder('c');
    if (filters.status)     qb.andWhere('c.status = :status', { status: filters.status });
    if (filters.type)       qb.andWhere('c.type = :type', { type: filters.type });
    if (filters.customerId) qb.andWhere('c.customerId = :cid', { cid: filters.customerId });
    qb.orderBy('c.createdAt', 'DESC').skip(pagination.skip).take(pagination.limit);
    const [data, total] = await qb.getManyAndCount();
    return new PaginatedResult(data, total, pagination.page, pagination.limit);
  }

  async findOne(id: string): Promise<Complaint> {
    const r = await this.repo.findOne({ where: { id } });
    if (!r) throw new NotFoundException('Kayıt bulunamadı');
    return r;
  }

  async update(id: string, data: Partial<Complaint>, userId: string): Promise<Complaint> {
    await this.repo.update(id, data);
    await this.auditService.log({ userId, action: 'COMPLAINT_UPDATED', entityType: 'Complaint', entityId: id, newValues: data as any });
    return this.findOne(id);
  }

  async resolve(id: string, resolution: string, userId: string): Promise<Complaint> {
    await this.repo.update(id, { status: ComplaintStatus.RESOLVED, resolution, resolvedAt: new Date() });
    await this.auditService.log({ userId, action: 'COMPLAINT_RESOLVED', entityType: 'Complaint', entityId: id });
    return this.findOne(id);
  }

  async close(id: string, userId: string): Promise<Complaint> {
    await this.repo.update(id, { status: ComplaintStatus.CLOSED, closedAt: new Date(), closedById: userId });
    await this.auditService.log({ userId, action: 'COMPLAINT_CLOSED', entityType: 'Complaint', entityId: id });
    return this.findOne(id);
  }

  async getStats() {
    return { total: await this.repo.count() };
  }
}

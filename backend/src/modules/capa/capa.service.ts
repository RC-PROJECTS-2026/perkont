import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CapaRecord, CapaStatus } from './entities/capa-record.entity';
import { AuditService } from '@/modules/audit/audit.service';
import { PaginationDto, PaginatedResult } from '@/common/dto/pagination.dto';

@Injectable()
export class CapaService {
  constructor(@InjectRepository(CapaRecord) private capaRepo: Repository<CapaRecord>, private auditService: AuditService) {}

  private async generateCapaNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.capaRepo.count();
    return `CAPA-${year}-${String(count + 1).padStart(4, '0')}`;
  }

  async create(data: Partial<CapaRecord>, userId: string): Promise<CapaRecord> {
    const capaNumber = await this.generateCapaNumber();
    const record = this.capaRepo.create({ ...data, capaNumber, createdById: userId });
    const saved = await this.capaRepo.save(record);
    await this.auditService.log({ userId, action: 'CAPA_CREATED', entityType: 'CapaRecord', entityId: saved.id, newValues: { capaNumber, type: data.type, severity: data.severity } as any });
    return saved;
  }

  async findAll(filters: { status?: string; type?: string }, pagination: PaginationDto): Promise<PaginatedResult<CapaRecord>> {
    const qb = this.capaRepo.createQueryBuilder('c');
    if (filters.status) qb.andWhere('c.status = :status', { status: filters.status });
    if (filters.type)   qb.andWhere('c.type = :type', { type: filters.type });
    qb.orderBy('c.createdAt', 'DESC').skip(pagination.skip).take(pagination.limit);
    const [data, total] = await qb.getManyAndCount();
    return new PaginatedResult(data, total, pagination.page, pagination.limit);
  }

  async findOne(id: string): Promise<CapaRecord> {
    const r = await this.capaRepo.findOne({ where: { id } });
    if (!r) throw new NotFoundException('CAPA kaydı bulunamadı');
    return r;
  }

  async update(id: string, data: Partial<CapaRecord>, userId: string): Promise<CapaRecord> {
    await this.capaRepo.update(id, data);
    await this.auditService.log({ userId, action: 'CAPA_UPDATED', entityType: 'CapaRecord', entityId: id, newValues: data as any });
    return this.findOne(id);
  }

  async close(id: string, effectivenessResult: string, userId: string): Promise<CapaRecord> {
    const capa = await this.findOne(id);
    if (capa.status !== CapaStatus.EFFECTIVENESS_CHECK) throw new BadRequestException('Kapatmadan önce etkinlik kontrolü yapılmalıdır');
    await this.capaRepo.update(id, { status: CapaStatus.CLOSED, effectivenessResult, closedAt: new Date(), closedById: userId });
    await this.auditService.log({ userId, action: 'CAPA_CLOSED', entityType: 'CapaRecord', entityId: id });
    return this.findOne(id);
  }

  async getStats() {
    const total = await this.capaRepo.count();
    const byStatus = await this.capaRepo.createQueryBuilder('c').select('c.status, COUNT(*) as count').groupBy('c.status').getRawMany();
    return { total, byStatus };
  }
}

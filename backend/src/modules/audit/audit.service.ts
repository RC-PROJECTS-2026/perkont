import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { AuditLog } from './entities/audit-log.entity';
import { ComplianceEvent } from './entities/compliance-event.entity';
import { PaginationDto, PaginatedResult } from '@/common/dto/pagination.dto';

export interface CreateAuditLogDto {
  userId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  ipAddress?: string;
  deviceInfo?: string;
  sessionId?: string;
  description?: string;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private auditRepo: Repository<AuditLog>,
    @InjectRepository(ComplianceEvent)
    private complianceEventRepo: Repository<ComplianceEvent>,
  ) {}

  async log(dto: CreateAuditLogDto): Promise<void> {
    // Fire-and-forget: audit log hiçbir zaman ana işlemi engellemez
    const log = this.auditRepo.create(dto);
    await this.auditRepo.save(log).catch((err) => {
      // Audit log başarısız olsa bile ana işlem devam eder
      // Ama bir şekilde alert gönderilmeli
      console.error('AUDIT LOG FAILED:', err.message, dto);
    });
  }

  async findAll(
    filters: {
      userId?: string;
      entityType?: string;
      entityId?: string;
      action?: string;
      startDate?: Date;
      endDate?: Date;
    },
    pagination: PaginationDto,
  ): Promise<PaginatedResult<AuditLog>> {
    const qb = this.auditRepo.createQueryBuilder('al');

    if (filters.userId) qb.andWhere('al.userId = :userId', { userId: filters.userId });
    if (filters.entityType) qb.andWhere('al.entityType = :et', { et: filters.entityType });
    if (filters.entityId) qb.andWhere('al.entityId = :ei', { ei: filters.entityId });
    if (filters.action) qb.andWhere('al.action = :action', { action: filters.action });
    if (filters.startDate) qb.andWhere('al.timestamp >= :start', { start: filters.startDate });
    if (filters.endDate) qb.andWhere('al.timestamp <= :end', { end: filters.endDate });

    qb.orderBy('al.timestamp', 'DESC')
      .skip(pagination.skip)
      .take(pagination.limit);

    const [data, total] = await qb.getManyAndCount();
    return new PaginatedResult(data, total, pagination.page, pagination.limit);
  }

  async getEntityHistory(entityType: string, entityId: string): Promise<AuditLog[]> {
    return this.auditRepo.find({
      where: { entityType, entityId },
      order: { timestamp: 'DESC' },
    });
  }

  /**
   * Her ayın 1'inde gece 3'te çalışır
   * 24 aydan eski audit logları kontrol eder ve arşivleme uyarısı verir
   * (MySQL trigger'ları DELETE'i engellediği için silme yapılmaz)
   */
  @Cron('0 3 1 * *')
  async auditLogRetentionCheck(): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - 24);

    const oldCount = await this.auditRepo.count({
      where: { timestamp: LessThan(cutoffDate) },
    });

    if (oldCount > 0) {
      console.warn(`[AUDIT RETENTION] ${oldCount} adet audit log 24 aydan eski. Arşivleme gerekli.`);
    }
  }

  async logComplianceEvent(params: {
    eventType: string;
    entityType: string;
    entityId?: string;
    userId?: string;
    userName?: string;
    description?: string;
    metadata?: Record<string, any>;
    ipAddress?: string;
  }): Promise<void> {
    try {
      const event = this.complianceEventRepo.create(params);
      await this.complianceEventRepo.save(event);
    } catch (err) {
      console.error('COMPLIANCE EVENT LOG FAILED:', err.message);
    }
  }
}

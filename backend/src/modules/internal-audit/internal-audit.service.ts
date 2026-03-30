import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InternalAuditPlan, InternalAuditFinding, FindingStatus } from './entities/internal-audit.entity';
import { AuditService } from '@/modules/audit/audit.service';
import { PaginationDto, PaginatedResult } from '@/common/dto/pagination.dto';

@Injectable()
export class InternalAuditService {
  constructor(
    @InjectRepository(InternalAuditPlan) private planRepo: Repository<InternalAuditPlan>,
    @InjectRepository(InternalAuditFinding) private findingRepo: Repository<InternalAuditFinding>,
    private auditService: AuditService,
  ) {}

  private async generateAuditNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.planRepo.count();
    return `ITA-${year}-${String(count + 1).padStart(2, '0')}`;
  }

  async createPlan(data: Partial<InternalAuditPlan>, userId: string): Promise<InternalAuditPlan> {
    const auditNumber = await this.generateAuditNumber();
    const plan = this.planRepo.create({ ...data, auditNumber, createdById: userId });
    const saved = await this.planRepo.save(plan);
    await this.auditService.log({ userId, action: 'INTERNAL_AUDIT_PLANNED', entityType: 'InternalAuditPlan', entityId: saved.id });
    return saved;
  }

  async findAllPlans(pagination: PaginationDto): Promise<PaginatedResult<InternalAuditPlan>> {
    const [data, total] = await this.planRepo.findAndCount({
      relations: ['findings'],
      order: { plannedDate: 'DESC' },
      skip: pagination.skip, take: pagination.limit,
    });
    return new PaginatedResult(data, total, pagination.page, pagination.limit);
  }

  async findOnePlan(id: string): Promise<InternalAuditPlan> {
    const plan = await this.planRepo.findOne({ where: { id }, relations: ['findings'] });
    if (!plan) throw new NotFoundException('Tetkik planı bulunamadı');
    return plan;
  }

  async updatePlan(id: string, data: Partial<InternalAuditPlan>, userId: string): Promise<InternalAuditPlan> {
    await this.planRepo.update(id, data);
    await this.auditService.log({ userId, action: 'INTERNAL_AUDIT_UPDATED', entityType: 'InternalAuditPlan', entityId: id, newValues: data as any });
    return this.findOnePlan(id);
  }

  async addFinding(planId: string, data: Partial<InternalAuditFinding>, userId: string): Promise<InternalAuditFinding> {
    const plan = await this.findOnePlan(planId);
    const existingCount = await this.findingRepo.count({ where: { auditPlanId: planId } });
    const findingNumber = `${plan.auditNumber}-${data.severity?.charAt(0).toUpperCase()}${String(existingCount + 1).padStart(2, '0')}`;
    const finding = this.findingRepo.create({ ...data, auditPlanId: planId, findingNumber });
    return this.findingRepo.save(finding);
  }

  async closeFinding(findingId: string, userId: string): Promise<InternalAuditFinding> {
    const finding = await this.findingRepo.findOneOrFail({ where: { id: findingId } });
    await this.findingRepo.update(findingId, { status: FindingStatus.CLOSED, closedAt: new Date(), closedById: userId });
    await this.auditService.log({ userId, action: 'FINDING_CLOSED', entityType: 'InternalAuditFinding', entityId: findingId });
    return { ...finding, status: FindingStatus.CLOSED, closedAt: new Date() } as any;
  }

  async getOpenFindings(): Promise<InternalAuditFinding[]> {
    return this.findingRepo.find({
      where: [{ status: FindingStatus.OPEN }, { status: FindingStatus.IN_PROGRESS }] as any,
      relations: ['auditPlan'],
      order: { createdAt: 'ASC' },
    });
  }
}

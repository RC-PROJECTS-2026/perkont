import {
  Injectable, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, DataSource } from 'typeorm';
import { format } from 'date-fns';
import {
  WorkOrder, WorkOrderEquipment, WorkOrderStatus,
} from './entities/work-order.entity';
import { AuditService } from '@/modules/audit/audit.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { EquipmentService } from '@/modules/equipment/equipment.service';
import { FormTemplatesService } from '@/modules/form-templates/form-templates.service';
import { PaginationDto, PaginatedResult } from '@/common/dto/pagination.dto';
import { NotificationType, NotificationChannel } from '@/modules/notifications/entities/notification.entity';
import { InjectRepository as IR } from '@nestjs/typeorm';
import { UsersService } from '@/modules/users/users.service';

export interface CreateWorkOrderDto {
  customerId: string;
  locationId?: string;
  contractId?: string;
  plannedDate?: string;
  plannedTime?: string;
  priority?: string;
  notes?: string;
  equipmentItems: Array<{
    equipmentId: string;
    formTemplateId?: string;
    unitPrice?: number;
    serviceCode?: string;
    notes?: string;
  }>;
}

export interface AssignWorkOrderDto {
  inspectorId: string;
  plannedDate?: string;
  plannedTime?: string;
  notes?: string;
}

@Injectable()
export class WorkOrdersService {
  private orderCounter = 0;

  constructor(
    @InjectRepository(WorkOrder)
    private workOrderRepo: Repository<WorkOrder>,
    @InjectRepository(WorkOrderEquipment)
    private woeRepo: Repository<WorkOrderEquipment>,
    private auditService: AuditService,
    private notificationsService: NotificationsService,
    private equipmentService: EquipmentService,
    private formTemplatesService: FormTemplatesService,
    private usersService: UsersService,
    private dataSource: DataSource,
  ) {}

  private async generateWorkOrderNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.workOrderRepo.count();
    return `IS-${year}-${String(count + 1).padStart(4, '0')}`;
  }

  async create(dto: CreateWorkOrderDto, createdById: string): Promise<WorkOrder> {
    // Zorunlu alan kontrolleri
    if (!dto.customerId) {
      throw new BadRequestException('Müşteri seçimi zorunludur');
    }
    if (!dto.equipmentItems || dto.equipmentItems.length === 0) {
      throw new BadRequestException('En az bir ekipman seçilmelidir. Ekipmansız iş emri oluşturulamaz.');
    }

    // Ekipmanların seçilen müşteriye ait olduğunu doğrula
    if (dto.equipmentItems?.length > 0) {
      const eqIds = dto.equipmentItems.map(i => i.equipmentId);
      const placeholders = eqIds.map(() => '?').join(',');
      const wrongEq = await this.dataSource.query(
        `SELECT id, inventoryCode, customerId FROM equipment WHERE id IN (${placeholders}) AND customerId != ?`,
        [...eqIds, dto.customerId],
      );
      if (wrongEq.length > 0) {
        throw new BadRequestException(
          `Seçilen ${wrongEq.length} ekipman bu müşteriye ait değil: ${wrongEq.map((e: any) => e.inventoryCode).join(', ')}`,
        );
      }
    }

    let noContractRisk = false;

    // Sözleşme kontrolü
    if (dto.contractId) {
      // contractId verilmişse: aktif/imzalı olmalı
      const contractRows = await this.dataSource.query(
        `SELECT status FROM contract_documents WHERE id = ?`,
        [dto.contractId],
      );
      if (contractRows.length > 0 && !['active', 'signed'].includes(contractRows[0].status)) {
        throw new BadRequestException('Sözleşme aktif veya imzalı durumda olmalıdır');
      }

      // Sozlesme kapsam kontrolu: WO ekipman tipleri sozlesme kapsaminda mi?
      if (dto.equipmentItems?.length > 0) {
        const eqTypeRows = await this.dataSource.query(
          `SELECT DISTINCT e.equipmentTypeId, et.name as typeName
           FROM equipment e JOIN equipment_types et ON et.id = e.equipmentTypeId
           WHERE e.id IN (${dto.equipmentItems.map(() => '?').join(',')})`,
          dto.equipmentItems.map(i => i.equipmentId),
        );
        for (const et of eqTypeRows) {
          const scopeCheck = await this.dataSource.query(
            `SELECT COUNT(*) as c FROM contract_scope_items WHERE contractId = ? AND equipmentTypeId = ?`,
            [dto.contractId, et.equipmentTypeId],
          );
          if (Number(scopeCheck[0]?.c) === 0) {
            throw new BadRequestException(
              `"${et.typeName}" ekipman tipi bu sözleşmenin kapsamında değil. Sözleşme kapsamını güncelleyin veya doğru sözleşmeyi seçin.`,
            );
          }
        }
      }
    } else {
      // contractId verilmemişse: şirket ayarına bak
      const companyRows = await this.dataSource.query(
        `SELECT settings FROM companies LIMIT 1`,
      );
      const settings = companyRows?.[0]?.settings;
      const parsed = typeof settings === 'string' ? JSON.parse(settings) : settings;
      const contractRequired = parsed?.contractRequired ?? false;

      if (contractRequired) {
        throw new BadRequestException(
          'Şirket ayarlarına göre sözleşme olmadan iş emri oluşturulamaz. Önce sözleşme oluşturun ve aktif edin.',
        );
      }

      // contractRequired=false → izin ver ama riskFlag işaretle
      noContractRisk = true;

      // Audit log yaz
      await this.auditService.log({
        userId: createdById,
        action: 'WORK_ORDER_NO_CONTRACT_RISK',
        entityType: 'WorkOrder',
        description: `Sözleşmesiz iş emri oluşturuldu. Müşteri: ${dto.customerId}`,
        newValues: { customerId: dto.customerId, noContractRisk: true },
      });
    }

    const workOrderNumber = await this.generateWorkOrderNumber();

    const workOrder = this.workOrderRepo.create({
      ...dto,
      workOrderNumber,
      plannedDate: dto.plannedDate ? new Date(dto.plannedDate) : null,
      status: WorkOrderStatus.DRAFT,
      noContractRisk,
      createdById,
    });

    const saved = await this.workOrderRepo.save(workOrder);

    // Ekipman kalemlerini kaydet, form şablonunu otomatik bul
    for (const item of dto.equipmentItems) {
      let formTemplateId = item.formTemplateId;

      if (!formTemplateId) {
        const equipment = await this.equipmentService.findOne(item.equipmentId);
        try {
          const activeForm = await this.formTemplatesService.findActiveForEquipmentType(
            equipment.equipmentTypeId,
          );
          formTemplateId = activeForm.id;
        } catch {
          // Form yoksa manuel atama gerekir
        }
      }

      await this.woeRepo.save(
        this.woeRepo.create({
          ...item,
          workOrderId: saved.id,
          formTemplateId,
        }),
      );
    }

    await this.auditService.log({
      userId: createdById,
      action: 'WORK_ORDER_CREATED',
      entityType: 'WorkOrder',
      entityId: saved.id,
      newValues: { workOrderNumber, customerId: dto.customerId },
    });

    return this.findOne(saved.id);
  }

  async assign(id: string, dto: AssignWorkOrderDto, assignedById: string): Promise<WorkOrder> {
    const workOrder = await this.findOne(id);

    if (workOrder.status === WorkOrderStatus.COMPLETED ||
        workOrder.status === WorkOrderStatus.INVOICED) {
      throw new BadRequestException('Tamamlanmış veya faturalanmış iş emri yeniden atanamaz. Yeni bir iş emri oluşturun.');
    }

    // Personel yetkilendirme kontrolu: denetci bu ekipman tiplerinde yetkili mi?
    try {
      const woEquipmentTypes = await this.dataSource.query(
        `SELECT DISTINCT e.equipmentTypeId, et.name FROM work_order_equipment woe
         JOIN equipment e ON e.id = woe.equipmentId
         JOIN equipment_types et ON et.id = e.equipmentTypeId
         WHERE woe.workOrderId = ?`, [id]
      );
      for (const et of woEquipmentTypes) {
        const authCheck = await this.dataSource.query(
          `SELECT COUNT(*) as c FROM personnel_authorizations
           WHERE userId = ? AND equipmentTypeId = ? AND isActive = 1
           AND (expiresAt IS NULL OR expiresAt >= CURDATE())`,
          [dto.inspectorId, et.equipmentTypeId]
        );
        if (Number(authCheck[0]?.c) === 0) {
          throw new BadRequestException(
            `Denetçi "${et.name}" ekipman tipinde yetkili değil. Önce personel yetkilendirme kaydı oluşturun.`
          );
        }
      }
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      // personnel_authorizations tablosu yoksa veya baska hata → atla (geriye uyumluluk)
    }

    await this.workOrderRepo.update(id, {
      assignedInspectorId: dto.inspectorId,
      assignedById,
      assignedAt: new Date(),
      plannedDate: dto.plannedDate ? new Date(dto.plannedDate) : workOrder.plannedDate,
      plannedTime: dto.plannedTime || workOrder.plannedTime,
      status: WorkOrderStatus.ASSIGNED,
    });

    // Muayene elemanına bildirim — hata olursa atama islemi engellenmemeli
    try {
      const inspector = await this.usersService.findOne(dto.inspectorId);
      if (inspector?.phone || inspector?.email) {
        await this.notificationsService.notifyWorkOrderAssigned(
          inspector.email,
          inspector.phone,
          {
            workOrderNumber: workOrder.workOrderNumber,
            customerName: workOrder.customer?.name || '',
            plannedDate: dto.plannedDate ? new Date(dto.plannedDate) : workOrder.plannedDate,
          },
        );
      }
    } catch {
      // Inspector bulunamazsa veya bildirim gonderilemezse atama yine basarili olsun
    }

    await this.auditService.log({
      userId: assignedById,
      action: 'WORK_ORDER_ASSIGNED',
      entityType: 'WorkOrder',
      entityId: id,
      newValues: { inspectorId: dto.inspectorId, plannedDate: dto.plannedDate },
    });

    return this.findOne(id);
  }

  async findAll(
    filters: {
      status?: string;
      customerId?: string;
      inspectorId?: string;
      startDate?: string;
      endDate?: string;
      companyId?: string;
    },
    pagination: PaginationDto,
  ): Promise<PaginatedResult<WorkOrder>> {
    const qb = this.workOrderRepo
      .createQueryBuilder('wo')
      .leftJoinAndSelect('wo.customer', 'customer')
      .leftJoinAndSelect('wo.location', 'location')
      .leftJoinAndSelect('wo.equipmentItems', 'equipmentItems');

    if (filters.status) qb.andWhere('wo.status = :status', { status: filters.status });
    if (filters.customerId) qb.andWhere('wo.customerId = :cid', { cid: filters.customerId });
    if (filters.inspectorId) qb.andWhere('wo.assignedInspectorId = :iid', { iid: filters.inspectorId });
    if (filters.startDate) qb.andWhere('wo.plannedDate >= :start', { start: filters.startDate });
    if (filters.endDate) qb.andWhere('wo.plannedDate <= :end', { end: filters.endDate });

    // Tenant isolation: WorkOrder filtered through customer's companyId
    if (filters.companyId) {
      qb.andWhere('customer.companyId = :companyId', { companyId: filters.companyId });
    }

    qb.orderBy('wo.plannedDate', 'ASC')
      .skip(pagination.skip)
      .take(pagination.limit);

    const [data, total] = await qb.getManyAndCount();
    return new PaginatedResult(data, total, pagination.page, pagination.limit);
  }

  async findOne(id: string): Promise<WorkOrder> {
    const wo = await this.workOrderRepo.findOne({
      where: { id },
      relations: ['customer', 'location', 'equipmentItems'],
    });
    if (!wo) throw new NotFoundException('İş emri bulunamadı. Lütfen sayfayı yenileyip tekrar deneyin.');
    return wo;
  }

  // Muayene elemanının kendi işleri (offline sync için tam paket)
  async getMyWorkOrders(inspectorId: string): Promise<any[]> {
    // Get work orders with equipment items
    const workOrders = await this.workOrderRepo
      .createQueryBuilder('wo')
      .leftJoinAndSelect('wo.customer', 'customer')
      .leftJoinAndSelect('wo.location', 'location')
      .leftJoinAndSelect('wo.equipmentItems', 'items')
      .where('wo.assignedInspectorId = :inspectorId', { inspectorId })
      .andWhere('wo.status = :status', { status: WorkOrderStatus.ASSIGNED })
      .orderBy('wo.plannedDate', 'ASC')
      .getMany();

    // Batch-load all equipment and form templates in 2 queries (instead of N+1)
    const allEquipmentIds = new Set<string>();
    const allFormTemplateIds = new Set<string>();
    for (const wo of workOrders) {
      for (const item of wo.equipmentItems || []) {
        if (item.equipmentId) allEquipmentIds.add(item.equipmentId);
        if (item.formTemplateId) allFormTemplateIds.add(item.formTemplateId);
      }
    }

    const equipmentMap = new Map<string, any>();
    const formTemplateMap = new Map<string, any>();

    if (allEquipmentIds.size > 0) {
      const equipments = await this.dataSource.query(
        `SELECT e.*, et.name as typeName, et.code as typeCode, et.defaultControlPeriodMonths
         FROM equipment e LEFT JOIN equipment_types et ON e.equipmentTypeId = et.id
         WHERE e.id IN (${[...allEquipmentIds].map(() => '?').join(',')})`,
        [...allEquipmentIds],
      );
      for (const eq of equipments) equipmentMap.set(eq.id, eq);
    }

    if (allFormTemplateIds.size > 0) {
      const templates = await this.formTemplatesService.findByIds([...allFormTemplateIds]);
      for (const ft of templates) formTemplateMap.set(ft.id, ft);
    }

    // Enrich items with pre-loaded data
    return workOrders.map(wo => ({
      ...wo,
      equipmentItems: (wo.equipmentItems || []).map(item => ({
        ...item,
        equipment: equipmentMap.get(item.equipmentId) || null,
        formTemplate: formTemplateMap.get(item.formTemplateId) || null,
      })),
    }));
  }

  // Faturalanmayı bekleyenler
  async getReadyForInvoice(companyId?: string): Promise<WorkOrder[]> {
    const qb = this.workOrderRepo
      .createQueryBuilder('wo')
      .leftJoinAndSelect('wo.customer', 'customer')
      .leftJoinAndSelect('wo.equipmentItems', 'equipmentItems')
      .where('wo.status = :status', { status: WorkOrderStatus.REPORT_APPROVED });

    if (companyId) {
      qb.andWhere('customer.companyId = :companyId', { companyId });
    }

    return qb.orderBy('wo.updatedAt', 'ASC').getMany();
  }

  // ─── Work Order State Machine ─────────────────────────────────────────────
  private static readonly VALID_WO_TRANSITIONS: Record<string, string[]> = {
    [WorkOrderStatus.DRAFT]:           [WorkOrderStatus.PLANNED, WorkOrderStatus.ASSIGNED, WorkOrderStatus.CANCELLED],
    [WorkOrderStatus.PLANNED]:         [WorkOrderStatus.ASSIGNED, WorkOrderStatus.POSTPONED, WorkOrderStatus.CANCELLED],
    [WorkOrderStatus.ASSIGNED]:        [WorkOrderStatus.IN_PROGRESS, WorkOrderStatus.PLANNED, WorkOrderStatus.POSTPONED, WorkOrderStatus.CANCELLED],
    [WorkOrderStatus.IN_PROGRESS]:     [WorkOrderStatus.COMPLETED, WorkOrderStatus.POSTPONED, WorkOrderStatus.CANCELLED],
    [WorkOrderStatus.POSTPONED]:       [WorkOrderStatus.PLANNED, WorkOrderStatus.ASSIGNED, WorkOrderStatus.CANCELLED],
    [WorkOrderStatus.COMPLETED]:       [WorkOrderStatus.REPORT_PENDING],
    [WorkOrderStatus.REPORT_PENDING]:  [WorkOrderStatus.REPORT_APPROVED],
    [WorkOrderStatus.REPORT_APPROVED]: [WorkOrderStatus.INVOICED],
    [WorkOrderStatus.INVOICED]:        [],
    [WorkOrderStatus.CANCELLED]:       [],
  };

  private validateWoTransition(current: string, next: string): void {
    const allowed = WorkOrdersService.VALID_WO_TRANSITIONS[current];
    if (!allowed || !allowed.includes(next)) {
      throw new BadRequestException(
        `İş emri durumu '${current}' → '${next}' geçişi yapılamaz. İzin verilen: ${allowed?.join(', ') || 'yok'}`,
      );
    }
  }

  async updateStatus(id: string, status: WorkOrderStatus, userId: string): Promise<WorkOrder> {
    const wo = await this.findOne(id);
    const oldStatus = wo.status;

    this.validateWoTransition(oldStatus, status);

    const updates: Partial<WorkOrder> = { status };
    if (status === WorkOrderStatus.COMPLETED) {
      updates.completedAt = new Date();
    }

    await this.workOrderRepo.update(id, updates);

    await this.auditService.log({
      userId,
      action: 'WORK_ORDER_STATUS_CHANGED',
      entityType: 'WorkOrder',
      entityId: id,
      oldValues: { status: oldStatus },
      newValues: { status },
    });

    return this.findOne(id);
  }

  // ─── Offline Sync Data Bundle ─────────────────────────────────────────────
  // Bölüm 11: GET /work-orders/sync-data
  // Muayene elemanına atanmış tüm aktif iş emirleri + ilgili ekipman +
  // form şablonları tek pakette döner. Mobil cihaz bu paketi indirir.
  async getSyncData(inspectorId: string): Promise<{
    workOrders: any[];
    equipment: any[];
    formTemplates: any[];
    lastSyncAt: string;
  }> {
    // Aktif / planlanmış iş emirleri
    const workOrders = await this.workOrderRepo.find({
      where: {
        assignedInspectorId: inspectorId,
        status: WorkOrderStatus.ASSIGNED,
      } as any,
      relations: [
        'customer',
        'location',
        'equipmentItems',
      ],
      order: { plannedDate: 'ASC' },
    });

    // Collect all equipment and formTemplate IDs, then batch-load
    const allEquipmentIds = new Set<string>();
    const allFormTemplateIds = new Set<string>();

    for (const wo of workOrders) {
      for (const woe of wo.equipmentItems || []) {
        if (woe.equipmentId) allEquipmentIds.add(woe.equipmentId);
        if (woe.formTemplateId) allFormTemplateIds.add(woe.formTemplateId);
      }
    }

    const equipmentMap = new Map<string, any>();
    const formTemplateMap = new Map<string, any>();

    if (allEquipmentIds.size > 0) {
      const ids = [...allEquipmentIds];
      const placeholders = ids.map(() => '?').join(',');
      const equipments = await this.dataSource.query(
        `SELECT e.*, et.name as typeName, et.code as typeCode
         FROM equipment e LEFT JOIN equipment_types et ON e.equipmentTypeId = et.id
         WHERE e.id IN (${placeholders})`,
        ids,
      );
      for (const eq of equipments) equipmentMap.set(eq.id, eq);
    }

    if (allFormTemplateIds.size > 0) {
      const templates = await this.formTemplatesService.findByIds([...allFormTemplateIds]);
      for (const ft of templates) formTemplateMap.set(ft.id, ft);
    }

    return {
      workOrders,
      equipment: Array.from(equipmentMap.values()),
      formTemplates: Array.from(formTemplateMap.values()),
      lastSyncAt: new Date().toISOString(),
    };
  }
}

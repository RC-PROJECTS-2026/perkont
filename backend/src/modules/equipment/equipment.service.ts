import {
  Injectable, NotFoundException, ConflictException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, LessThan, LessThanOrEqual, MoreThanOrEqual, Between } from 'typeorm';
import { addMonths } from 'date-fns';
import { Equipment } from './entities/equipment.entity';
import { EquipmentType } from './entities/equipment-type.entity';
import {
  CreateEquipmentDto, UpdateEquipmentDto,
  CreateEquipmentTypeDto, EquipmentFilterDto,
} from './dto/equipment.dto';
import { PaginationDto, PaginatedResult } from '@/common/dto/pagination.dto';
import { AuditService } from '@/modules/audit/audit.service';
import { StorageService, StorageBucket } from '@/modules/storage/storage.service';
import * as qrcode from 'qrcode';

@Injectable()
export class EquipmentService {
  constructor(
    @InjectRepository(Equipment)
    private equipmentRepo: Repository<Equipment>,
    @InjectRepository(EquipmentType)
    private typeRepo: Repository<EquipmentType>,
    private auditService: AuditService,
    private storageService: StorageService,
    private dataSource: DataSource,
  ) {}

  // ─── Equipment Types ──────────────────────────────────────────────────────
  async createType(dto: CreateEquipmentTypeDto): Promise<EquipmentType> {
    const exists = await this.typeRepo.findOne({ where: { code: dto.code } });
    if (exists) throw new ConflictException(`'${dto.code}' kodlu ekipman tipi zaten mevcut`);
    const type = this.typeRepo.create(dto);
    return this.typeRepo.save(type);
  }

  async findAllTypes(): Promise<EquipmentType[]> {
    return this.typeRepo.find({ where: { isActive: true }, order: { name: 'ASC' } });
  }

  async findType(id: string): Promise<EquipmentType> {
    const type = await this.typeRepo.findOne({ where: { id } });
    if (!type) throw new NotFoundException('Ekipman tipi bulunamadı');
    return type;
  }

  // ─── Equipment CRUD ───────────────────────────────────────────────────────
  async create(dto: CreateEquipmentDto, createdById: string): Promise<Equipment> {
    // Zorunlu alan kontrolleri
    if (!dto.customerId) {
      throw new BadRequestException('Müşteri seçimi zorunludur');
    }
    if (!dto.locationId) {
      throw new BadRequestException('Lokasyon seçimi zorunludur. Her ekipman bir lokasyona bağlı olmalıdır.');
    }
    if (!dto.equipmentTypeId) {
      throw new BadRequestException('Ekipman tipi seçimi zorunludur');
    }

    // Lokasyonun müşteriye ait olduğunu doğrula
    const location = await this.dataSource.query(
      'SELECT id, customerId FROM customer_locations WHERE id = ?', [dto.locationId]
    );
    if (location.length === 0) {
      throw new BadRequestException('Seçilen lokasyon bulunamadı');
    }
    if (location[0].customerId !== dto.customerId) {
      throw new BadRequestException('Seçilen lokasyon bu müşteriye ait değil. Doğru müşteri-lokasyon eşleşmesini kontrol edin.');
    }

    const codeExists = await this.equipmentRepo.findOne({
      where: { inventoryCode: dto.inventoryCode },
    });
    if (codeExists) {
      throw new ConflictException(`'${dto.inventoryCode}' envanter kodu zaten mevcut`);
    }

    // Kontrol periyodu varsa nextControlDate hesapla
    let nextControlDate = dto.nextControlDate
      ? new Date(dto.nextControlDate)
      : null;

    if (!nextControlDate && dto.controlPeriodMonths && dto.firstUseDate) {
      nextControlDate = addMonths(new Date(dto.firstUseDate), dto.controlPeriodMonths);
    }

    const equipment = this.equipmentRepo.create({
      ...dto,
      nextControlDate,
      createdById,
    });

    const saved = await this.equipmentRepo.save(equipment);

    await this.auditService.log({
      userId: createdById,
      action: 'EQUIPMENT_CREATED',
      entityType: 'Equipment',
      entityId: saved.id,
      newValues: { inventoryCode: saved.inventoryCode, qrCode: saved.qrCode },
    });

    return this.findOne(saved.id);
  }

  async findAll(
    filters: EquipmentFilterDto,
    pagination: PaginationDto,
  ): Promise<PaginatedResult<Equipment>> {
    const qb = this.equipmentRepo
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.customer', 'customer')
      .leftJoinAndSelect('e.location', 'location')
      .leftJoinAndSelect('e.equipmentType', 'equipmentType');

    if (filters.search) {
      qb.andWhere(
        '(e.inventoryCode LIKE :s OR e.serialNumber LIKE :s OR e.brand LIKE :s OR e.model LIKE :s OR e.qrCode LIKE :s)',
        { s: `%${filters.search}%` },
      );
    }
    if (filters.customerId)
      qb.andWhere('e.customerId = :cid', { cid: filters.customerId });
    if (filters.locationId)
      qb.andWhere('e.locationId = :lid', { lid: filters.locationId });
    if (filters.equipmentTypeId)
      qb.andWhere('e.equipmentTypeId = :etid', { etid: filters.equipmentTypeId });
    if (filters.status)
      qb.andWhere('e.status = :status', { status: filters.status });
    if (filters.nextControlBefore)
      qb.andWhere('e.nextControlDate <= :before', { before: filters.nextControlBefore });
    if (filters.nextControlAfter)
      qb.andWhere('e.nextControlDate >= :after', { after: filters.nextControlAfter });

    // Tenant isolation: Equipment filtered through customer's companyId
    if (filters.companyId) {
      qb.andWhere('customer.companyId = :companyId', { companyId: filters.companyId });
    }

    qb.orderBy(`e.${pagination.sortBy || 'createdAt'}`, pagination.sortOrder)
      .skip(pagination.skip)
      .take(pagination.limit);

    const [data, total] = await qb.getManyAndCount();
    return new PaginatedResult(data, total, pagination.page, pagination.limit);
  }

  async findOne(id: string): Promise<Equipment> {
    const eq = await this.equipmentRepo.findOne({
      where: { id },
      relations: ['customer', 'location', 'equipmentType'],
    });
    if (!eq) throw new NotFoundException('Ekipman bulunamadı');
    return eq;
  }

  async findByQrCode(qrCode: string): Promise<Equipment> {
    const eq = await this.equipmentRepo.findOne({
      where: { qrCode },
      relations: ['customer', 'location', 'equipmentType'],
    });
    if (!eq) throw new NotFoundException(`QR kodu '${qrCode}' olan ekipman bulunamadı`);
    return eq;
  }

  async update(id: string, dto: UpdateEquipmentDto, userId: string): Promise<Equipment> {
    const equipment = await this.findOne(id);
    const oldValues = {
      status: equipment.status,
      nextControlDate: equipment.nextControlDate,
      locationId: equipment.locationId,
    };

    // Ekipman pasif/hurda yapiliyorsa acik denetim/WO kontrolu
    if (dto.status && ['passive', 'scrapped'].includes(dto.status) && dto.status !== equipment.status) {
      const openWork = await this.dataSource.query(`
        SELECT
          (SELECT COUNT(*) FROM inspections WHERE equipmentId = ? AND status IN ('in_progress','submitted','under_review')) as openInspections,
          (SELECT COUNT(*) FROM work_order_equipment woe JOIN work_orders wo ON wo.id = woe.workOrderId WHERE woe.equipmentId = ? AND wo.status NOT IN ('cancelled','invoiced','completed')) as openWOs
      `, [id, id]);
      const issues: string[] = [];
      if (Number(openWork[0]?.openInspections) > 0) issues.push(`${openWork[0].openInspections} açık denetim`);
      if (Number(openWork[0]?.openWOs) > 0) issues.push(`${openWork[0].openWOs} açık iş emri`);
      if (issues.length > 0) {
        throw new BadRequestException(`Ekipman ${dto.status} yapılamaz: ${issues.join(', ')} mevcut.`);
      }
    }

    Object.assign(equipment, dto);
    await this.equipmentRepo.save(equipment);

    await this.auditService.log({
      userId,
      action: 'EQUIPMENT_UPDATED',
      entityType: 'Equipment',
      entityId: id,
      oldValues,
      newValues: { status: equipment.status, nextControlDate: equipment.nextControlDate },
    });

    return this.findOne(id);
  }

  // ─── Kontrol tarihi güncellemesi (denetim tamamlandığında çağrılır) ───────
  async updateAfterInspection(
    id: string,
    inspectionDate: Date,
    result: string,
  ): Promise<void> {
    const equipment = await this.findOne(id);
    const nextDate = addMonths(inspectionDate, equipment.controlPeriodMonths || 12);

    await this.equipmentRepo.update(id, {
      lastControlDate: inspectionDate,
      nextControlDate: nextDate,
    });
  }

  // ─── Yaklaşan kontroller ──────────────────────────────────────────────────
  async getDueControls(daysAhead = 30, companyId?: string): Promise<Equipment[]> {
    const futureDate = addMonths(new Date(), Math.ceil(daysAhead / 30));
    const qb = this.equipmentRepo
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.customer', 'customer')
      .leftJoinAndSelect('e.location', 'location')
      .leftJoinAndSelect('e.equipmentType', 'equipmentType')
      .where('e.nextControlDate <= :future', { future: futureDate })
      .andWhere("e.status = 'active'");

    if (companyId) {
      qb.andWhere('customer.companyId = :companyId', { companyId });
    }

    return qb.orderBy('e.nextControlDate', 'ASC').getMany();
  }

  async getOverdueControls(companyId?: string): Promise<Equipment[]> {
    const qb = this.equipmentRepo
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.customer', 'customer')
      .leftJoinAndSelect('e.location', 'location')
      .leftJoinAndSelect('e.equipmentType', 'equipmentType')
      .where('e.nextControlDate < :now', { now: new Date() })
      .andWhere("e.status = 'active'");

    if (companyId) {
      qb.andWhere('customer.companyId = :companyId', { companyId });
    }

    return qb.orderBy('e.nextControlDate', 'ASC').getMany();
  }

  // ─── QR Etiket Üretimi ────────────────────────────────────────────────────
  async generateQrLabel(id: string): Promise<Buffer> {
    const equipment = await this.findOne(id);
    const qrData = JSON.stringify({
      id: equipment.id,
      qrCode: equipment.qrCode,
      inventoryCode: equipment.inventoryCode,
      type: equipment.equipmentType?.name,
    });
    return qrcode.toBuffer(qrData, { type: 'png', width: 300 });
  }

  // ─── Toplu ekipman yükleme (Excel import) ────────────────────────────────
  async bulkCreate(
    items: CreateEquipmentDto[],
    createdById: string,
  ): Promise<{ success: number; failed: number; errors: string[] }> {
    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const item of items) {
      try {
        await this.create(item, createdById);
        success++;
      } catch (err) {
        failed++;
        errors.push(`${item.inventoryCode}: ${err.message}`);
      }
    }

    return { success, failed, errors };
  }
}

import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike, FindOptionsWhere } from 'typeorm';
import { Customer } from './entities/customer.entity';
import { CustomerLocation } from './entities/customer-location.entity';
import {
  CreateCustomerDto,
  UpdateCustomerDto,
  CreateCustomerLocationDto,
  UpdateCustomerLocationDto,
  CustomerFilterDto,
} from './dto/customer.dto';
import { PaginationDto, PaginatedResult } from '@/common/dto/pagination.dto';
import { AuditService } from '@/modules/audit/audit.service';

@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(Customer)
    private customerRepo: Repository<Customer>,
    @InjectRepository(CustomerLocation)
    private locationRepo: Repository<CustomerLocation>,
    private auditService: AuditService,
  ) {}

  // ─── Müşteri CRUD ─────────────────────────────────────────────────────────
  async create(dto: CreateCustomerDto, createdById: string): Promise<Customer> {
    const existing = await this.customerRepo.findOne({
      where: { code: dto.code },
    });
    if (existing) {
      throw new ConflictException(`'${dto.code}' kodlu müşteri zaten mevcut`);
    }

    if (dto.taxNumber) {
      const taxExists = await this.customerRepo.findOne({
        where: { taxNumber: dto.taxNumber },
      });
      if (taxExists) {
        throw new ConflictException('Bu vergi numarası zaten kayıtlı');
      }
    }

    const { locations, ...customerData } = dto;
    const customer = this.customerRepo.create({ ...customerData, createdById });
    const saved = await this.customerRepo.save(customer);

    // Lokasyonları varsa oluştur
    if (locations && locations.length > 0) {
      const locs = locations.map((l) =>
        this.locationRepo.create({ ...l, customerId: saved.id }),
      );
      await this.locationRepo.save(locs);
    }

    await this.auditService.log({
      userId: createdById,
      action: 'CUSTOMER_CREATED',
      entityType: 'Customer',
      entityId: saved.id,
      newValues: { code: saved.code, name: saved.name },
    });

    return this.findOne(saved.id);
  }

  async findAll(
    filters: CustomerFilterDto,
    pagination: PaginationDto,
  ): Promise<PaginatedResult<Customer>> {
    const qb = this.customerRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.locations', 'locations', 'locations.isActive = true');

    if (filters.search) {
      qb.andWhere(
        '(c.name LIKE :search OR c.code LIKE :search OR c.taxNumber LIKE :search OR c.contactName LIKE :search)',
        { search: `%${filters.search}%` },
      );
    }
    if (filters.city) qb.andWhere('c.city = :city', { city: filters.city });
    if (filters.sector) qb.andWhere('c.sector = :sector', { sector: filters.sector });
    if (filters.isActive !== undefined)
      qb.andWhere('c.isActive = :isActive', { isActive: filters.isActive });
    if (filters.assignedSalesRepId)
      qb.andWhere('c.assignedSalesRepId = :salesRep', {
        salesRep: filters.assignedSalesRepId,
      });

    // Tenant isolation
    const companyId = filters.companyId;
    if (companyId) {
      qb.andWhere('c.companyId = :companyId', { companyId });
    }

    const sortField = pagination.sortBy || 'createdAt';
    qb.orderBy(`c.${sortField}`, pagination.sortOrder)
      .skip(pagination.skip)
      .take(pagination.limit);

    const [data, total] = await qb.getManyAndCount();
    return new PaginatedResult(data, total, pagination.page, pagination.limit);
  }

  async findOne(id: string): Promise<Customer> {
    const customer = await this.customerRepo.findOne({
      where: { id },
      relations: ['locations'],
    });
    if (!customer) throw new NotFoundException('Müşteri bulunamadı');
    return customer;
  }

  async findByCode(code: string): Promise<Customer> {
    const customer = await this.customerRepo.findOne({ where: { code } });
    if (!customer) throw new NotFoundException(`'${code}' kodlu müşteri bulunamadı`);
    return customer;
  }

  async update(
    id: string,
    dto: UpdateCustomerDto,
    updatedById: string,
  ): Promise<Customer> {
    const customer = await this.findOne(id);
    const oldValues = { ...customer };

    if (dto.code && dto.code !== customer.code) {
      const exists = await this.customerRepo.findOne({ where: { code: dto.code } });
      if (exists) throw new ConflictException(`'${dto.code}' kodlu müşteri zaten mevcut`);
    }

    Object.assign(customer, dto);
    await this.customerRepo.save(customer);

    await this.auditService.log({
      userId: updatedById,
      action: 'CUSTOMER_UPDATED',
      entityType: 'Customer',
      entityId: id,
      oldValues: { name: oldValues.name, code: oldValues.code },
      newValues: { name: customer.name, code: customer.code },
    });

    return this.findOne(id);
  }

  async deactivate(id: string, userId: string): Promise<void> {
    const customer = await this.findOne(id);

    // Cascading kontrol: acik sozlesme, WO veya denetim varsa engelle
    const blocks = await this.customerRepo.manager.query(`
      SELECT
        (SELECT COUNT(*) FROM contract_documents WHERE customerId = ? AND status IN ('active','signed')) as activeContracts,
        (SELECT COUNT(*) FROM work_orders WHERE customerId = ? AND status NOT IN ('cancelled','invoiced')) as openWorkOrders,
        (SELECT COUNT(*) FROM inspections i JOIN equipment e ON e.id = i.equipmentId WHERE e.customerId = ? AND i.status IN ('in_progress','submitted','under_review')) as openInspections
    `, [id, id, id]);

    const b = blocks[0];
    const issues: string[] = [];
    if (Number(b.activeContracts) > 0) issues.push(`${b.activeContracts} aktif sözleşme`);
    if (Number(b.openWorkOrders) > 0) issues.push(`${b.openWorkOrders} açık iş emri`);
    if (Number(b.openInspections) > 0) issues.push(`${b.openInspections} devam eden denetim`);

    if (issues.length > 0) {
      throw new BadRequestException(`Müşteri pasife alınamaz: ${issues.join(', ')} mevcut. Önce bunları kapatın.`);
    }

    await this.customerRepo.update(id, { isActive: false });
    await this.auditService.log({
      userId,
      action: 'CUSTOMER_DEACTIVATED',
      entityType: 'Customer',
      entityId: id,
      newValues: { name: customer.name },
    });
  }

  // ─── Lokasyon CRUD ────────────────────────────────────────────────────────
  async createLocation(
    customerId: string,
    dto: CreateCustomerLocationDto,
  ): Promise<CustomerLocation> {
    await this.findOne(customerId); // müşteri var mı kontrol
    const location = this.locationRepo.create({ ...dto, customerId });
    return this.locationRepo.save(location);
  }

  async findLocations(customerId: string): Promise<CustomerLocation[]> {
    return this.locationRepo.find({
      where: { customerId, isActive: true },
      order: { name: 'ASC' },
    });
  }

  async findLocation(id: string): Promise<CustomerLocation> {
    const loc = await this.locationRepo.findOne({ where: { id } });
    if (!loc) throw new NotFoundException('Lokasyon bulunamadı');
    return loc;
  }

  async updateLocation(
    id: string,
    dto: UpdateCustomerLocationDto,
  ): Promise<CustomerLocation> {
    const location = await this.findLocation(id);
    Object.assign(location, dto);
    return this.locationRepo.save(location);
  }

  // ─── İstatistik ───────────────────────────────────────────────────────────
  async getCustomerStats(customerId: string) {
    await this.findOne(customerId);
    const locationCount = await this.locationRepo.count({
      where: { customerId, isActive: true },
    });
    return { customerId, locationCount };
  }

  async getTopCustomers(limit = 10) {
    return this.customerRepo
      .createQueryBuilder('c')
      .select(['c.id', 'c.name', 'c.code'])
      .where('c.isActive = true')
      .orderBy('c.name', 'ASC')
      .take(limit)
      .getMany();
  }
}

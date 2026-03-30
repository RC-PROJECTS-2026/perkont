import { Entity, Column, Index, Repository } from 'typeorm';
import { AbstractEntity } from '@/common/entities/abstract.entity';
import {
  Injectable, NotFoundException, Controller, Get, Post, Put, Patch,
  Body, Param, Query, UseGuards, Module,
} from '@nestjs/common';
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

// ─── Entity: PriceList ──────────────────────────────────────────────────────────
@Entity('price_lists')
@Index(['equipmentTypeId', 'isActive'])
@Index(['customerId', 'equipmentTypeId', 'isActive'])
export class PriceList extends AbstractEntity {
  @Column({ type: 'varchar', length: 36 }) equipmentTypeId: string;
  @Column({ type: 'varchar', length: 36, nullable: true }) customerId: string;
  @Column({ type: 'varchar', length: 255 }) name: string;
  @Column({ type: 'decimal', precision: 10, scale: 2 }) basePrice: number;
  @Column({ type: 'varchar', length: 10, default: 'TRY' }) currency: string;
  @Column({ type: 'date' }) validFrom: Date;
  @Column({ type: 'date', nullable: true }) validUntil: Date;
  @Column({ type: 'json', nullable: true }) discountTiers: Array<{ minQuantity: number; discountRate: number }>;
  @Column({ type: 'tinyint', default: 1, transformer: { to: (v: boolean) => (v ? 1 : 0), from: (v: number) => !!v } })
  isActive: boolean;
  @Column({ type: 'text', nullable: true }) notes: string;
  @Column({ type: 'varchar', length: 36 }) createdById: string;
}

// ─── Service: PricingService ────────────────────────────────────────────────────
@Injectable()
export class PricingService {
  constructor(
    @InjectRepository(PriceList) private repo: Repository<PriceList>,
    private auditService: AuditService,
  ) {}

  async create(data: Partial<PriceList>, userId: string): Promise<PriceList> {
    const entity = this.repo.create({ ...data, createdById: userId });
    const saved = await this.repo.save(entity);
    await this.auditService.log({
      userId, action: 'CREATE', entityType: 'price_list', entityId: saved.id,
      newValues: data, description: `Fiyat listesi oluşturuldu: ${saved.name}`,
    });
    return saved;
  }

  async findAll(
    filters: { equipmentTypeId?: string; isActive?: string; search?: string; customerId?: string },
    pagination: PaginationDto,
  ): Promise<PaginatedResult<PriceList>> {
    const qb = this.repo.createQueryBuilder('p');

    if (filters.equipmentTypeId) {
      qb.andWhere('p.equipmentTypeId = :eid', { eid: filters.equipmentTypeId });
    }
    if (filters.isActive !== undefined) {
      qb.andWhere('p.isActive = :active', { active: filters.isActive === 'true' ? 1 : 0 });
    }
    if (filters.search) {
      qb.andWhere('p.name LIKE :s', { s: `%${filters.search}%` });
    }
    if (filters.customerId) {
      qb.andWhere('p.customerId = :cid', { cid: filters.customerId });
    }

    qb.orderBy('p.createdAt', 'DESC')
      .skip(pagination.skip)
      .take(pagination.limit);

    const [data, total] = await qb.getManyAndCount();
    return new PaginatedResult(data, total, pagination.page, pagination.limit);
  }

  async findOne(id: string): Promise<PriceList> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('Fiyat listesi bulunamadı');
    return entity;
  }

  async update(id: string, data: Partial<PriceList>, userId: string): Promise<PriceList> {
    const existing = await this.findOne(id);
    const oldValues = { ...existing };
    Object.assign(existing, data);
    const saved = await this.repo.save(existing);
    await this.auditService.log({
      userId, action: 'UPDATE', entityType: 'price_list', entityId: id,
      oldValues, newValues: data, description: `Fiyat listesi güncellendi: ${saved.name}`,
    });
    return saved;
  }

  async getForEquipmentType(equipmentTypeId: string): Promise<PriceList> {
    const now = new Date().toISOString().slice(0, 10);
    const entity = await this.repo.createQueryBuilder('p')
      .where('p.equipmentTypeId = :eid', { eid: equipmentTypeId })
      .andWhere('p.isActive = 1')
      .andWhere('p.customerId IS NULL')
      .andWhere('p.validFrom <= :now', { now })
      .andWhere('(p.validUntil IS NULL OR p.validUntil >= :now)', { now })
      .orderBy('p.validFrom', 'DESC')
      .getOne();
    if (!entity) throw new NotFoundException('Aktif fiyat bulunamadı');
    return entity;
  }

  async getForCustomerAndType(customerId: string, equipmentTypeId: string): Promise<PriceList> {
    const now = new Date().toISOString().slice(0, 10);

    // First check customer-specific price
    const customerPrice = await this.repo.createQueryBuilder('p')
      .where('p.equipmentTypeId = :eid', { eid: equipmentTypeId })
      .andWhere('p.customerId = :cid', { cid: customerId })
      .andWhere('p.isActive = 1')
      .andWhere('p.validFrom <= :now', { now })
      .andWhere('(p.validUntil IS NULL OR p.validUntil >= :now)', { now })
      .orderBy('p.validFrom', 'DESC')
      .getOne();

    if (customerPrice) return customerPrice;

    // Fall back to general price
    return this.getForEquipmentType(equipmentTypeId);
  }

  async calculatePrice(equipmentTypeId: string, quantity: number, customerId?: string): Promise<{
    basePrice: number; discountRate: number; discountAmount: number;
    unitPrice: number; totalPrice: number; currency: string;
  }> {
    const priceList = customerId
      ? await this.getForCustomerAndType(customerId, equipmentTypeId)
      : await this.getForEquipmentType(equipmentTypeId);
    const base = Number(priceList.basePrice);
    let discountRate = 0;

    if (priceList.discountTiers && priceList.discountTiers.length > 0) {
      const sorted = [...priceList.discountTiers].sort((a, b) => b.minQuantity - a.minQuantity);
      for (const tier of sorted) {
        if (quantity >= tier.minQuantity) {
          discountRate = tier.discountRate;
          break;
        }
      }
    }

    const discountAmount = base * (discountRate / 100);
    const unitPrice = base - discountAmount;
    const totalPrice = unitPrice * quantity;

    return {
      basePrice: base, discountRate, discountAmount,
      unitPrice, totalPrice, currency: priceList.currency,
    };
  }

  async deactivate(id: string, userId: string): Promise<PriceList> {
    const entity = await this.findOne(id);
    entity.isActive = false;
    const saved = await this.repo.save(entity);
    await this.auditService.log({
      userId, action: 'DEACTIVATE', entityType: 'price_list', entityId: id,
      description: `Fiyat listesi deaktive edildi: ${saved.name}`,
    });
    return saved;
  }
}

// ─── Controller: PricingController ──────────────────────────────────────────────
@ApiTags('pricing') @ApiBearerAuth('JWT') @UseGuards(AuthGuard('jwt'), RolesGuard) @Controller('pricing')
export class PricingController {
  constructor(private service: PricingService) {}

  @Post() @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.FINANCE)
  create(@Body() body: any, @CurrentUser('id') uid: string) {
    return this.service.create(body, uid);
  }

  @Get() @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.FINANCE, UserRole.EXECUTIVE)
  findAll(
    @Query('equipmentTypeId') equipmentTypeId?: string,
    @Query('isActive') isActive?: string,
    @Query('search') search?: string,
    @Query('customerId') customerId?: string,
    @Query() pagination?: PaginationDto,
  ) {
    return this.service.findAll({ equipmentTypeId, isActive, search, customerId }, pagination);
  }

  @Get('customer/:customerId/equipment-type/:equipmentTypeId')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.FINANCE, UserRole.EXECUTIVE)
  getForCustomerAndType(
    @Param('customerId') customerId: string,
    @Param('equipmentTypeId') equipmentTypeId: string,
  ) {
    return this.service.getForCustomerAndType(customerId, equipmentTypeId);
  }

  @Get('equipment-type/:equipmentTypeId') @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.FINANCE, UserRole.EXECUTIVE)
  getForEquipmentType(@Param('equipmentTypeId') equipmentTypeId: string) {
    return this.service.getForEquipmentType(equipmentTypeId);
  }

  @Get(':id') @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.FINANCE, UserRole.EXECUTIVE)
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Put(':id') @Roles(UserRole.ADMIN, UserRole.FINANCE)
  update(@Param('id') id: string, @Body() body: any, @CurrentUser('id') uid: string) {
    return this.service.update(id, body, uid);
  }

  @Patch(':id/deactivate') @Roles(UserRole.ADMIN)
  deactivate(@Param('id') id: string, @CurrentUser('id') uid: string) {
    return this.service.deactivate(id, uid);
  }

  @Post('calculate') @Roles(UserRole.ADMIN, UserRole.SALES)
  calculatePrice(@Body() body: { equipmentTypeId: string; quantity: number; customerId?: string }) {
    return this.service.calculatePrice(body.equipmentTypeId, body.quantity, body.customerId);
  }
}

// ─── Module ─────────────────────────────────────────────────────────────────────
@Module({
  imports: [TypeOrmModule.forFeature([PriceList]), AuditModule],
  providers: [PricingService],
  controllers: [PricingController],
  exports: [PricingService],
})
export class PricingModule {}

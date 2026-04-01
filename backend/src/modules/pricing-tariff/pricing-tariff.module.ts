/**
 * K2: Fiyat Tarifesi Modulu
 * Ekipman tipi bazli birim fiyat tanimi → teklif + fatura hesaplama
 */
import { Entity, Column, Index, Repository } from 'typeorm';
import { AbstractEntity } from '@/common/entities/abstract.entity';
import {
  Injectable, NotFoundException,
  Controller, Get, Post, Put, Body, Param, Query, UseGuards, Module,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '@/common/decorators/roles.decorator';
import { RolesGuard } from '@/common/guards/roles.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { UserRole } from '@/common/enums/user-role.enum';

@Entity('pricing_tariffs')
@Index(['equipmentTypeId', 'isActive'])
export class PricingTariff extends AbstractEntity {
  @Column({ type: 'varchar', length: 36 }) equipmentTypeId: string;
  @Column({ type: 'varchar', length: 255 }) name: string;
  @Column({ type: 'decimal', precision: 12, scale: 2 }) basePrice: number;
  @Column({ type: 'varchar', length: 10, default: 'TRY' }) currency: string;
  @Column({ type: 'date' }) validFrom: Date;
  @Column({ type: 'date', nullable: true }) validUntil: Date;
  @Column({ type: 'tinyint', default: 1 }) isActive: boolean;
  @Column({ type: 'text', nullable: true }) notes: string;
  @Column({ type: 'varchar', length: 36, nullable: true }) createdById: string;
}

@Injectable()
export class PricingTariffService {
  constructor(@InjectRepository(PricingTariff) private repo: Repository<PricingTariff>) {}

  async findAll(equipmentTypeId?: string): Promise<PricingTariff[]> {
    const qb = this.repo.createQueryBuilder('t');
    if (equipmentTypeId) qb.where('t.equipmentTypeId = :eid', { eid: equipmentTypeId });
    return qb.orderBy('t.validFrom', 'DESC').getMany();
  }

  async getActivePrice(equipmentTypeId: string): Promise<number> {
    const tariff = await this.repo.findOne({
      where: { equipmentTypeId, isActive: true as any },
      order: { validFrom: 'DESC' },
    });
    return tariff?.basePrice || 0;
  }

  async create(data: Partial<PricingTariff>, userId: string): Promise<PricingTariff> {
    return this.repo.save(this.repo.create({ ...data, createdById: userId }));
  }

  async update(id: string, data: Partial<PricingTariff>): Promise<PricingTariff> {
    await this.repo.update(id, data);
    return this.repo.findOne({ where: { id } });
  }
}

@ApiTags('pricing-tariffs')
@ApiBearerAuth('JWT')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('pricing-tariffs')
export class PricingTariffController {
  constructor(private service: PricingTariffService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.FINANCE)
  findAll(@Query('equipmentTypeId') eid?: string) { return this.service.findAll(eid); }

  @Get('price/:equipmentTypeId')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.FINANCE)
  getPrice(@Param('equipmentTypeId') eid: string) { return this.service.getActivePrice(eid).then(p => ({ price: p })); }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.FINANCE)
  create(@Body() body: any, @CurrentUser('id') userId: string) { return this.service.create(body, userId); }

  @Put(':id')
  @Roles(UserRole.ADMIN, UserRole.FINANCE)
  update(@Param('id') id: string, @Body() body: any) { return this.service.update(id, body); }
}

@Module({
  imports: [TypeOrmModule.forFeature([PricingTariff])],
  providers: [PricingTariffService],
  controllers: [PricingTariffController],
  exports: [PricingTariffService],
})
export class PricingTariffModule {}

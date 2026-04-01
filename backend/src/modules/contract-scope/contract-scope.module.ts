/**
 * K1: Sozlesme Kapsam Modulu
 * Sozlesme ↔ ekipman tipi ↔ lokasyon eslesmesi
 * Hangi sozlesme hangi lokasyondaki hangi tip ekipmanlari kapsar + birim fiyat
 */
import { Entity, Column, Index, Repository } from 'typeorm';
import { AbstractEntity } from '@/common/entities/abstract.entity';
import {
  Injectable, NotFoundException, BadRequestException,
  Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Module,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '@/common/decorators/roles.decorator';
import { RolesGuard } from '@/common/guards/roles.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { UserRole } from '@/common/enums/user-role.enum';
import { AuditModule } from '@/modules/audit/audit.module';
import { AuditService } from '@/modules/audit/audit.service';

// ─── Entity ────────────────────────────────────────────────────────────────────

@Entity('contract_scope_items')
@Index(['contractId', 'equipmentTypeId'])
export class ContractScopeItem extends AbstractEntity {
  @Column({ type: 'varchar', length: 36 }) contractId: string;
  @Column({ type: 'varchar', length: 36 }) equipmentTypeId: string;
  @Column({ type: 'varchar', length: 36, nullable: true }) locationId: string;
  @Column({ type: 'int', default: 0 }) equipmentCount: number;
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 }) unitPrice: number;
  @Column({ type: 'varchar', length: 10, default: 'TRY' }) currency: string;
  @Column({ type: 'int', nullable: true }) controlPeriodMonths: number;
  @Column({ type: 'text', nullable: true }) notes: string;
}

// ─── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class ContractScopeService {
  constructor(
    @InjectRepository(ContractScopeItem) private repo: Repository<ContractScopeItem>,
    private auditService: AuditService,
  ) {}

  async findByContract(contractId: string): Promise<ContractScopeItem[]> {
    return this.repo.find({ where: { contractId }, order: { createdAt: 'ASC' } });
  }

  async addItem(contractId: string, data: Partial<ContractScopeItem>, userId: string): Promise<ContractScopeItem> {
    if (!data.equipmentTypeId) throw new BadRequestException('Ekipman tipi zorunludur');
    const item = this.repo.create({ ...data, contractId });
    const saved = await this.repo.save(item);
    await this.auditService.log({ userId, action: 'CONTRACT_SCOPE_ADDED', entityType: 'ContractScopeItem', entityId: saved.id, newValues: { contractId, equipmentTypeId: data.equipmentTypeId } });
    return saved;
  }

  async updateItem(id: string, data: Partial<ContractScopeItem>, userId: string): Promise<ContractScopeItem> {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Kapsam kalemi bulunamadı');
    await this.repo.update(id, data);
    await this.auditService.log({ userId, action: 'CONTRACT_SCOPE_UPDATED', entityType: 'ContractScopeItem', entityId: id });
    return this.repo.findOne({ where: { id } });
  }

  async removeItem(id: string, userId: string): Promise<void> {
    await this.repo.delete(id);
    await this.auditService.log({ userId, action: 'CONTRACT_SCOPE_REMOVED', entityType: 'ContractScopeItem', entityId: id });
  }

  async getUnitPrice(contractId: string, equipmentTypeId: string, locationId?: string): Promise<number> {
    const item = await this.repo.findOne({
      where: { contractId, equipmentTypeId, ...(locationId ? { locationId } : {}) },
    });
    return item?.unitPrice || 0;
  }

  async getTotalValue(contractId: string): Promise<number> {
    const items = await this.findByContract(contractId);
    return items.reduce((sum, i) => sum + (i.equipmentCount * i.unitPrice), 0);
  }

  async isEquipmentInScope(contractId: string, equipmentTypeId: string): Promise<boolean> {
    const count = await this.repo.count({ where: { contractId, equipmentTypeId } });
    return count > 0;
  }
}

// ─── Controller ────────────────────────────────────────────────────────────────

@ApiTags('contract-scope')
@ApiBearerAuth('JWT')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('contracts/:contractId/scope')
export class ContractScopeController {
  constructor(private service: ContractScopeService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.FINANCE, UserRole.EXECUTIVE)
  findAll(@Param('contractId') contractId: string) {
    return this.service.findByContract(contractId);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.SALES)
  add(@Param('contractId') contractId: string, @Body() body: any, @CurrentUser('id') userId: string) {
    return this.service.addItem(contractId, body, userId);
  }

  @Put(':id')
  @Roles(UserRole.ADMIN, UserRole.SALES)
  update(@Param('id') id: string, @Body() body: any, @CurrentUser('id') userId: string) {
    return this.service.updateItem(id, body, userId);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.SALES)
  remove(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.removeItem(id, userId);
  }

  @Get('total')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.FINANCE)
  getTotal(@Param('contractId') contractId: string) {
    return this.service.getTotalValue(contractId).then(total => ({ total }));
  }
}

// ─── Module ────────────────────────────────────────────────────────────────────

@Module({
  imports: [TypeOrmModule.forFeature([ContractScopeItem]), AuditModule],
  providers: [ContractScopeService],
  controllers: [ContractScopeController],
  exports: [ContractScopeService],
})
export class ContractScopeModule {}

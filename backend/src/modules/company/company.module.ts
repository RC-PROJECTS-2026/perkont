// Bölüm 1 — Şirket/Tenant katmanı (multi-tenant ready)
// Şirket ayarları, akreditasyon kapsamı ve firma bilgilerini yönetir.

import {
  Controller, Get, Post, Put, Patch, Body, Param,
  UseGuards, Module,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Injectable, NotFoundException } from '@nestjs/common';

import { Roles }      from '@/common/decorators/roles.decorator';
import { RolesGuard } from '@/common/guards/roles.guard';
import { UserRole }   from '@/common/enums/user-role.enum';
import { Company }    from './entities/company.entity';

// ─── Service ─────────────────────────────────────────────────────────────────
@Injectable()
export class CompanyService {
  constructor(
    @InjectRepository(Company) private companyRepo: Repository<Company>,
  ) {}

  async findAll(): Promise<Company[]> {
    return this.companyRepo.find({ order: { createdAt: 'DESC' } });
  }

  async findOne(id: string): Promise<Company> {
    const company = await this.companyRepo.findOne({ where: { id } });
    if (!company) throw new NotFoundException('Şirket bulunamadı');
    return company;
  }

  async create(dto: Partial<Company>): Promise<Company> {
    const company = this.companyRepo.create(dto);
    return this.companyRepo.save(company);
  }

  async update(id: string, dto: Partial<Company>): Promise<Company> {
    await this.findOne(id); // 404 kontrolü
    await this.companyRepo.update(id, dto);
    return this.findOne(id);
  }

  async updateSettings(id: string, settings: Record<string, any>): Promise<Company> {
    const company = await this.findOne(id);
    await this.companyRepo.update(id, {
      settings: { ...(company.settings || {}), ...settings },
    });
    return this.findOne(id);
  }

  async updateAccreditationScope(id: string, scope: any): Promise<Company> {
    await this.findOne(id);
    await this.companyRepo.update(id, { accreditationScope: scope });
    return this.findOne(id);
  }

  async deactivate(id: string): Promise<void> {
    await this.findOne(id);
    await this.companyRepo.update(id, { isActive: false });
  }
}

// ─── Controller ──────────────────────────────────────────────────────────────
@ApiTags('companies')
@ApiBearerAuth('JWT')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('companies')
export class CompanyController {
  constructor(private service: CompanyService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.EXECUTIVE)
  @ApiOperation({ summary: 'Şirket listesi' })
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.EXECUTIVE, UserRole.TECHNICAL_MANAGER)
  @ApiOperation({ summary: 'Şirket detayı' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Yeni şirket oluştur' })
  create(@Body() dto: Partial<Company>) {
    return this.service.create(dto);
  }

  @Put(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Şirket güncelle' })
  update(@Param('id') id: string, @Body() dto: Partial<Company>) {
    return this.service.update(id, dto);
  }

  @Patch(':id/settings')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Şirket ayarlarını güncelle' })
  updateSettings(@Param('id') id: string, @Body() settings: Record<string, any>) {
    return this.service.updateSettings(id, settings);
  }

  @Patch(':id/accreditation-scope')
  @Roles(UserRole.ADMIN, UserRole.TECHNICAL_MANAGER)
  @ApiOperation({ summary: 'Akreditasyon kapsamını güncelle' })
  updateScope(@Param('id') id: string, @Body() scope: any) {
    return this.service.updateAccreditationScope(id, scope);
  }

  @Patch(':id/deactivate')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Şirketi pasif yap' })
  deactivate(@Param('id') id: string) {
    return this.service.deactivate(id);
  }
}

// ─── Module ──────────────────────────────────────────────────────────────────
@Module({
  imports: [TypeOrmModule.forFeature([Company])],
  providers:   [CompanyService],
  controllers: [CompanyController],
  exports:     [CompanyService],
})
export class CompanyModule {}

import {
  Controller, Get, Post, Put, Body, Param,
  Query, UseGuards, Res, Req, HttpCode, HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { Roles } from '@/common/decorators/roles.decorator';
import { RolesGuard } from '@/common/guards/roles.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { UserRole } from '@/common/enums/user-role.enum';
import { PaginationDto } from '@/common/dto/pagination.dto';
import { EquipmentService } from './equipment.service';
import { DataSource } from 'typeorm';
import { verifyTenantAccess } from '@/common/guards/tenant-verify.helper';
import {
  CreateEquipmentDto, UpdateEquipmentDto,
  CreateEquipmentTypeDto, EquipmentFilterDto,
} from './dto/equipment.dto';

@ApiTags('equipment')
@ApiBearerAuth('JWT')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('equipment')
export class EquipmentController {
  constructor(private service: EquipmentService, private dataSource: DataSource) {}

  // ─── Equipment Types ──────────────────────────────────────────────────────
  @Post('types')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Ekipman tipi oluştur' })
  createType(@Body() dto: CreateEquipmentTypeDto) {
    return this.service.createType(dto);
  }

  @Get('types')
  @ApiOperation({ summary: 'Ekipman tiplerini listele' })
  findAllTypes() {
    return this.service.findAllTypes();
  }

  // ─── Equipment ────────────────────────────────────────────────────────────
  @Post()
  @Roles(UserRole.ADMIN, UserRole.PLANNER, UserRole.CUSTOMER_REP, UserRole.SALES)
  @ApiOperation({ summary: 'Yeni ekipman tanımla' })
  create(@Body() dto: CreateEquipmentDto, @CurrentUser('id') userId: string) {
    return this.service.create(dto, userId);
  }

  @Get()
  @ApiOperation({ summary: 'Ekipman listesi' })
  findAll(@Query() filters: EquipmentFilterDto, @Query() pagination: PaginationDto, @Req() req: Request) {
    return this.service.findAll({ ...filters, companyId: (req as any).companyId }, pagination);
  }

  @Get('due-controls')
  @Roles(UserRole.ADMIN, UserRole.PLANNER, UserRole.EXECUTIVE, UserRole.TECHNICAL_MANAGER)
  @ApiOperation({ summary: 'Yaklaşan periyodik kontrol tarihleri' })
  getDueControls(@Query('days') days?: number, @Req() req?: Request) {
    return this.service.getDueControls(days || 30, (req as any)?.companyId);
  }

  @Get('overdue')
  @Roles(UserRole.ADMIN, UserRole.PLANNER, UserRole.EXECUTIVE)
  @ApiOperation({ summary: 'Süresi geçmiş kontroller' })
  getOverdueControls(@Req() req?: Request) {
    return this.service.getOverdueControls((req as any)?.companyId);
  }

  @Get('by-qr/:qrCode')
  @ApiOperation({ summary: 'QR kod ile ekipman bul (saha kullanımı)' })
  findByQrCode(@Param('qrCode') qrCode: string) {
    return this.service.findByQrCode(qrCode);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Ekipman detayı' })
  async findOne(@Param('id') id: string, @Req() req: Request) {
    await verifyTenantAccess(this.dataSource, 'equipment', id, (req as any).companyId);
    return this.service.findOne(id);
  }

  @Put(':id')
  @Roles(UserRole.ADMIN, UserRole.PLANNER, UserRole.CUSTOMER_REP)
  @ApiOperation({ summary: 'Ekipman güncelle' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateEquipmentDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.update(id, dto, userId);
  }

  @Get(':id/qr-label')
  @ApiOperation({ summary: 'QR etiket PNG indir' })
  async getQrLabel(@Param('id') id: string, @Res() res: Response) {
    const buffer = await this.service.generateQrLabel(id);
    res.set({ 'Content-Type': 'image/png', 'Content-Disposition': 'attachment; filename=qr-label.png' });
    res.send(buffer);
  }
}

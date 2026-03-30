// ─── Controller ──────────────────────────────────────────────────────────────
import {
  Controller, Get, Post, Patch, Body,
  Param, Query, UseGuards, Req,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Roles } from '@/common/decorators/roles.decorator';
import { RolesGuard } from '@/common/guards/roles.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { UserRole } from '@/common/enums/user-role.enum';
import { PaginationDto } from '@/common/dto/pagination.dto';
import { WorkOrdersService, CreateWorkOrderDto, AssignWorkOrderDto } from './work-orders.service';
import { WorkOrderStatus } from './entities/work-order.entity';
import { DataSource } from 'typeorm';
import { verifyTenantAccess } from '@/common/guards/tenant-verify.helper';

@ApiTags('work-orders')
@ApiBearerAuth('JWT')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('work-orders')
export class WorkOrdersController {
  constructor(private service: WorkOrdersService, private dataSource: DataSource) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.PLANNER)
  @ApiOperation({ summary: 'İş emri oluştur' })
  create(@Body() dto: CreateWorkOrderDto, @CurrentUser('id') userId: string) {
    return this.service.create(dto, userId);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.PLANNER, UserRole.TECHNICAL_MANAGER,
         UserRole.FINANCE, UserRole.EXECUTIVE)
  @ApiOperation({ summary: 'İş emirlerini listele' })
  findAll(
    @Query() pagination: PaginationDto,
    @Query('status') status?: string,
    @Query('customerId') customerId?: string,
    @Query('inspectorId') inspectorId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Req() req?: Request,
  ) {
    return this.service.findAll(
      { status, customerId, inspectorId, startDate, endDate, companyId: (req as any)?.companyId },
      pagination,
    );
  }

  @Get('my')
  @Roles(UserRole.INSPECTOR)
  @ApiOperation({ summary: 'Bana atanan iş emirleri (offline sync için tam paket)' })
  getMyWorkOrders(@CurrentUser('id') userId: string) {
    return this.service.getMyWorkOrders(userId);
  }

  @Get('ready-for-invoice')
  @Roles(UserRole.ADMIN, UserRole.FINANCE, UserRole.EXECUTIVE)
  @ApiOperation({ summary: 'Faturalanmayı bekleyen tamamlanmış işler' })
  getReadyForInvoice(@Req() req: any) {
    return this.service.getReadyForInvoice(req.companyId);
  }

  @Get('sync-data')
  @Roles(UserRole.INSPECTOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Offline sync için veri paketi — muayene elemanına atanmış işler + ekipman + form şablonları' })
  getSyncData(@CurrentUser('id') userId: string) {
    return this.service.getSyncData(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'İş emri detayı' })
  async findOne(@Param('id') id: string, @Req() req: any) {
    await verifyTenantAccess(this.dataSource, 'work_order', id, req.companyId);
    return this.service.findOne(id);
  }

  @Patch(':id/assign')
  @Roles(UserRole.ADMIN, UserRole.PLANNER)
  @ApiOperation({ summary: 'İş emrini muayene elemanına ata' })
  assign(
    @Param('id') id: string,
    @Body() dto: AssignWorkOrderDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.assign(id, dto, userId);
  }

  @Patch(':id/status')
  @Roles(UserRole.ADMIN, UserRole.PLANNER)
  @ApiOperation({ summary: 'İş emri durumu güncelle' })
  updateStatus(
    @Param('id') id: string,
    @Body('status') status: WorkOrderStatus,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.updateStatus(id, status, userId);
  }
}


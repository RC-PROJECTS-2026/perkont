import {
  Controller, Get, Post, Put, Patch, Delete,
  Body, Param, Query, UseGuards, HttpCode, HttpStatus, Req,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '@/common/decorators/roles.decorator';
import { RolesGuard } from '@/common/guards/roles.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { UserRole } from '@/common/enums/user-role.enum';
import { PaginationDto } from '@/common/dto/pagination.dto';
import { CustomersService } from './customers.service';
import { DataSource } from 'typeorm';
import { verifyTenantAccess } from '@/common/guards/tenant-verify.helper';
import {
  CreateCustomerDto,
  UpdateCustomerDto,
  CreateCustomerLocationDto,
  UpdateCustomerLocationDto,
  CustomerFilterDto,
} from './dto/customer.dto';

@ApiTags('customers')
@ApiBearerAuth('JWT')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('customers')
export class CustomersController {
  constructor(private service: CustomersService, private dataSource: DataSource) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.CUSTOMER_REP)
  @ApiOperation({ summary: 'Yeni müşteri oluştur' })
  create(@Body() dto: CreateCustomerDto, @CurrentUser('id') userId: string) {
    return this.service.create(dto, userId);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.PLANNER, UserRole.CUSTOMER_REP,
         UserRole.FINANCE, UserRole.TECHNICAL_MANAGER, UserRole.EXECUTIVE)
  @ApiOperation({ summary: 'Müşteri listesi' })
  findAll(@Query() filters: CustomerFilterDto, @Query() pagination: PaginationDto, @Req() req: any) {
    return this.service.findAll({ ...filters, companyId: req.companyId }, pagination);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.PLANNER, UserRole.CUSTOMER_REP,
         UserRole.FINANCE, UserRole.TECHNICAL_MANAGER, UserRole.EXECUTIVE, UserRole.INSPECTOR)
  @ApiOperation({ summary: 'Müşteri detayı' })
  async findOne(@Param('id') id: string, @Req() req: any) {
    await verifyTenantAccess(this.dataSource, 'customer', id, req.companyId);
    return this.service.findOne(id);
  }

  @Put(':id')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.CUSTOMER_REP)
  @ApiOperation({ summary: 'Müşteri güncelle' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.update(id, dto, userId);
  }

  @Patch(':id/deactivate')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Müşteriyi pasif yap' })
  deactivate(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.deactivate(id, userId);
  }

  @Get(':id/stats')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.EXECUTIVE)
  @ApiOperation({ summary: 'Müşteri istatistikleri' })
  getStats(@Param('id') id: string) {
    return this.service.getCustomerStats(id);
  }

  // ─── Lokasyon endpoint'leri ───────────────────────────────────────────────
  @Post(':id/locations')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.CUSTOMER_REP, UserRole.PLANNER)
  @ApiOperation({ summary: 'Müşteriye lokasyon ekle' })
  createLocation(
    @Param('id') customerId: string,
    @Body() dto: CreateCustomerLocationDto,
  ) {
    return this.service.createLocation(customerId, dto);
  }

  @Get(':id/locations')
  @ApiOperation({ summary: 'Müşteri lokasyonlarını getir' })
  findLocations(@Param('id') customerId: string) {
    return this.service.findLocations(customerId);
  }

  @Put('locations/:locationId')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.CUSTOMER_REP, UserRole.PLANNER)
  @ApiOperation({ summary: 'Lokasyon güncelle' })
  updateLocation(
    @Param('locationId') locationId: string,
    @Body() dto: UpdateCustomerLocationDto,
  ) {
    return this.service.updateLocation(locationId, dto);
  }
}

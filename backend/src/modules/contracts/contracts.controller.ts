import {
  Controller, Get, Post, Put, Patch, Body,
  Param, Query, UseGuards, UseInterceptors, UploadedFile, Req,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags, ApiConsumes } from '@nestjs/swagger';
import { Roles } from '@/common/decorators/roles.decorator';
import { RolesGuard } from '@/common/guards/roles.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { UserRole } from '@/common/enums/user-role.enum';
import { PaginationDto } from '@/common/dto/pagination.dto';
import { ContractsService } from './contracts.service';
import { DataSource } from 'typeorm';
import { verifyTenantAccess } from '@/common/guards/tenant-verify.helper';

@ApiTags('contracts')
@ApiBearerAuth('JWT')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('contracts')
export class ContractsController {
  constructor(private service: ContractsService, private dataSource: DataSource) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.CUSTOMER_REP)
  create(@Body() body: any, @CurrentUser('id') userId: string) {
    return this.service.create(body, userId);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.CUSTOMER_REP, UserRole.FINANCE, UserRole.EXECUTIVE)
  findAll(
    @Query() pagination: PaginationDto,
    @Query('status') status?: string,
    @Query('customerId') customerId?: string,
    @Req() req?: any,
  ) {
    return this.service.findAll({ status, customerId, companyId: req?.companyId }, pagination);
  }

  @Get('expiring')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.EXECUTIVE)
  getExpiring(@Query('days') days?: number) {
    return this.service.getExpiringContracts(days || 60);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Req() req: any) {
    await verifyTenantAccess(this.dataSource, 'contract', id, req.companyId);
    return this.service.findOne(id);
  }

  @Put(':id')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.CUSTOMER_REP)
  update(@Param('id') id: string, @Body() body: any, @CurrentUser('id') userId: string) {
    return this.service.update(id, body, userId);
  }

  @Post(':id/upload')
  @Roles(UserRole.ADMIN, UserRole.SALES)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  uploadDocument(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.uploadDocument(id, file.buffer, file.originalname, userId);
  }

  @Patch(':id/sign/:party')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.CUSTOMER_REP)
  markSigned(
    @Param('id') id: string,
    @Param('party') party: 'customer' | 'company',
    @CurrentUser('id') userId: string,
  ) {
    return this.service.markSigned(id, party, userId);
  }
}

import {
  Controller, Get, Post, Put, Patch, Body,
  Param, Query, UseGuards, Res, Req,
} from '@nestjs/common';
import { Response } from 'express';
import { DataSource } from 'typeorm';
import { verifyTenantAccess } from '@/common/guards/tenant-verify.helper';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '@/common/decorators/roles.decorator';
import { RolesGuard } from '@/common/guards/roles.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { UserRole } from '@/common/enums/user-role.enum';
import { PaginationDto } from '@/common/dto/pagination.dto';
import { QuotationsService } from './quotations.service';

@ApiTags('quotations')
@ApiBearerAuth('JWT')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('quotations')
export class QuotationsController {
  constructor(private service: QuotationsService, private dataSource: DataSource) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.CUSTOMER_REP)
  create(@Body() body: any, @CurrentUser('id') userId: string) {
    return this.service.create(body, userId);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.CUSTOMER_REP, UserRole.FINANCE, UserRole.EXECUTIVE)
  findAll(
    @Query() pagination: PaginationDto,
    @Query('status')     status?: string,
    @Query('customerId') customerId?: string,
    @Req() req?: any,
  ) {
    return this.service.findAll({ status, customerId, companyId: req?.companyId }, pagination);
  }

  @Get(':id/pdf')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.CUSTOMER_REP)
  async getPdf(@Param('id') id: string, @Res() res: Response) {
    const pdfBuffer = await this.service.generatePdf(id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="teklif-${id}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.end(pdfBuffer);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Req() req?: any) {
    await verifyTenantAccess(this.dataSource, 'quotation', id, req?.companyId);
    return this.service.findOne(id);
  }

  @Put(':id')
  @Roles(UserRole.ADMIN, UserRole.SALES)
  update(@Param('id') id: string, @Body() body: any, @CurrentUser('id') userId: string) {
    return this.service.update(id, body, userId);
  }

  @Patch(':id/send')
  @Roles(UserRole.ADMIN, UserRole.SALES)
  send(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.send(id, userId);
  }

  @Patch(':id/accept')
  @Roles(UserRole.ADMIN, UserRole.SALES, UserRole.CUSTOMER_REP)
  accept(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.accept(id, userId);
  }

  @Patch(':id/reject')
  @Roles(UserRole.ADMIN, UserRole.SALES)
  reject(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.reject(id, reason, userId);
  }
}

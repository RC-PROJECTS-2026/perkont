import {
  Controller, Get, Post, Patch, Param, Body,
  Query, UseGuards, Res, Req, StreamableFile, SetMetadata,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { SKIP_TENANT_CHECK } from '@/common/guards/tenant.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { RolesGuard } from '@/common/guards/roles.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { UserRole } from '@/common/enums/user-role.enum';
import { PaginationDto } from '@/common/dto/pagination.dto';
import { ReportsService } from './reports.service';
import { AuditService } from '@/modules/audit/audit.service';
import { DataSource } from 'typeorm';
import { verifyTenantAccess } from '@/common/guards/tenant-verify.helper';

@ApiTags('reports')
@ApiBearerAuth('JWT')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('reports')
export class ReportsController {
  constructor(
    private service: ReportsService,
    private auditService: AuditService,
    private dataSource: DataSource,
  ) {}

  @Post('from-inspection/:inspectionId')
  @Roles(UserRole.TECHNICAL_MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Onaylı denetimden rapor oluştur ve PDF üret' })
  createFromInspection(
    @Param('inspectionId') inspectionId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.createFromInspection(inspectionId, userId);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.TECHNICAL_MANAGER, UserRole.FINANCE,
         UserRole.EXECUTIVE, UserRole.CUSTOMER_REP)
  @ApiOperation({ summary: 'Rapor listesi' })
  findAll(
    @Query() pagination: PaginationDto,
    @Query('status') status?: string,
    @Query('customerId') customerId?: string,
    @Query('equipmentId') equipmentId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Req() req?: Request,
  ) {
    return this.service.findAll(
      { status, customerId, equipmentId, startDate, endDate, companyId: (req as any)?.companyId },
      pagination,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Rapor detayı' })
  async findOne(@Param('id') id: string, @Req() req: Request) {
    await verifyTenantAccess(this.dataSource, 'report', id, (req as any).companyId);
    return this.service.findOne(id);
  }

  @Get(':id/pdf')
  @ApiOperation({ summary: 'Rapor PDF indir' })
  async getPdf(
    @Param('id') id: string,
    @Query('signed') signed: string,
    @Res({ passthrough: true }) res: Response,
    @Req() request: Request,
  ) {
    await verifyTenantAccess(this.dataSource, 'report', id, (request as any).companyId);
    const buffer = await this.service.getPdfBuffer(id, signed === 'true');

    // Log the download
    await this.auditService.log({
      userId: (request as any).user?.id || 'anonymous',
      action: 'REPORT_DOWNLOADED',
      entityType: 'Report',
      entityId: id,
      newValues: { signed: signed === 'true' ? 'true' : 'false' },
      ipAddress: request.ip,
      deviceInfo: request.headers['user-agent'],
    });

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="rapor-${id}.pdf"`,
    });
    return new StreamableFile(buffer);
  }

  @Patch(':id/approve')
  @Roles(UserRole.TECHNICAL_MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Raporu onayla' })
  approve(
    @Param('id') id: string,
    @Body('comment') comment: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.approve(id, comment, userId);
  }

  @Patch(':id/request-revision')
  @Roles(UserRole.TECHNICAL_MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Revizyon iste' })
  requestRevision(
    @Param('id') id: string,
    @Body('comment') comment: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.requestRevision(id, comment, userId);
  }

  @Post(':id/sign/initiate')
  @Roles(UserRole.TECHNICAL_MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'E-imza başlat (OTP gönder)' })
  initiateSign(
    @Param('id') id: string,
    @Body('phone') phone: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.initiateSign(id, phone, userId);
  }

  @Post(':id/sign/complete')
  @Roles(UserRole.TECHNICAL_MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'E-imzayı OTP ile tamamla' })
  completeSigning(
    @Param('id') id: string,
    @Body('sessionId') sessionId: string,
    @Body('otpCode') otpCode: string,
    @Body('signerName') signerName: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.completeSigning(id, sessionId, otpCode, signerName, userId);
  }

  @Post(':id/deliver')
  @Roles(UserRole.TECHNICAL_MANAGER, UserRole.ADMIN, UserRole.CUSTOMER_REP)
  @ApiOperation({ summary: 'Raporu müşteriye teslim et' })
  deliver(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.deliver(id, userId);
  }

  // Public endpoint — auth gerektirmez
  @Get('verify/:reportNumber')
  @SetMetadata(SKIP_TENANT_CHECK, true)
  @ApiOperation({ summary: 'Rapor doğrulama (QR kodu ile)' })
  verify(@Param('reportNumber') reportNumber: string) {
    return this.service.verifyReport(reportNumber);
  }
}


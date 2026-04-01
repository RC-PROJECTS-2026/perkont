import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Injectable, Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { addDays } from 'date-fns';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { Roles } from '@/common/decorators/roles.decorator';
import { RolesGuard } from '@/common/guards/roles.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { UserRole } from '@/common/enums/user-role.enum';
import { Equipment } from '@/modules/equipment/entities/equipment.entity';
import { Report, ReportStatus } from '@/modules/reports/entities/report.entity';
import { Contract } from '@/modules/contracts/entities/contract.entity';
import { ContractsService } from '@/modules/contracts/contracts.service';
import { ContractsModule } from '@/modules/contracts/contracts.module';

@Injectable()
export class PortalService {
  constructor(
    @InjectRepository(Equipment) private equipmentRepo: Repository<Equipment>,
    @InjectRepository(Report)    private reportRepo:    Repository<Report>,
    @InjectRepository(Contract)  private contractRepo:  Repository<Contract>,
  ) {}

  async getDashboard(customerId: string) {
    const [equipment, reports] = await Promise.all([
      this.equipmentRepo.find({
        where: { customerId, status: 'active' as any },
        relations: ['equipmentType', 'location'],
      }),
      this.reportRepo.find({
        where: { customerId },
        order: { createdAt: 'DESC' },
        take: 10,
      }),
    ]);

    const overdue = equipment.filter(
      (e) => e.nextControlDate && new Date(e.nextControlDate) < new Date(),
    ).length;

    const upcoming30 = equipment.filter((e) => {
      if (!e.nextControlDate) return false;
      const d = new Date(e.nextControlDate);
      return d >= new Date() && d <= addDays(new Date(), 30);
    }).length;

    return {
      stats: {
        totalEquipment: equipment.length,
        overdueControls: overdue,
        upcomingControls30Days: upcoming30,
        totalReports: reports.length,
        deliveredReports: reports.filter(
          (r) => r.status === ReportStatus.SIGNED || r.status === ReportStatus.DELIVERED,
        ).length,
      },
      recentReports: reports.slice(0, 5),
      upcomingEquipment: equipment
        .filter((e) => {
          if (!e.nextControlDate) return false;
          return new Date(e.nextControlDate) <= addDays(new Date(), 30);
        })
        .sort((a, b) =>
          new Date(a.nextControlDate!).getTime() - new Date(b.nextControlDate!).getTime(),
        )
        .slice(0, 10),
    };
  }

  async getMyEquipment(customerId: string) {
    return this.equipmentRepo.find({
      where: { customerId },
      relations: ['equipmentType', 'location'],
      order: { nextControlDate: 'ASC' },
    });
  }

  async getMyReports(customerId: string) {
    return this.reportRepo.find({
      where: { customerId },
      order: { createdAt: 'DESC' },
    });
  }

  async getMyContracts(customerId: string) {
    return this.contractRepo.find({
      where: { customerId },
      order: { createdAt: 'DESC' },
    });
  }
}

@ApiTags('portal')
@ApiBearerAuth('JWT')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('portal')
export class PortalController {
  constructor(
    private service: PortalService,
    private contractsService: ContractsService,
  ) {}

  @Get('dashboard')
  @Roles(UserRole.CUSTOMER, UserRole.CUSTOMER_REP)
  getDashboard(@CurrentUser() user: any) {
    return this.service.getDashboard(user.customerId || user.id);
  }

  @Get('equipment')
  @Roles(UserRole.CUSTOMER, UserRole.CUSTOMER_REP)
  getMyEquipment(@CurrentUser() user: any) {
    return this.service.getMyEquipment(user.customerId || user.id);
  }

  @Get('reports')
  @Roles(UserRole.CUSTOMER, UserRole.CUSTOMER_REP)
  getMyReports(@CurrentUser() user: any) {
    return this.service.getMyReports(user.customerId || user.id);
  }

  @Get('contracts')
  @Roles(UserRole.CUSTOMER, UserRole.CUSTOMER_REP)
  getMyContracts(@CurrentUser() user: any) {
    return this.service.getMyContracts(user.customerId || user.id);
  }

  @Get('contracts/:id')
  @Roles(UserRole.CUSTOMER, UserRole.CUSTOMER_REP)
  @ApiOperation({ summary: 'Sözleşme detayı' })
  getContractDetail(@Param('id') id: string) {
    return this.contractsService.findOne(id);
  }

  @Post('contracts/:id/accept')
  @Roles(UserRole.CUSTOMER, UserRole.CUSTOMER_REP)
  @ApiOperation({ summary: 'Sözleşmeyi kabul et' })
  acceptContract(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.contractsService.acceptByCustomer(id, userId);
  }

  @Post('contracts/:id/reject')
  @Roles(UserRole.CUSTOMER, UserRole.CUSTOMER_REP)
  @ApiOperation({ summary: 'Sözleşmeyi reddet' })
  rejectContract(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.contractsService.rejectByCustomer(id, reason, userId);
  }
}

// ─── Extended Portal Endpoints ─────────────────────────────────────────────────

import { PortalExtendedService } from './portal-extended.service';

@ApiTags('portal')
@ApiBearerAuth('JWT')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('portal')
export class PortalExtendedController {
  constructor(private extended: PortalExtendedService) {}

  @Post('control-request')
  @Roles(UserRole.CUSTOMER, UserRole.CUSTOMER_REP)
  @ApiOperation({ summary: 'Yeni kontrol talebi olustur' })
  createControlRequest(@CurrentUser() user: any, @Body() body: any) {
    return this.extended.createControlRequest(user.customerId || user.id, body);
  }

  @Get('invoices')
  @Roles(UserRole.CUSTOMER, UserRole.CUSTOMER_REP)
  @ApiOperation({ summary: 'Fatura durumlarini gor' })
  getInvoiceStatus(@CurrentUser() user: any) {
    return this.extended.getInvoiceStatus(user.customerId || user.id);
  }

  @Get('nonconformities')
  @Roles(UserRole.CUSTOMER, UserRole.CUSTOMER_REP)
  @ApiOperation({ summary: 'Uygunsuzluk takibi' })
  getNonconformities(@CurrentUser() user: any) {
    return this.extended.getNonconformities(user.customerId || user.id);
  }

  @Get('upcoming-controls')
  @Roles(UserRole.CUSTOMER, UserRole.CUSTOMER_REP)
  @ApiOperation({ summary: 'Yaklasan kontrol tarihleri' })
  getUpcomingControls(@CurrentUser() user: any) {
    return this.extended.getUpcomingControls(user.customerId || user.id);
  }
}

@Module({
  imports: [
    TypeOrmModule.forFeature([Equipment, Report, Contract]),
    ContractsModule,
  ],
  providers: [PortalService, PortalExtendedService],
  controllers: [PortalController, PortalExtendedController],
  exports: [PortalService],
})
export class PortalModule {}

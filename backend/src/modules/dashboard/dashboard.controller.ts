// ─── Controller ──────────────────────────────────────────────────────────────
import { Controller, Get, Query, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { Roles } from '@/common/decorators/roles.decorator';
import { RolesGuard } from '@/common/guards/roles.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { UserRole } from '@/common/enums/user-role.enum';
import { DashboardService } from './dashboard.service';
import { ExecutiveBiService } from './executive-bi.service';

@ApiTags('dashboard')
@ApiBearerAuth('JWT')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private service: DashboardService, private biService: ExecutiveBiService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.EXECUTIVE)
  @ApiOperation({ summary: 'Ana yönetim paneli' })
  getMain(@Req() req: any) {
    return this.service.getMainDashboard(req.companyId);
  }

  @Get('extended')
  @Roles(UserRole.ADMIN, UserRole.EXECUTIVE)
  @ApiOperation({ summary: 'Genişletilmiş yönetim paneli (12 KPI)' })
  getExtended(@Req() req: any) {
    return this.service.getExtendedDashboard(req.companyId);
  }

  @Get('inspector')
  @Roles(UserRole.INSPECTOR)
  @ApiOperation({ summary: 'Muayene elemanı paneli' })
  getInspector(@CurrentUser('id') userId: string) {
    return this.service.getInspectorDashboard(userId);
  }

  @Get('technical-manager')
  @Roles(UserRole.TECHNICAL_MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Teknik yönetici paneli' })
  getTechnicalManager() {
    return this.service.getTechnicalManagerDashboard();
  }

  @Get('finance')
  @Roles(UserRole.FINANCE, UserRole.ADMIN)
  @ApiOperation({ summary: 'Finans paneli' })
  getFinance() {
    return this.service.getFinanceDashboard();
  }

  @Get('equipment-timeline')
  @Roles(UserRole.ADMIN, UserRole.PLANNER, UserRole.EXECUTIVE)
  @ApiOperation({ summary: 'Ekipman kontrol takvimi' })
  getEquipmentTimeline(@Query('days') days?: number, @Req() req?: any) {
    return this.service.getEquipmentControlTimeline(days || 90, req?.companyId);
  }

  @Get('monthly-stats')
  @Roles(UserRole.ADMIN, UserRole.EXECUTIVE, UserRole.TECHNICAL_MANAGER)
  @ApiOperation({ summary: 'Aylık denetim istatistikleri' })
  getMonthlyStats(@Query('months') months?: number) {
    return this.service.getMonthlyInspectionStats(months || 12);
  }

  @Get('executive-bi')
  @Roles(UserRole.ADMIN, UserRole.EXECUTIVE)
  @ApiOperation({ summary: 'Executive BI: ciro, pipeline, verimlilik, musteri analizi' })
  getExecutiveBi(@Req() req: any) {
    return this.biService.getExecutiveDashboard(req.companyId);
  }
}


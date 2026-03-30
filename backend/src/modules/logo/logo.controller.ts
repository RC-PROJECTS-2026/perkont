import {
  Controller, Get, Post, Patch, Param, Body, Query, UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '@/common/decorators/roles.decorator';
import { RolesGuard } from '@/common/guards/roles.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { UserRole } from '@/common/enums/user-role.enum';
import { PaginationDto } from '@/common/dto/pagination.dto';
import { LogoService } from './logo.service';

@ApiTags('logo')
@ApiBearerAuth('JWT')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('logo')
export class LogoController {
  constructor(private service: LogoService) {}

  @Get('queue')
  @Roles(UserRole.ADMIN, UserRole.FINANCE, UserRole.EXECUTIVE)
  @ApiOperation({ summary: 'LOGO senkronizasyon kuyruğu' })
  getQueue(
    @Query() pagination: PaginationDto,
    @Query('status') status?: string,
    @Query('entityType') entityType?: string,
  ) {
    return this.service.getQueue({ status, entityType }, pagination);
  }

  @Get('queue/stats')
  @Roles(UserRole.ADMIN, UserRole.FINANCE, UserRole.EXECUTIVE)
  @ApiOperation({ summary: 'Kuyruk istatistikleri' })
  getStats() {
    return this.service.getQueueStats();
  }

  @Post('queue/:id/retry')
  @Roles(UserRole.ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: 'Başarısız kaydı yeniden dene' })
  retryItem(@Param('id') id: string) {
    return this.service.retryItem(id);
  }

  @Post('queue/retry-all-failed')
  @Roles(UserRole.ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: 'Tüm başarısız kayıtları yeniden dene' })
  async retryAllFailed() {
    const count = await this.service.retryAllFailed();
    return { message: `${count} kayıt yeniden kuyruğa alındı` };
  }

  @Post('customers/:customerId/sync')
  @Roles(UserRole.ADMIN, UserRole.FINANCE, UserRole.CUSTOMER_REP)
  @ApiOperation({ summary: 'Müşteriyi LOGO cari kartıyla senkronize et' })
  syncCustomer(
    @Param('customerId') customerId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.syncCustomer(customerId, userId);
  }

  @Patch('customers/:customerId/map')
  @Roles(UserRole.ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: 'Müşteriyi mevcut LOGO cari kartıyla manuel eşle' })
  mapCustomer(
    @Param('customerId') customerId: string,
    @Body('logoCariId') logoCariId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.mapCustomerToLogoCari(customerId, logoCariId, userId);
  }

  @Post('invoices')
  @Roles(UserRole.ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: 'Fatura oluşturma kuyruğuna ekle' })
  createInvoice(
    @Body('workOrderId') workOrderId: string,
    @Body() invoiceData: any,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.createInvoice(workOrderId, invoiceData, userId);
  }
}

// ─── Module ───────────────────────────────────────────────────────────────────
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LogoSyncQueue } from './entities/logo-sync-queue.entity';
import { LogoInvoice }   from './entities/logo-invoice.entity';
import { LogoApiClient } from './logo-api.client';
import { CustomersModule } from '@/modules/customers/customers.module';
import { NotificationsModule } from '@/modules/notifications/notifications.module';
import { AuditModule } from '@/modules/audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([LogoSyncQueue, LogoInvoice]),
    CustomersModule, NotificationsModule, AuditModule,
  ],
  providers: [LogoService, LogoApiClient],
  controllers: [LogoController],
  exports: [LogoService],
})
export class LogoModule {}

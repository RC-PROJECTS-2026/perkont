import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Inspection } from '@/modules/inspections/entities/inspection.entity';
import { Report } from '@/modules/reports/entities/report.entity';
import { WorkOrder } from '@/modules/work-orders/entities/work-order.entity';
import { Equipment } from '@/modules/equipment/entities/equipment.entity';
import { LogoSyncQueue } from '@/modules/logo/entities/logo-sync-queue.entity';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { ScheduledTasksService } from './scheduled-tasks.service';
import { NotificationsModule } from '@/modules/notifications/notifications.module';
import { UsersModule } from '@/modules/users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Inspection, Report, WorkOrder, Equipment, LogoSyncQueue]),
    NotificationsModule,
    UsersModule,
  ],
  providers: [DashboardService, ScheduledTasksService],
  controllers: [DashboardController],
  exports: [DashboardService],
})
export class DashboardModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkOrder, WorkOrderEquipment } from './entities/work-order.entity';
import { WorkOrdersService } from './work-orders.service';
import { WorkOrdersController } from './work-orders.controller';
import { AutoWoGenerationService } from './auto-wo-generation.service';
import { AuditModule } from '@/modules/audit/audit.module';
import { NotificationsModule } from '@/modules/notifications/notifications.module';
import { EquipmentModule } from '@/modules/equipment/equipment.module';
import { FormTemplatesModule } from '@/modules/form-templates/form-templates.module';
import { UsersModule } from '@/modules/users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([WorkOrder, WorkOrderEquipment]),
    AuditModule,
    NotificationsModule,
    EquipmentModule,
    FormTemplatesModule,
    UsersModule,
  ],
  providers: [WorkOrdersService, AutoWoGenerationService],
  controllers: [WorkOrdersController],
  exports: [WorkOrdersService, TypeOrmModule],
})
export class WorkOrdersModule {}

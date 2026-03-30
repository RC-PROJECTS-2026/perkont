import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import {
  Inspection,
  InspectionFieldValue,
  InspectionPhoto,
  InspectionNonconformity,
  InspectionInstrument,
} from './entities/inspection.entity';
import { InspectionsService } from './inspections.service';
import { InspectionValidationService } from './inspection-validation.service';
import { InspectionsController } from './inspections.controller';
import { AuditModule } from '@/modules/audit/audit.module';
import { NotificationsModule } from '@/modules/notifications/notifications.module';
import { EquipmentModule } from '@/modules/equipment/equipment.module';
import { FormTemplatesModule } from '@/modules/form-templates/form-templates.module';
import { StorageModule } from '@/modules/storage/storage.module';
import { WorkOrdersModule } from '@/modules/work-orders/work-orders.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Inspection,
      InspectionFieldValue,
      InspectionPhoto,
      InspectionNonconformity,
      InspectionInstrument,
    ]),
    MulterModule.register({ limits: { fileSize: 20 * 1024 * 1024 } }),
    AuditModule,
    NotificationsModule,
    EquipmentModule,
    FormTemplatesModule,
    StorageModule,
    WorkOrdersModule,
  ],
  providers: [InspectionsService, InspectionValidationService],
  controllers: [InspectionsController],
  exports: [InspectionsService, TypeOrmModule],
})
export class InspectionsModule {}

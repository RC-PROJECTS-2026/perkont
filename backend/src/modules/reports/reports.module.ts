import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Report } from './entities/report.entity';
import { ReportReview } from './entities/report-review.entity';
import { ReportsService } from './reports.service';
import { PdfEngineService } from './pdf-engine.service';
import { ESignatureService } from './esignature.service';
import { ReportsController } from './reports.controller';
import { AuditModule } from '@/modules/audit/audit.module';
import { NotificationsModule } from '@/modules/notifications/notifications.module';
import { StorageModule } from '@/modules/storage/storage.module';
import { InspectionsModule } from '@/modules/inspections/inspections.module';
import { FormTemplatesModule } from '@/modules/form-templates/form-templates.module';
import { EquipmentModule } from '@/modules/equipment/equipment.module';
import { CustomersModule } from '@/modules/customers/customers.module';
import { WorkOrdersModule } from '@/modules/work-orders/work-orders.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Report, ReportReview]),
    AuditModule,
    NotificationsModule,
    StorageModule,
    InspectionsModule,
    FormTemplatesModule,
    EquipmentModule,
    CustomersModule,
    WorkOrdersModule,
  ],
  providers: [ReportsService, PdfEngineService, ESignatureService],
  controllers: [ReportsController],
  exports: [ReportsService],
})
export class ReportsModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Equipment } from './entities/equipment.entity';
import { EquipmentType } from './entities/equipment-type.entity';
import { EquipmentService } from './equipment.service';
import { EquipmentController } from './equipment.controller';
import { EquipmentImportService } from './equipment-import.service';
import { EquipmentImportController } from './equipment-import.controller';
import { AuditModule } from '@/modules/audit/audit.module';
import { StorageModule } from '@/modules/storage/storage.module';

@Module({
  imports: [TypeOrmModule.forFeature([Equipment, EquipmentType]), AuditModule, StorageModule],
  providers: [EquipmentService, EquipmentImportService],
  controllers: [EquipmentController, EquipmentImportController],
  exports: [EquipmentService, EquipmentImportService],
})
export class EquipmentModule {}

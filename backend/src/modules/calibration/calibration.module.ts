import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { MeasuringInstrument } from './entities/measuring-instrument.entity';
import { CalibrationService } from './calibration.service';
import { CalibrationController } from './calibration.controller';
import { AuditModule } from '@/modules/audit/audit.module';
import { StorageModule } from '@/modules/storage/storage.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MeasuringInstrument]),
    MulterModule.register({ limits: { fileSize: 20 * 1024 * 1024 } }),
    AuditModule,
    StorageModule,
  ],
  providers: [CalibrationService],
  controllers: [CalibrationController],
  exports: [CalibrationService, TypeOrmModule],
})
export class CalibrationModule {}

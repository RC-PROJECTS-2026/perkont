import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { Contract } from './entities/contract.entity';
import { ContractsService } from './contracts.service';
import { ContractsController } from './contracts.controller';
import { AuditModule } from '@/modules/audit/audit.module';
import { StorageModule } from '@/modules/storage/storage.module';
import { NotificationsModule } from '@/modules/notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Contract]),
    MulterModule.register({ limits: { fileSize: 20 * 1024 * 1024 } }),
    AuditModule,
    StorageModule,
    NotificationsModule,
  ],
  providers: [ContractsService],
  controllers: [ContractsController],
  exports: [ContractsService, TypeOrmModule],
})
export class ContractsModule {}

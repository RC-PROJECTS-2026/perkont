import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CapaRecord } from './entities/capa-record.entity';
import { CapaService } from './capa.service';
import { CapaController } from './capa.controller';
import { AuditModule } from '@/modules/audit/audit.module';

@Module({
  imports: [TypeOrmModule.forFeature([CapaRecord]), AuditModule],
  providers: [CapaService],
  controllers: [CapaController],
  exports: [CapaService],
})
export class CapaModule {}

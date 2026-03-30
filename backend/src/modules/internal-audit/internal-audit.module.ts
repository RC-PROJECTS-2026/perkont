import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InternalAuditPlan, InternalAuditFinding } from './entities/internal-audit.entity';
import { InternalAuditService } from './internal-audit.service';
import { InternalAuditController } from './internal-audit.controller';
import { AuditModule } from '@/modules/audit/audit.module';

@Module({
  imports: [TypeOrmModule.forFeature([InternalAuditPlan, InternalAuditFinding]), AuditModule],
  providers: [InternalAuditService],
  controllers: [InternalAuditController],
  exports: [InternalAuditService],
})
export class InternalAuditModule {}

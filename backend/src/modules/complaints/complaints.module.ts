import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Complaint } from './entities/complaint.entity';
import { ComplaintsService } from './complaints.service';
import { ComplaintsController } from './complaints.controller';
import { AuditModule } from '@/modules/audit/audit.module';

@Module({
  imports: [TypeOrmModule.forFeature([Complaint]), AuditModule],
  providers: [ComplaintsService],
  controllers: [ComplaintsController],
  exports: [ComplaintsService],
})
export class ComplaintsModule {}

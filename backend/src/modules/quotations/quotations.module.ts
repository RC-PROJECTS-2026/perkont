import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Quotation, QuotationItem } from './entities/quotation.entity';
import { QuotationsService } from './quotations.service';
import { QuotationsController } from './quotations.controller';
import { AuditModule } from '@/modules/audit/audit.module';

@Module({
  imports: [TypeOrmModule.forFeature([Quotation, QuotationItem]), AuditModule],
  providers: [QuotationsService],
  controllers: [QuotationsController],
  exports: [QuotationsService, TypeOrmModule],
})
export class QuotationsModule {}

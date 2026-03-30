import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer } from './entities/customer.entity';
import { CustomerLocation } from './entities/customer-location.entity';
import { CustomersService } from './customers.service';
import { CustomersController } from './customers.controller';
import { AuditModule } from '@/modules/audit/audit.module';

@Module({
  imports: [TypeOrmModule.forFeature([Customer, CustomerLocation]), AuditModule],
  providers: [CustomersService],
  controllers: [CustomersController],
  exports: [CustomersService],
})
export class CustomersModule {}

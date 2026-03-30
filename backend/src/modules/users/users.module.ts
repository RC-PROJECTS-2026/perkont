import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { InspectorQualification } from './entities/inspector-qualification.entity';
import { UserPermission }         from './entities/user-permission.entity';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { AuditModule } from '@/modules/audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, InspectorQualification, UserPermission]),
    AuditModule,
  ],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService, TypeOrmModule],
})
export class UsersModule {}

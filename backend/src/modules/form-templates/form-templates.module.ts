import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { FormTemplate } from './entities/form-template.entity';
import { FormField } from './entities/form-template.entity';
import { FormTemplatesService } from './form-templates.service';
import { FormTemplatesController } from './form-templates.controller';
import { AuditModule } from '@/modules/audit/audit.module';
import { StorageModule } from '@/modules/storage/storage.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([FormTemplate, FormField]),
    MulterModule.register({ limits: { fileSize: 50 * 1024 * 1024 } }), // 50MB
    AuditModule,
    StorageModule,
  ],
  providers: [FormTemplatesService],
  controllers: [FormTemplatesController],
  exports: [FormTemplatesService],
})
export class FormTemplatesModule {}

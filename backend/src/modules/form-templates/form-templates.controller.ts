import {
  Controller, Get, Post, Put, Patch, Body,
  Param, Query, UseGuards, UseInterceptors,
  UploadedFile, HttpCode, HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiConsumes } from '@nestjs/swagger';
import { Roles } from '@/common/decorators/roles.decorator';
import { RolesGuard } from '@/common/guards/roles.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { UserRole } from '@/common/enums/user-role.enum';
import { FormTemplatesService, CreateFormTemplateDto } from './form-templates.service';

@ApiTags('form-templates')
@ApiBearerAuth('JWT')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('form-templates')
export class FormTemplatesController {
  constructor(private service: FormTemplatesService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.TECHNICAL_MANAGER)
  @ApiOperation({ summary: 'Yeni form şablonu oluştur' })
  create(@Body() dto: CreateFormTemplateDto, @CurrentUser('id') userId: string) {
    return this.service.create(dto, userId);
  }

  @Get()
  @ApiOperation({ summary: 'Form şablonlarını listele' })
  findAll(@Query('equipmentTypeId') equipmentTypeId?: string) {
    return this.service.findAll(equipmentTypeId);
  }

  @Get('active/:equipmentTypeId')
  @ApiOperation({ summary: 'Ekipman tipine göre aktif form şablonu' })
  findActive(@Param('equipmentTypeId') equipmentTypeId: string) {
    return this.service.findActiveForEquipmentType(equipmentTypeId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Form şablonu detayı' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post(':id/upload-template')
  @Roles(UserRole.ADMIN, UserRole.TECHNICAL_MANAGER)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'PDF şablon dosyası yükle' })
  uploadTemplate(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.uploadPdfTemplate(id, file.buffer, file.originalname, userId);
  }

  @Patch(':id/activate')
  @Roles(UserRole.ADMIN, UserRole.TECHNICAL_MANAGER)
  @ApiOperation({ summary: 'Formu aktif et (eski aktif form superseded olur)' })
  activate(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.activate(id, userId);
  }

  @Post(':id/revise')
  @Roles(UserRole.ADMIN, UserRole.TECHNICAL_MANAGER)
  @ApiOperation({ summary: 'Yeni revizyon oluştur' })
  createRevision(
    @Param('id') id: string,
    @Body('revision') revision: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.createRevision(id, revision, userId);
  }

  @Put(':templateId/fields/:fieldId')
  @Roles(UserRole.ADMIN, UserRole.TECHNICAL_MANAGER)
  @ApiOperation({ summary: 'Form alanı güncelle (koordinat, label, validasyon)' })
  updateField(
    @Param('templateId') templateId: string,
    @Param('fieldId') fieldId: string,
    @Body() updates: any,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.updateField(templateId, fieldId, updates, userId);
  }
}

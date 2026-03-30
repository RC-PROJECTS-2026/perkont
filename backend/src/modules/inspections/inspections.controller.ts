import {
  Controller, Get, Post, Patch, Body, Param,
  Query, UseGuards, UseInterceptors, UploadedFile, Req,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiConsumes } from '@nestjs/swagger';
import { Roles } from '@/common/decorators/roles.decorator';
import { RolesGuard } from '@/common/guards/roles.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { UserRole } from '@/common/enums/user-role.enum';
import { PaginationDto } from '@/common/dto/pagination.dto';
import {
  InspectionsService, StartInspectionDto, SaveFieldValuesDto,
  CompleteInspectionDto, OfflineSyncPayload,
} from './inspections.service';
import { DataSource } from 'typeorm';
import { verifyTenantAccess } from '@/common/guards/tenant-verify.helper';

@ApiTags('inspections')
@ApiBearerAuth('JWT')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('inspections')
export class InspectionsController {
  constructor(private service: InspectionsService, private dataSource: DataSource) {}

  @Post()
  @Roles(UserRole.INSPECTOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Denetim başlat' })
  start(@Body() dto: StartInspectionDto, @CurrentUser('id') userId: string) {
    return this.service.start(dto, userId);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.TECHNICAL_MANAGER, UserRole.EXECUTIVE, UserRole.PLANNER)
  @ApiOperation({ summary: 'Denetim listesi' })
  findAll(
    @Query() pagination: PaginationDto,
    @Query('status') status?: string,
    @Query('inspectorId') inspectorId?: string,
    @Query('equipmentId') equipmentId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Req() req?: any,
  ) {
    return this.service.findAll(
      { status, inspectorId, equipmentId, startDate, endDate, companyId: req?.companyId },
      pagination,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Denetim detayı' })
  async findOne(@Param('id') id: string, @Req() req: any) {
    await verifyTenantAccess(this.dataSource, 'inspection', id, req.companyId);
    return this.service.findOne(id);
  }

  @Post(':id/field-values')
  @Roles(UserRole.INSPECTOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Alan değerlerini kaydet (taslak)' })
  saveFieldValues(
    @Param('id') id: string,
    @Body() dto: SaveFieldValuesDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.saveFieldValues(id, dto, userId);
  }

  @Post(':id/photos')
  @Roles(UserRole.INSPECTOR, UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('photo', {
    fileFilter: (_req, file, cb) => {
      const allowed = [
        'image/jpeg', 'image/png', 'image/webp', 'image/gif',
        'video/mp4', 'video/quicktime',
        'application/pdf',
      ];
      cb(null, allowed.includes(file.mimetype));
    },
  }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Denetim fotoğraf/video/doküman yükle' })
  uploadPhoto(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() metadata: any,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.uploadPhoto(
      id, file.buffer, file.originalname,
      { ...metadata, mimeType: file.mimetype },
      userId,
    );
  }

  @Post(':id/files')
  @Roles(UserRole.INSPECTOR, UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB max (service enforces per-type limits)
    fileFilter: (_req, file, cb) => {
      const allowed = [
        'image/jpeg', 'image/png', 'image/webp', 'image/gif',
        'video/mp4', 'video/quicktime',
        'application/pdf',
      ];
      cb(null, allowed.includes(file.mimetype));
    },
  }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Denetim dosyası yükle (fotoğraf/video/doküman)' })
  uploadFile(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() metadata: any,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.uploadFile(
      id, file.buffer, file.originalname, file.mimetype, metadata, userId,
    );
  }

  @Post(':id/nonconformities')
  @Roles(UserRole.INSPECTOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Uygunsuzluk ekle' })
  addNonconformity(
    @Param('id') id: string,
    @Body() data: any,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.addNonconformity(id, data, userId);
  }

  @Patch(':id/complete')
  @Roles(UserRole.INSPECTOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Denetimi tamamla' })
  complete(
    @Param('id') id: string,
    @Body() dto: CompleteInspectionDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.complete(id, dto, userId);
  }

  @Patch(':id/submit')
  @Roles(UserRole.INSPECTOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Teknik yöneticiye gönder' })
  submit(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.submit(id, userId);
  }

  @Patch(':id/review')
  @Roles(UserRole.TECHNICAL_MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Teknik yönetici: onayla / iade et / revizyon iste' })
  review(
    @Param('id') id: string,
    @Body('action') action: 'approve' | 'reject' | 'request_revision',
    @Body('note') note: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.review(id, action, note, userId);
  }

  // ─── OFFLINE SYNC ─────────────────────────────────────────────────────────
  @Post('sync/offline')
  @Roles(UserRole.INSPECTOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Offline denetim verilerini senkronize et' })
  syncOffline(@Body() payload: OfflineSyncPayload, @CurrentUser('id') userId: string) {
    return this.service.syncOffline(payload, userId);
  }

  @Get(':id/photos/:photoId/upload-url')
  @Roles(UserRole.INSPECTOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Fotoğraf yükleme için presigned URL al' })
  getPhotoUploadUrl(
    @Param('id') id: string,
    @Param('photoId') photoId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.getPhotoUploadUrl(id, photoId, userId);
  }
}


import {
  Injectable, NotFoundException, BadRequestException, ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Inspection, InspectionFieldValue, InspectionPhoto,
  InspectionNonconformity, InspectionInstrument,
  InspectionStatus, InspectionResult, SyncStatus, MediaType,
} from './entities/inspection.entity';
import { AuditService } from '@/modules/audit/audit.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { EquipmentService } from '@/modules/equipment/equipment.service';
import { FormTemplatesService } from '@/modules/form-templates/form-templates.service';
import { StorageService, StorageBucket } from '@/modules/storage/storage.service';
import { WorkOrdersService } from '@/modules/work-orders/work-orders.service';
import { WorkOrderStatus } from '@/modules/work-orders/entities/work-order.entity';
import { PaginationDto, PaginatedResult } from '@/common/dto/pagination.dto';
import { InspectionValidationService } from './inspection-validation.service';

export interface StartInspectionDto {
  workOrderId?: string;
  workOrderEquipmentId?: string;
  equipmentId: string;
  formTemplateId: string;
  latitude?: number;
  longitude?: number;
  offlineCreated?: boolean;
  offlineDeviceId?: string;
  deviceTimestamp?: string;
  localUuid?: string;
}

export interface SaveFieldValuesDto {
  fieldValues: Array<{
    fieldId?: string;
    fieldKey: string;
    valueText?: string;
    valueNumber?: number;
    valueBoolean?: boolean;
    valueDate?: string;
    valueJson?: any;
    repetitionIndex?: number;
  }>;
}

export interface CompleteInspectionDto {
  overallResult: InspectionResult;
  inspectorNotes?: string;
  fieldValues?: SaveFieldValuesDto['fieldValues'];
}

export interface OfflineSyncPayload {
  localUuid: string;
  inspection: StartInspectionDto & { status: string };
  fieldValues: SaveFieldValuesDto['fieldValues'];
  nonconformities?: Array<{
    fieldId?: string;
    checkItemId?: string;
    description: string;
    severity?: string;
    recommendation?: string;
  }>;
  usedInstrumentIds?: string[];
  photos?: Array<{
    fieldKey: string;
    localPath: string;
    takenAt: string;
    latitude?: number;
    longitude?: number;
    caption?: string;
  }>;
  deviceTimestamp: string;
  overallResult?: InspectionResult;
}

@Injectable()
export class InspectionsService {
  constructor(
    @InjectRepository(Inspection)
    private inspectionRepo: Repository<Inspection>,
    @InjectRepository(InspectionFieldValue)
    private fieldValueRepo: Repository<InspectionFieldValue>,
    @InjectRepository(InspectionPhoto)
    private photoRepo: Repository<InspectionPhoto>,
    @InjectRepository(InspectionNonconformity)
    private nonconformityRepo: Repository<InspectionNonconformity>,
    @InjectRepository(InspectionInstrument)
    private instrumentRepo: Repository<InspectionInstrument>,
    private auditService: AuditService,
    private notificationsService: NotificationsService,
    private equipmentService: EquipmentService,
    private formTemplatesService: FormTemplatesService,
    private storageService: StorageService,
    private workOrdersService: WorkOrdersService,
    private validationService: InspectionValidationService,
    private moduleRef: ModuleRef,
  ) {}

  // ─── Denetim Başlat ───────────────────────────────────────────────────────
  async start(dto: StartInspectionDto, inspectorId: string): Promise<Inspection> {
    const equipment = await this.equipmentService.findOne(dto.equipmentId);
    const formTemplate = await this.formTemplatesService.findOne(dto.formTemplateId);

    // Aynı ekipman için açık denetim var mı?
    const openInspection = await this.inspectionRepo.findOne({
      where: {
        equipmentId: dto.equipmentId,
        inspectorId,
        status: InspectionStatus.IN_PROGRESS,
      },
    });
    if (openInspection) {
      throw new BadRequestException('Bu ekipman için zaten devam eden bir denetim var');
    }

    const inspection = this.inspectionRepo.create({
      ...dto,
      inspectorId,
      formTemplateRevision: formTemplate.revision,
      status: InspectionStatus.IN_PROGRESS,
      startedAt: dto.deviceTimestamp ? new Date(dto.deviceTimestamp) : new Date(),
      deviceTimestamp: dto.deviceTimestamp ? new Date(dto.deviceTimestamp) : new Date(),
      serverTimestamp: new Date(),
      syncStatus: SyncStatus.SYNCED,
    });

    const saved = await this.inspectionRepo.save(inspection);

    // İş emri varsa durumu güncelle
    if (dto.workOrderId) {
      await this.workOrdersService.updateStatus(
        dto.workOrderId,
        WorkOrderStatus.IN_PROGRESS,
        inspectorId,
      );
    }

    await this.auditService.log({
      userId: inspectorId,
      action: 'INSPECTION_STARTED',
      entityType: 'Inspection',
      entityId: saved.id,
      newValues: { equipmentId: dto.equipmentId, formRevision: formTemplate.revision },
    });

    return this.findOne(saved.id);
  }

  // ─── Alan Değerlerini Kaydet (taslak kayıt) ───────────────────────────────
  async saveFieldValues(
    inspectionId: string,
    dto: SaveFieldValuesDto,
    userId: string,
  ): Promise<void> {
    const inspection = await this.findOne(inspectionId);
    this.assertCanEdit(inspection, userId);

    for (const fv of dto.fieldValues) {
      const repetitionIndex = fv.repetitionIndex ?? 0;
      // Varsa güncelle, yoksa ekle (upsert) — fieldKey + repetitionIndex ile eşleştir
      const existing = await this.fieldValueRepo.findOne({
        where: { inspectionId, fieldKey: fv.fieldKey, repetitionIndex },
      });

      if (existing) {
        await this.fieldValueRepo.update(existing.id, {
          ...fv,
          repetitionIndex,
          valueDate: fv.valueDate ? new Date(fv.valueDate) : null,
          enteredById: userId,
          enteredAt: new Date(),
        });
      } else {
        await this.fieldValueRepo.save(
          this.fieldValueRepo.create({
            ...fv,
            inspectionId,
            repetitionIndex,
            valueDate: fv.valueDate ? new Date(fv.valueDate) : null,
            enteredById: userId,
            enteredAt: new Date(),
          }),
        );
      }
    }

    // If inspection is in REVISION_REQUESTED, auto-transition back to IN_PROGRESS
    if (inspection.status === InspectionStatus.REVISION_REQUESTED) {
      await this.inspectionRepo.update(inspectionId, { status: InspectionStatus.IN_PROGRESS });
    }
  }

  // ─── Fotoğraf / Video / Doküman Yükle ────────────────────────────────────
  private detectMediaType(mimeType: string): MediaType {
    if (mimeType.startsWith('video/')) return MediaType.VIDEO;
    if (mimeType === 'application/pdf') return MediaType.DOCUMENT;
    return MediaType.PHOTO;
  }

  private getStorageBucket(mediaType: MediaType): StorageBucket {
    switch (mediaType) {
      case MediaType.VIDEO: return StorageBucket.PHOTOS; // same bucket, different folder
      case MediaType.DOCUMENT: return StorageBucket.PHOTOS;
      default: return StorageBucket.PHOTOS;
    }
  }

  async uploadPhoto(
    inspectionId: string,
    file: Buffer,
    originalName: string,
    metadata: {
      fieldKey?: string;
      caption?: string;
      latitude?: number;
      longitude?: number;
      takenAt?: string;
      mimeType?: string;
    },
    userId: string,
  ): Promise<InspectionPhoto> {
    const inspection = await this.findOne(inspectionId);
    this.assertCanEdit(inspection, userId);

    const mimeType = metadata.mimeType || 'image/jpeg';
    const mediaType = this.detectMediaType(mimeType);
    const subfolder = mediaType === MediaType.PHOTO ? 'photos' : mediaType === MediaType.VIDEO ? 'videos' : 'documents';

    const { url, objectName } = await this.storageService.uploadFile(
      this.getStorageBucket(mediaType),
      file,
      originalName,
      mimeType,
      `inspections/${inspectionId}/${subfolder}`,
    );

    const photo = this.photoRepo.create({
      inspectionId,
      mediaType,
      fieldKey: metadata.fieldKey,
      fileUrl: url,
      objectName,
      fileSize: file.length,
      mimeType,
      takenAt: metadata.takenAt ? new Date(metadata.takenAt) : new Date(),
      latitude: metadata.latitude,
      longitude: metadata.longitude,
      caption: metadata.caption,
      syncStatus: SyncStatus.SYNCED,
    });

    return this.photoRepo.save(photo);
  }

  // ─── Genel Dosya Yükle (fotoğraf/video/doküman) ────────────────────────
  async uploadFile(
    inspectionId: string,
    file: Buffer,
    originalName: string,
    mimeType: string,
    metadata: {
      fieldKey?: string;
      caption?: string;
      latitude?: number;
      longitude?: number;
      takenAt?: string;
    },
    userId: string,
  ): Promise<InspectionPhoto> {
    const inspection = await this.findOne(inspectionId);
    this.assertCanEdit(inspection, userId);

    const mediaType = this.detectMediaType(mimeType);

    // Enforce file size limits
    const sizeLimits: Record<MediaType, number> = {
      [MediaType.PHOTO]: 10 * 1024 * 1024,      // 10MB
      [MediaType.VIDEO]: 100 * 1024 * 1024,      // 100MB
      [MediaType.DOCUMENT]: 20 * 1024 * 1024,    // 20MB
    };
    if (file.length > sizeLimits[mediaType]) {
      throw new BadRequestException(
        `Dosya boyutu limiti aşıldı. Maksimum: ${sizeLimits[mediaType] / (1024 * 1024)}MB`,
      );
    }

    const subfolder = mediaType === MediaType.PHOTO ? 'photos' : mediaType === MediaType.VIDEO ? 'videos' : 'documents';

    const { url, objectName } = await this.storageService.uploadFile(
      this.getStorageBucket(mediaType),
      file,
      originalName,
      mimeType,
      `inspections/${inspectionId}/${subfolder}`,
    );

    const record = this.photoRepo.create({
      inspectionId,
      mediaType,
      fieldKey: metadata.fieldKey,
      fileUrl: url,
      objectName,
      fileSize: file.length,
      mimeType,
      takenAt: metadata.takenAt ? new Date(metadata.takenAt) : new Date(),
      latitude: metadata.latitude,
      longitude: metadata.longitude,
      caption: metadata.caption,
      syncStatus: SyncStatus.SYNCED,
    });

    return this.photoRepo.save(record);
  }

  // ─── Uygunsuzluk Ekle ────────────────────────────────────────────────────
  async addNonconformity(
    inspectionId: string,
    data: {
      fieldId?: string;
      checkItemId?: string;
      description: string;
      severity?: string;
      recommendation?: string;
    },
    userId: string,
  ): Promise<InspectionNonconformity> {
    const inspection = await this.findOne(inspectionId);
    this.assertCanEdit(inspection, userId);

    const nc = this.nonconformityRepo.create({ ...data, inspectionId });
    return this.nonconformityRepo.save(nc);
  }

  // ─── Denetimi Tamamla ─────────────────────────────────────────────────────
  async complete(
    inspectionId: string,
    dto: CompleteInspectionDto,
    inspectorId: string,
  ): Promise<Inspection> {
    const inspection = await this.findOne(inspectionId);
    this.assertCanEdit(inspection, inspectorId);

    // Son alan değerleri varsa kaydet
    if (dto.fieldValues?.length) {
      await this.saveFieldValues(inspectionId, { fieldValues: dto.fieldValues }, inspectorId);
    }

    // Zorunlu alan kontrolü
    const template = await this.formTemplatesService.findOne(inspection.formTemplateId);
    const requiredFields = template.fields.filter((f) => f.isRequired);
    const savedValues = await this.fieldValueRepo.find({ where: { inspectionId } });
    const savedKeys = new Set(savedValues.map((v) => v.fieldKey));

    const missingRequired = requiredFields.filter((f) => !savedKeys.has(f.fieldKey));
    if (missingRequired.length > 0) {
      throw new BadRequestException(
        `Zorunlu alanlar eksik: ${missingRequired.map((f) => f.label).join(', ')}`,
      );
    }

    // Server-side field content validation
    const savedMap = new Map(savedValues.map(v => [v.fieldKey, v.valueText || v.valueNumber || v.valueBoolean || v.valueDate || v.valueJson]));
    const validationErrors = this.validationService.validateCompletion(template.fields, savedMap);
    const blockingErrors = validationErrors.filter(e => e.severity === 'error');
    if (blockingErrors.length > 0) {
      throw new BadRequestException({
        message: 'Doğrulama hataları',
        errors: blockingErrors,
      });
    }

    await this.inspectionRepo.update(inspectionId, {
      overallResult: dto.overallResult,
      inspectorNotes: dto.inspectorNotes,
      status: InspectionStatus.COMPLETED,
      completedAt: new Date(),
    });

    // Ekipmanın son kontrol tarihini güncelle
    await this.equipmentService.updateAfterInspection(
      inspection.equipmentId,
      new Date(),
      dto.overallResult,
    );

    await this.auditService.log({
      userId: inspectorId,
      action: 'INSPECTION_COMPLETED',
      entityType: 'Inspection',
      entityId: inspectionId,
      newValues: { overallResult: dto.overallResult },
    });

    return this.findOne(inspectionId);
  }

  // ─── Teknik Yöneticiye Gönder ─────────────────────────────────────────────
  async submit(inspectionId: string, inspectorId: string): Promise<Inspection> {
    const inspection = await this.findOne(inspectionId);

    if (inspection.status !== InspectionStatus.COMPLETED) {
      throw new BadRequestException('Denetim önce tamamlanmalıdır');
    }

    await this.inspectionRepo.update(inspectionId, {
      status: InspectionStatus.SUBMITTED,
      submittedAt: new Date(),
    });

    await this.auditService.log({
      userId: inspectorId,
      action: 'INSPECTION_SUBMITTED',
      entityType: 'Inspection',
      entityId: inspectionId,
    });

    return this.findOne(inspectionId);
  }

  // ─── Teknik Yönetici Onayı / İadesi ──────────────────────────────────────
  async review(
    inspectionId: string,
    action: 'approve' | 'reject' | 'request_revision',
    reviewerNote: string,
    reviewerId: string,
  ): Promise<Inspection> {
    const inspection = await this.findOne(inspectionId);

    if (inspection.status !== InspectionStatus.SUBMITTED &&
        inspection.status !== InspectionStatus.UNDER_REVIEW) {
      throw new BadRequestException('Bu denetim inceleme aşamasında değil');
    }

    const statusMap = {
      approve: InspectionStatus.APPROVED,
      reject: InspectionStatus.REJECTED,
      request_revision: InspectionStatus.REVISION_REQUESTED,
    };

    const updates = {
      status: statusMap[action],
      reviewerNotes: reviewerNote,
      reviewedById: reviewerId,
      reviewedAt: new Date(),
    };

    try {
      await this.inspectionRepo.update(
        { id: inspectionId, version: inspection.version },
        updates,
      );
    } catch (e) {
      throw new ConflictException('Bu kayıt başka biri tarafından güncellendi. Sayfayı yenileyip tekrar deneyin.');
    }

    await this.auditService.log({
      userId: reviewerId,
      action: `INSPECTION_${action.toUpperCase()}`,
      entityType: 'Inspection',
      entityId: inspectionId,
      newValues: { action, reviewerNote },
    });

    // Onay sonrası otomatik rapor oluştur
    if (action === 'approve') {
      try {
        const reportsService = this.moduleRef.get('ReportsService', { strict: false });
        if (reportsService) {
          await reportsService.createFromInspection(inspectionId, reviewerId);
        }
      } catch (e) {
        // Rapor oluşturma hatası denetim onayını engellememeli
        // Log the error but don't throw
      }
    }

    return this.findOne(inspectionId);
  }

  // ─── OFFLINE SYNC — Ana endpoint ─────────────────────────────────────────
  async syncOffline(
    payload: OfflineSyncPayload,
    inspectorId: string,
  ): Promise<{ inspectionId: string; conflicts: string[] }> {
    const conflicts: string[] = [];

    // localUuid ile daha önce sync edilmiş mi?
    const existing = await this.inspectionRepo.findOne({
      where: { localUuid: payload.localUuid },
    });

    let inspection: Inspection;

    if (existing) {
      // Çakışma kontrolü: sunucuda daha yeni değişiklik var mı?
      if (
        existing.status === InspectionStatus.APPROVED ||
        existing.status === InspectionStatus.REJECTED
      ) {
        conflicts.push('Denetim zaten incelendi, offline değişiklikler uygulanamaz');
        return { inspectionId: existing.id, conflicts };
      }
      inspection = existing;
    } else {
      // Yeni denetim olarak oluştur
      inspection = await this.inspectionRepo.save(
        this.inspectionRepo.create({
          ...payload.inspection,
          inspectorId,
          localUuid: payload.localUuid,
          offlineCreated: true,
          deviceTimestamp: new Date(payload.deviceTimestamp),
          serverTimestamp: new Date(),
          syncStatus: SyncStatus.SYNCED,
          status: payload.inspection.status as InspectionStatus || InspectionStatus.IN_PROGRESS,
        }),
      );
    }

    // Alan değerlerini upsert et
    if (payload.fieldValues?.length) {
      await this.saveFieldValues(inspection.id, { fieldValues: payload.fieldValues }, inspectorId);
    }

    // Uygunsuzluklar
    if (payload.nonconformities?.length) {
      for (const nc of payload.nonconformities) {
        await this.addNonconformity(inspection.id, nc, inspectorId);
      }
    }

    // Kullanılan aletler
    if (payload.usedInstrumentIds?.length) {
      for (const instrumentId of payload.usedInstrumentIds) {
        await this.instrumentRepo.save(
          this.instrumentRepo.create({ inspectionId: inspection.id, instrumentId }),
        );
      }
    }

    // Fotoğraflar — sync_status: pending olarak kaydedilir, presigned URL ile ayrıca yüklenir
    if (payload.photos?.length) {
      for (const p of payload.photos) {
        const existingPhoto = await this.photoRepo.findOne({
          where: { inspectionId: inspection.id, localPath: p.localPath },
        });
        if (!existingPhoto) {
          await this.photoRepo.save(
            this.photoRepo.create({
              inspectionId: inspection.id,
              fieldKey: p.fieldKey,
              localPath: p.localPath,
              takenAt: new Date(p.takenAt),
              latitude: p.latitude,
              longitude: p.longitude,
              caption: p.caption,
              syncStatus: SyncStatus.PENDING,
            }),
          );
        }
      }
    }

    // Tamamlandıysa complete işlemi uygula
    if (
      payload.overallResult &&
      payload.inspection.status === InspectionStatus.COMPLETED
    ) {
      await this.inspectionRepo.update(inspection.id, {
        overallResult: payload.overallResult,
        status: InspectionStatus.COMPLETED,
        completedAt: new Date(payload.deviceTimestamp),
      });
    }

    await this.auditService.log({
      userId: inspectorId,
      action: 'INSPECTION_OFFLINE_SYNCED',
      entityType: 'Inspection',
      entityId: inspection.id,
      newValues: { localUuid: payload.localUuid, deviceTimestamp: payload.deviceTimestamp },
    });

    return { inspectionId: inspection.id, conflicts };
  }

  // ─── Presigned URL (fotoğraf yükleme) ────────────────────────────────────
  async getPhotoUploadUrl(
    inspectionId: string,
    photoId: string,
    userId: string,
  ): Promise<{ uploadUrl: string; objectName: string }> {
    const photo = await this.photoRepo.findOne({
      where: { id: photoId, inspectionId },
    });
    if (!photo) throw new NotFoundException('Fotoğraf kaydı bulunamadı');

    const objectName = `inspections/${inspectionId}/photos/${photoId}.jpg`;
    const uploadUrl = await this.storageService.getPresignedUploadUrl(
      StorageBucket.PHOTOS,
      objectName,
    );

    return { uploadUrl, objectName };
  }

  // ─── Yardımcı metodlar ────────────────────────────────────────────────────
  async findAll(
    filters: {
      status?: string;
      inspectorId?: string;
      equipmentId?: string;
      startDate?: string;
      endDate?: string;
      companyId?: string;
    },
    pagination: PaginationDto,
  ): Promise<PaginatedResult<Inspection>> {
    const qb = this.inspectionRepo
      .createQueryBuilder('i')
      .leftJoinAndSelect('i.fieldValues', 'fieldValues')
      .leftJoinAndSelect('i.photos', 'photos')
      .leftJoinAndSelect('i.nonconformities', 'nonconformities');

    if (filters.status) qb.andWhere('i.status = :status', { status: filters.status });
    if (filters.inspectorId) qb.andWhere('i.inspectorId = :iid', { iid: filters.inspectorId });
    if (filters.equipmentId) qb.andWhere('i.equipmentId = :eid', { eid: filters.equipmentId });
    if (filters.startDate) qb.andWhere('i.startedAt >= :start', { start: filters.startDate });
    if (filters.endDate) qb.andWhere('i.startedAt <= :end', { end: filters.endDate });

    // Tenant isolation: filter inspections through equipment → customer → companyId
    if (filters.companyId) {
      qb.innerJoin('i.equipment', 'eq')
        .innerJoin('eq.customer', 'cust')
        .andWhere('cust.companyId = :companyId', { companyId: filters.companyId });
    }

    qb.orderBy('i.createdAt', 'DESC').skip(pagination.skip).take(pagination.limit);

    const [data, total] = await qb.getManyAndCount();
    return new PaginatedResult(data, total, pagination.page, pagination.limit);
  }

  async findOne(id: string): Promise<Inspection> {
    const inspection = await this.inspectionRepo.findOne({
      where: { id },
      relations: ['fieldValues', 'photos', 'nonconformities', 'usedInstruments'],
    });
    if (!inspection) throw new NotFoundException('Denetim bulunamadı');
    return inspection;
  }

  async getPendingSync(): Promise<Inspection[]> {
    return this.inspectionRepo.find({
      where: { syncStatus: SyncStatus.PENDING },
    });
  }

  private assertCanEdit(inspection: Inspection, userId: string): void {
    if (inspection.inspectorId !== userId) {
      throw new ForbiddenException('Bu denetime erişim yetkiniz yok');
    }
    const editableStatuses = [InspectionStatus.DRAFT, InspectionStatus.IN_PROGRESS, InspectionStatus.REVISION_REQUESTED];
    if (!editableStatuses.includes(inspection.status)) {
      throw new BadRequestException(`'${inspection.status}' durumundaki denetim düzenlenemez`);
    }
  }
}

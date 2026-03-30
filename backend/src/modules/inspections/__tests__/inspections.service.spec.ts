import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { InspectionsService } from '../inspections.service';
import {
  Inspection, InspectionFieldValue, InspectionPhoto,
  InspectionNonconformity, InspectionInstrument,
  InspectionStatus, InspectionResult, SyncStatus,
} from '../entities/inspection.entity';
import { AuditService } from '@/modules/audit/audit.service';
import { EquipmentService } from '@/modules/equipment/equipment.service';
import { FormTemplatesService } from '@/modules/form-templates/form-templates.service';
import { StorageService } from '@/modules/storage/storage.service';
import { WorkOrdersService } from '@/modules/work-orders/work-orders.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { InspectionValidationService } from '../inspection-validation.service';

const mockRepo = () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  findAndCount: jest.fn(),
  count: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
  create: jest.fn().mockImplementation((d: any) => d),
  createQueryBuilder: jest.fn().mockReturnValue({
    andWhere: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
  }),
});

const mockInspection = (overrides = {}): Partial<Inspection> => ({
  id: 'insp-uuid-001',
  inspectorId: 'user-uuid-123',
  equipmentId: 'equip-uuid-001',
  formTemplateId: 'tmpl-uuid-001',
  formTemplateRevision: 'Rev.03',
  status: InspectionStatus.IN_PROGRESS,
  fieldValues: [],
  photos: [],
  nonconformities: [],
  usedInstruments: [],
  syncStatus: SyncStatus.SYNCED,
  ...overrides,
});

describe('InspectionsService', () => {
  let service: InspectionsService;
  let inspectionRepo: ReturnType<typeof mockRepo>;
  let fieldValueRepo: ReturnType<typeof mockRepo>;
  let photoRepo: ReturnType<typeof mockRepo>;
  let nonconformityRepo: ReturnType<typeof mockRepo>;
  let instrumentRepo: ReturnType<typeof mockRepo>;
  let equipmentService: jest.Mocked<EquipmentService>;
  let formTemplatesService: jest.Mocked<FormTemplatesService>;

  beforeEach(async () => {
    inspectionRepo    = mockRepo();
    fieldValueRepo    = mockRepo();
    photoRepo         = mockRepo();
    nonconformityRepo = mockRepo();
    instrumentRepo    = mockRepo();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InspectionsService,
        { provide: getRepositoryToken(Inspection),             useValue: inspectionRepo },
        { provide: getRepositoryToken(InspectionFieldValue),  useValue: fieldValueRepo },
        { provide: getRepositoryToken(InspectionPhoto),       useValue: photoRepo },
        { provide: getRepositoryToken(InspectionNonconformity), useValue: nonconformityRepo },
        { provide: getRepositoryToken(InspectionInstrument),  useValue: instrumentRepo },
        { provide: AuditService, useValue: { log: jest.fn().mockResolvedValue(undefined) } },
        {
          provide: EquipmentService,
          useValue: {
            findOne: jest.fn().mockResolvedValue({ id: 'equip-uuid-001', equipmentTypeId: 'type-001', controlPeriodMonths: 12 }),
            updateAfterInspection: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: FormTemplatesService,
          useValue: {
            findOne: jest.fn().mockResolvedValue({
              id: 'tmpl-uuid-001',
              revision: 'Rev.03',
              fields: [
                { fieldKey: 'capacity', label: 'Kapasite', isRequired: true },
                { fieldKey: 'condition', label: 'Durum', isRequired: true },
                { fieldKey: 'notes', label: 'Notlar', isRequired: false },
              ],
            }),
          },
        },
        { provide: StorageService, useValue: { uploadFile: jest.fn(), getFileByUrl: jest.fn(), getPresignedUploadUrl: jest.fn() } },
        {
          provide: WorkOrdersService,
          useValue: { updateStatus: jest.fn().mockResolvedValue(undefined) },
        },
        { provide: NotificationsService, useValue: { sendEmail: jest.fn() } },
        { provide: InspectionValidationService, useValue: { validateCompletion: jest.fn().mockReturnValue([]) } },
        { provide: 'winston', useValue: { log: jest.fn(), warn: jest.fn(), error: jest.fn() } },
      ],
    }).compile();

    service = module.get<InspectionsService>(InspectionsService);
    equipmentService = module.get(EquipmentService);
    formTemplatesService = module.get(FormTemplatesService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── start ────────────────────────────────────────────────────────────────
  describe('start', () => {
    it('yeni denetim başlatmalı', async () => {
      inspectionRepo.findOne.mockResolvedValueOnce(null); // Açık denetim yok
      inspectionRepo.save.mockResolvedValue(mockInspection() as Inspection);
      inspectionRepo.findOne.mockResolvedValue(mockInspection() as Inspection);

      const result = await service.start(
        { equipmentId: 'equip-uuid-001', formTemplateId: 'tmpl-uuid-001' },
        'user-uuid-123',
      );

      expect(result).toBeDefined();
      expect(inspectionRepo.save).toHaveBeenCalled();
    });

    it('aynı ekipman için açık denetim varsa BadRequestException fırlatmalı', async () => {
      inspectionRepo.findOne.mockResolvedValue(mockInspection({ status: InspectionStatus.IN_PROGRESS }) as Inspection);

      await expect(
        service.start({ equipmentId: 'equip-uuid-001', formTemplateId: 'tmpl-uuid-001' }, 'user-uuid-123'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── saveFieldValues ──────────────────────────────────────────────────────
  describe('saveFieldValues', () => {
    it('alan değerlerini upsert etmeli', async () => {
      inspectionRepo.findOne.mockResolvedValue(mockInspection() as Inspection);
      fieldValueRepo.findOne.mockResolvedValue(null); // Yeni kayıt
      fieldValueRepo.save.mockResolvedValue({ id: 'fv-001' } as any);

      await service.saveFieldValues(
        'insp-uuid-001',
        { fieldValues: [{ fieldKey: 'capacity', valueText: '5 ton' }] },
        'user-uuid-123',
      );

      expect(fieldValueRepo.save).toHaveBeenCalled();
    });

    it('başka kullanıcının denetimine erişimi reddetmeli', async () => {
      inspectionRepo.findOne.mockResolvedValue(
        mockInspection({ inspectorId: 'other-user-uuid' }) as Inspection,
      );

      await expect(
        service.saveFieldValues('insp-uuid-001', { fieldValues: [] }, 'user-uuid-123'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── complete ─────────────────────────────────────────────────────────────
  describe('complete', () => {
    it('zorunlu alanlar eksikse BadRequestException fırlatmalı', async () => {
      const inspection = mockInspection({ fieldValues: [] });
      inspectionRepo.findOne.mockResolvedValue(inspection as Inspection);
      fieldValueRepo.findOne.mockResolvedValue(null);
      fieldValueRepo.save.mockResolvedValue({} as any);
      fieldValueRepo.find.mockResolvedValue([]); // Hiçbir alan girilmemiş

      await expect(
        service.complete('insp-uuid-001', { overallResult: InspectionResult.COMPLIANT }, 'user-uuid-123'),
      ).rejects.toThrow(BadRequestException);
    });

    it('tüm zorunlu alanlar doldurulmuşsa tamamlanmalı', async () => {
      const inspection = mockInspection({
        fieldValues: [
          { fieldKey: 'capacity' } as any,
          { fieldKey: 'condition' } as any,
        ],
      });
      inspectionRepo.findOne.mockResolvedValue(inspection as Inspection);
      fieldValueRepo.findOne.mockResolvedValue(null);
      fieldValueRepo.save.mockResolvedValue({} as any);
      // Tüm zorunlu alanlar mevcut
      fieldValueRepo.find.mockResolvedValue([
        { fieldKey: 'capacity', valueText: '5 ton' } as any,
        { fieldKey: 'condition', valueText: 'iyi' } as any,
      ]);
      inspectionRepo.update.mockResolvedValue({ affected: 1 } as any);

      await service.complete(
        'insp-uuid-001',
        { overallResult: InspectionResult.COMPLIANT },
        'user-uuid-123',
      );

      expect(inspectionRepo.update).toHaveBeenCalledWith(
        'insp-uuid-001',
        expect.objectContaining({ status: InspectionStatus.COMPLETED }),
      );
      expect(equipmentService.updateAfterInspection).toHaveBeenCalled();
    });
  });

  // ─── syncOffline ──────────────────────────────────────────────────────────
  describe('syncOffline', () => {
    it('yeni offline denetimi kaydetmeli', async () => {
      const localUuid = 'local_123_abc';
      inspectionRepo.findOne
        .mockResolvedValueOnce(null)    // localUuid kontrolü — bulunamadı
        .mockResolvedValue(mockInspection({ localUuid }) as Inspection);
      inspectionRepo.save.mockResolvedValue(mockInspection({ localUuid }) as Inspection);
      fieldValueRepo.findOne.mockResolvedValue(null);
      fieldValueRepo.save.mockResolvedValue({} as any);

      const result = await service.syncOffline(
        {
          localUuid,
          inspection: {
            equipmentId: 'equip-uuid-001',
            formTemplateId: 'tmpl-uuid-001',
            status: InspectionStatus.IN_PROGRESS,
          } as any,
          fieldValues: [{ fieldKey: 'capacity', valueText: '5 ton' }],
          deviceTimestamp: new Date().toISOString(),
        },
        'user-uuid-123',
      );

      expect(result.inspectionId).toBeDefined();
      expect(result.conflicts).toHaveLength(0);
    });

    it('zaten senkronize edilmiş localUuid için çakışma döndürmemeli', async () => {
      const existing = mockInspection({
        localUuid: 'existing-uuid',
        status: InspectionStatus.IN_PROGRESS,
      });
      inspectionRepo.findOne.mockResolvedValue(existing as Inspection);
      fieldValueRepo.findOne.mockResolvedValue(null);
      fieldValueRepo.save.mockResolvedValue({} as any);

      const result = await service.syncOffline(
        {
          localUuid: 'existing-uuid',
          inspection: { equipmentId: 'equip-uuid-001', formTemplateId: 'tmpl-uuid-001', status: InspectionStatus.COMPLETED } as any,
          fieldValues: [],
          deviceTimestamp: new Date().toISOString(),
        },
        'user-uuid-123',
      );

      expect(result.conflicts).toHaveLength(0);
    });

    it('onaylanmış denetim üzerine sync conflict döndürmeli', async () => {
      inspectionRepo.findOne.mockResolvedValue(
        mockInspection({ status: InspectionStatus.APPROVED, localUuid: 'approved-uuid' }) as Inspection,
      );

      const result = await service.syncOffline(
        {
          localUuid: 'approved-uuid',
          inspection: { status: InspectionStatus.COMPLETED } as any,
          fieldValues: [],
          deviceTimestamp: new Date().toISOString(),
        },
        'user-uuid-123',
      );

      expect(result.conflicts.length).toBeGreaterThan(0);
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { FormTemplatesService } from '../form-templates.service';
import { FormTemplate, FormField, FormStatus } from '../entities/form-template.entity';
import { AuditService } from '@/modules/audit/audit.service';
import { StorageService } from '@/modules/storage/storage.service';

const mockTemplate = (overrides = {}): Partial<FormTemplate> => ({
  id:         'tmpl-uuid-001',
  code:       'FRM-KIE-001',
  name:       'Kaldırma Ekipmanı Kontrol Formu',
  revision:   'Rev.03',
  status:     FormStatus.DRAFT,
  fields:     [],
  equipmentTypeId: 'type-uuid-001',
  ...overrides,
});

describe('FormTemplatesService', () => {
  let service: FormTemplatesService;
  let templateRepo: any;
  let auditService: jest.Mocked<AuditService>;
  let storageService: jest.Mocked<StorageService>;

  beforeEach(async () => {
    templateRepo = {
      findOne:  jest.fn(),
      find:     jest.fn().mockResolvedValue([]),
      count:    jest.fn().mockResolvedValue(0),
      save:     jest.fn(),
      update:   jest.fn().mockResolvedValue({ affected: 1 }),
      create:   jest.fn().mockImplementation((d: any) => d),
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
      createQueryBuilder: jest.fn().mockReturnValue({
        andWhere:        jest.fn().mockReturnThis(),
        orderBy:         jest.fn().mockReturnThis(),
        skip:            jest.fn().mockReturnThis(),
        take:            jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FormTemplatesService,
        { provide: getRepositoryToken(FormTemplate), useValue: templateRepo },
        { provide: getRepositoryToken(FormField), useValue: {
          find: jest.fn().mockResolvedValue([]),
          save: jest.fn().mockResolvedValue([]),
          create: jest.fn().mockImplementation((d: any) => d),
          createQueryBuilder: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            getMany: jest.fn().mockResolvedValue([]),
          }),
        }},
        { provide: AuditService,   useValue: { log: jest.fn().mockResolvedValue(undefined) } },
        { provide: StorageService, useValue: {
          uploadFile:        jest.fn().mockResolvedValue({ url: 'http://minio/tmpl.pdf', objectName: 'templates/tmpl.pdf' }),
          getFileByUrl:      jest.fn().mockResolvedValue(Buffer.from('pdf')),
          deleteFile:        jest.fn().mockResolvedValue(undefined),
        }},
      ],
    }).compile();

    service       = module.get<FormTemplatesService>(FormTemplatesService);
    auditService  = module.get(AuditService);
    storageService = module.get(StorageService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── create ───────────────────────────────────────────────────────────────
  describe('create', () => {
    it('yeni form şablonu oluşturmalı', async () => {
      templateRepo.findOne
        .mockResolvedValueOnce(null) // code exists check
        .mockResolvedValueOnce({ ...mockTemplate(), fields: [] } as any); // findOne after save
      templateRepo.save.mockResolvedValue(mockTemplate() as FormTemplate);

      const result = await service.create(
        { code: 'FRM-KIE-001', name: 'Test', revision: 'Rev.01', equipmentTypeId: 'type-001', fields: [], layoutConfig: {} },
        'user-uuid',
      );

      expect(templateRepo.save).toHaveBeenCalled();
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'FORM_TEMPLATE_CREATED' }),
      );
    });

    it('aynı kod + revizyon tekrar oluşturulamamalı', async () => {
      templateRepo.findOne.mockResolvedValue(mockTemplate() as FormTemplate);
      await expect(
        service.create({ code: 'FRM-KIE-001', name: 'X', revision: 'Rev.03', equipmentTypeId: 't', fields: [], layoutConfig: {} }, 'user'),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ─── findOne ──────────────────────────────────────────────────────────────
  describe('findOne', () => {
    it('ID ile template bulmalı', async () => {
      templateRepo.findOne.mockResolvedValue(mockTemplate() as FormTemplate);
      const result = await service.findOne('tmpl-uuid-001');
      expect(result.code).toBe('FRM-KIE-001');
    });

    it('bulunamazsa NotFoundException fırlatmalı', async () => {
      templateRepo.findOne.mockResolvedValue(null);
      await expect(service.findOne('no-id')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── activate ─────────────────────────────────────────────────────────────
  describe('activate', () => {
    it('draft + pdf yüklüyse aktif etmeli', async () => {
      const draft = mockTemplate({ status: FormStatus.DRAFT, outputTemplateUrl: 'http://minio/tmpl.pdf' });
      templateRepo.findOne.mockResolvedValue(draft as FormTemplate);
      templateRepo.update.mockResolvedValue({ affected: 1 } as any);
      // Aynı tip için başka aktif form yok
      templateRepo.find.mockResolvedValue([]);

      await service.activate('tmpl-uuid-001', 'user-uuid');

      expect(templateRepo.update).toHaveBeenCalledWith(
        'tmpl-uuid-001',
        expect.objectContaining({ status: FormStatus.ACTIVE }),
      );
    });

    it('PDF yüklü değilse aktif etmemeli', async () => {
      const draft = mockTemplate({ status: FormStatus.DRAFT, outputTemplateUrl: null });
      templateRepo.findOne.mockResolvedValue(draft as FormTemplate);

      await expect(service.activate('tmpl-uuid-001', 'user')).rejects.toThrow(BadRequestException);
    });

    it('aktif form varsa superseded yapmalı', async () => {
      const draft  = mockTemplate({ status: FormStatus.DRAFT, outputTemplateUrl: 'http://minio/tmpl.pdf', fields: [] });
      const active = mockTemplate({ id: 'old-tmpl', status: FormStatus.ACTIVE });
      templateRepo.findOne
        .mockResolvedValueOnce(draft as FormTemplate) // findOne(templateId) in activate
        .mockResolvedValueOnce(active as FormTemplate) // findOne(currentActive) check
        .mockResolvedValueOnce({ ...draft, status: FormStatus.ACTIVE } as FormTemplate); // findOne at end of activate (return)
      templateRepo.update.mockResolvedValue({ affected: 1 } as any);

      await service.activate('tmpl-uuid-001', 'user-uuid');

      // Eski aktif form superseded olmalı
      expect(templateRepo.update).toHaveBeenCalledWith(
        'old-tmpl',
        expect.objectContaining({ status: FormStatus.SUPERSEDED }),
      );
    });
  });

  // ─── createRevision ───────────────────────────────────────────────────────
  describe('createRevision', () => {
    it('mevcut aktif formdan yeni taslak oluşturmalı', async () => {
      const active = mockTemplate({
        status: FormStatus.ACTIVE,
        fields: [{ fieldKey: 'test', label: 'Test' }],
      });
      templateRepo.findOne.mockResolvedValue(active as FormTemplate);
      templateRepo.findOne.mockResolvedValueOnce(active as FormTemplate)
        .mockResolvedValueOnce(null) // yeni revizyon yok
        .mockResolvedValue(mockTemplate({ revision: 'Rev.04' }) as FormTemplate);
      templateRepo.save.mockResolvedValue(mockTemplate({ revision: 'Rev.04' }) as FormTemplate);

      const result = await service.createRevision('tmpl-uuid-001', 'Rev.04', 'user-uuid');

      expect(templateRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          revision: 'Rev.04',
          status: FormStatus.DRAFT,
        }),
      );
    });

    it('rev zaten mevcutsa ConflictException fırlatmalı', async () => {
      templateRepo.findOne
        .mockResolvedValueOnce(mockTemplate({ status: FormStatus.ACTIVE }) as FormTemplate)
        .mockResolvedValueOnce(mockTemplate({ revision: 'Rev.04' }) as FormTemplate); // zaten var

      await expect(
        service.createRevision('tmpl-uuid-001', 'Rev.04', 'user'),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ─── uploadTemplate ───────────────────────────────────────────────────────
  describe('uploadTemplate', () => {
    it('PDF şablonu yüklemeli ve url kaydetmeli', async () => {
      templateRepo.findOne.mockResolvedValue(mockTemplate() as FormTemplate);
      templateRepo.update.mockResolvedValue({ affected: 1 } as any);

      const pdfBuffer  = Buffer.from('fake pdf content');
      await service.uploadPdfTemplate('tmpl-uuid-001', pdfBuffer, 'form.pdf', 'user-uuid');

      expect(storageService.uploadFile).toHaveBeenCalled();
      expect(templateRepo.update).toHaveBeenCalledWith(
        'tmpl-uuid-001',
        expect.objectContaining({ outputTemplateUrl: 'http://minio/tmpl.pdf' }),
      );
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'FORM_TEMPLATE_PDF_UPLOADED' }),
      );
    });
  });

  // ─── findActiveForEquipmentType ──────────────────────────────────────────
  describe('findActiveForEquipmentType', () => {
    it('ekipman tipi için aktif formu döndürmeli', async () => {
      const active = mockTemplate({ status: FormStatus.ACTIVE });
      templateRepo.findOne.mockResolvedValue(active as FormTemplate);

      const result = await service.findActiveForEquipmentType('type-uuid-001');
      expect(result?.status).toBe(FormStatus.ACTIVE);
    });

    it('aktif form yoksa hata firlatmali', async () => {
      templateRepo.findOne.mockResolvedValue(null);
      await expect(service.findActiveForEquipmentType('type-unknown')).rejects.toThrow();
    });
  });
});

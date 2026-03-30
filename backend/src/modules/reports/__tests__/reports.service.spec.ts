import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { ReportsService } from '../reports.service';
import { Report, ReportStatus } from '../entities/report.entity';
import { PdfEngineService } from '../pdf-engine.service';
import { ESignatureService } from '../esignature.service';
import { StorageService, StorageBucket } from '@/modules/storage/storage.service';
import { AuditService } from '@/modules/audit/audit.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { InspectionsService } from '@/modules/inspections/inspections.service';
import { FormTemplatesService } from '@/modules/form-templates/form-templates.service';
import { EquipmentService } from '@/modules/equipment/equipment.service';
import { CustomersService } from '@/modules/customers/customers.service';
import { WorkOrdersService } from '@/modules/work-orders/work-orders.service';
import { InspectionStatus } from '@/modules/inspections/entities/inspection.entity';

const mockReport = (overrides = {}): Partial<Report> => ({
  id: 'report-uuid-001',
  reportNumber: 'R-2024-00001',
  inspectionId: 'insp-uuid-001',
  customerId: 'cust-uuid-001',
  equipmentId: 'equip-uuid-001',
  formTemplateId: 'tmpl-uuid-001',
  formTemplateRevision: 'Rev.03',
  status: ReportStatus.UNDER_REVIEW,
  pdfUrl: 'http://minio/reports/R-2024-00001.pdf',
  pdfObjectName: 'reports/2024/R-2024-00001.pdf',
  documentHash: '9cca06ce6b093aacad4657a5198cfceb531e04c69d602b30d1d05749173eae5f',
  reviewHistory: [],
  ...overrides,
});

describe('ReportsService', () => {
  let service: ReportsService;
  let reportRepo: any;
  let pdfEngine: jest.Mocked<PdfEngineService>;
  let eSignature: jest.Mocked<ESignatureService>;
  let storageService: jest.Mocked<StorageService>;
  let auditService: jest.Mocked<AuditService>;
  let notificationsService: jest.Mocked<NotificationsService>;
  let inspectionsService: jest.Mocked<InspectionsService>;

  beforeEach(async () => {
    reportRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      save: jest.fn(),
      update: jest.fn(),
      create: jest.fn().mockImplementation((d: any) => d),
      createQueryBuilder: jest.fn().mockReturnValue({
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: getRepositoryToken(Report), useValue: reportRepo },
        {
          provide: PdfEngineService,
          useValue: {
            generateInspectionReport: jest.fn().mockResolvedValue({ buffer: Buffer.from('pdf'), hash: 'testhash' }),
            computeHash: jest.fn().mockReturnValue('testhash'),
            verifyHash: jest.fn().mockReturnValue(true),
          },
        },
        {
          provide: ESignatureService,
          useValue: {
            initiateSigning: jest.fn().mockResolvedValue({ sessionId: 'sess-123', otpSent: true, message: 'OTP gönderildi' }),
            completeSigning: jest.fn().mockResolvedValue({
              signedPdfBuffer: Buffer.from('signed-pdf'),
              signedHash: 'signedhash',
              signatureData: { signerName: 'Teknik Yönetici', signTime: new Date().toISOString(), provider: 'mock' },
            }),
            verifySignature: jest.fn().mockResolvedValue({ valid: true, details: 'Geçerli' }),
          },
        },
        {
          provide: StorageService,
          useValue: {
            uploadFile: jest.fn().mockResolvedValue({ url: 'http://minio/test.pdf', objectName: 'reports/test.pdf' }),
            getFileByUrl: jest.fn().mockResolvedValue(Buffer.from('pdf content')),
            moveToArchive: jest.fn().mockResolvedValue('http://minio/archive/test_SIGNED.pdf'),
            getPresignedDownloadUrl: jest.fn().mockResolvedValue('http://presigned-url'),
          },
        },
        { provide: AuditService, useValue: { log: jest.fn().mockResolvedValue(undefined) } },
        {
          provide: NotificationsService,
          useValue: {
            notifyReportReady: jest.fn().mockResolvedValue(undefined),
            sendEmail: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: InspectionsService,
          useValue: {
            findOne: jest.fn().mockResolvedValue({
              id: 'insp-uuid-001',
              status: InspectionStatus.APPROVED,
              equipmentId: 'equip-uuid-001',
              formTemplateId: 'tmpl-uuid-001',
              workOrderId: null,
              fieldValues: [{ fieldKey: 'capacity', valueText: '5 ton' }],
              photos: [],
            }),
          },
        },
        {
          provide: FormTemplatesService,
          useValue: {
            findOne: jest.fn().mockResolvedValue({
              id: 'tmpl-uuid-001',
              revision: 'Rev.03',
              outputTemplateUrl: 'http://minio/templates/form.pdf',
              fields: [],
            }),
          },
        },
        {
          provide: EquipmentService,
          useValue: {
            findOne: jest.fn().mockResolvedValue({
              id: 'equip-uuid-001',
              customerId: 'cust-uuid-001',
              brand: 'ABUS', model: 'KS', capacity: '5 ton',
              inventoryCode: 'EKP-2024-001', serialNumber: 'SN001',
              location: { name: 'Fabrika' },
            }),
          },
        },
        {
          provide: CustomersService,
          useValue: {
            findOne: jest.fn().mockResolvedValue({
              id: 'cust-uuid-001',
              name: 'Test A.Ş.',
              contactEmail: 'test@musteri.com',
              taxNumber: '1234567890',
            }),
          },
        },
        {
          provide: WorkOrdersService,
          useValue: { updateStatus: jest.fn().mockResolvedValue(undefined) },
        },
        { provide: 'winston', useValue: { log: jest.fn(), warn: jest.fn(), error: jest.fn() } },
      ],
    }).compile();

    service       = module.get<ReportsService>(ReportsService);
    pdfEngine     = module.get(PdfEngineService);
    eSignature    = module.get(ESignatureService);
    storageService = module.get(StorageService);
    auditService  = module.get(AuditService);
    notificationsService = module.get(NotificationsService);
    inspectionsService   = module.get(InspectionsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── createFromInspection ─────────────────────────────────────────────────
  describe('createFromInspection', () => {
    it('onaylı denetimden rapor oluşturmalı ve PDF üretmeli', async () => {
      reportRepo.findOne.mockResolvedValueOnce(null); // Daha önce rapor yok
      reportRepo.save.mockResolvedValue(mockReport() as Report);
      reportRepo.findOne.mockResolvedValue(mockReport() as Report);

      const result = await service.createFromInspection('insp-uuid-001', 'user-uuid-123');

      expect(pdfEngine.generateInspectionReport).toHaveBeenCalled();
      expect(storageService.uploadFile).toHaveBeenCalledWith(
        StorageBucket.REPORTS, expect.any(Buffer), expect.any(String), 'application/pdf', expect.any(String),
      );
      expect(result.reportNumber).toMatch(/^R-\d{4}-\d{5}$/);
    });

    it('onaylanmamış denetimden rapor oluşturmamalı', async () => {
      (inspectionsService.findOne as jest.Mock).mockResolvedValue({
        status: InspectionStatus.SUBMITTED, // Onaylı değil
      });

      await expect(service.createFromInspection('insp-uuid-001', 'user-uuid-123'))
        .rejects.toThrow(BadRequestException);
    });

    it('ikinci kez oluşturmaya çalışınca BadRequestException fırlatmalı', async () => {
      reportRepo.findOne.mockResolvedValue(mockReport() as Report); // Zaten rapor var

      await expect(service.createFromInspection('insp-uuid-001', 'user-uuid-123'))
        .rejects.toThrow(BadRequestException);
    });
  });

  // ─── approve ──────────────────────────────────────────────────────────────
  describe('approve', () => {
    it('under_review raporunu onaylamalı', async () => {
      reportRepo.findOne.mockResolvedValue(mockReport({ status: ReportStatus.UNDER_REVIEW }) as Report);
      reportRepo.update.mockResolvedValue({ affected: 1 } as any);

      const result = await service.approve('report-uuid-001', 'İncelendi, uygun', 'reviewer-uuid');

      expect(reportRepo.update).toHaveBeenCalledWith(
        'report-uuid-001',
        expect.objectContaining({ status: ReportStatus.APPROVED }),
      );
    });

    it('approved raporunu onaylamaya çalışınca BadRequestException fırlatmalı', async () => {
      reportRepo.findOne.mockResolvedValue(mockReport({ status: ReportStatus.SIGNED }) as Report);

      await expect(service.approve('report-uuid-001', 'comment', 'user'))
        .rejects.toThrow(BadRequestException);
    });
  });

  // ─── initiateSign ─────────────────────────────────────────────────────────
  describe('initiateSign', () => {
    it('onaylı raporu imzalamaya başlatmalı', async () => {
      reportRepo.findOne.mockResolvedValue(mockReport({ status: ReportStatus.APPROVED }) as Report);
      reportRepo.update.mockResolvedValue({ affected: 1 } as any);

      const result = await service.initiateSign('report-uuid-001', '+905001234567', 'user-uuid');

      expect(eSignature.initiateSigning).toHaveBeenCalled();
      expect(result.sessionId).toBe('sess-123');
      expect(reportRepo.update).toHaveBeenCalledWith(
        'report-uuid-001',
        expect.objectContaining({ status: ReportStatus.UNDER_SIGNING }),
      );
    });

    it('onaylanmamış raporu imzalamaya başlatmamalı', async () => {
      reportRepo.findOne.mockResolvedValue(mockReport({ status: ReportStatus.UNDER_REVIEW }) as Report);

      await expect(service.initiateSign('report-uuid-001', '+90500', 'user'))
        .rejects.toThrow(BadRequestException);
    });
  });

  // ─── completeSigning ──────────────────────────────────────────────────────
  describe('completeSigning', () => {
    it('imzalamayı tamamlamalı, arşive taşımalı ve hash kaydetmeli', async () => {
      reportRepo.findOne
        .mockResolvedValueOnce(mockReport({ status: ReportStatus.UNDER_SIGNING }) as Report)
        .mockResolvedValue(mockReport({ status: ReportStatus.SIGNED }) as Report);
      reportRepo.update.mockResolvedValue({ affected: 1 } as any);

      const result = await service.completeSigning(
        'report-uuid-001', 'sess-123', '123456', 'Teknik Yönetici', 'user-uuid',
      );

      expect(eSignature.completeSigning).toHaveBeenCalled();
      expect(storageService.moveToArchive).toHaveBeenCalled();
      expect(reportRepo.update).toHaveBeenCalledWith(
        'report-uuid-001',
        expect.objectContaining({
          status: ReportStatus.SIGNED,
          signedDocumentHash: 'signedhash',
          signedById: 'user-uuid',
        }),
      );
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'REPORT_SIGNED' }),
      );
    });
  });

  // ─── deliver ──────────────────────────────────────────────────────────────
  describe('deliver', () => {
    it('imzalı raporu teslim etmeli ve müşteriye e-posta göndermeli', async () => {
      reportRepo.findOne
        .mockResolvedValueOnce(mockReport({ status: ReportStatus.SIGNED, signedPdfObjectName: 'archive/test.pdf' }) as Report)
        .mockResolvedValue(mockReport({ status: ReportStatus.DELIVERED }) as Report);
      reportRepo.update.mockResolvedValue({ affected: 1 } as any);

      await service.deliver('report-uuid-001', 'user-uuid');

      expect(notificationsService.notifyReportReady).toHaveBeenCalledWith(
        'test@musteri.com',
        expect.objectContaining({ reportNumber: 'R-2024-00001' }),
      );
      expect(reportRepo.update).toHaveBeenCalledWith(
        'report-uuid-001',
        expect.objectContaining({ status: ReportStatus.DELIVERED }),
      );
    });

    it('imzalanmamış raporu teslim etmemeli', async () => {
      reportRepo.findOne.mockResolvedValue(mockReport({ status: ReportStatus.APPROVED }) as Report);

      await expect(service.deliver('report-uuid-001', 'user')).rejects.toThrow(BadRequestException);
    });
  });

  // ─── verifyReport ─────────────────────────────────────────────────────────
  describe('verifyReport', () => {
    it('imzalı raporun bütünlüğünü doğrulamalı', async () => {
      reportRepo.findOne.mockResolvedValue(mockReport({
        status: ReportStatus.SIGNED,
        signedPdfUrl: 'http://archive/signed.pdf',
        signedDocumentHash: 'signedhash',
        signatureData: { signerName: 'TY', signTime: new Date().toISOString() } as any,
      }) as Report);

      const result = await service.verifyReport('R-2024-00001');

      expect(result.valid).toBe(true);
      expect(result.report?.reportNumber).toBe('R-2024-00001');
    });

    it('var olmayan rapor için valid: false dönmeli', async () => {
      reportRepo.findOne.mockResolvedValue(null);

      const result = await service.verifyReport('R-NONEXIST');
      expect(result.valid).toBe(false);
    });
  });
});

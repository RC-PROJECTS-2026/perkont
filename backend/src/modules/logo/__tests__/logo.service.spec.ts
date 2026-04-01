import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { LogoService } from '../logo.service';
import {
  LogoSyncQueue, LogoSyncStatus, LogoEntityType, LogoDirection,
} from '../entities/logo-sync-queue.entity';
import { LogoApiClient } from '../logo-api.client';
import { CustomersService } from '@/modules/customers/customers.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { AuditService } from '@/modules/audit/audit.service';
import { DataSource } from 'typeorm';

const mockQueueItem = (overrides = {}): Partial<LogoSyncQueue> => ({
  id: 'queue-uuid-001',
  entityType: LogoEntityType.CUSTOMER,
  entityId: 'cust-uuid-001',
  direction: LogoDirection.PUSH,
  payload: { CODE: 'ACME-001', DEFINITION_: 'ACME A.Ş.' } as any,
  status: LogoSyncStatus.PENDING,
  attemptCount: 0,
  ...overrides,
});

describe('LogoService', () => {
  let service: LogoService;
  let queueRepo: any;
  let logoClient: jest.Mocked<LogoApiClient>;
  let customersService: jest.Mocked<CustomersService>;
  let notificationsService: jest.Mocked<NotificationsService>;
  let auditService: jest.Mocked<AuditService>;

  beforeEach(async () => {
    queueRepo = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      save: jest.fn(),
      update: jest.fn(),
      create: jest.fn().mockImplementation((d: any) => d),
      createQueryBuilder: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
        getRawMany: jest.fn().mockResolvedValue([]),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LogoService,
        { provide: getRepositoryToken(LogoSyncQueue), useValue: queueRepo },
        {
          provide: LogoApiClient,
          useValue: {
            getCariKart:   jest.fn().mockResolvedValue(null),
            createCariKart: jest.fn().mockResolvedValue({ ref: 'LOGO-CARI-001' }),
            updateCariKart: jest.fn().mockResolvedValue(undefined),
            createInvoice:  jest.fn().mockResolvedValue({ ref: 'INV-001', ficheNo: 'F-2024-001' }),
          },
        },
        {
          provide: CustomersService,
          useValue: {
            findOne: jest.fn().mockResolvedValue({
              id: 'cust-uuid-001',
              code: 'ACME-001',
              name: 'ACME A.Ş.',
              taxNumber: '1234567890',
              logoCariId: null,
              contactPhone: '05001234567',
              contactEmail: 'test@acme.com',
              address: 'Test Mah.',
              city: 'İstanbul',
            }),
            update: jest.fn().mockResolvedValue({}),
          },
        },
        { provide: NotificationsService, useValue: { queueNotification: jest.fn().mockResolvedValue(undefined) } },
        { provide: AuditService, useValue: { log: jest.fn().mockResolvedValue(undefined) } },
        { provide: DataSource, useValue: { query: jest.fn().mockResolvedValue([{ affected: 1 }]) } },
        { provide: 'winston', useValue: { log: jest.fn(), warn: jest.fn(), error: jest.fn() } },
      ],
    }).compile();

    service = module.get<LogoService>(LogoService);
    logoClient = module.get(LogoApiClient);
    customersService = module.get(CustomersService);
    notificationsService = module.get(NotificationsService);
    auditService = module.get(AuditService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── enqueue ──────────────────────────────────────────────────────────────
  describe('enqueue', () => {
    it('kuyruğa yeni kayıt eklemeli', async () => {
      queueRepo.save.mockResolvedValue(mockQueueItem() as LogoSyncQueue);

      await service.enqueue(
        LogoEntityType.CUSTOMER, 'cust-uuid-001', LogoDirection.PUSH,
        { CODE: 'ACME-001' }, 'user-uuid',
      );

      expect(queueRepo.save).toHaveBeenCalled();
    });
  });

  // ─── processQueue (via processItem) ───────────────────────────────────────
  describe('processItem — CUSTOMER', () => {
    it('yeni cari kart oluşturmalı ve müşteri kaydını güncellemeli', async () => {
      const item = mockQueueItem() as LogoSyncQueue;
      queueRepo.update.mockResolvedValue({ affected: 1 } as any);
      logoClient.getCariKart.mockResolvedValue(null); // LOGO'da yok
      logoClient.createCariKart.mockResolvedValue({ ref: 'LOGO-001' });
      queueRepo.findOne.mockResolvedValue({ ...item, status: LogoSyncStatus.SUCCESS });

      // processItem private olduğu için processQueue üzerinden test
      queueRepo.find.mockResolvedValue([item]);
      await (service as any).processItem(item);

      expect(logoClient.createCariKart).toHaveBeenCalled();
      expect(customersService.update).toHaveBeenCalledWith(
        'cust-uuid-001',
        expect.objectContaining({ logoCariId: 'LOGO-001' }),
        'system',
      );
    });

    it('mevcut cari varsa güncelleme yapmalı', async () => {
      logoClient.getCariKart.mockResolvedValue({ CODE: 'ACME-001', DEFINITION_: 'ACME A.Ş.', TAXNR: '1234567890', TELNRS1: '02121234567', EMAILADDR: 'test@test.com', ADDR1: 'Test Adr', CITY: 'Istanbul' } as any);
      queueRepo.update.mockResolvedValue({ affected: 1 } as any);

      const item = mockQueueItem() as LogoSyncQueue;
      await (service as any).processItem(item);

      expect(logoClient.updateCariKart).toHaveBeenCalled();
      expect(logoClient.createCariKart).not.toHaveBeenCalled();
    });

    it('hata durumunda retry planlamalı', async () => {
      logoClient.getCariKart.mockRejectedValue(new Error('LOGO bağlantı hatası'));
      queueRepo.update.mockResolvedValue({ affected: 1 } as any);

      const item = mockQueueItem() as LogoSyncQueue;
      await (service as any).processItem(item);

      expect(queueRepo.update).toHaveBeenCalledWith(
        item.id,
        expect.objectContaining({
          status: LogoSyncStatus.PENDING,
          lastError: 'LOGO bağlantı hatası',
        }),
      );
    });

    it('5 denemeden sonra FAILED yapmalı ve alarm göndermeli', async () => {
      logoClient.getCariKart.mockRejectedValue(new Error('Kalıcı hata'));
      queueRepo.update.mockResolvedValue({ affected: 1 } as any);

      const item = { ...mockQueueItem(), attemptCount: 4 } as LogoSyncQueue;
      await (service as any).processItem(item);

      expect(queueRepo.update).toHaveBeenCalledWith(
        item.id,
        expect.objectContaining({ status: LogoSyncStatus.FAILED }),
      );
      expect(notificationsService.queueNotification).toHaveBeenCalled();
    });
  });

  // ─── retryAllFailed ───────────────────────────────────────────────────────
  describe('retryAllFailed', () => {
    it('tüm başarısız kayıtları pending yapmalı', async () => {
      queueRepo.find.mockResolvedValue([
        { id: 'q-001', status: LogoSyncStatus.FAILED },
        { id: 'q-002', status: LogoSyncStatus.FAILED },
      ]);
      queueRepo.update.mockResolvedValue({ affected: 1 } as any);

      const count = await service.retryAllFailed();
      expect(count).toBe(2);
    });
  });

  // ─── mapCustomerToLogoCari ────────────────────────────────────────────────
  describe('mapCustomerToLogoCari', () => {
    it('müşteriye LOGO cari ID atamalı', async () => {
      await service.mapCustomerToLogoCari('cust-uuid-001', 'LOGO-CARI-123', 'user-uuid');

      expect(customersService.update).toHaveBeenCalledWith(
        'cust-uuid-001',
        expect.objectContaining({ logoCariId: 'LOGO-CARI-123' }),
        'user-uuid',
      );
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'LOGO_CARI_MAPPED' }),
      );
    });
  });
});

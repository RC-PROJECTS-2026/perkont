import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { CustomersService } from '../customers.service';
import { Customer } from '../entities/customer.entity';
import { CustomerLocation } from '../entities/customer-location.entity';
import { AuditService } from '@/modules/audit/audit.service';

const mockCustomer = (overrides = {}): Partial<Customer> => ({
  id:       'cust-uuid-001',
  code:     'ACME-001',
  name:     'ACME A.Ş.',
  taxNumber: '1234567890',
  city:     'İstanbul',
  isActive:  true,
  locations: [],
  ...overrides,
});

describe('CustomersService', () => {
  let service: CustomersService;
  let customerRepo: any;
  let locationRepo: any;
  let auditService: jest.Mocked<AuditService>;

  beforeEach(async () => {
    customerRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      save: jest.fn(),
      update: jest.fn(),
      create: jest.fn().mockImplementation((d: any) => d),
      createQueryBuilder: jest.fn().mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      }),
    };

    locationRepo = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      save: jest.fn(),
      create: jest.fn().mockImplementation((d: any) => d),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomersService,
        { provide: getRepositoryToken(Customer), useValue: customerRepo },
        { provide: getRepositoryToken(CustomerLocation), useValue: locationRepo },
        { provide: AuditService, useValue: { log: jest.fn().mockResolvedValue(undefined) } },
      ],
    }).compile();

    service      = module.get<CustomersService>(CustomersService);
    auditService = module.get(AuditService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('create', () => {
    it('yeni müşteri oluşturmalı', async () => {
      customerRepo.findOne
        .mockResolvedValueOnce(null)  // code check — no taxNumber in DTO so skips tax check
        .mockResolvedValueOnce({ ...mockCustomer(), locations: [] } as any); // findOne after save
      customerRepo.save.mockResolvedValue(mockCustomer() as Customer);

      const result = await service.create(
        { code: 'ACME-001', name: 'ACME A.Ş.' },
        'user-uuid',
      );

      expect(customerRepo.save).toHaveBeenCalled();
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CUSTOMER_CREATED' }),
      );
    });

    it('aynı kod tekrar eklenemez', async () => {
      customerRepo.findOne.mockResolvedValue(mockCustomer() as Customer);

      await expect(
        service.create({ code: 'ACME-001', name: 'Test' }, 'user-uuid'),
      ).rejects.toThrow(ConflictException);
    });

    it('aynı vergi numarası tekrar eklenemez', async () => {
      customerRepo.findOne
        .mockResolvedValueOnce(null)        // kod kontrolü — yok
        .mockResolvedValueOnce(mockCustomer() as Customer); // vergi no kontrolü — mevcut

      await expect(
        service.create({ code: 'NEW-001', name: 'Test', taxNumber: '1234567890' }, 'user-uuid'),
      ).rejects.toThrow(ConflictException);
    });

    it('lokasyonlarla birlikte oluşturmalı', async () => {
      customerRepo.findOne
        .mockResolvedValueOnce(null)  // code check — no taxNumber so skips tax check
        .mockResolvedValueOnce({ ...mockCustomer(), id: 'cust-001', locations: [{ id: 'loc-001' }] } as any); // findOne after save
      customerRepo.save.mockResolvedValue({ ...mockCustomer(), id: 'cust-001' } as Customer);
      locationRepo.create = jest.fn().mockImplementation((d: any) => d);
      locationRepo.save.mockResolvedValue([{ id: 'loc-001' }]);

      await service.create(
        {
          code: 'ACME-002',
          name: 'Yeni Müşteri',
          locations: [{ name: 'Merkez Ofis', city: 'İstanbul' }],
        },
        'user-uuid',
      );

      expect(locationRepo.save).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('müşteriyi ID ile getirmeli', async () => {
      customerRepo.findOne.mockResolvedValue(mockCustomer() as Customer);
      const result = await service.findOne('cust-uuid-001');
      expect(result.code).toBe('ACME-001');
    });

    it('bulunamazsa NotFoundException fırlatmalı', async () => {
      customerRepo.findOne.mockResolvedValue(null);
      await expect(service.findOne('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('müşteri bilgilerini güncellemeli', async () => {
      const customer = mockCustomer() as Customer;
      customerRepo.findOne.mockResolvedValue(customer);
      customerRepo.save.mockResolvedValue({ ...customer, city: 'Ankara' } as Customer);

      await service.update('cust-uuid-001', { city: 'Ankara' }, 'user-uuid');

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CUSTOMER_UPDATED' }),
      );
    });
  });

  describe('deactivate', () => {
    it('müşteriyi pasife almalı', async () => {
      customerRepo.findOne.mockResolvedValue(mockCustomer() as Customer);
      customerRepo.update.mockResolvedValue({ affected: 1 } as any);
      // Cascading kontrol: acik sozlesme/WO/denetim yok
      customerRepo.manager = { query: jest.fn().mockResolvedValue([{ activeContracts: 0, openWorkOrders: 0, openInspections: 0 }]) } as any;

      await service.deactivate('cust-uuid-001', 'user-uuid');

      expect(customerRepo.update).toHaveBeenCalledWith(
        'cust-uuid-001', { isActive: false },
      );
    });
  });

  describe('createLocation', () => {
    it('müşteriye lokasyon eklemeli', async () => {
      customerRepo.findOne.mockResolvedValue(mockCustomer() as Customer);
      locationRepo.save.mockResolvedValue({ id: 'loc-001', name: 'Fabrika', customerId: 'cust-uuid-001' });

      const result = await service.createLocation('cust-uuid-001', { name: 'Fabrika' });
      expect(result.name).toBe('Fabrika');
    });
  });
});

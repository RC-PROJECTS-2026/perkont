import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { EquipmentService } from '../equipment.service';
import { Equipment, EquipmentStatus } from '../entities/equipment.entity';
import { EquipmentType } from '../entities/equipment-type.entity';
import { AuditService } from '@/modules/audit/audit.service';
import { StorageService } from '@/modules/storage/storage.service';
import { DataSource } from 'typeorm';

const mockEquipmentType = (): Partial<EquipmentType> => ({
  id: 'type-uuid-001',
  code: 'KIE',
  name: 'Kaldırma İletme Ekipmanları',
  defaultPeriodMonths: 12,
  isActive: true,
});

const mockEquipment = (overrides = {}): Partial<Equipment> => ({
  id:              'equip-uuid-001',
  inventoryCode:   'EKP-2024-0001',
  qrCode:          'PKT-ABCD1234',
  customerId:      'cust-uuid-001',
  equipmentTypeId: 'type-uuid-001',
  status:          EquipmentStatus.ACTIVE,
  controlPeriodMonths: 12,
  brand:           'ABUS',
  model:           'KS-5000',
  capacity:        '5 ton',
  ...overrides,
});

describe('EquipmentService', () => {
  let service: EquipmentService;
  let equipmentRepo: any;
  let typeRepo: any;
  let auditService: jest.Mocked<AuditService>;
  let storageService: jest.Mocked<StorageService>;

  beforeEach(async () => {
    equipmentRepo = {
      findOne:         jest.fn(),
      find:            jest.fn(),
      count:           jest.fn().mockResolvedValue(0),
      save:            jest.fn(),
      update:          jest.fn(),
      create:          jest.fn().mockImplementation((d: any) => d),
      createQueryBuilder: jest.fn().mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        andWhere:          jest.fn().mockReturnThis(),
        orderBy:           jest.fn().mockReturnThis(),
        skip:              jest.fn().mockReturnThis(),
        take:              jest.fn().mockReturnThis(),
        getManyAndCount:   jest.fn().mockResolvedValue([[], 0]),
      }),
    };

    typeRepo = {
      findOne:  jest.fn(),
      find:     jest.fn().mockResolvedValue([]),
      save:     jest.fn(),
      create:   jest.fn().mockImplementation((d: any) => d),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EquipmentService,
        { provide: getRepositoryToken(Equipment),     useValue: equipmentRepo },
        { provide: getRepositoryToken(EquipmentType), useValue: typeRepo },
        { provide: AuditService,  useValue: { log: jest.fn().mockResolvedValue(undefined) } },
        { provide: StorageService, useValue: { uploadFile: jest.fn().mockResolvedValue({ url: 'http://test/qr.png', objectName: 'qr.png' }) } },
        { provide: DataSource, useValue: { query: jest.fn().mockResolvedValue([]) } },
      ],
    }).compile();

    service       = module.get<EquipmentService>(EquipmentService);
    auditService  = module.get(AuditService);
    storageService = module.get(StorageService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── Equipment Types ──────────────────────────────────────────────────────
  describe('createType', () => {
    it('yeni ekipman tipi oluşturmalı', async () => {
      typeRepo.findOne.mockResolvedValue(null);
      typeRepo.save.mockResolvedValue(mockEquipmentType() as EquipmentType);

      const result = await service.createType({ code: 'KIE', name: 'Kaldırma İletme' });
      expect(typeRepo.save).toHaveBeenCalled();
      expect(result.code).toBe('KIE');
    });

    it('aynı kodla tekrar oluşturmamalı', async () => {
      typeRepo.findOne.mockResolvedValue(mockEquipmentType() as EquipmentType);
      await expect(service.createType({ code: 'KIE', name: 'Duplicate' }))
        .rejects.toThrow(ConflictException);
    });
  });

  describe('findAllTypes', () => {
    it('aktif tipleri döndürmeli', async () => {
      typeRepo.find.mockResolvedValue([mockEquipmentType()]);
      const result = await service.findAllTypes();
      expect(typeRepo.find).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true } }));
    });
  });

  // ─── Equipment CRUD ───────────────────────────────────────────────────────
  describe('create', () => {
    it('QR kodu ile yeni ekipman oluşturmalı', async () => {
      equipmentRepo.findOne.mockResolvedValue(null); // kod yok
      equipmentRepo.save.mockResolvedValue(mockEquipment() as Equipment);
      equipmentRepo.findOne.mockResolvedValueOnce(null)
        .mockResolvedValue({ ...mockEquipment(), equipmentType: mockEquipmentType() } as any);
      // Mock location check query — location belongs to customer
      const ds = (service as any).dataSource;
      ds.query.mockResolvedValueOnce([{ id: 'loc-uuid-001', customerId: 'cust-uuid-001' }]);

      const result = await service.create(
        { customerId: 'cust-uuid-001', locationId: 'loc-uuid-001', equipmentTypeId: 'type-uuid-001', inventoryCode: 'EKP-2024-0001' },
        'user-uuid',
      );

      expect(equipmentRepo.save).toHaveBeenCalled();
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'EQUIPMENT_CREATED' }),
      );
    });

    it('aynı envanter koduyla oluşturmamalı', async () => {
      const ds = (service as any).dataSource;
      ds.query.mockResolvedValueOnce([{ id: 'loc-1', customerId: 'c' }]);
      equipmentRepo.findOne.mockResolvedValue(mockEquipment() as Equipment);
      await expect(
        service.create({ customerId: 'c', locationId: 'loc-1', equipmentTypeId: 't', inventoryCode: 'EKP-2024-0001' }, 'user'),
      ).rejects.toThrow(ConflictException);
    });

    it('controlPeriodMonths ve firstUseDate varsa nextControlDate hesaplamalı', async () => {
      const ds = (service as any).dataSource;
      ds.query.mockResolvedValueOnce([{ id: 'loc-uuid-001', customerId: 'cust-uuid-001' }]);
      equipmentRepo.findOne.mockResolvedValueOnce(null);
      equipmentRepo.save.mockResolvedValue(mockEquipment() as Equipment);
      equipmentRepo.findOne.mockResolvedValue(mockEquipment() as Equipment);

      await service.create({
        customerId: 'cust-uuid-001', locationId: 'loc-uuid-001', equipmentTypeId: 't', inventoryCode: 'NEW-001',
        controlPeriodMonths: 12,
        firstUseDate: '2024-01-01',
      }, 'user');

      expect(equipmentRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ nextControlDate: expect.any(Date) }),
      );
    });
  });

  describe('findOne', () => {
    it('ID ile ekipman bulmalı', async () => {
      equipmentRepo.findOne.mockResolvedValue(mockEquipment() as Equipment);
      const result = await service.findOne('equip-uuid-001');
      expect(result.inventoryCode).toBe('EKP-2024-0001');
    });

    it('bulunamazsa NotFoundException fırlatmalı', async () => {
      equipmentRepo.findOne.mockResolvedValue(null);
      await expect(service.findOne('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByQrCode', () => {
    it('QR kodu ile ekipman bulmalı', async () => {
      equipmentRepo.findOne.mockResolvedValue(mockEquipment() as Equipment);
      const result = await service.findByQrCode('PKT-ABCD1234');
      expect(result.qrCode).toBe('PKT-ABCD1234');
    });

    it('QR kodu yoksa NotFoundException fırlatmalı', async () => {
      equipmentRepo.findOne.mockResolvedValue(null);
      await expect(service.findByQrCode('WRONG-QR')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('ekipman bilgilerini güncellemeli ve audit log kaydetmeli', async () => {
      equipmentRepo.findOne.mockResolvedValue(mockEquipment() as Equipment);
      equipmentRepo.save.mockResolvedValue(mockEquipment({ status: EquipmentStatus.PASSIVE }) as Equipment);

      await service.update('equip-uuid-001', { status: EquipmentStatus.PASSIVE }, 'user-uuid');

      expect(equipmentRepo.save).toHaveBeenCalled();
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'EQUIPMENT_UPDATED' }),
      );
    });
  });

  describe('updateAfterInspection', () => {
    it('denetim sonrası lastControlDate ve nextControlDate güncellemeli', async () => {
      equipmentRepo.findOne.mockResolvedValue(mockEquipment({ controlPeriodMonths: 12 }) as Equipment);
      equipmentRepo.update.mockResolvedValue({ affected: 1 } as any);

      const inspectionDate = new Date('2024-06-01');
      await service.updateAfterInspection('equip-uuid-001', inspectionDate, 'uygun');

      expect(equipmentRepo.update).toHaveBeenCalledWith(
        'equip-uuid-001',
        expect.objectContaining({
          lastControlDate: inspectionDate,
          nextControlDate: expect.any(Date),
        }),
      );
    });
  });

  describe('getDueControls', () => {
    it('yaklaşan kontrol tarihli ekipmanları döndürmeli', async () => {
      const upcoming = [mockEquipment({ nextControlDate: new Date() as any })] as Equipment[];
      equipmentRepo.createQueryBuilder.mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(upcoming),
      });

      const result = await service.getDueControls(30);
      expect(result).toHaveLength(1);
    });
  });

  describe('generateQrLabel', () => {
    it('QR etiket buffer üretmeli', async () => {
      equipmentRepo.findOne.mockResolvedValue({
        ...mockEquipment(),
        equipmentType: mockEquipmentType(),
      } as any);

      const buffer = await service.generateQrLabel('equip-uuid-001');
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });
  });

  describe('bulkCreate', () => {
    it('birden fazla ekipmanı toplu oluşturmalı', async () => {
      const ds = (service as any).dataSource;
      ds.query.mockResolvedValue([{ id: 'loc-1', customerId: 'c' }]);
      // For each create: findOne(code) → null, then findOne(id) → equipment
      equipmentRepo.findOne
        .mockResolvedValueOnce(null).mockResolvedValueOnce({ ...mockEquipment(), customer: {}, location: {}, equipmentType: {} } as any)
        .mockResolvedValueOnce(null).mockResolvedValueOnce({ ...mockEquipment(), customer: {}, location: {}, equipmentType: {} } as any);
      equipmentRepo.save.mockResolvedValue(mockEquipment() as Equipment);

      const result = await service.bulkCreate(
        [
          { customerId: 'c', locationId: 'loc-1', equipmentTypeId: 't', inventoryCode: 'BULK-001' },
          { customerId: 'c', locationId: 'loc-1', equipmentTypeId: 't', inventoryCode: 'BULK-002' },
        ],
        'user-uuid',
      );

      expect(result.success).toBe(2);
      expect(result.failed).toBe(0);
    });

    it('hatalı kayıtları errors listesine eklemeli', async () => {
      const ds = (service as any).dataSource;
      ds.query.mockResolvedValue([{ id: 'loc-1', customerId: 'c' }]);
      // İlk başarılı, ikincisi çakışma hatası
      equipmentRepo.findOne
        .mockResolvedValueOnce(null) // first: code check pass
        .mockResolvedValueOnce(mockEquipment() as Equipment) // first: findOne after save
        .mockResolvedValueOnce(mockEquipment() as Equipment); // second: code check — exists!
      equipmentRepo.save.mockResolvedValue(mockEquipment() as Equipment);

      const result = await service.bulkCreate(
        [
          { customerId: 'c', locationId: 'loc-1', equipmentTypeId: 't', inventoryCode: 'BULK-OK-001' },
          { customerId: 'c', locationId: 'loc-1', equipmentTypeId: 't', inventoryCode: 'EKP-2024-0001' }, // duplicate
        ],
        'user-uuid',
      );

      expect(result.success).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
    });
  });
});

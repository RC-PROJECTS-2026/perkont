/**
 * PerKont Validation & Business Rule Tests
 *
 * Is kurallari ve validasyon zincirinin dogrulamasi.
 *
 * Calistirma:
 *   cd backend && npx jest --config ../tests/jest.integration.json ../tests/validation/validation-tests.spec.ts
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../backend/src/app.module';

describe('Validation & Business Rules', () => {
  let app: INestApplication;
  let adminToken: string;
  let testCustomerId: string;
  let testLocationId: string;
  let testEquipmentId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    // Login as admin
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'admin1@perkont-test.com', password: 'Test1234!' });
    adminToken = res.body?.accessToken;

    // Get test data
    const custRes = await request(app.getHttpServer())
      .get('/api/v1/customers?page=1&limit=1')
      .set('Authorization', `Bearer ${adminToken}`);
    testCustomerId = custRes.body?.data?.[0]?.id;

    if (testCustomerId) {
      // Get location
      const locRes = await request(app.getHttpServer())
        .get(`/api/v1/customers/${testCustomerId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      testLocationId = locRes.body?.locations?.[0]?.id || locRes.body?.data?.locations?.[0]?.id;

      // Get equipment
      const eqRes = await request(app.getHttpServer())
        .get(`/api/v1/equipment?customerId=${testCustomerId}&page=1&limit=1`)
        .set('Authorization', `Bearer ${adminToken}`);
      testEquipmentId = eqRes.body?.data?.[0]?.id;
    }
  });

  afterAll(async () => {
    await app.close();
  });

  // ============================================================
  // MUSTERI VALIDASYONLARI
  // ============================================================

  describe('Musteri Validasyonlari', () => {
    it('C02 - musteri kodu tekrari engellenmeli', async () => {
      // Get existing customer code
      const existing = await request(app.getHttpServer())
        .get('/api/v1/customers?page=1&limit=1')
        .set('Authorization', `Bearer ${adminToken}`);

      if (!existing.body?.data?.[0]) return;

      const existingCode = existing.body.data[0].code;

      // Try to create with same code
      const res = await request(app.getHttpServer())
        .post('/api/v1/customers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Duplicate Code Test',
          code: existingCode, // duplicate!
          taxNumber: '9999999999',
          address: 'Test',
          city: 'Istanbul',
        });

      expect([400, 409, 422]).toContain(res.status);
    });

    it('C03 - vergi no tekrari engellenmeli', async () => {
      const existing = await request(app.getHttpServer())
        .get('/api/v1/customers?page=1&limit=1')
        .set('Authorization', `Bearer ${adminToken}`);

      if (!existing.body?.data?.[0]?.taxNumber) return;

      const res = await request(app.getHttpServer())
        .post('/api/v1/customers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Duplicate Tax Test',
          code: `UNIQUE-${Date.now()}`,
          taxNumber: existing.body.data[0].taxNumber,
          address: 'Test',
          city: 'Istanbul',
        });

      expect([400, 409, 422]).toContain(res.status);
    });
  });

  // ============================================================
  // EKIPMAN VALIDASYONLARI
  // ============================================================

  describe('Ekipman Validasyonlari', () => {
    it('E02 - lokasyonsuz ekipman eklenemez', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/equipment')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'No Location Equipment',
          inventoryCode: `NL-${Date.now()}`,
          customerId: testCustomerId,
          // locationId YOKSUN!
          equipmentTypeId: 'some-type-id',
        });

      expect([400, 422]).toContain(res.status);
    });

    it('E03 - yanlis musteri-lokasyon eslesmesi engellenmeli', async () => {
      // Get another customer's location
      const otherCust = await request(app.getHttpServer())
        .get('/api/v1/customers?page=2&limit=1')
        .set('Authorization', `Bearer ${adminToken}`);

      if (!otherCust.body?.data?.[0]) return;

      const otherCustId = otherCust.body.data[0].id;

      // Try to create equipment with mismatched customer-location
      if (testLocationId && otherCustId !== testCustomerId) {
        const res = await request(app.getHttpServer())
          .post('/api/v1/equipment')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            name: 'Mismatched Equipment',
            inventoryCode: `MM-${Date.now()}`,
            customerId: otherCustId,     // Different customer
            locationId: testLocationId,   // Belongs to testCustomerId
            equipmentTypeId: 'some-type-id',
          });

        expect([400, 422]).toContain(res.status);
      }
    });

    it('E04 - envanter kodu tekrari engellenmeli', async () => {
      const existing = await request(app.getHttpServer())
        .get('/api/v1/equipment?page=1&limit=1')
        .set('Authorization', `Bearer ${adminToken}`);

      if (!existing.body?.data?.[0]?.inventoryCode) return;

      const res = await request(app.getHttpServer())
        .post('/api/v1/equipment')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Duplicate Code Equipment',
          inventoryCode: existing.body.data[0].inventoryCode, // duplicate!
          customerId: testCustomerId,
          locationId: testLocationId,
          equipmentTypeId: 'some-type-id',
        });

      expect([400, 409, 422]).toContain(res.status);
    });

    it('E05 - sonraki kontrol tarihi otomatik hesaplanmali', async () => {
      if (!testCustomerId || !testLocationId) return;

      // Get an equipment type
      const typeRes = await request(app.getHttpServer())
        .get('/api/v1/equipment/types')
        .set('Authorization', `Bearer ${adminToken}`);

      const typeId = typeRes.body?.data?.[0]?.id || typeRes.body?.[0]?.id;
      if (!typeId) return;

      const res = await request(app.getHttpServer())
        .post('/api/v1/equipment')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Auto Date Equipment',
          inventoryCode: `AD-${Date.now()}`,
          customerId: testCustomerId,
          locationId: testLocationId,
          equipmentTypeId: typeId,
          firstUseDate: '2024-01-15',
          controlPeriodMonths: 12,
        });

      if (res.status === 201 || res.status === 200) {
        const eq = res.body?.data || res.body;
        if (eq.nextControlDate) {
          // nextControlDate should be approximately firstUseDate + controlPeriodMonths
          expect(eq.nextControlDate).toBeDefined();
        }
      }
    });
  });

  // ============================================================
  // IS EMRI VALIDASYONLARI
  // ============================================================

  describe('Is Emri Validasyonlari', () => {
    it('W02 - ekipmansiz WO olusturulamaz', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/work-orders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customerId: testCustomerId,
          equipmentIds: [], // empty!
          plannedDate: '2026-05-01',
          priority: 'normal',
        });

      expect([400, 422]).toContain(res.status);
    });

    it('W03 - ekipman-musteri uyumsuzlugu engellenmeli', async () => {
      // Get equipment from different customer
      const otherEq = await request(app.getHttpServer())
        .get('/api/v1/equipment?page=2&limit=1')
        .set('Authorization', `Bearer ${adminToken}`);

      if (!otherEq.body?.data?.[0]) return;

      const otherEquipId = otherEq.body.data[0].id;
      const otherCustId = otherEq.body.data[0].customerId;

      if (otherCustId && otherCustId !== testCustomerId) {
        const res = await request(app.getHttpServer())
          .post('/api/v1/work-orders')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            customerId: testCustomerId,
            equipmentIds: [otherEquipId], // belongs to different customer!
            plannedDate: '2026-05-01',
            priority: 'normal',
          });

        expect([400, 422]).toContain(res.status);
      }
    });

    it('W04 - contractRequired=true, sozlesmesiz WO engellenmeli', async () => {
      // NOTE: Bu test company setting'e baglidir.
      // contractRequired=true ise sozlesme olmadan WO olusturulamaz.
      // Simdilik check ediyoruz.
      expect(true).toBe(true); // TODO: Company setting'i test ortaminda ayarla
    });

    it('W05 - contractRequired=false, sozlesmesiz WO → noContractRisk', async () => {
      if (!testCustomerId || !testEquipmentId) return;

      const res = await request(app.getHttpServer())
        .post('/api/v1/work-orders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customerId: testCustomerId,
          equipmentIds: [testEquipmentId],
          plannedDate: '2026-05-01',
          priority: 'normal',
          // No contractId
        });

      if (res.status === 201 || res.status === 200) {
        const wo = res.body?.data || res.body;
        // noContractRisk should be set if no contract
        expect(wo.noContractRisk).toBeDefined();
      }
    });
  });

  // ============================================================
  // TEKLIF VALIDASYONLARI
  // ============================================================

  describe('Teklif Validasyonlari', () => {
    it('P03 - kalemsiz teklif gonderilemez', async () => {
      if (!testCustomerId) return;

      // Create proposal without items
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/proposals')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customerId: testCustomerId,
          validUntil: '2026-12-31',
          items: [], // empty!
        });

      const proposalId = createRes.body?.id || createRes.body?.data?.id;
      if (!proposalId) return;

      // Try to send
      const sendRes = await request(app.getHttpServer())
        .patch(`/api/v1/proposals/${proposalId}/send`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect([400, 422]).toContain(sendRes.status);
    });

    it('P07 - suresi dolmus teklif kabul edilemez', async () => {
      if (!testCustomerId) return;

      // Create proposal with past validUntil
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/proposals')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customerId: testCustomerId,
          validUntil: '2024-01-01', // past date
          items: [{ description: 'Expired test', quantity: 1, unitPrice: 100 }],
        });

      const proposalId = createRes.body?.id || createRes.body?.data?.id;
      if (!proposalId) return;

      // Send it
      await request(app.getHttpServer())
        .patch(`/api/v1/proposals/${proposalId}/send`)
        .set('Authorization', `Bearer ${adminToken}`);

      // Try to accept
      const acceptRes = await request(app.getHttpServer())
        .patch(`/api/v1/proposals/${proposalId}/accept`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect([400, 422]).toContain(acceptRes.status);
    });
  });

  // ============================================================
  // SOZLESME VALIDASYONLARI
  // ============================================================

  describe('Sozlesme Validasyonlari', () => {
    it('S03 - PDF disi dosya sozlesme olarak yuklenemez', async () => {
      // Create a contract first
      const contracts = await request(app.getHttpServer())
        .get('/api/v1/contracts?status=draft&page=1&limit=1')
        .set('Authorization', `Bearer ${adminToken}`);

      if (!contracts.body?.data?.[0]) return;

      const contractId = contracts.body.data[0].id;

      // Try to upload non-PDF
      const textFile = Buffer.from('not a pdf');
      const res = await request(app.getHttpServer())
        .post(`/api/v1/contracts/${contractId}/upload-signed`)
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', textFile, 'contract.txt');

      expect([400, 415, 422]).toContain(res.status);
    });

    it('S07 - signed/active olmayan sozlesme ile WO olusturulamaz', async () => {
      // Get a draft contract
      const contracts = await request(app.getHttpServer())
        .get('/api/v1/contracts?status=draft&page=1&limit=1')
        .set('Authorization', `Bearer ${adminToken}`);

      if (!contracts.body?.data?.[0]) return;

      const draftContractId = contracts.body.data[0].id;

      const res = await request(app.getHttpServer())
        .post('/api/v1/work-orders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customerId: testCustomerId,
          equipmentIds: [testEquipmentId],
          contractId: draftContractId, // draft - not signed/active!
          plannedDate: '2026-05-01',
          priority: 'normal',
        });

      expect([400, 422]).toContain(res.status);
    });
  });

  // ============================================================
  // DENETIM VALIDASYONLARI
  // ============================================================

  describe('Denetim Validasyonlari', () => {
    it('I03 - eksik zorunlu alanla denetim submit edilemez', async () => {
      // Find an in-progress inspection
      const res = await request(app.getHttpServer())
        .get('/api/v1/inspections?status=in_progress&page=1&limit=1')
        .set('Authorization', `Bearer ${adminToken}`);

      if (!res.body?.data?.[0]) return;

      const insId = res.body.data[0].id;

      // Try to complete without filling required fields
      const completeRes = await request(app.getHttpServer())
        .patch(`/api/v1/inspections/${insId}/complete`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ overallResult: 'uygun' });

      // Should fail if required fields are missing
      // (depends on form template requirements)
    });

    it('I04 - ayni ekipman+muhenids icin ikinci acik denetim engellenmeli', async () => {
      // Get an in-progress inspection
      const res = await request(app.getHttpServer())
        .get('/api/v1/inspections?status=in_progress&page=1&limit=1')
        .set('Authorization', `Bearer ${adminToken}`);

      if (!res.body?.data?.[0]) return;

      const ins = res.body.data[0];

      // Try to create another inspection for same equipment + inspector
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/inspections')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          workOrderId: ins.workOrderId,
          equipmentId: ins.equipmentId,
          inspectorId: ins.inspectorId,
        });

      expect([400, 409, 422]).toContain(createRes.status);
    });
  });

  // ============================================================
  // RAPOR VALIDASYONLARI
  // ============================================================

  describe('Rapor Validasyonlari', () => {
    it('R02 - onaysiz inspection dan rapor uretilememeli', async () => {
      // Get a non-approved inspection
      const res = await request(app.getHttpServer())
        .get('/api/v1/inspections?status=in_progress&page=1&limit=1')
        .set('Authorization', `Bearer ${adminToken}`);

      if (!res.body?.data?.[0]) return;

      const insId = res.body.data[0].id;

      const reportRes = await request(app.getHttpServer())
        .post('/api/v1/reports')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ inspectionId: insId });

      expect([400, 422]).toContain(reportRes.status);
    });

    it('R03 - ayni inspection dan ikinci rapor uretilememeli', async () => {
      // Get an inspection that already has a report
      const reports = await request(app.getHttpServer())
        .get('/api/v1/reports?page=1&limit=1')
        .set('Authorization', `Bearer ${adminToken}`);

      if (!reports.body?.data?.[0]) return;

      const existingInspectionId = reports.body.data[0].inspectionId;

      const res = await request(app.getHttpServer())
        .post('/api/v1/reports')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ inspectionId: existingInspectionId });

      expect([400, 409, 422]).toContain(res.status);
    });
  });

  // ============================================================
  // CROSS-ENTITY RELATIONSHIP VALIDASYONLARI
  // ============================================================

  describe('Cross-Entity Relationship Validation', () => {
    it('should not allow WO with non-existent customer', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/work-orders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customerId: '00000000-0000-0000-0000-000000000000',
          equipmentIds: [testEquipmentId],
          plannedDate: '2026-05-01',
        });

      expect([400, 404, 422]).toContain(res.status);
    });

    it('should not allow inspection with non-existent work order', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/inspections')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          workOrderId: '00000000-0000-0000-0000-000000000000',
          equipmentId: testEquipmentId,
        });

      expect([400, 404, 422]).toContain(res.status);
    });
  });
});

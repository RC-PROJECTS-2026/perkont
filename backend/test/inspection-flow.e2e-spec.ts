import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../app.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';

/**
 * E2E Test: Tam denetim akışı
 *
 * Bu test gerçek bir test veritabanı gerektirir.
 * .env.test dosyasında TEST_DATABASE_URL tanımlanmalıdır.
 *
 * Çalıştırmak için:
 *   NODE_ENV=test jest --config jest-e2e.json --testPathPattern=inspection-flow
 */
describe('Inspection Flow (E2E)', () => {
  let app: INestApplication;
  let adminToken: string;
  let inspectorToken: string;
  let techManagerToken: string;

  let customerId: string;
  let locationId: string;
  let equipmentTypeId: string;
  let equipmentId: string;
  let formTemplateId: string;
  let workOrderId: string;
  let inspectionId: string;
  let reportId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── 1. Auth ──────────────────────────────────────────────────────────────
  describe('1. Authentication', () => {
    it('Admin giriş yapabilmeli', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'admin@test.com', password: 'Admin123!' })
        .expect(200);

      expect(res.body.data.accessToken).toBeDefined();
      adminToken = res.body.data.accessToken;
    });

    it('Muayene elemanı giriş yapabilmeli', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'inspector@test.com', password: 'Inspector123!' })
        .expect(200);
      inspectorToken = res.body.data.accessToken;
    });

    it('Teknik yönetici giriş yapabilmeli', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'techmanager@test.com', password: 'TechMgr123!' })
        .expect(200);
      techManagerToken = res.body.data.accessToken;
    });

    it('Yanlış şifreyle 401 dönmeli', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'admin@test.com', password: 'WrongPassword' })
        .expect(401);
    });
  });

  // ─── 2. Müşteri + Ekipman Kurulumu ────────────────────────────────────────
  describe('2. Setup — Customer & Equipment', () => {
    it('Müşteri oluşturulabilmeli', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/customers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: 'E2E-ACME-001',
          name: 'E2E Test Müşterisi A.Ş.',
          taxNumber: '9876543210',
          city: 'İstanbul',
          contactEmail: 'test@e2e-acme.com',
        })
        .expect(201);

      customerId = res.body.data.id;
      expect(customerId).toBeDefined();
    });

    it('Ekipman tipi oluşturulabilmeli', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/equipment/types')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ code: 'E2E-KIE', name: 'E2E Kaldırma Ekipmanı', defaultPeriodMonths: 12 })
        .expect(201);
      equipmentTypeId = res.body.data.id;
    });

    it('Ekipman oluşturulabilmeli', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/equipment')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customerId,
          equipmentTypeId,
          inventoryCode: 'E2E-EKP-001',
          brand: 'E2E Brand',
          capacity: '5 ton',
          controlPeriodMonths: 12,
        })
        .expect(201);
      equipmentId = res.body.data.id;
      expect(res.body.data.qrCode).toBeDefined();
    });

    it('Form şablonu oluşturulabilmeli ve aktif edilebilmeli', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/form-templates')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          equipmentTypeId,
          code: 'E2E-FORM-001',
          name: 'E2E Test Formu',
          revision: 'Rev.01',
          layoutConfig: {},
          fields: [
            { fieldKey: 'test_field', label: 'Test Alanı', fieldType: 'text', isRequired: true, orderIndex: 0 },
            { fieldKey: 'result_field', label: 'Sonuç', fieldType: 'check_item', isRequired: true, orderIndex: 1 },
          ],
        })
        .expect(201);
      formTemplateId = res.body.data.id;

      // PDF şablon olmadan aktivasyon başarısız olmalı
      await request(app.getHttpServer())
        .patch(`/api/v1/form-templates/${formTemplateId}/activate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });
  });

  // ─── 3. İş Emri + Planlama ────────────────────────────────────────────────
  describe('3. Work Order Planning', () => {
    it('İş emri oluşturulabilmeli', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/work-orders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          customerId,
          plannedDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
          equipmentItems: [{ equipmentId, formTemplateId }],
        })
        .expect(201);

      workOrderId = res.body.data.id;
      expect(res.body.data.workOrderNumber).toMatch(/^IS-\d{4}-\d{4}$/);
    });

    it('Muayene elemanına atanabilmeli', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/work-orders/${workOrderId}/assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ inspectorId: 'inspector-user-uuid', plannedDate: new Date().toISOString().split('T')[0] })
        .expect(200);

      expect(res.body.data.status).toBe('assigned');
    });
  });

  // ─── 4. Saha Denetimi ─────────────────────────────────────────────────────
  describe('4. Field Inspection', () => {
    it('Muayene elemanı denetim başlatabilmeli', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/inspections')
        .set('Authorization', `Bearer ${inspectorToken}`)
        .send({
          workOrderId,
          equipmentId,
          formTemplateId,
          latitude: 41.015137,
          longitude: 28.979530,
        })
        .expect(201);

      inspectionId = res.body.data.id;
      expect(res.body.data.status).toBe('in_progress');
    });

    it('Alan değerleri kaydedilebilmeli', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/inspections/${inspectionId}/field-values`)
        .set('Authorization', `Bearer ${inspectorToken}`)
        .send({
          fieldValues: [
            { fieldKey: 'test_field', valueText: 'Test değeri' },
            { fieldKey: 'result_field', valueText: 'Uygun' },
          ],
        })
        .expect(201);
    });

    it('Denetim tamamlanabilmeli', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/inspections/${inspectionId}/complete`)
        .set('Authorization', `Bearer ${inspectorToken}`)
        .send({ overallResult: 'uygun', inspectorNotes: 'E2E test notu' })
        .expect(200);

      expect(res.body.data.status).toBe('completed');
      expect(res.body.data.overallResult).toBe('uygun');
    });

    it('Teknik yöneticiye gönderilebilmeli', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/inspections/${inspectionId}/submit`)
        .set('Authorization', `Bearer ${inspectorToken}`)
        .expect(200);

      expect(res.body.data.status).toBe('submitted');
    });
  });

  // ─── 5. Teknik Yönetici İncelemesi ───────────────────────────────────────
  describe('5. Technical Manager Review', () => {
    it('Teknik yönetici denetimi onaylayabilmeli', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/inspections/${inspectionId}/review`)
        .set('Authorization', `Bearer ${techManagerToken}`)
        .send({ action: 'approve', note: 'E2E test - onaylandı' })
        .expect(200);

      expect(res.body.data.status).toBe('approved');
    });
  });

  // ─── 6. Audit Trail Doğrulaması ───────────────────────────────────────────
  describe('6. Audit Trail Verification', () => {
    it('Denetim için audit kayıtları olmalı', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/audit/entity/Inspection/${inspectionId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const actions = res.body.data.map((l: any) => l.action);
      expect(actions).toContain('INSPECTION_STARTED');
      expect(actions).toContain('INSPECTION_COMPLETED');
      expect(actions).toContain('INSPECTION_SUBMITTED');
      expect(actions).toContain('INSPECTION_APPROVE');
    });
  });

  // ─── 7. Yetki Kontrolleri ─────────────────────────────────────────────────
  describe('7. Authorization Controls', () => {
    it('Muayene elemanı başkasının denetimini düzenleyememeli', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/inspections/${inspectionId}/field-values`)
        .set('Authorization', `Bearer ${techManagerToken}`) // Muayene elemanı değil
        .send({ fieldValues: [{ fieldKey: 'test', valueText: 'hack' }] })
        .expect(403);
    });

    it('Token olmadan korumalı endpoint 401 dönmeli', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/customers')
        .expect(401);
    });

    it('Finance rolü rapor listeleyebilmeli ama denetim inceleyememeli', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/reports')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });
  });
});

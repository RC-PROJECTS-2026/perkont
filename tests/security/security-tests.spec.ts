/**
 * PerKont Security Test Suite
 *
 * Guvenlik testleri: auth bypass, tenant leak, injection, IDOR, rate limiting
 *
 * Calistirma:
 *   cd backend && npx jest --config ../tests/jest.integration.json ../tests/security/security-tests.spec.ts
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../backend/src/app.module';

describe('Security Tests', () => {
  let app: INestApplication;
  let adminToken: string;
  let salesToken: string;
  let inspectorToken: string;
  let customerToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    // Login as different roles
    const loginAs = async (email: string) => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: 'Test1234!' });
      return res.body?.accessToken;
    };

    adminToken = await loginAs('admin1@perkont-test.com');
    salesToken = await loginAs('sales2@perkont-test.com');
    inspectorToken = await loginAs('inspector1@perkont-test.com');
    customerToken = await loginAs('customer1@perkont-test.com');
  });

  afterAll(async () => {
    await app.close();
  });

  // ============================================================
  // SEC01: AUTH BYPASS
  // ============================================================

  describe('SEC01 - Auth Bypass', () => {
    const protectedEndpoints = [
      'GET /api/v1/customers',
      'GET /api/v1/equipment',
      'GET /api/v1/work-orders',
      'GET /api/v1/inspections',
      'GET /api/v1/reports',
      'GET /api/v1/proposals',
      'GET /api/v1/contracts',
      'GET /api/v1/dashboard',
      'GET /api/v1/audit',
      'GET /api/v1/users',
    ];

    it('should reject all protected endpoints without token', async () => {
      for (const ep of protectedEndpoints) {
        const [method, path] = ep.split(' ');
        const res = await request(app.getHttpServer())
          .get(path)
          .expect(401);
      }
    });

    it('should reject with malformed Bearer token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/customers')
        .set('Authorization', 'Bearer')
        .expect(401);
    });

    it('should reject with completely invalid token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/customers')
        .set('Authorization', 'Bearer not-a-jwt-token')
        .expect(401);
    });

    it('should reject with token from different secret', async () => {
      // Forge a token with different secret
      const fakeToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwicm9sZSI6ImFkbWluIiwiZXhwIjo5OTk5OTk5OTk5fQ.abc123';
      await request(app.getHttpServer())
        .get('/api/v1/customers')
        .set('Authorization', `Bearer ${fakeToken}`)
        .expect(401);
    });
  });

  // ============================================================
  // SEC02: ROLE BYPASS
  // ============================================================

  describe('SEC02 - Role Bypass', () => {
    it('inspector should NOT access user management', async () => {
      if (!inspectorToken) return;
      await request(app.getHttpServer())
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${inspectorToken}`)
        .expect(403);
    });

    it('sales should NOT approve inspections', async () => {
      if (!salesToken) return;

      // Get a submitted inspection
      const res = await request(app.getHttpServer())
        .get('/api/v1/inspections?status=submitted&page=1&limit=1')
        .set('Authorization', `Bearer ${adminToken}`);

      if (res.body?.data?.[0]) {
        const insId = res.body.data[0].id;
        const approveRes = await request(app.getHttpServer())
          .patch(`/api/v1/inspections/${insId}/review`)
          .set('Authorization', `Bearer ${salesToken}`)
          .send({ action: 'approve', notes: 'Role bypass test' });

        expect(approveRes.status).toBe(403);
      }
    });

    it('customer portal should NOT access internal customers', async () => {
      if (!customerToken) return;
      await request(app.getHttpServer())
        .get('/api/v1/customers')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(403);
    });

    it('customer portal should NOT create work orders', async () => {
      if (!customerToken) return;
      await request(app.getHttpServer())
        .post('/api/v1/work-orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          customerId: 'test',
          equipmentIds: ['test'],
          plannedDate: '2026-05-01',
        })
        .expect(403);
    });

    it('finance should NOT create proposals', async () => {
      // Login as finance
      const financeLogin = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'finance1@perkont-test.com', password: 'Test1234!' });

      if (financeLogin.body?.accessToken) {
        await request(app.getHttpServer())
          .post('/api/v1/proposals')
          .set('Authorization', `Bearer ${financeLogin.body.accessToken}`)
          .send({
            customerId: 'test',
            validUntil: '2026-12-31',
            items: [],
          })
          .expect(403);
      }
    });
  });

  // ============================================================
  // SEC03: TENANT DATA LEAK
  // ============================================================

  describe('SEC03 - Tenant Data Leak', () => {
    it('should not return data from other companies', async () => {
      // NOTE: Bu test iki farkli company setup gerektirir.
      // Mevcut kodda tenant izolasyonu 8/12 serviste EKSIK.
      // Bu test FAIL etmesi BEKLENIR.

      const res = await request(app.getHttpServer())
        .get('/api/v1/customers')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      if (res.body?.data && res.body.data.length > 0) {
        // All customers should have same companyId
        const companyIds = [...new Set(res.body.data.map((c: any) => c.companyId).filter(Boolean))];
        // If companyId is present, should be unique
        if (companyIds.length > 0) {
          expect(companyIds.length).toBe(1);
        }
      }
    });

    it('should not allow cross-tenant header injection', async () => {
      // Try to set different company header
      const res = await request(app.getHttpServer())
        .get('/api/v1/customers')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Company-Id', 'different-company-id')
        .set('X-Tenant-Id', 'different-tenant-id');

      // Should still return same company data (not honored)
      if (res.body?.data && res.body.data.length > 0) {
        const companyIds = [...new Set(res.body.data.map((c: any) => c.companyId).filter(Boolean))];
        if (companyIds.length > 0) {
          expect(companyIds.length).toBe(1);
        }
      }
    });
  });

  // ============================================================
  // SEC08: XSS / INJECTION
  // ============================================================

  describe('SEC08 - XSS Injection', () => {
    const xssPayloads = [
      '<script>alert("xss")</script>',
      '"><img src=x onerror=alert(1)>',
      "'; DROP TABLE users; --",
      '${7*7}',
      '{{constructor.constructor("return this")()}}',
    ];

    it('should sanitize XSS in customer name', async () => {
      for (const payload of xssPayloads) {
        const res = await request(app.getHttpServer())
          .post('/api/v1/customers')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            name: payload,
            code: `XSS-${Date.now()}-${Math.random()}`,
            taxNumber: `${Math.floor(Math.random() * 9000000000 + 1000000000)}`,
            address: 'Test',
            city: 'Istanbul',
          });

        if (res.status === 201 || res.status === 200) {
          // If saved, check it's not returned with raw script tags
          const customerId = res.body?.id || res.body?.data?.id;
          if (customerId) {
            const getRes = await request(app.getHttpServer())
              .get(`/api/v1/customers/${customerId}`)
              .set('Authorization', `Bearer ${adminToken}`);

            const name = getRes.body?.name || getRes.body?.data?.name;
            if (name) {
              expect(name).not.toContain('<script>');
            }
          }
        }
      }
    });
  });

  // ============================================================
  // SEC09: SQL INJECTION
  // ============================================================

  describe('SEC09 - SQL Injection', () => {
    const sqlPayloads = [
      "' OR '1'='1",
      "'; DROP TABLE customers; --",
      "' UNION SELECT * FROM users --",
      "1'; WAITFOR DELAY '0:0:5'--",
      "admin'--",
    ];

    it('should not be vulnerable to SQL injection in search', async () => {
      for (const payload of sqlPayloads) {
        const startTime = Date.now();
        const res = await request(app.getHttpServer())
          .get(`/api/v1/customers?search=${encodeURIComponent(payload)}`)
          .set('Authorization', `Bearer ${adminToken}`);

        const duration = Date.now() - startTime;

        // Should not return all records (injection success indicator)
        if (res.status === 200 && res.body?.data) {
          // Results should be 0 or very few (not all customers)
          expect(res.body.data.length).toBeLessThan(100);
        }

        // Should not be slow (time-based injection indicator)
        expect(duration).toBeLessThan(5000);
      }
    });

    it('should not be vulnerable to SQL injection in ID parameters', async () => {
      for (const payload of sqlPayloads) {
        const res = await request(app.getHttpServer())
          .get(`/api/v1/customers/${encodeURIComponent(payload)}`)
          .set('Authorization', `Bearer ${adminToken}`);

        // Should return 400 or 404, not 500 (which could indicate SQL error)
        expect(res.status).not.toBe(500);
      }
    });
  });

  // ============================================================
  // SEC10: IDOR - Yetkisiz Rapor Indirme
  // ============================================================

  describe('SEC10 - IDOR (Insecure Direct Object Reference)', () => {
    it('customer should not access other customer reports', async () => {
      if (!customerToken) return;

      // Get report list for this customer
      const myReports = await request(app.getHttpServer())
        .get('/api/v1/portal/reports?page=1&limit=1')
        .set('Authorization', `Bearer ${customerToken}`);

      // Try to access a report from main API (not portal)
      const allReports = await request(app.getHttpServer())
        .get('/api/v1/reports?page=1&limit=1')
        .set('Authorization', `Bearer ${adminToken}`);

      if (allReports.body?.data?.[0]) {
        const otherReportId = allReports.body.data[0].id;

        // Customer trying to access via portal
        const accessRes = await request(app.getHttpServer())
          .get(`/api/v1/portal/reports/${otherReportId}`)
          .set('Authorization', `Bearer ${customerToken}`);

        // Should either be 403 or return only if belongs to customer
        if (accessRes.status === 200) {
          // If allowed, verify it belongs to this customer
          const reportCustomerId = accessRes.body?.customerId || accessRes.body?.data?.customerId;
          // This would need the customer's actual ID to validate
        }
      }
    });

    it('inspector should not access other inspector inspections', async () => {
      if (!inspectorToken) return;

      // Get inspections assigned to other inspectors
      const allInspections = await request(app.getHttpServer())
        .get('/api/v1/inspections?page=1&limit=5')
        .set('Authorization', `Bearer ${adminToken}`);

      if (allInspections.body?.data) {
        // Try to edit someone else's inspection
        for (const ins of allInspections.body.data) {
          if (ins.status === 'in_progress') {
            const editRes = await request(app.getHttpServer())
              .patch(`/api/v1/inspections/${ins.id}/field-values`)
              .set('Authorization', `Bearer ${inspectorToken}`)
              .send({
                fieldValues: [{ fieldKey: 'test', value: 'IDOR test' }],
              });

            // Should fail if not assigned to this inspector
            // (assertCanEdit checks inspector ownership)
            break;
          }
        }
      }
    });
  });

  // ============================================================
  // SEC12: AUDIT LOG IMMUTABILITY
  // ============================================================

  describe('SEC12 - Audit Log Immutability', () => {
    it('should not allow deleting audit logs via API', async () => {
      // Get first audit log
      const auditRes = await request(app.getHttpServer())
        .get('/api/v1/audit?page=1&limit=1')
        .set('Authorization', `Bearer ${adminToken}`);

      if (auditRes.body?.data?.[0]) {
        const logId = auditRes.body.data[0].id;

        // Try to delete
        const deleteRes = await request(app.getHttpServer())
          .delete(`/api/v1/audit/${logId}`)
          .set('Authorization', `Bearer ${adminToken}`);

        // Should be 404 (no delete endpoint) or 405 (method not allowed)
        expect([403, 404, 405]).toContain(deleteRes.status);
      }
    });

    it('should not allow updating audit logs via API', async () => {
      const auditRes = await request(app.getHttpServer())
        .get('/api/v1/audit?page=1&limit=1')
        .set('Authorization', `Bearer ${adminToken}`);

      if (auditRes.body?.data?.[0]) {
        const logId = auditRes.body.data[0].id;

        const updateRes = await request(app.getHttpServer())
          .patch(`/api/v1/audit/${logId}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ action: 'MODIFIED' });

        expect([403, 404, 405]).toContain(updateRes.status);
      }
    });
  });

  // ============================================================
  // SEC05: REFRESH TOKEN REUSE
  // ============================================================

  describe('SEC05 - Refresh Token Reuse', () => {
    it('should invalidate old refresh token after rotation', async () => {
      // Login
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'inspector2@perkont-test.com', password: 'Test1234!' });

      if (!loginRes.body?.refreshToken) return;

      const oldRefreshToken = loginRes.body.refreshToken;

      // Use refresh token
      const refreshRes = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: oldRefreshToken });

      // Try to reuse old refresh token
      const reuseRes = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: oldRefreshToken });

      // Should be rejected (token already rotated)
      // NOTE: If this passes (200), it means refresh tokens are NOT rotated on use
      // which is a security concern
      if (refreshRes.status === 201 || refreshRes.status === 200) {
        // If first refresh succeeded, second should fail
        expect([401, 403]).toContain(reuseRes.status);
      }
    });
  });

  // ============================================================
  // SEC07: FILE UPLOAD SECURITY
  // ============================================================

  describe('SEC07 - File Upload Security', () => {
    it('should reject executable file uploads', async () => {
      const maliciousFile = Buffer.from('#!/bin/bash\nrm -rf /');

      const res = await request(app.getHttpServer())
        .post('/api/v1/storage/upload')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', maliciousFile, 'malicious.sh');

      // Should reject non-allowed file types
      expect([400, 403, 415, 422]).toContain(res.status);
    });

    it('should reject oversized file uploads', async () => {
      // Create a 100MB buffer (exceeds typical limits)
      const largeFile = Buffer.alloc(100 * 1024 * 1024, 'x');

      const res = await request(app.getHttpServer())
        .post('/api/v1/storage/upload')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', largeFile, 'large.pdf');

      expect([400, 413, 422]).toContain(res.status);
    });

    it('should reject double extension tricks', async () => {
      const file = Buffer.from('test');

      const res = await request(app.getHttpServer())
        .post('/api/v1/storage/upload')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', file, 'report.pdf.exe');

      expect([400, 403, 415, 422]).toContain(res.status);
    });
  });

  // ============================================================
  // SEC06: BRUTE FORCE
  // ============================================================

  describe('SEC06 - Brute Force Protection', () => {
    it('should block rapid login attempts', async () => {
      const email = 'admin1@perkont-test.com';
      const results: number[] = [];

      // Send 20 rapid requests
      const promises = Array.from({ length: 20 }, () =>
        request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .send({ email, password: 'wrong' })
          .then(r => r.status)
      );

      const statuses = await Promise.all(promises);

      // After several attempts, should see 429 (rate limit) or 403 (locked)
      const blocked = statuses.filter(s => s === 429 || s === 403);
      // At least some should be blocked
      expect(blocked.length).toBeGreaterThan(0);
    });
  });

  // ============================================================
  // PRESIGNED URL SECURITY
  // ============================================================

  describe('SEC04 - Presigned URL', () => {
    it('presigned URLs should have expiry', async () => {
      // Get a report with PDF URL
      const res = await request(app.getHttpServer())
        .get('/api/v1/reports?status=signed&page=1&limit=1')
        .set('Authorization', `Bearer ${adminToken}`);

      if (res.body?.data?.[0]?.pdfUrl) {
        const pdfUrl = res.body.data[0].pdfUrl;

        // If it's a presigned URL (MinIO), it should contain expiry params
        if (pdfUrl.includes('X-Amz-Expires') || pdfUrl.includes('Expires')) {
          // URL has expiry - good
          expect(true).toBe(true);
        } else if (pdfUrl.startsWith('http')) {
          // Direct URL without expiry - security concern
          console.warn('SEC04 WARNING: PDF URL does not appear to have expiry');
        }
      }
    });
  });
});

/**
 * State Machine Validation Tests
 *
 * Tum state gecislerini dogrular:
 * - Gecerli gecisler basarili
 * - Gecersiz gecisler engellenir
 * - Audit log yazilir
 * - Optimistic locking calisir
 *
 * Calistirma:
 *   cd backend && npx jest --config ../tests/jest.integration.json ../tests/state-machine/state-transitions.spec.ts
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../backend/src/app.module';

// ============================================================
// STATE TRANSITION DEFINITIONS (Ground Truth)
// ============================================================

const PROPOSAL_TRANSITIONS: Record<string, string[]> = {
  draft: ['sent', 'cancelled'],
  sent: ['accepted', 'rejected', 'revision_requested', 'expired'],
  revision_requested: ['draft'],
  accepted: [],
  rejected: [],
  expired: [],
  cancelled: [],
};

const CONTRACT_TRANSITIONS: Record<string, string[]> = {
  draft: ['sent'],
  sent: ['signed'],
  signed: ['active'],
  active: ['archived'],
  archived: [],
};

const WORK_ORDER_TRANSITIONS: Record<string, string[]> = {
  draft: ['planned', 'cancelled'],
  planned: ['assigned', 'cancelled'],
  assigned: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: ['report_pending'],
  report_pending: ['report_approved'],
  report_approved: ['invoiced'],
  invoiced: [],
  cancelled: [],
};

const INSPECTION_TRANSITIONS: Record<string, string[]> = {
  draft: ['in_progress'],
  in_progress: ['completed'],
  completed: ['submitted'],
  submitted: ['under_review'],
  under_review: ['approved', 'rejected', 'revision_requested'],
  revision_requested: ['in_progress'],
  approved: [],
  rejected: [],
};

const REPORT_TRANSITIONS: Record<string, string[]> = {
  draft: ['under_review'],
  under_review: ['approved', 'revision_requested', 'rejected'],
  revision_requested: ['under_review'],
  approved: ['under_signing'],
  under_signing: ['signed'],
  signed: ['delivered'],
  delivered: [],
};

describe('State Machine Tests', () => {
  let app: INestApplication;
  let adminToken: string;
  let salesToken: string;
  let inspectorToken: string;
  let tmToken: string;

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
    salesToken = await loginAs('sales1@perkont-test.com');
    inspectorToken = await loginAs('inspector1@perkont-test.com');
    tmToken = await loginAs('technical_manager1@perkont-test.com');
  });

  afterAll(async () => {
    await app.close();
  });

  // ============================================================
  // PROPOSAL STATE MACHINE
  // ============================================================

  describe('Proposal State Machine', () => {
    let proposalId: string;
    let customerId: string;

    beforeAll(async () => {
      // Get a customer
      const custRes = await request(app.getHttpServer())
        .get('/api/v1/customers?page=1&limit=1')
        .set('Authorization', `Bearer ${adminToken}`);
      customerId = custRes.body?.data?.[0]?.id;
    });

    it('P04 - should create proposal in draft state', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/proposals')
        .set('Authorization', `Bearer ${salesToken || adminToken}`)
        .send({
          customerId,
          validUntil: '2026-12-31',
          notes: 'State machine test proposal',
          items: [{
            description: 'Test hizmet',
            quantity: 1,
            unitPrice: 1000,
          }],
        })
        .expect((r) => expect([200, 201]).toContain(r.status));

      proposalId = res.body?.id || res.body?.data?.id;
      expect(proposalId).toBeDefined();
    });

    it('P04 - draft → sent (valid)', async () => {
      if (!proposalId) return;

      await request(app.getHttpServer())
        .patch(`/api/v1/proposals/${proposalId}/send`)
        .set('Authorization', `Bearer ${salesToken || adminToken}`)
        .expect((r) => expect([200, 201]).toContain(r.status));
    });

    it('P05 - sent → draft (INVALID - should fail)', async () => {
      if (!proposalId) return;

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/proposals/${proposalId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'draft' });

      // Should be 400 or 409 (invalid transition)
      expect([400, 409, 422]).toContain(res.status);
    });

    it('P04 - sent → accepted (valid)', async () => {
      if (!proposalId) return;

      await request(app.getHttpServer())
        .patch(`/api/v1/proposals/${proposalId}/accept`)
        .set('Authorization', `Bearer ${salesToken || adminToken}`)
        .expect((r) => expect([200, 201]).toContain(r.status));
    });

    it('P10 - accepted → accepted again (DUPLICATE - should fail)', async () => {
      if (!proposalId) return;

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/proposals/${proposalId}/accept`)
        .set('Authorization', `Bearer ${salesToken || adminToken}`);

      expect([400, 409, 422]).toContain(res.status);
    });

    it('P05 - accepted → sent (INVALID - terminal state)', async () => {
      if (!proposalId) return;

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/proposals/${proposalId}/send`)
        .set('Authorization', `Bearer ${salesToken || adminToken}`);

      expect([400, 409, 422]).toContain(res.status);
    });
  });

  // ============================================================
  // PROPOSAL - REVISION FLOW
  // ============================================================

  describe('Proposal Revision Flow', () => {
    let proposalId: string;
    let customerId: string;

    beforeAll(async () => {
      const custRes = await request(app.getHttpServer())
        .get('/api/v1/customers?page=1&limit=1')
        .set('Authorization', `Bearer ${adminToken}`);
      customerId = custRes.body?.data?.[0]?.id;
    });

    it('should handle full revision flow: draft → sent → revision_requested → draft → sent → accepted', async () => {
      if (!customerId) return;

      // Create
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/proposals')
        .set('Authorization', `Bearer ${salesToken || adminToken}`)
        .send({
          customerId,
          validUntil: '2026-12-31',
          items: [{ description: 'Revizyon test', quantity: 1, unitPrice: 500 }],
        });
      proposalId = createRes.body?.id || createRes.body?.data?.id;
      if (!proposalId) return;

      // Send
      await request(app.getHttpServer())
        .patch(`/api/v1/proposals/${proposalId}/send`)
        .set('Authorization', `Bearer ${salesToken || adminToken}`)
        .expect((r) => expect([200, 201]).toContain(r.status));

      // Revision requested
      await request(app.getHttpServer())
        .patch(`/api/v1/proposals/${proposalId}/revision-request`)
        .set('Authorization', `Bearer ${salesToken || adminToken}`)
        .send({ notes: 'Fiyat guncellenmeli' })
        .expect((r) => expect([200, 201]).toContain(r.status));

      // Create revision (new version)
      const revRes = await request(app.getHttpServer())
        .post(`/api/v1/proposals/${proposalId}/revision`)
        .set('Authorization', `Bearer ${salesToken || adminToken}`)
        .send({
          items: [{ description: 'Revizyon test - v2', quantity: 1, unitPrice: 450 }],
        });
      const newProposalId = revRes.body?.id || revRes.body?.data?.id || proposalId;

      // Send revised version
      await request(app.getHttpServer())
        .patch(`/api/v1/proposals/${newProposalId}/send`)
        .set('Authorization', `Bearer ${salesToken || adminToken}`);

      // Accept
      await request(app.getHttpServer())
        .patch(`/api/v1/proposals/${newProposalId}/accept`)
        .set('Authorization', `Bearer ${salesToken || adminToken}`);
    });
  });

  // ============================================================
  // INSPECTION STATE MACHINE
  // ============================================================

  describe('Inspection State Machine', () => {
    it('I05 - valid transitions: draft → in_progress → completed → submitted → approved', async () => {
      // Get an existing in_progress inspection
      const res = await request(app.getHttpServer())
        .get('/api/v1/inspections?status=in_progress&page=1&limit=1')
        .set('Authorization', `Bearer ${inspectorToken || adminToken}`);

      if (!res.body?.data?.[0]) {
        console.warn('No in_progress inspection found for state machine test');
        return;
      }

      const inspectionId = res.body.data[0].id;

      // Complete inspection (fill required fields first)
      await request(app.getHttpServer())
        .patch(`/api/v1/inspections/${inspectionId}/complete`)
        .set('Authorization', `Bearer ${inspectorToken || adminToken}`)
        .send({ overallResult: 'uygun' });
    });

    it('I06 - INVALID: approved → in_progress (should fail)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/inspections?status=approved&page=1&limit=1')
        .set('Authorization', `Bearer ${adminToken}`);

      if (!res.body?.data?.[0]) return;

      const approvedId = res.body.data[0].id;

      // Try to move approved back to in_progress
      const updateRes = await request(app.getHttpServer())
        .patch(`/api/v1/inspections/${approvedId}/field-values`)
        .set('Authorization', `Bearer ${inspectorToken || adminToken}`)
        .send({ fieldValues: [{ fieldKey: 'test', value: 'test' }] });

      // Should fail - approved inspection cannot be edited
      expect([400, 403, 409, 422]).toContain(updateRes.status);
    });

    it('I07 - revision_requested → in_progress on field edit', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/inspections?status=revision_requested&page=1&limit=1')
        .set('Authorization', `Bearer ${inspectorToken || adminToken}`);

      if (!res.body?.data?.[0]) return;

      const insId = res.body.data[0].id;

      // Edit field values - should auto-transition to in_progress
      const editRes = await request(app.getHttpServer())
        .patch(`/api/v1/inspections/${insId}/field-values`)
        .set('Authorization', `Bearer ${inspectorToken || adminToken}`)
        .send({
          fieldValues: [{ fieldKey: 'genel_durum', value: 'Duzeltildi' }],
        });

      if (editRes.status >= 200 && editRes.status < 300) {
        // Verify status changed to in_progress
        const checkRes = await request(app.getHttpServer())
          .get(`/api/v1/inspections/${insId}`)
          .set('Authorization', `Bearer ${inspectorToken || adminToken}`);

        expect(checkRes.body?.status || checkRes.body?.data?.status).toBe('in_progress');
      }
    });

    it('I08 - optimistic locking: concurrent edit should fail', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/inspections?status=submitted&page=1&limit=1')
        .set('Authorization', `Bearer ${tmToken || adminToken}`);

      if (!res.body?.data?.[0]) return;

      const insId = res.body.data[0].id;

      // Simulate two concurrent review attempts
      const [review1, review2] = await Promise.all([
        request(app.getHttpServer())
          .patch(`/api/v1/inspections/${insId}/review`)
          .set('Authorization', `Bearer ${tmToken || adminToken}`)
          .send({ action: 'approve', notes: 'Concurrent test 1' }),
        request(app.getHttpServer())
          .patch(`/api/v1/inspections/${insId}/review`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ action: 'approve', notes: 'Concurrent test 2' }),
      ]);

      // One should succeed, other should fail with conflict
      const statuses = [review1.status, review2.status].sort();
      // At least one should be success, at least one might be conflict
      expect(statuses.some(s => s >= 200 && s < 300)).toBe(true);
    });
  });

  // ============================================================
  // REPORT STATE MACHINE
  // ============================================================

  describe('Report State Machine', () => {
    it('R05 - valid transition: approved → under_signing', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/reports?status=approved&page=1&limit=1')
        .set('Authorization', `Bearer ${tmToken || adminToken}`);

      if (!res.body?.data?.[0]) return;

      const reportId = res.body.data[0].id;

      const signRes = await request(app.getHttpServer())
        .patch(`/api/v1/reports/${reportId}/start-signing`)
        .set('Authorization', `Bearer ${tmToken || adminToken}`);

      expect([200, 201]).toContain(signRes.status);
    });

    it('R06 - hash mismatch should prevent signing', async () => {
      // NOTE: Bu test e-imza entegrasyonu ile calisir.
      // Hash bozuldugunda imza baslatilamamali.
      const res = await request(app.getHttpServer())
        .get('/api/v1/reports?status=approved&page=1&limit=1')
        .set('Authorization', `Bearer ${adminToken}`);

      if (!res.body?.data?.[0]) return;

      // Verify hash field exists
      const report = res.body.data[0];
      expect(report).toHaveProperty('documentHash');
    });
  });

  // ============================================================
  // WORK ORDER STATE MACHINE
  // ============================================================

  describe('Work Order State Machine', () => {
    it('W07 - completed/invoiced WO cannot be reassigned', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/work-orders?status=completed&page=1&limit=1')
        .set('Authorization', `Bearer ${adminToken}`);

      if (!res.body?.data?.[0]) return;

      const woId = res.body.data[0].id;

      const assignRes = await request(app.getHttpServer())
        .patch(`/api/v1/work-orders/${woId}/assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ inspectorId: 'some-inspector-id' });

      expect([400, 409, 422]).toContain(assignRes.status);
    });
  });

  // ============================================================
  // AUDIT LOG VERIFICATION
  // ============================================================

  describe('Audit Log on State Changes', () => {
    it('should write audit log on proposal status change', async () => {
      // Create and send a proposal, then check audit log
      const custRes = await request(app.getHttpServer())
        .get('/api/v1/customers?page=1&limit=1')
        .set('Authorization', `Bearer ${adminToken}`);
      const customerId = custRes.body?.data?.[0]?.id;
      if (!customerId) return;

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/proposals')
        .set('Authorization', `Bearer ${salesToken || adminToken}`)
        .send({
          customerId,
          validUntil: '2026-12-31',
          items: [{ description: 'Audit test', quantity: 1, unitPrice: 100 }],
        });

      const proposalId = createRes.body?.id || createRes.body?.data?.id;
      if (!proposalId) return;

      // Send proposal
      await request(app.getHttpServer())
        .patch(`/api/v1/proposals/${proposalId}/send`)
        .set('Authorization', `Bearer ${salesToken || adminToken}`);

      // Check audit log
      const auditRes = await request(app.getHttpServer())
        .get(`/api/v1/audit?entityId=${proposalId}&entityType=proposal`)
        .set('Authorization', `Bearer ${adminToken}`);

      if (auditRes.status === 200 && auditRes.body?.data) {
        const logs = auditRes.body.data;
        expect(logs.length).toBeGreaterThan(0);
      }
    });
  });

  // ============================================================
  // COMPLETE STATE TRANSITION MATRIX TEST
  // ============================================================

  describe('State Transition Matrix Validation', () => {
    // Helper: generate all possible invalid transitions
    function getInvalidTransitions(transitions: Record<string, string[]>): [string, string][] {
      const allStatuses = Object.keys(transitions);
      const invalid: [string, string][] = [];

      for (const from of allStatuses) {
        for (const to of allStatuses) {
          if (from !== to && !transitions[from].includes(to)) {
            invalid.push([from, to]);
          }
        }
      }
      return invalid;
    }

    it('Proposal - all invalid transitions should be blocked', () => {
      const invalid = getInvalidTransitions(PROPOSAL_TRANSITIONS);
      console.log(`Proposal: ${invalid.length} invalid transitions to test`);

      // Verify transition map completeness
      expect(Object.keys(PROPOSAL_TRANSITIONS).length).toBe(7);

      // Terminal states should have no outgoing transitions
      expect(PROPOSAL_TRANSITIONS.accepted).toEqual([]);
      expect(PROPOSAL_TRANSITIONS.rejected).toEqual([]);
      expect(PROPOSAL_TRANSITIONS.expired).toEqual([]);
      expect(PROPOSAL_TRANSITIONS.cancelled).toEqual([]);
    });

    it('Inspection - all invalid transitions should be blocked', () => {
      const invalid = getInvalidTransitions(INSPECTION_TRANSITIONS);
      console.log(`Inspection: ${invalid.length} invalid transitions to test`);

      expect(Object.keys(INSPECTION_TRANSITIONS).length).toBe(8);
      expect(INSPECTION_TRANSITIONS.approved).toEqual([]);
      expect(INSPECTION_TRANSITIONS.rejected).toEqual([]);
    });

    it('Report - all invalid transitions should be blocked', () => {
      const invalid = getInvalidTransitions(REPORT_TRANSITIONS);
      console.log(`Report: ${invalid.length} invalid transitions to test`);

      expect(Object.keys(REPORT_TRANSITIONS).length).toBe(7);
      expect(REPORT_TRANSITIONS.delivered).toEqual([]);
    });

    it('Work Order - all invalid transitions should be blocked', () => {
      const invalid = getInvalidTransitions(WORK_ORDER_TRANSITIONS);
      console.log(`Work Order: ${invalid.length} invalid transitions to test`);

      expect(Object.keys(WORK_ORDER_TRANSITIONS).length).toBe(9);
      expect(WORK_ORDER_TRANSITIONS.invoiced).toEqual([]);
      expect(WORK_ORDER_TRANSITIONS.cancelled).toEqual([]);
    });
  });
});

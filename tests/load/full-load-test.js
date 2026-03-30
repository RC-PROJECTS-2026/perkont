/**
 * PerKont k6 Yuk Testi
 *
 * 100 esanlamli kullanici senaryosu
 *
 * Kurulum:
 *   brew install k6  (macOS)
 *   choco install k6 (Windows)
 *   apt install k6   (Linux)
 *
 * Calistirma:
 *   k6 run tests/load/full-load-test.js
 *   k6 run --out json=results.json tests/load/full-load-test.js
 *   k6 run --out influxdb=http://localhost:8086/k6 tests/load/full-load-test.js
 */

import http from 'k6/http';
import { check, group, sleep, fail } from 'k6';
import { Rate, Counter, Trend } from 'k6/metrics';
import { SharedArray } from 'k6/data';
import { randomIntBetween, randomItem } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

// ============================================================
// CUSTOM METRICS
// ============================================================

const errorRate = new Rate('errors');
const loginDuration = new Trend('login_duration', true);
const dashboardDuration = new Trend('dashboard_duration', true);
const customerListDuration = new Trend('customer_list_duration', true);
const customerSearchDuration = new Trend('customer_search_duration', true);
const equipmentSearchDuration = new Trend('equipment_search_duration', true);
const woCreateDuration = new Trend('wo_create_duration', true);
const inspectionSubmitDuration = new Trend('inspection_submit_duration', true);
const reportListDuration = new Trend('report_list_duration', true);
const proposalCreateDuration = new Trend('proposal_create_duration', true);
const customer360Duration = new Trend('customer360_duration', true);
const pdfGenerateDuration = new Trend('pdf_generate_duration', true);

// ============================================================
// CONFIGURATION
// ============================================================

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000/api/v1';

// User pools by role
const USERS = {
  sales: Array.from({ length: 20 }, (_, i) => ({
    email: `sales${i + 1}@perkont-test.com`,
    password: 'Test1234!',
  })),
  planner: Array.from({ length: 15 }, (_, i) => ({
    email: `planner${i + 1}@perkont-test.com`,
    password: 'Test1234!',
  })),
  inspector: Array.from({ length: 30 }, (_, i) => ({
    email: `inspector${i + 1}@perkont-test.com`,
    password: 'Test1234!',
  })),
  technical_manager: Array.from({ length: 10 }, (_, i) => ({
    email: `technical_manager${i + 1}@perkont-test.com`,
    password: 'Test1234!',
  })),
  finance: Array.from({ length: 10 }, (_, i) => ({
    email: `finance${i + 1}@perkont-test.com`,
    password: 'Test1234!',
  })),
  admin: Array.from({ length: 10 }, (_, i) => ({
    email: `admin${i + 1}@perkont-test.com`,
    password: 'Test1234!',
  })),
  customer: Array.from({ length: 5 }, (_, i) => ({
    email: `customer${i + 1}@perkont-test.com`,
    password: 'Test1234!',
  })),
};

// ============================================================
// LOAD PROFILE
// ============================================================

export const options = {
  scenarios: {
    // Sales users - customer search, proposal creation
    sales_flow: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 10 },   // ramp up
        { duration: '2m', target: 20 },   // full load
        { duration: '10m', target: 20 },  // sustained
        { duration: '2m', target: 0 },    // ramp down
      ],
      exec: 'salesScenario',
      tags: { role: 'sales' },
    },

    // Planner users - WO creation, equipment selection
    planner_flow: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 8 },
        { duration: '2m', target: 15 },
        { duration: '10m', target: 15 },
        { duration: '2m', target: 0 },
      ],
      exec: 'plannerScenario',
      tags: { role: 'planner' },
    },

    // Inspector users - inspection form filling, photo upload
    inspector_flow: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 15 },
        { duration: '2m', target: 30 },
        { duration: '10m', target: 30 },
        { duration: '2m', target: 0 },
      ],
      exec: 'inspectorScenario',
      tags: { role: 'inspector' },
    },

    // Technical Manager - report approval
    tm_flow: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 5 },
        { duration: '2m', target: 10 },
        { duration: '10m', target: 10 },
        { duration: '2m', target: 0 },
      ],
      exec: 'technicalManagerScenario',
      tags: { role: 'technical_manager' },
    },

    // Finance - invoice listing, Logo sync
    finance_flow: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 5 },
        { duration: '2m', target: 10 },
        { duration: '10m', target: 10 },
        { duration: '2m', target: 0 },
      ],
      exec: 'financeScenario',
      tags: { role: 'finance' },
    },

    // Admin/Executive - dashboard heavy
    admin_flow: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 5 },
        { duration: '2m', target: 10 },
        { duration: '10m', target: 10 },
        { duration: '2m', target: 0 },
      ],
      exec: 'adminScenario',
      tags: { role: 'admin' },
    },

    // Customer Portal
    portal_flow: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 3 },
        { duration: '2m', target: 5 },
        { duration: '10m', target: 5 },
        { duration: '2m', target: 0 },
      ],
      exec: 'customerPortalScenario',
      tags: { role: 'customer' },
    },
  },

  thresholds: {
    // Global thresholds
    http_req_duration: ['p(95)<2000', 'p(99)<5000'],
    http_req_failed: ['rate<0.01'], // < 1% error rate
    errors: ['rate<0.01'],

    // Per-operation thresholds (matching SLA table)
    login_duration: ['p(95)<300', 'p(99)<500'],
    dashboard_duration: ['p(95)<1000', 'p(99)<2000'],
    customer_list_duration: ['p(95)<500', 'p(99)<1000'],
    customer_search_duration: ['p(95)<300', 'p(99)<500'],
    equipment_search_duration: ['p(95)<500', 'p(99)<1000'],
    wo_create_duration: ['p(95)<500', 'p(99)<1000'],
    inspection_submit_duration: ['p(95)<1000', 'p(99)<2000'],
    report_list_duration: ['p(95)<500', 'p(99)<1000'],
    proposal_create_duration: ['p(95)<500', 'p(99)<1000'],
    customer360_duration: ['p(95)<1000', 'p(99)<2000'],
    pdf_generate_duration: ['p(95)<5000', 'p(99)<8000'],
  },
};

// ============================================================
// HELPERS
// ============================================================

function login(user) {
  const start = new Date();
  const res = http.post(`${BASE_URL}/auth/login`, JSON.stringify({
    email: user.email,
    password: user.password,
  }), {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'POST /auth/login' },
  });

  loginDuration.add(new Date() - start);

  const success = check(res, {
    'login status is 200 or 201': (r) => r.status === 200 || r.status === 201,
    'login has access token': (r) => {
      try {
        return JSON.parse(r.body).accessToken !== undefined;
      } catch {
        return false;
      }
    },
  });

  errorRate.add(!success);

  if (!success) {
    console.error(`Login failed for ${user.email}: ${res.status} ${res.body}`);
    return null;
  }

  const body = JSON.parse(res.body);
  return {
    token: body.accessToken,
    refreshToken: body.refreshToken,
  };
}

function authHeaders(token) {
  return {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };
}

function apiGet(path, token, metricTrend, tagName) {
  const start = new Date();
  const res = http.get(`${BASE_URL}${path}`, {
    ...authHeaders(token),
    tags: { name: tagName || `GET ${path}` },
  });

  if (metricTrend) metricTrend.add(new Date() - start);

  const success = check(res, {
    [`${tagName || path} status ok`]: (r) => r.status >= 200 && r.status < 300,
  });
  errorRate.add(!success);
  return res;
}

function apiPost(path, payload, token, metricTrend, tagName) {
  const start = new Date();
  const res = http.post(`${BASE_URL}${path}`, JSON.stringify(payload), {
    ...authHeaders(token),
    tags: { name: tagName || `POST ${path}` },
  });

  if (metricTrend) metricTrend.add(new Date() - start);

  const success = check(res, {
    [`${tagName || path} status ok`]: (r) => r.status >= 200 && r.status < 300,
  });
  errorRate.add(!success);
  return res;
}

function apiPatch(path, payload, token, metricTrend, tagName) {
  const start = new Date();
  const res = http.patch(`${BASE_URL}${path}`, JSON.stringify(payload), {
    ...authHeaders(token),
    tags: { name: tagName || `PATCH ${path}` },
  });

  if (metricTrend) metricTrend.add(new Date() - start);

  const success = check(res, {
    [`${tagName || path} status ok`]: (r) => r.status >= 200 && r.status < 300,
  });
  errorRate.add(!success);
  return res;
}

// ============================================================
// SCENARIOS
// ============================================================

export function salesScenario() {
  const user = USERS.sales[__VU % USERS.sales.length];
  const auth = login(user);
  if (!auth) return;

  group('Sales - Dashboard', () => {
    apiGet('/dashboard', auth.token, dashboardDuration, 'GET /dashboard');
    sleep(randomIntBetween(1, 3));
  });

  group('Sales - Customer Search', () => {
    const searchTerms = ['Acme', 'Metal', 'Enerji', 'San', 'Ltd', 'Mak'];
    const term = randomItem(searchTerms);
    apiGet(`/customers?search=${term}&page=1&limit=20`, auth.token, customerSearchDuration, 'GET /customers?search');
    sleep(randomIntBetween(1, 2));
  });

  group('Sales - Customer List (paginated)', () => {
    const page = randomIntBetween(1, 100);
    apiGet(`/customers?page=${page}&limit=20`, auth.token, customerListDuration, 'GET /customers');
    sleep(randomIntBetween(1, 2));
  });

  group('Sales - Customer 360', () => {
    // Get a customer ID first
    const listRes = apiGet('/customers?page=1&limit=1', auth.token, null, 'GET /customers (for 360)');
    try {
      const data = JSON.parse(listRes.body);
      if (data.data && data.data.length > 0) {
        const custId = data.data[0].id;
        apiGet(`/customers/${custId}`, auth.token, customer360Duration, 'GET /customers/:id');
        sleep(randomIntBetween(2, 4));
      }
    } catch (e) { /* skip */ }
  });

  group('Sales - Proposal List', () => {
    apiGet('/proposals?page=1&limit=20', auth.token, null, 'GET /proposals');
    sleep(randomIntBetween(1, 3));
  });

  group('Sales - Create Proposal', () => {
    const listRes = apiGet('/customers?page=1&limit=1', auth.token, null, 'GET /customers (for proposal)');
    try {
      const data = JSON.parse(listRes.body);
      if (data.data && data.data.length > 0) {
        apiPost('/proposals', {
          customerId: data.data[0].id,
          validUntil: '2026-06-30',
          notes: 'k6 load test proposal',
          items: [{
            description: 'Periyodik Kontrol Hizmeti',
            quantity: randomIntBetween(1, 50),
            unitPrice: randomIntBetween(100, 5000),
          }],
        }, auth.token, proposalCreateDuration, 'POST /proposals');
      }
    } catch (e) { /* skip */ }
    sleep(randomIntBetween(2, 5));
  });

  sleep(randomIntBetween(3, 8));
}

export function plannerScenario() {
  const user = USERS.planner[__VU % USERS.planner.length];
  const auth = login(user);
  if (!auth) return;

  group('Planner - Dashboard', () => {
    apiGet('/dashboard', auth.token, dashboardDuration, 'GET /dashboard');
    sleep(randomIntBetween(1, 3));
  });

  group('Planner - Work Order List', () => {
    apiGet('/work-orders?page=1&limit=20&status=draft,planned', auth.token, null, 'GET /work-orders');
    sleep(randomIntBetween(1, 2));
  });

  group('Planner - Equipment Search', () => {
    const terms = ['Vinc', 'Forklift', 'Asansor', 'Kazan', 'Kompressor'];
    apiGet(`/equipment?search=${randomItem(terms)}&page=1&limit=20`, auth.token, equipmentSearchDuration, 'GET /equipment?search');
    sleep(randomIntBetween(1, 2));
  });

  group('Planner - Create Work Order', () => {
    // Get customer
    const custRes = apiGet('/customers?page=1&limit=1', auth.token, null, 'GET /customers (for WO)');
    try {
      const custData = JSON.parse(custRes.body);
      if (custData.data && custData.data.length > 0) {
        const custId = custData.data[0].id;

        // Get equipment for this customer
        const eqRes = apiGet(`/equipment?customerId=${custId}&page=1&limit=5`, auth.token, null, 'GET /equipment (for WO)');
        const eqData = JSON.parse(eqRes.body);

        if (eqData.data && eqData.data.length > 0) {
          apiPost('/work-orders', {
            customerId: custId,
            equipmentIds: eqData.data.map(e => e.id),
            plannedDate: '2026-04-15',
            priority: 'normal',
            notes: 'k6 load test work order',
          }, auth.token, woCreateDuration, 'POST /work-orders');
        }
      }
    } catch (e) { /* skip */ }
    sleep(randomIntBetween(2, 5));
  });

  sleep(randomIntBetween(3, 8));
}

export function inspectorScenario() {
  const user = USERS.inspector[__VU % USERS.inspector.length];
  const auth = login(user);
  if (!auth) return;

  group('Inspector - My Work Orders', () => {
    apiGet('/work-orders/my?status=assigned,in_progress', auth.token, null, 'GET /work-orders/my');
    sleep(randomIntBetween(1, 3));
  });

  group('Inspector - Inspection List', () => {
    apiGet('/inspections?page=1&limit=20&status=in_progress', auth.token, null, 'GET /inspections');
    sleep(randomIntBetween(1, 2));
  });

  group('Inspector - Save Field Values', () => {
    // Simulate inspection form filling
    const insRes = apiGet('/inspections?page=1&limit=1&status=in_progress', auth.token, null, 'GET /inspections (for edit)');
    try {
      const insData = JSON.parse(insRes.body);
      if (insData.data && insData.data.length > 0) {
        const insId = insData.data[0].id;
        apiPatch(`/inspections/${insId}/field-values`, {
          fieldValues: [
            { fieldKey: 'genel_durum', value: 'Kontrol edildi' },
            { fieldKey: 'gorsel_kontrol', value: 'uygun' },
            { fieldKey: 'yapisal_kontrol', value: 'uygun' },
            { fieldKey: 'elektrik_kontrol', value: 'uygun' },
            { fieldKey: 'hidrolik_kontrol', value: 'uygun' },
            { fieldKey: 'guvenlik_donanimlari', value: true },
            { fieldKey: 'aciklama', value: 'k6 test - tum kontroller tamamlandi' },
          ],
        }, auth.token, null, 'PATCH /inspections/:id/field-values');
      }
    } catch (e) { /* skip */ }
    sleep(randomIntBetween(2, 5));
  });

  group('Inspector - Submit Inspection', () => {
    const insRes = apiGet('/inspections?page=1&limit=1&status=completed', auth.token, null, 'GET /inspections (for submit)');
    try {
      const insData = JSON.parse(insRes.body);
      if (insData.data && insData.data.length > 0) {
        apiPatch(`/inspections/${insData.data[0].id}/submit`, {
          overallResult: 'uygun',
        }, auth.token, inspectionSubmitDuration, 'PATCH /inspections/:id/submit');
      }
    } catch (e) { /* skip */ }
    sleep(randomIntBetween(3, 6));
  });

  sleep(randomIntBetween(3, 10));
}

export function technicalManagerScenario() {
  const user = USERS.technical_manager[__VU % USERS.technical_manager.length];
  const auth = login(user);
  if (!auth) return;

  group('TM - Dashboard', () => {
    apiGet('/dashboard', auth.token, dashboardDuration, 'GET /dashboard');
    sleep(randomIntBetween(1, 3));
  });

  group('TM - Pending Reviews', () => {
    apiGet('/inspections?status=submitted,under_review&page=1&limit=20', auth.token, null, 'GET /inspections (pending review)');
    sleep(randomIntBetween(1, 3));
  });

  group('TM - Approve Inspection', () => {
    const res = apiGet('/inspections?status=submitted&page=1&limit=1', auth.token, null, 'GET /inspections (for approve)');
    try {
      const data = JSON.parse(res.body);
      if (data.data && data.data.length > 0) {
        apiPatch(`/inspections/${data.data[0].id}/review`, {
          action: 'approve',
          notes: 'k6 test approval',
        }, auth.token, null, 'PATCH /inspections/:id/review');
      }
    } catch (e) { /* skip */ }
    sleep(randomIntBetween(2, 5));
  });

  group('TM - Report List', () => {
    apiGet('/reports?page=1&limit=20', auth.token, reportListDuration, 'GET /reports');
    sleep(randomIntBetween(1, 3));
  });

  group('TM - Approve Report', () => {
    const res = apiGet('/reports?status=under_review&page=1&limit=1', auth.token, null, 'GET /reports (for approve)');
    try {
      const data = JSON.parse(res.body);
      if (data.data && data.data.length > 0) {
        apiPatch(`/reports/${data.data[0].id}/approve`, {
          notes: 'k6 test report approval',
        }, auth.token, null, 'PATCH /reports/:id/approve');
      }
    } catch (e) { /* skip */ }
    sleep(randomIntBetween(2, 5));
  });

  sleep(randomIntBetween(3, 8));
}

export function financeScenario() {
  const user = USERS.finance[__VU % USERS.finance.length];
  const auth = login(user);
  if (!auth) return;

  group('Finance - Dashboard', () => {
    apiGet('/dashboard', auth.token, dashboardDuration, 'GET /dashboard');
    sleep(randomIntBetween(1, 3));
  });

  group('Finance - Invoice Ready WOs', () => {
    apiGet('/work-orders?status=report_approved&page=1&limit=20', auth.token, null, 'GET /work-orders (invoice ready)');
    sleep(randomIntBetween(1, 3));
  });

  group('Finance - Contract List', () => {
    apiGet('/contracts?page=1&limit=20', auth.token, null, 'GET /contracts');
    sleep(randomIntBetween(1, 2));
  });

  group('Finance - Logo Sync Status', () => {
    apiGet('/logo/queue?status=pending&page=1&limit=20', auth.token, null, 'GET /logo/queue');
    sleep(randomIntBetween(1, 3));
  });

  group('Finance - Proposal Stats', () => {
    apiGet('/proposals?status=accepted&page=1&limit=20', auth.token, null, 'GET /proposals (accepted)');
    sleep(randomIntBetween(1, 2));
  });

  sleep(randomIntBetween(3, 8));
}

export function adminScenario() {
  const user = USERS.admin[__VU % USERS.admin.length];
  const auth = login(user);
  if (!auth) return;

  group('Admin - Dashboard', () => {
    apiGet('/dashboard', auth.token, dashboardDuration, 'GET /dashboard');
    sleep(randomIntBetween(2, 5));
  });

  group('Admin - Audit Logs', () => {
    apiGet('/audit?page=1&limit=50', auth.token, null, 'GET /audit');
    sleep(randomIntBetween(1, 3));
  });

  group('Admin - User List', () => {
    apiGet('/users?page=1&limit=50', auth.token, null, 'GET /users');
    sleep(randomIntBetween(1, 2));
  });

  group('Admin - Customer Overview', () => {
    const page = randomIntBetween(1, 50);
    apiGet(`/customers?page=${page}&limit=20`, auth.token, customerListDuration, 'GET /customers (admin)');
    sleep(randomIntBetween(1, 3));
  });

  group('Admin - Equipment Stats', () => {
    apiGet('/equipment?page=1&limit=20&sort=nextControlDate&order=ASC', auth.token, null, 'GET /equipment (upcoming)');
    sleep(randomIntBetween(1, 2));
  });

  sleep(randomIntBetween(5, 12));
}

export function customerPortalScenario() {
  const user = USERS.customer[__VU % USERS.customer.length];
  const auth = login(user);
  if (!auth) return;

  group('Portal - My Reports', () => {
    apiGet('/portal/reports?page=1&limit=20', auth.token, reportListDuration, 'GET /portal/reports');
    sleep(randomIntBetween(2, 5));
  });

  group('Portal - My Equipment', () => {
    apiGet('/portal/equipment?page=1&limit=20', auth.token, null, 'GET /portal/equipment');
    sleep(randomIntBetween(1, 3));
  });

  group('Portal - Upcoming Controls', () => {
    apiGet('/portal/upcoming?page=1&limit=20', auth.token, null, 'GET /portal/upcoming');
    sleep(randomIntBetween(1, 3));
  });

  group('Portal - My Contracts', () => {
    apiGet('/portal/contracts?page=1&limit=10', auth.token, null, 'GET /portal/contracts');
    sleep(randomIntBetween(1, 3));
  });

  sleep(randomIntBetween(5, 15));
}

// ============================================================
// SETUP & TEARDOWN
// ============================================================

export function setup() {
  // Verify API is reachable
  const res = http.get(`${BASE_URL}/health`);
  if (res.status !== 200) {
    fail(`API health check failed: ${res.status}`);
  }

  // Verify login works
  const auth = login(USERS.admin[0]);
  if (!auth) {
    fail('Setup login failed');
  }

  console.log('Setup complete - API is healthy and login works');
  return { baseUrl: BASE_URL };
}

export function teardown(data) {
  console.log('Load test completed');
}

/**
 * PerKont Stress Test
 *
 * Normal kapasitenin 2x uzerinde (200 VU) ve failure senaryolari.
 *
 * Calistirma:
 *   k6 run tests/load/stress-test.js
 */

import http from 'k6/http';
import { check, sleep, fail } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000/api/v1';
const errorRate = new Rate('errors');

export const options = {
  scenarios: {
    // ST08: 200 VU spike (2x kapasite)
    spike_test: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 50 },    // warm up
        { duration: '1m', target: 100 },    // normal load
        { duration: '30s', target: 200 },   // SPIKE to 2x
        { duration: '3m', target: 200 },    // sustained spike
        { duration: '30s', target: 100 },   // recovery
        { duration: '2m', target: 100 },    // check recovery
        { duration: '1m', target: 0 },      // ramp down
      ],
      exec: 'spikeScenario',
    },

    // Concurrent proposal accept (ST06)
    concurrent_accept: {
      executor: 'shared-iterations',
      vus: 10,
      iterations: 50,
      maxDuration: '2m',
      exec: 'concurrentAcceptScenario',
      startTime: '1m',
    },
  },

  thresholds: {
    http_req_duration: ['p(95)<5000'],  // Spike'da daha yuksek tolerans
    http_req_failed: ['rate<0.05'],     // < 5% error during stress
    errors: ['rate<0.05'],
  },
};

function login(email) {
  const res = http.post(`${BASE_URL}/auth/login`, JSON.stringify({
    email,
    password: 'Test1234!',
  }), {
    headers: { 'Content-Type': 'application/json' },
  });

  if (res.status !== 200 && res.status !== 201) return null;

  try {
    return JSON.parse(res.body).accessToken;
  } catch {
    return null;
  }
}

function authHeaders(token) {
  return {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };
}

// ============================================================
// ST08: SPIKE TEST (200 VU)
// ============================================================

export function spikeScenario() {
  const roles = ['sales', 'inspector', 'planner', 'admin'];
  const role = roles[__VU % roles.length];
  const userNum = (__VU % 10) + 1;
  const email = `${role}${userNum}@perkont-test.com`;

  const token = login(email);
  if (!token) {
    errorRate.add(true);
    sleep(1);
    return;
  }

  // Dashboard load
  const dashRes = http.get(`${BASE_URL}/dashboard`, authHeaders(token));
  const dashOk = check(dashRes, {
    'dashboard ok': (r) => r.status === 200,
  });
  errorRate.add(!dashOk);

  sleep(randomIntBetween(1, 3));

  // Customer search
  const searchRes = http.get(
    `${BASE_URL}/customers?search=test&page=1&limit=20`,
    authHeaders(token)
  );
  const searchOk = check(searchRes, {
    'search ok': (r) => r.status === 200,
  });
  errorRate.add(!searchOk);

  sleep(randomIntBetween(1, 3));

  // Equipment list
  const eqRes = http.get(
    `${BASE_URL}/equipment?page=${randomIntBetween(1, 100)}&limit=20`,
    authHeaders(token)
  );
  const eqOk = check(eqRes, {
    'equipment ok': (r) => r.status === 200,
  });
  errorRate.add(!eqOk);

  sleep(randomIntBetween(2, 5));
}

// ============================================================
// ST06: CONCURRENT PROPOSAL ACCEPT
// ============================================================

export function concurrentAcceptScenario() {
  const token = login('admin1@perkont-test.com');
  if (!token) return;

  // Get a sent proposal
  const listRes = http.get(
    `${BASE_URL}/proposals?status=sent&page=1&limit=1`,
    authHeaders(token)
  );

  let proposalId;
  try {
    const data = JSON.parse(listRes.body);
    proposalId = data.data?.[0]?.id;
  } catch {
    return;
  }

  if (!proposalId) return;

  // Try to accept concurrently
  const acceptRes = http.patch(
    `${BASE_URL}/proposals/${proposalId}/accept`,
    '{}',
    authHeaders(token)
  );

  const ok = check(acceptRes, {
    'accept response received': (r) => r.status < 500,
    'no server error': (r) => r.status !== 500,
  });

  // One should succeed (200/201), others should fail (400/409)
  if (acceptRes.status >= 200 && acceptRes.status < 300) {
    console.log(`VU ${__VU}: Proposal ${proposalId} accepted successfully`);
  } else if (acceptRes.status === 409 || acceptRes.status === 400) {
    console.log(`VU ${__VU}: Proposal ${proposalId} already accepted (expected)`);
  }

  errorRate.add(!ok);
}

// ============================================================
// SETUP
// ============================================================

export function setup() {
  const res = http.get(`${BASE_URL}/health`);
  if (res.status !== 200) {
    fail(`API health check failed: ${res.status}`);
  }
  console.log('Stress test setup complete');
}

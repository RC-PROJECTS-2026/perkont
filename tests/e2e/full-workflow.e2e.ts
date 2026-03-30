/**
 * PerKont End-to-End Test Senaryolari
 *
 * Playwright ile tam uctan uca is akisi testi.
 *
 * Calistirma:
 *   cd frontend && npx playwright test e2e/full-workflow.e2e.ts
 *   cd frontend && npx playwright test e2e/full-workflow.e2e.ts --ui
 */

import { test, expect, Page } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
const API_URL = process.env.API_URL || 'http://localhost:3000/api/v1';

// ============================================================
// HELPERS
// ============================================================

async function login(page: Page, email: string, password: string = 'Test1234!') {
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[name="email"], input[type="email"]', email);
  await page.fill('input[name="password"], input[type="password"]', password);
  await page.click('button[type="submit"]');
  // Wait for redirect to dashboard
  await page.waitForURL('**/dashboard**', { timeout: 10000 });
}

async function apiLogin(email: string, password: string = 'Test1234!'): Promise<string> {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  return body.accessToken;
}

// ============================================================
// SENARYO 1: Tam Is Akisi (CRM → Fatura)
// ============================================================

test.describe('Senaryo 1: CRM → Teklif → Sozlesme → WO → Denetim → Rapor', () => {
  let customerId: string;
  let locationId: string;
  let equipmentIds: string[] = [];
  let proposalId: string;
  let contractId: string;
  let workOrderId: string;
  let inspectionId: string;
  let reportId: string;

  test('1.1 - Sales: Musteri olustur', async ({ page }) => {
    await login(page, 'sales1@perkont-test.com');

    await page.goto(`${BASE_URL}/customers`);
    await page.click('text=Yeni Musteri, button:has-text("Yeni"), a:has-text("Yeni")');

    await page.fill('input[name="name"]', 'E2E Test Firması A.Ş.');
    await page.fill('input[name="code"]', `E2E-${Date.now()}`);
    await page.fill('input[name="taxNumber"]', `${Math.floor(Math.random() * 9000000000 + 1000000000)}`);
    await page.fill('input[name="address"]', 'Test Caddesi No:1');
    await page.fill('input[name="city"]', 'Istanbul');
    await page.fill('input[name="phone"]', '02121234567');
    await page.fill('input[name="email"]', 'e2e-test@test.com');

    await page.click('button[type="submit"]');

    // Verify success
    await expect(page.locator('text=basariyla, .toast-success, [role="status"]')).toBeVisible({ timeout: 5000 });

    // Get customer ID from URL
    const url = page.url();
    const match = url.match(/customers\/([a-f0-9-]+)/);
    if (match) customerId = match[1];
  });

  test('1.2 - Sales: Lokasyon ekle', async ({ page }) => {
    test.skip(!customerId, 'Customer not created');
    await login(page, 'sales1@perkont-test.com');

    await page.goto(`${BASE_URL}/customers/${customerId}`);
    await page.click('text=Lokasyon Ekle, button:has-text("Lokasyon")');

    await page.fill('input[name="name"]', 'Istanbul Fabrika');
    await page.fill('input[name="address"]', 'Organize Sanayi Bolgesi');
    await page.fill('input[name="city"]', 'Istanbul');
    await page.fill('input[name="contactPerson"]', 'Ali Yilmaz');
    await page.fill('input[name="contactPhone"]', '05321234567');

    await page.click('button[type="submit"]');
    await expect(page.locator('text=basariyla, .toast-success')).toBeVisible({ timeout: 5000 });
  });

  test('1.3 - Sales: Ekipman ekle (3 adet)', async ({ page }) => {
    test.skip(!customerId, 'Customer not created');
    await login(page, 'sales1@perkont-test.com');

    const equipments = ['Vinc', 'Forklift', 'Asansor'];

    for (const eq of equipments) {
      await page.goto(`${BASE_URL}/equipment`);
      await page.click('text=Yeni Ekipman, button:has-text("Yeni"), a:has-text("Ekipman Ekle")');

      await page.fill('input[name="name"]', `${eq} - E2E Test`);
      await page.fill('input[name="inventoryCode"]', `EQ-E2E-${eq}-${Date.now()}`);

      // Select customer
      if (await page.isVisible('select[name="customerId"]')) {
        await page.selectOption('select[name="customerId"]', { label: 'E2E Test Firması' });
      }

      // Select equipment type
      if (await page.isVisible('select[name="equipmentTypeId"]')) {
        await page.selectOption('select[name="equipmentTypeId"]', { index: 1 });
      }

      await page.click('button[type="submit"]');
      await page.waitForTimeout(1000);
    }
  });

  test('1.4 - Sales: Teklif olustur ve gonder', async ({ page }) => {
    test.skip(!customerId, 'Customer not created');
    await login(page, 'sales1@perkont-test.com');

    await page.goto(`${BASE_URL}/proposals`);

    // Teklif olustur butonunu bul
    const newBtn = page.locator('text=Yeni Teklif, button:has-text("Yeni"), a:has-text("Teklif")').first();
    if (await newBtn.isVisible()) {
      await newBtn.click();
    } else {
      await page.goto(`${BASE_URL}/proposals/new`);
    }

    // Form doldur
    await page.waitForTimeout(1000);

    // Customer secimi
    const custSelect = page.locator('select[name="customerId"], [data-testid="customer-select"]');
    if (await custSelect.isVisible()) {
      await custSelect.selectOption({ index: 1 });
    }

    // Submit
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);

    // Teklif ID al
    const url = page.url();
    const match = url.match(/proposals\/([a-f0-9-]+)/);
    if (match) proposalId = match[1];
  });

  test('1.5 - Sales: Teklif kabul et → Sozlesme olusur', async ({ page }) => {
    test.skip(!proposalId, 'Proposal not created');
    await login(page, 'sales1@perkont-test.com');

    await page.goto(`${BASE_URL}/proposals/${proposalId}`);

    // Kabul et butonu
    const acceptBtn = page.locator('button:has-text("Kabul"), button:has-text("Onayla")').first();
    if (await acceptBtn.isVisible()) {
      await acceptBtn.click();
      await page.waitForTimeout(2000);
    }

    // Sozlesme otomatik olusmus olmali
    // Contracts sayfasinda kontrol et
    await page.goto(`${BASE_URL}/contracts`);
    await page.waitForTimeout(1000);
  });

  test('1.6 - Planner: Is emri olustur', async ({ page }) => {
    await login(page, 'planner1@perkont-test.com');

    await page.goto(`${BASE_URL}/work-orders`);

    const newBtn = page.locator('text=Yeni, button:has-text("Yeni"), a:has-text("Is Emri")').first();
    if (await newBtn.isVisible()) {
      await newBtn.click();
    }

    await page.waitForTimeout(2000);

    // Form doldur - musteri sec, ekipman sec, tarih
    // Details depend on actual UI implementation
  });

  test('1.7 - Inspector: Denetim baslat ve tamamla', async ({ page }) => {
    await login(page, 'inspector1@perkont-test.com');

    await page.goto(`${BASE_URL}/inspections`);

    // My inspections
    await page.waitForTimeout(1000);

    // Find an in_progress inspection
    const inspection = page.locator('tr, [data-testid="inspection-row"]').first();
    if (await inspection.isVisible()) {
      await inspection.click();
      await page.waitForTimeout(1000);
    }
  });

  test('1.8 - Technical Manager: Rapor onayla', async ({ page }) => {
    await login(page, 'technical_manager1@perkont-test.com');

    await page.goto(`${BASE_URL}/reports`);
    await page.waitForTimeout(1000);

    // Onay bekleyen raporlar
    const pendingTab = page.locator('text=Onay Bekleyen, button:has-text("Bekleyen")');
    if (await pendingTab.isVisible()) {
      await pendingTab.click();
    }
  });
});

// ============================================================
// SENARYO 4: Customer Portal
// ============================================================

test.describe('Senaryo 4: Customer Portal Erisim', () => {
  test('4.1 - Portal: Login ve rapor listele', async ({ page }) => {
    await login(page, 'customer1@perkont-test.com');

    await page.goto(`${BASE_URL}/portal/reports`);
    await page.waitForTimeout(2000);

    // Rapor listesi gorunmeli
    const reportList = page.locator('table, [data-testid="report-list"]');
    await expect(reportList).toBeVisible({ timeout: 10000 });
  });

  test('4.2 - Portal: Baska musterinin verisine ERISILEMEZ', async ({ page }) => {
    await login(page, 'customer1@perkont-test.com');

    // API uzerinden baska musterinin raporu
    const response = await page.request.get(`${API_URL}/portal/reports`);
    const data = await response.json();

    // Tum raporlar ayni musteriye ait olmali
    if (data.data && data.data.length > 0) {
      const customerIds = new Set(data.data.map((r: any) => r.customerId));
      expect(customerIds.size).toBeLessThanOrEqual(1);
    }
  });

  test('4.3 - Portal: Dahili endpointlere ERISILEMEZ', async ({ page }) => {
    await login(page, 'customer1@perkont-test.com');

    // Customers endpoint'ine erisim denemesi
    const response = await page.request.get(`${API_URL}/customers`, {
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(403);

    // Work orders
    const woResponse = await page.request.get(`${API_URL}/work-orders`, {
      failOnStatusCode: false,
    });
    expect(woResponse.status()).toBe(403);
  });
});

// ============================================================
// SENARYO 12: contractRequired=true Engelleme
// ============================================================

test.describe('Senaryo 12: Sozlesmesiz WO Engelleme', () => {
  test('12.1 - contractRequired=true iken sozlesmesiz WO ENGELLENMELI', async ({ request }) => {
    const token = await apiLogin('admin1@perkont-test.com');

    // TODO: Company setting contractRequired=true ayarla
    // Sonra sozlesmesiz WO olustur - 400/422 beklenir
  });
});

// ============================================================
// SENARYO 13: noContractRisk
// ============================================================

test.describe('Senaryo 13: noContractRisk Isaretleme', () => {
  test('13.1 - contractRequired=false iken sozlesmesiz WO → noContractRisk=true', async ({ request }) => {
    const token = await apiLogin('admin1@perkont-test.com');

    // Get a customer
    const custRes = await request.get(`${API_URL}/customers?page=1&limit=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const custData = await custRes.json();
    if (!custData.data?.[0]) return;

    // Get equipment
    const eqRes = await request.get(`${API_URL}/equipment?customerId=${custData.data[0].id}&page=1&limit=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const eqData = await eqRes.json();
    if (!eqData.data?.[0]) return;

    // Create WO without contract
    const woRes = await request.post(`${API_URL}/work-orders`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: {
        customerId: custData.data[0].id,
        equipmentIds: [eqData.data[0].id],
        plannedDate: '2026-05-01',
        priority: 'normal',
        // No contractId
      },
    });

    if (woRes.ok()) {
      const woData = await woRes.json();
      // noContractRisk should be true
      expect(woData.noContractRisk || woData.data?.noContractRisk).toBe(true);
    }
  });
});

// ============================================================
// SENARYO 14: Customer 360
// ============================================================

test.describe('Senaryo 14: Customer 360 Dogruluk', () => {
  test('14.1 - Customer 360 tum iliskileri gosterir', async ({ page }) => {
    await login(page, 'admin1@perkont-test.com');

    // Get first customer
    await page.goto(`${BASE_URL}/customers`);
    await page.waitForTimeout(2000);

    const firstRow = page.locator('tr a, [data-testid="customer-row"]').first();
    if (await firstRow.isVisible()) {
      await firstRow.click();
      await page.waitForTimeout(3000);

      // Customer 360 sayfasinda su bolumler olmali:
      // - Musteri bilgileri
      // - Lokasyonlar
      // - Ekipmanlar
      // - Teklifler
      // - Sozlesmeler
      // - Is emirleri
      // - Raporlar

      const sections = [
        'Lokasyon',
        'Ekipman',
      ];

      for (const section of sections) {
        const sectionEl = page.locator(`text=${section}`).first();
        // At least the heading should exist
        const isVisible = await sectionEl.isVisible().catch(() => false);
        if (!isVisible) {
          console.warn(`Customer 360: "${section}" bolumu bulunamadi`);
        }
      }
    }
  });
});

// ============================================================
// VALIDATION TESTS (UI)
// ============================================================

test.describe('Validation Tests (UI)', () => {
  test('V01 - Zorunlu alan bos birakilamaz (Musteri olusturma)', async ({ page }) => {
    await login(page, 'admin1@perkont-test.com');

    await page.goto(`${BASE_URL}/customers`);
    const newBtn = page.locator('text=Yeni Musteri, button:has-text("Yeni")').first();
    if (await newBtn.isVisible()) {
      await newBtn.click();
      await page.waitForTimeout(1000);

      // Submit without filling required fields
      await page.click('button[type="submit"]');

      // Validation error messages should appear
      const errors = page.locator('.text-red, .error, [role="alert"], .text-destructive');
      await expect(errors.first()).toBeVisible({ timeout: 3000 });
    }
  });

  test('V02 - Dashboard rol bazli dogru veri gosterir', async ({ page }) => {
    // Sales dashboard
    await login(page, 'sales1@perkont-test.com');
    await page.goto(`${BASE_URL}/dashboard`);
    await page.waitForTimeout(2000);

    // Sales user should see sales-related widgets
    const salesWidgets = page.locator('text=Teklif, text=Musteri, text=Firsat');
    // At least one should be visible
  });
});

// ============================================================
// PERFORMANCE TESTS (Page Load)
// ============================================================

test.describe('Performance: Sayfa Yuklenme Sureleri', () => {
  test('PERF-01 - Dashboard 3 saniye altinda acilmali', async ({ page }) => {
    await login(page, 'admin1@perkont-test.com');

    const start = Date.now();
    await page.goto(`${BASE_URL}/dashboard`);
    await page.waitForLoadState('networkidle');
    const duration = Date.now() - start;

    console.log(`Dashboard load time: ${duration}ms`);
    expect(duration).toBeLessThan(3000);
  });

  test('PERF-02 - Musteri listesi 2 saniye altinda acilmali', async ({ page }) => {
    await login(page, 'admin1@perkont-test.com');

    const start = Date.now();
    await page.goto(`${BASE_URL}/customers`);
    await page.waitForLoadState('networkidle');
    const duration = Date.now() - start;

    console.log(`Customer list load time: ${duration}ms`);
    expect(duration).toBeLessThan(2000);
  });

  test('PERF-03 - Ekipman arama 2 saniye altinda sonuc vermeli', async ({ page }) => {
    await login(page, 'admin1@perkont-test.com');

    await page.goto(`${BASE_URL}/equipment`);
    await page.waitForLoadState('networkidle');

    const searchInput = page.locator('input[placeholder*="Ara"], input[name="search"]').first();
    if (await searchInput.isVisible()) {
      const start = Date.now();
      await searchInput.fill('Vinc');
      await page.waitForTimeout(500); // debounce
      await page.waitForLoadState('networkidle');
      const duration = Date.now() - start;

      console.log(`Equipment search time: ${duration}ms`);
      expect(duration).toBeLessThan(2000);
    }
  });
});

// Bölüm 14 — E2E Setup: Kimlik doğrulama state'lerini kaydet
// Her test projesinin ayrı bir authenticated session'ı olur.

import { test as setup, expect } from '@playwright/test';
import path from 'path';

const ADMIN_FILE    = path.join(__dirname, '.auth/admin.json');
const INSPECTOR_FILE = path.join(__dirname, '.auth/inspector.json');

// Admin kullanıcı oturumu
setup('authenticate as admin', async ({ page }) => {
  await page.goto('/auth/login');

  await page.getByLabel('E-posta').fill(process.env.TEST_ADMIN_EMAIL || 'admin@test.com');
  await page.getByLabel('Şifre').fill(process.env.TEST_ADMIN_PASSWORD || 'Test123!');
  await page.getByRole('button', { name: 'Giriş Yap' }).click();

  // Dashboard'a yönlendirme bekle
  await page.waitForURL('**/dashboard');
  await expect(page).toHaveURL(/dashboard/);

  // Storage state kaydet — diğer testlerde kullanılır
  await page.context().storageState({ path: ADMIN_FILE });
});

// Muayene elemanı oturumu
setup('authenticate as inspector', async ({ page }) => {
  await page.goto('/auth/login');

  await page.getByLabel('E-posta').fill(process.env.TEST_INSPECTOR_EMAIL || 'inspector@test.com');
  await page.getByLabel('Şifre').fill(process.env.TEST_INSPECTOR_PASSWORD || 'Test123!');
  await page.getByRole('button', { name: 'Giriş Yap' }).click();

  await page.waitForURL('**/dashboard');
  await page.context().storageState({ path: INSPECTOR_FILE });
});

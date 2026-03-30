// Bölüm 14 — Test Stratejisi: Jest + Supertest + Playwright
// Playwright: %10 E2E testler — kritik akışlar
// Bu config frontend Next.js uygulaması için E2E testleri çalıştırır.

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',

  // Paralel çalıştırma
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,

  // Reporter
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['junit', { outputFile: 'playwright-results.xml' }],
    ['list'],
  ],

  use: {
    // Test edilen URL
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',

    // Her testte screenshot al (başarısız olunca)
    screenshot: 'only-on-failure',

    // Video kayıt (başarısız olunca)
    video: 'on-first-retry',

    // Trace (debug için)
    trace: 'on-first-retry',

    // Timeout
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },

  // Test projeleri
  projects: [
    // Setup — kimlik doğrulama
    {
      name: 'setup',
      testMatch: '**/auth.setup.ts',
    },

    // Desktop Chrome (ana test tarayıcısı)
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/admin.json',
      },
      dependencies: ['setup'],
    },

    // Mobile (saha kullanıcısı senaryoları)
    {
      name: 'mobile-chrome',
      use: {
        ...devices['Pixel 7'],
        storageState: 'e2e/.auth/inspector.json',
      },
      dependencies: ['setup'],
    },
  ],

  // Dev server'ı otomatik başlat
  webServer: {
    command: 'npm run start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

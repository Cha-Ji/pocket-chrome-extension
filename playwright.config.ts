import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,   // Extension tests need serial execution (shared persistent context)
  forbidOnly: !!process.env.CI,
  retries: 0,             // Diagnostics should not retry — we want raw results
  workers: 1,             // One browser instance at a time
  reporter: [
    ['list'],             // Console-friendly output for LLM consumption
    ['html', { open: 'never' }],
  ],
  timeout: 120_000,       // Mining tests need longer timeouts

  use: {
    baseURL: 'https://pocketoption.com',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    // Lightweight tests that run without auth / extension
    {
      name: 'basic',
      testMatch: ['example.spec.ts', 'offline-dom.spec.ts'],
      use: { ...devices['Desktop Chrome'] },
    },
    // Extension-loaded tests (Playwright manages persistent context internally)
    // Run: npx playwright test --project=extension-diagnostic
    {
      name: 'extension-diagnostic',
      testMatch: ['mining-diagnostic.spec.ts'],
      // No device config — persistent context is launched by the test itself
    },
    // Full extension tests
    {
      name: 'extension',
      testMatch: ['extension.spec.ts'],
    },
    // CDP-based deep diagnostic tests
    // Run: npx playwright test --project=cdp-diagnostic
    {
      name: 'cdp-diagnostic',
      testMatch: ['cdp-diagnostic.spec.ts'],
    },
  ],

  // E2E tests against live Pocket Option require:
  //   1. Accessible region (Korea, etc.)
  //   2. Pre-authenticated profile: TEST_PROFILE=./test-profile
  //   3. Local collector server: npm run collector
  //   4. Built extension: npm run build
})

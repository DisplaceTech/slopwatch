import { defineConfig } from '@playwright/test';

/**
 * Chromium E2E (TESTING.md Layer 4): launch a persistent context with the built
 * unpacked extension and the MockProvider forced, then drive the full
 * click→annotate flow. Specs land in M1.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  timeout: 30_000,
});

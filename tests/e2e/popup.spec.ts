import { test, expect, chromium, type BrowserContext } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Chromium E2E: load the real built extension in a persistent context and verify
 * the popup renders and upholds the no-bare-verdict invariant (AD-7).
 *
 * NOTE: Chromium offers no Playwright API to click the toolbar action, so the
 * full click→extract→analyze→annotate flow is covered by the orchestrator
 * integration test (deterministic MockProvider) and the manual Firefox smoke
 * checklist in TESTING.md — not here.
 */

const dir = path.dirname(fileURLToPath(import.meta.url));
const EXT_PATH = path.resolve(dir, '../../.output/chrome-mv3');

let context: BrowserContext;

test.beforeAll(async () => {
  // Extensions require the full Chromium build (headless shell can't load them);
  // the `chromium` channel runs new-headless with extension support.
  context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${EXT_PATH}`, `--load-extension=${EXT_PATH}`],
  });
});

test.afterAll(async () => {
  await context?.close();
});

async function extensionId(): Promise<string> {
  let [sw] = context.serviceWorkers();
  sw ??= await context.waitForEvent('serviceworker');
  return new URL(sw.url()).host;
}

test('popup prompts setup on a fresh install — never silently runs', async () => {
  const id = await extensionId();
  const page = await context.newPage();
  await page.goto(`chrome-extension://${id}/popup.html`);

  await expect(page.getByRole('heading', { name: 'Slopwatch' })).toBeVisible();
  // A fresh production install has no configured provider: it must prompt setup,
  // not show a Run button (the Mock provider never runs in a real build).
  await expect(page.getByRole('button', { name: /open settings/i })).toBeVisible();
  await expect(page.getByText(/no analysis provider is set up/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /run analysis/i })).toHaveCount(0);
  // The permanent responsible-use caveat is still shown.
  await expect(page.getByText(/probabilistic estimate from a language model/i)).toBeVisible();
});

test('popup never shows a bare AI/Human verdict on idle', async () => {
  const id = await extensionId();
  const page = await context.newPage();
  await page.goto(`chrome-extension://${id}/popup.html`);
  const text = (await page.locator('main.popup').innerText()).trim();
  // No standalone "AI" or "Human" verdict word.
  expect(text).not.toMatch(/^(AI|Human)$/im);
});

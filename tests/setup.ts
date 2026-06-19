// Vitest setup: reset the in-memory fakeBrowser between tests so storage/state
// never leaks across cases. WXT's fakeBrowser is auto-injected by WxtVitest.
import { fakeBrowser } from 'wxt/testing';
import { beforeEach } from 'vitest';

beforeEach(() => {
  fakeBrowser.reset();
});

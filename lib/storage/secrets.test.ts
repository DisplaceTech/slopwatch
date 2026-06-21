import { describe, it, expect } from 'vitest';
import {
  setSecret,
  getSecret,
  hasSecret,
  clearSecret,
  applyPersistencePreference,
} from './secrets';

describe('secrets storage', () => {
  it('stores and retrieves a secret from session storage (default)', async () => {
    await setSecret('anthropic', 'sk-ant-test', false);
    expect(await getSecret('anthropic')).toBe('sk-ant-test');
    expect(await hasSecret('anthropic')).toBe(true);
  });

  it('stores a secret in local storage when persist=true', async () => {
    await setSecret('openai_compat', 'or-test-key', true);
    expect(await getSecret('openai_compat')).toBe('or-test-key');
    expect(await hasSecret('openai_compat')).toBe(true);
  });

  it('clears a secret from both areas', async () => {
    await setSecret('anthropic', 'k', false);
    await clearSecret('anthropic');
    expect(await hasSecret('anthropic')).toBe(false);
  });

  it('applyPersistencePreference migrates an openai_compat secret to local', async () => {
    await setSecret('openai_compat', 'or-migrate-key', false);
    expect(await hasSecret('openai_compat')).toBe(true);

    await applyPersistencePreference(true);

    // Secret is still accessible after migration.
    expect(await getSecret('openai_compat')).toBe('or-migrate-key');
    expect(await hasSecret('openai_compat')).toBe(true);
  });

  it('applyPersistencePreference migrates openai_compat back to session', async () => {
    await setSecret('openai_compat', 'or-session-key', true);
    await applyPersistencePreference(false);
    expect(await getSecret('openai_compat')).toBe('or-session-key');
  });

  it('applyPersistencePreference is a no-op for unset providers', async () => {
    // No secret set for openai_compat — should not throw.
    await expect(applyPersistencePreference(true)).resolves.toBeUndefined();
    expect(await hasSecret('openai_compat')).toBe(false);
  });
});

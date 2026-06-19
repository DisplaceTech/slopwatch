import { describe, it, expect } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  getSettings,
  updateSettings,
  parseSettings,
  onSettingsChanged,
  MIN_UNCERTAIN_BAND,
} from '@/lib/storage/settings';
import {
  setSecret,
  getSecret,
  hasSecret,
  clearSecret,
  applyPersistencePreference,
} from '@/lib/storage/secrets';

describe('settings', () => {
  it('returns defaults when nothing is stored', async () => {
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('falls back to defaults on a corrupt/partial stored object', async () => {
    await fakeBrowser.storage.local.set({ [SETTINGS_KEY]: { version: 1, garbage: true } });
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('parseSettings rejects a thresholds config that collapses the Uncertain band', () => {
    const collapsed = {
      ...DEFAULT_SETTINGS,
      thresholds: { humanMax: 0.5, aiMin: 0.5 },
    };
    // Returns defaults rather than the invalid object.
    expect(parseSettings(collapsed).thresholds).toEqual(DEFAULT_SETTINGS.thresholds);
  });

  it('accepts a thresholds config exactly at the minimum band width', () => {
    const ok = {
      ...DEFAULT_SETTINGS,
      thresholds: { humanMax: 0.3, aiMin: 0.3 + MIN_UNCERTAIN_BAND },
    };
    expect(parseSettings(ok).thresholds.aiMin).toBeCloseTo(0.3 + MIN_UNCERTAIN_BAND);
  });

  it('persists a partial patch atomically', async () => {
    const next = await updateSettings({ activeProvider: 'anthropic' });
    expect(next.activeProvider).toBe('anthropic');
    expect((await getSettings()).activeProvider).toBe('anthropic');
  });

  it('notifies subscribers on change', async () => {
    let seen: string | undefined;
    const unsub = onSettingsChanged((s) => {
      seen = s.activeProvider;
    });
    await updateSettings({ activeProvider: 'ollama' });
    expect(seen).toBe('ollama');
    unsub();
  });
});

describe('secrets', () => {
  it('defaults to session storage (write-only from UI perspective)', async () => {
    await setSecret('anthropic', 'sk-test', false);
    // Configured flag is visible…
    expect(await hasSecret('anthropic')).toBe(true);
    // …but the key lives in session, not local.
    expect(await fakeBrowser.storage.session.get('secret:anthropic')).toEqual({
      'secret:anthropic': 'sk-test',
    });
    expect(await fakeBrowser.storage.local.get('secret:anthropic')).toEqual({});
  });

  it('persists to local only on explicit opt-in, never duplicating', async () => {
    await setSecret('anthropic', 'sk-test', true);
    expect(await fakeBrowser.storage.local.get('secret:anthropic')).toEqual({
      'secret:anthropic': 'sk-test',
    });
    expect(await fakeBrowser.storage.session.get('secret:anthropic')).toEqual({});
  });

  it('reports hasSecret=false before any key is set', async () => {
    expect(await hasSecret('openai_compat')).toBe(false);
  });

  it('getSecret returns the value for the background request path only', async () => {
    await setSecret('openai_compat', 'sk-openai', false);
    expect(await getSecret('openai_compat')).toBe('sk-openai');
  });

  it('clears a key from both areas', async () => {
    await setSecret('anthropic', 'sk-test', true);
    await clearSecret('anthropic');
    expect(await hasSecret('anthropic')).toBe(false);
  });

  it('moves keys between areas when persistence preference changes', async () => {
    await setSecret('anthropic', 'sk-test', false);
    await applyPersistencePreference(true);
    expect(await fakeBrowser.storage.local.get('secret:anthropic')).toEqual({
      'secret:anthropic': 'sk-test',
    });
    expect(await fakeBrowser.storage.session.get('secret:anthropic')).toEqual({});
  });
});

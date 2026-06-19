import { browser } from 'wxt/browser';
import type { ProviderId } from '../types';

/**
 * API-key storage. Keys default to `storage.session` (in-memory, cleared on
 * browser restart). Persistence to `storage.local` is an explicit opt-in
 * (see Settings.persistSecrets) with a visible at-rest warning in the UI.
 *
 * Hard invariant: keys are write-only from the UI's perspective. The UI may ask
 * whether a key is *configured* (`hasSecret`) but never reads the value back.
 * Only the background request path calls `getSecret`. Keys are never logged,
 * never returned to the UI, and never written into cached results.
 */

const PREFIX = 'secret:';

function keyFor(provider: ProviderId): string {
  return `${PREFIX}${provider}`;
}

/** Save a key. `persist` decides session (default) vs local (opt-in). */
export async function setSecret(
  provider: ProviderId,
  value: string,
  persist: boolean,
): Promise<void> {
  const k = keyFor(provider);
  // Ensure a key only ever lives in one area; moving persistence clears the other.
  if (persist) {
    await browser.storage.session.remove(k);
    await browser.storage.local.set({ [k]: value });
  } else {
    await browser.storage.local.remove(k);
    await browser.storage.session.set({ [k]: value });
  }
}

/** Read a key for outbound use. Background-only. Returns undefined if absent. */
export async function getSecret(provider: ProviderId): Promise<string | undefined> {
  const k = keyFor(provider);
  const session = await browser.storage.session.get(k);
  if (typeof session[k] === 'string') return session[k] as string;
  const local = await browser.storage.local.get(k);
  return typeof local[k] === 'string' ? (local[k] as string) : undefined;
}

/** UI-safe check: is a key configured for this provider? Never returns the key. */
export async function hasSecret(provider: ProviderId): Promise<boolean> {
  return (await getSecret(provider)) !== undefined;
}

/** Remove a key from both areas. */
export async function clearSecret(provider: ProviderId): Promise<void> {
  const k = keyFor(provider);
  await browser.storage.session.remove(k);
  await browser.storage.local.remove(k);
}

/**
 * Migrate stored keys between session and local when the persistence preference
 * changes. Moves any existing key into the chosen area.
 */
export async function applyPersistencePreference(persist: boolean): Promise<void> {
  for (const provider of ['anthropic', 'openai_compat', 'ollama', 'mock'] as ProviderId[]) {
    const existing = await getSecret(provider);
    if (existing !== undefined) {
      await setSecret(provider, existing, persist);
    }
  }
}

import { browser } from 'wxt/browser';
import type { ProviderId } from './types';
import type { Settings } from './storage/settings';

/**
 * Optional host permissions, requested at runtime per provider in use (AD-3).
 * `request` must be called from a user gesture in an extension page (popup or
 * options). Match patterns ignore port, so `http://localhost/*` covers Ollama's
 * default :11434.
 */

export function originPatternFor(provider: ProviderId, settings: Settings): string | null {
  switch (provider) {
    case 'anthropic':
      return 'https://api.anthropic.com/*';
    case 'openai_compat':
      return originFromUrl(settings.providers.openai_compat.baseUrl);
    case 'ollama':
      return originFromUrl(settings.providers.ollama.baseUrl ?? 'http://localhost:11434');
    case 'mock':
      return null;
  }
}

function originFromUrl(url?: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}/*`;
  } catch {
    return null;
  }
}

export async function hasProviderPermission(provider: ProviderId, settings: Settings): Promise<boolean> {
  const origin = originPatternFor(provider, settings);
  if (!origin) return true;
  try {
    return await browser.permissions.contains({ origins: [origin] });
  } catch {
    return false;
  }
}

/** Request the provider's host permission. Call only from a user gesture. */
export async function requestProviderPermission(
  provider: ProviderId,
  settings: Settings,
): Promise<boolean> {
  const origin = originPatternFor(provider, settings);
  if (!origin) return true;
  try {
    return await browser.permissions.request({ origins: [origin] });
  } catch {
    return false;
  }
}

import { hasSecret } from '../storage/secrets';
import type { Settings } from '../storage/settings';

/**
 * Whether the active provider is actually usable, so the UI can prompt setup
 * instead of silently running (or failing). The Mock provider only counts as
 * configured in development builds — never in an installed extension.
 */
export async function isProviderConfigured(settings: Settings): Promise<boolean> {
  switch (settings.activeProvider) {
    case 'mock':
      return import.meta.env.DEV;
    case 'anthropic':
    case 'openai_compat':
      return hasSecret(settings.activeProvider);
    case 'ollama':
      // Can't verify reachability without a network call; assume configured and
      // surface a CORS/network error at run time if not.
      return true;
  }
}

import type { AnalysisProvider } from '../types';
import type { Settings } from '../storage/settings';
import { MockProvider } from './mock';
import { ProviderError } from '../errors';

/**
 * Provider factory. Resolves the active provider from settings, fetching secrets
 * from the background-only secret store as needed. M1 ships the MockProvider; the
 * real adapters (anthropic / openai_compat / ollama) arrive in M2.
 */
export async function createProvider(settings: Settings): Promise<AnalysisProvider> {
  const id = settings.activeProvider;
  const cfg = settings.providers[id];
  switch (id) {
    case 'mock':
      return new MockProvider(cfg.model, settings.thresholds);
    case 'anthropic':
    case 'openai_compat':
    case 'ollama':
      throw new ProviderError(
        'unknown',
        `The ${id} provider isn't implemented yet — it lands in M2. Use the Mock provider for now.`,
        { retryable: false },
      );
  }
}

export { MockProvider } from './mock';
export * from './base';

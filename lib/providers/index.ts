import type { AnalysisProvider } from '../types';
import type { Settings } from '../storage/settings';
import { getSecret } from '../storage/secrets';
import { MockProvider } from './mock';
import { AnthropicProvider } from './anthropic';
import { OllamaProvider } from './ollama';
import { OpenAICompatProvider } from './openai-compat';
import { ProviderError } from '../errors';

/**
 * Provider factory. Resolves the active provider from settings, reading API keys
 * from the background-only secret store. Secrets never leave this path.
 */
export async function createProvider(settings: Settings): Promise<AnalysisProvider> {
  const id = settings.activeProvider;
  const cfg = settings.providers[id];
  switch (id) {
    case 'mock':
      // The Mock provider is a development/test aid only. In a production build it
      // must never run — a missing real provider is reported as "not configured".
      if (!import.meta.env.DEV) {
        throw new ProviderError(
          'unknown',
          'No analysis provider is configured. Open Settings and add an Anthropic key or point at a local Ollama model.',
          { retryable: false },
        );
      }
      return new MockProvider(cfg.model, settings.thresholds);
    case 'anthropic': {
      const key = await getSecret('anthropic');
      return new AnthropicProvider(cfg.model, key, settings.thresholds);
    }
    case 'ollama':
      return new OllamaProvider(cfg.model, cfg.baseUrl, settings.thresholds);
    case 'openai_compat': {
      const key = await getSecret('openai_compat');
      return new OpenAICompatProvider(cfg.model, cfg.baseUrl, key, settings.thresholds);
    }
  }
}

export { isProviderConfigured } from './readiness';
export { MockProvider } from './mock';
export { AnthropicProvider, estimateCost } from './anthropic';
export { OllamaProvider, ollamaOriginsSnippet } from './ollama';
export { OpenAICompatProvider } from './openai-compat';
export * from './base';

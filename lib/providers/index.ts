import type { AnalysisProvider } from '../types';
import type { Settings } from '../storage/settings';
import { getSecret } from '../storage/secrets';
import { MockProvider } from './mock';
import { AnthropicProvider } from './anthropic';
import { OllamaProvider } from './ollama';
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
      return new MockProvider(cfg.model, settings.thresholds);
    case 'anthropic': {
      const key = await getSecret('anthropic');
      return new AnthropicProvider(cfg.model, key, settings.thresholds);
    }
    case 'ollama':
      return new OllamaProvider(cfg.model, cfg.baseUrl, settings.thresholds);
    case 'openai_compat':
      throw new ProviderError(
        'unknown',
        "The OpenAI-compatible provider isn't implemented yet. Use Anthropic, Ollama, or Mock.",
        { retryable: false },
      );
  }
}

export { MockProvider } from './mock';
export { AnthropicProvider, estimateCost } from './anthropic';
export { OllamaProvider, ollamaOriginsSnippet } from './ollama';
export * from './base';

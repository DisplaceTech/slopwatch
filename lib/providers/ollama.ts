import type { AnalysisProvider, AnalysisResult, AnalysisUsage, ExtractedContent } from '../types';
import type { Thresholds } from '../storage/settings';
import { ProviderError } from '../errors';
import { buildPrompt } from '../analysis/prompt';
import { RESPONSE_JSON_SCHEMA } from '../analysis/schema';
import { finalizeResult, parseWithRepair } from './base';
import { requestJson, DEFAULT_HTTP, type HttpDeps } from './http';

/**
 * Ollama native adapter (Story 8). Uses POST /api/chat with a `format` JSON
 * schema for structured output, and GET /api/tags to list pulled models. All
 * content stays on-device (`ranLocally: true`). The common failure is a missing
 * `OLLAMA_ORIGINS` allowance, which surfaces as a CORS error with a copy-paste
 * remediation in the UI.
 */

const DEFAULT_BASE = 'http://localhost:11434';
const LABEL = 'Ollama';

interface OllamaChatResponse {
  message?: { content?: string };
  prompt_eval_count?: number;
  eval_count?: number;
}

interface OllamaTagsResponse {
  models?: { name?: string }[];
}

export class OllamaProvider implements AnalysisProvider {
  readonly id = 'ollama' as const;
  private readonly base: string;

  constructor(
    private readonly model: string,
    baseUrl: string | undefined,
    private readonly thresholds: Thresholds,
    private readonly http: HttpDeps = DEFAULT_HTTP,
  ) {
    this.base = (baseUrl || DEFAULT_BASE).replace(/\/+$/, '');
  }

  async validate(signal?: AbortSignal): Promise<{ ok: boolean; detail?: string }> {
    try {
      const models = await this.listModels(signal);
      const has = this.model && models.includes(this.model);
      return {
        ok: true,
        detail: has
          ? `Connected to Ollama; "${this.model}" is available.`
          : `Connected to Ollama, but "${this.model}" isn't pulled. Available: ${models.join(', ') || 'none'}.`,
      };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : String(err) };
    }
  }

  async listModels(signal?: AbortSignal): Promise<string[]> {
    const data = (await requestJson(
      {
        url: `${this.base}/api/tags`,
        method: 'GET',
        headers: {},
        body: undefined,
        signal: signal ?? new AbortController().signal,
        networkFailureKind: 'cors',
        providerLabel: LABEL,
      },
      this.http,
    )) as OllamaTagsResponse;
    return (data.models ?? []).map((m) => m.name).filter((n): n is string => typeof n === 'string');
  }

  async analyze(content: ExtractedContent, signal: AbortSignal): Promise<AnalysisResult> {
    const { system, user } = buildPrompt(content);
    const start = Date.now();
    let usage: AnalysisUsage | undefined;

    const call = async (userText: string): Promise<string> => {
      const data = (await requestJson(
        {
          url: `${this.base}/api/chat`,
          headers: {},
          body: {
            model: this.model,
            stream: false,
            format: RESPONSE_JSON_SCHEMA,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: userText },
            ],
          },
          signal,
          networkFailureKind: 'cors',
          providerLabel: LABEL,
        },
        this.http,
      )) as OllamaChatResponse;
      usage = {
        inputTokens: data.prompt_eval_count,
        outputTokens: data.eval_count,
      };
      return data.message?.content ?? '';
    };

    const firstText = await call(user);
    const { analysis, repaired } = await parseWithRepair(firstText, (validationError) =>
      call(
        `${user}\n\nYour previous response could not be parsed (${validationError}). ` +
          `Return ONLY the corrected JSON object, no prose.`,
      ),
    );

    return finalizeResult({
      analysis,
      provider: 'ollama',
      model: this.model,
      ranLocally: true,
      thresholds: this.thresholds,
      latencyMs: Date.now() - start,
      truncated: content.truncated,
      sampledFraction: content.sampledFraction,
      schemaRepaired: repaired,
      segmentCount: content.segments.length,
      usage,
    });
  }
}

/** Build the CORS remediation snippet shown when Ollama refuses the request. */
export function ollamaOriginsSnippet(): string {
  return 'OLLAMA_ORIGINS="chrome-extension://*,moz-extension://*" ollama serve';
}

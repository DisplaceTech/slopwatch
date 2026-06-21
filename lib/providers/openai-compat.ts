import type { AnalysisProvider, AnalysisResult, AnalysisUsage, ExtractedContent } from '../types';
import type { Thresholds } from '../storage/settings';
import { ProviderError } from '../errors';
import { buildPrompt } from '../analysis/prompt';
import { RESPONSE_JSON_SCHEMA } from '../analysis/schema';
import { finalizeResult, parseWithRepair } from './base';
import { requestJson, DEFAULT_HTTP, type HttpDeps } from './http';

/**
 * OpenAI-compatible API adapter (Story 7). Works with any gateway that speaks the
 * OpenAI Chat Completions format — OpenAI, OpenRouter, Azure OpenAI, local proxies,
 * etc. Structured output is requested via `response_format.json_schema`; if the
 * gateway returns 400 with a body indicating it doesn't support that mode, the
 * adapter falls back once to `response_format.json_object` without silently hiding
 * other 4xx errors. Attribution headers (`HTTP-Referer`, `X-Title`) are always sent
 * and are harmless on non-OpenRouter gateways.
 */

const MAX_TOKENS = 2048;
const LABEL = 'OpenAI-compatible';

/**
 * Best-effort cost table (USD per 1M tokens). Returns undefined for unknown models
 * rather than crashing. Updated when the default provider changes.
 *
 * z-ai/glm-5.2 pricing from https://openrouter.ai/api/v1/models (2026-06-21):
 *   input $1.20/1M, output $4.10/1M.
 */
const PRICING: { match: string; in: number; out: number }[] = [
  { match: 'z-ai/glm-5.2', in: 1.2, out: 4.1 },
  { match: 'gpt-4o-mini', in: 0.15, out: 0.6 },
];

interface OpenAICompatResponse {
  choices?: { message?: { content?: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export class OpenAICompatProvider implements AnalysisProvider {
  readonly id = 'openai_compat' as const;
  private readonly base: string;

  constructor(
    private readonly model: string,
    baseUrl: string | undefined,
    private readonly apiKey: string | undefined,
    private readonly thresholds: Thresholds,
    private readonly http: HttpDeps = DEFAULT_HTTP,
  ) {
    this.base = (baseUrl ?? 'https://api.openai.com/v1').replace(/\/+$/, '');
  }

  private headers(): Record<string, string> {
    if (!this.apiKey) {
      throw new ProviderError('auth', 'No OpenAI-compatible API key is configured.', {
        retryable: false,
      });
    }
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'HTTP-Referer': 'https://github.com/DisplaceTech/slopwatch',
      'X-Title': 'Slopwatch',
    };
  }

  async validate(signal?: AbortSignal): Promise<{ ok: boolean; detail?: string }> {
    if (!this.apiKey) return { ok: false, detail: 'No OpenAI-compatible API key is configured.' };
    try {
      await requestJson(
        {
          url: `${this.base}/chat/completions`,
          headers: this.headers(),
          body: {
            model: this.model,
            max_tokens: 1,
            messages: [{ role: 'user', content: 'ping' }],
          },
          signal: signal ?? new AbortController().signal,
          providerLabel: LABEL,
        },
        this.http,
      );
      return { ok: true, detail: `Connected to OpenAI-compatible endpoint (${this.model}).` };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : String(err) };
    }
  }

  async analyze(content: ExtractedContent, signal: AbortSignal): Promise<AnalysisResult> {
    const headers = this.headers();
    const { system, user } = buildPrompt(content);
    const start = Date.now();
    let usage: AnalysisUsage | undefined;
    let useJsonObject = false;

    const call = async (userText: string): Promise<string> => {
      const responseFormat = useJsonObject
        ? { type: 'json_object' }
        : {
            type: 'json_schema',
            json_schema: { name: 'slopwatch_analysis', strict: true, schema: RESPONSE_JSON_SCHEMA },
          };

      const data = (await requestJson(
        {
          url: `${this.base}/chat/completions`,
          headers,
          body: {
            model: this.model,
            max_tokens: MAX_TOKENS,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: userText },
            ],
            response_format: responseFormat,
          },
          signal,
          providerLabel: LABEL,
        },
        this.http,
      )) as OpenAICompatResponse;

      usage = this.usageFrom(data);
      return (data.choices ?? [])[0]?.message?.content ?? '';
    };

    let firstText: string;
    try {
      firstText = await call(user);
    } catch (err) {
      if (isJsonSchemaUnsupported(err)) {
        // Gateway doesn't support json_schema structured output; fall back once to
        // json_object (which all OpenAI-compatible gateways must support). We do NOT
        // fall back silently for any other 4xx.
        useJsonObject = true;
        firstText = await call(user);
      } else {
        throw err;
      }
    }

    const { analysis, repaired } = await parseWithRepair(firstText, (validationError) =>
      call(
        `${user}\n\nYour previous response could not be parsed (${validationError}). ` +
          `Return ONLY the corrected JSON object, no prose.`,
      ),
    );

    return finalizeResult({
      analysis,
      provider: 'openai_compat',
      model: this.model,
      ranLocally: false,
      thresholds: this.thresholds,
      latencyMs: Date.now() - start,
      truncated: content.truncated,
      sampledFraction: content.sampledFraction,
      schemaRepaired: repaired,
      segmentCount: content.segments.length,
      usage,
    });
  }

  private usageFrom(data: OpenAICompatResponse): AnalysisUsage | undefined {
    const inputTokens = data.usage?.prompt_tokens;
    const outputTokens = data.usage?.completion_tokens;
    if (inputTokens === undefined && outputTokens === undefined) return undefined;
    return {
      inputTokens,
      outputTokens,
      estCostUsd: estimateCost(this.model, inputTokens ?? 0, outputTokens ?? 0),
    };
  }
}

/** True when a `ProviderError` signals that the gateway rejected `json_schema`. */
function isJsonSchemaUnsupported(err: unknown): boolean {
  return (
    err instanceof ProviderError &&
    err.kind === 'bad_response' &&
    typeof err.detail === 'string' &&
    /json_schema|response_format|unsupported/i.test(err.detail)
  );
}

export function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number | undefined {
  const price = PRICING.find((p) => model.toLowerCase().includes(p.match));
  if (!price) return undefined;
  return (inputTokens / 1_000_000) * price.in + (outputTokens / 1_000_000) * price.out;
}

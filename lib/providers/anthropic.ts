import type { AnalysisProvider, AnalysisResult, AnalysisUsage, ExtractedContent } from '../types';
import type { Thresholds } from '../storage/settings';
import { ProviderError } from '../errors';
import { buildPrompt } from '../analysis/prompt';
import { finalizeResult, parseWithRepair } from './base';
import { requestJson, DEFAULT_HTTP, type HttpDeps } from './http';

/**
 * Anthropic Messages API adapter (Story 6). Direct browser call with the
 * required headers (x-api-key, anthropic-version, and the
 * anthropic-dangerous-direct-browser-access flag — the "dangerous" name reflects
 * that the key is exposed client-side, which the UI warns about). Output is
 * coerced via the strict JSON instruction in the prompt + one repair attempt.
 */

const ENDPOINT = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MAX_TOKENS = 2048;
const LABEL = 'Anthropic';

/** $ per 1M tokens (input, output) for cost estimation. */
const PRICING: { match: string; in: number; out: number }[] = [
  { match: 'haiku', in: 1, out: 5 },
  { match: 'sonnet', in: 3, out: 15 },
  { match: 'opus', in: 5, out: 25 },
];

interface AnthropicResponse {
  content?: { type: string; text?: string }[];
  usage?: { input_tokens?: number; output_tokens?: number };
}

export class AnthropicProvider implements AnalysisProvider {
  readonly id = 'anthropic' as const;

  constructor(
    private readonly model: string,
    private readonly apiKey: string | undefined,
    private readonly thresholds: Thresholds,
    private readonly http: HttpDeps = DEFAULT_HTTP,
  ) {}

  private headers(): Record<string, string> {
    if (!this.apiKey) {
      throw new ProviderError('auth', 'No Anthropic API key is configured.', { retryable: false });
    }
    return {
      'x-api-key': this.apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'anthropic-dangerous-direct-browser-access': 'true',
    };
  }

  async validate(signal?: AbortSignal): Promise<{ ok: boolean; detail?: string }> {
    if (!this.apiKey) return { ok: false, detail: 'No Anthropic API key is configured.' };
    try {
      await requestJson(
        {
          url: ENDPOINT,
          headers: this.headers(),
          body: { model: this.model, max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] },
          signal: signal ?? new AbortController().signal,
          providerLabel: LABEL,
        },
        this.http,
      );
      return { ok: true, detail: `Connected to Anthropic (${this.model}).` };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : String(err) };
    }
  }

  async analyze(content: ExtractedContent, signal: AbortSignal): Promise<AnalysisResult> {
    const headers = this.headers();
    const { system, user } = buildPrompt(content);
    const start = Date.now();
    let usage: AnalysisUsage | undefined;

    const call = async (userText: string): Promise<string> => {
      const data = (await requestJson(
        {
          url: ENDPOINT,
          headers,
          body: {
            model: this.model,
            max_tokens: MAX_TOKENS,
            system,
            messages: [{ role: 'user', content: userText }],
          },
          signal,
          providerLabel: LABEL,
        },
        this.http,
      )) as AnthropicResponse;
      usage = this.usageFrom(data);
      return (data.content ?? [])
        .filter((b) => b.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text)
        .join('\n');
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
      provider: 'anthropic',
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

  private usageFrom(data: AnthropicResponse): AnalysisUsage | undefined {
    const inputTokens = data.usage?.input_tokens;
    const outputTokens = data.usage?.output_tokens;
    if (inputTokens === undefined && outputTokens === undefined) return undefined;
    return {
      inputTokens,
      outputTokens,
      estCostUsd: estimateCost(this.model, inputTokens ?? 0, outputTokens ?? 0),
    };
  }
}

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number | undefined {
  const price = PRICING.find((p) => model.toLowerCase().includes(p.match));
  if (!price) return undefined;
  return (inputTokens / 1_000_000) * price.in + (outputTokens / 1_000_000) * price.out;
}

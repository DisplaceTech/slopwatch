import type { AnalysisProvider, AnalysisResult, ExtractedContent } from '../types';
import type { Thresholds } from '../storage/settings';
import { ProviderError, type ProviderErrorKind } from '../errors';
import { finalizeResult } from './base';

/**
 * Deterministic provider for development and E2E (Story 5). Given the same
 * content it always returns the same result — no network, no keys — so the whole
 * click→annotate flow can be proven before any real API exists.
 *
 * Determinism comes from hashing the content; per-segment scores hash each
 * paragraph, so roughly half the paragraphs get flagged, which exercises the
 * highlight layer.
 */
export interface MockOptions {
  /** Force a specific overall score (else derived from the content hash). */
  overall?: number;
  /** Force a typed failure, to exercise error UX. */
  fail?: ProviderErrorKind;
}

export class MockProvider implements AnalysisProvider {
  readonly id = 'mock' as const;

  constructor(
    private readonly model: string,
    private readonly thresholds: Thresholds,
    private readonly options: MockOptions = {},
  ) {}

  async validate(): Promise<{ ok: boolean; detail?: string }> {
    if (this.options.fail) {
      return { ok: false, detail: `Mock configured to fail with kind="${this.options.fail}".` };
    }
    return { ok: true, detail: 'Mock provider is always available (deterministic, offline).' };
  }

  async analyze(content: ExtractedContent, signal: AbortSignal): Promise<AnalysisResult> {
    if (signal.aborted) throw new ProviderError('timeout', 'Analysis was cancelled.');
    if (this.options.fail) {
      throw new ProviderError(this.options.fail, `Mock failure (${this.options.fail}).`, {
        detail: 'This is a simulated error from the MockProvider.',
      });
    }

    const start = Date.now();
    const overall = this.options.overall ?? unitInterval(hashString(content.contentHash));
    const segments = content.segments
      .map((s) => ({
        index: s.index,
        aiLikelihood: unitInterval(hashString(`${content.contentHash}:${s.index}:${s.text}`)),
        rationale: pickRationale(s.text),
      }))
      .filter((s) => s.aiLikelihood >= 0.5);

    return finalizeResult({
      analysis: { overall, reasoning: mockReasoning(overall), segments },
      provider: 'mock',
      model: this.model,
      ranLocally: false,
      thresholds: this.thresholds,
      latencyMs: Date.now() - start,
      truncated: content.truncated,
      sampledFraction: content.sampledFraction,
      schemaRepaired: false,
      segmentCount: content.segments.length,
    });
  }
}

const RATIONALES = [
  'Uniform sentence cadence with low burstiness.',
  'Generic transitions and hedging filler.',
  'Listy scaffolding without specific lived detail.',
  'Over-smooth coherence; few verifiable specifics.',
  'Reads naturally with concrete, idiosyncratic detail.',
];

function pickRationale(text: string): string {
  return RATIONALES[hashString(text) % RATIONALES.length] ?? RATIONALES[0]!;
}

function mockReasoning(overall: number): string {
  const pct = Math.round(overall * 100);
  return (
    `Mock analysis: estimated ${pct}% likelihood of AI authorship from stylistic ` +
    `signals (cadence, burstiness, generic phrasing). This is a deterministic ` +
    `development result, not a real model's opinion.`
  );
}

/** Stable non-negative 32-bit hash of a string (FNV-1a). */
function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Map a 32-bit unsigned int into [0,1). */
function unitInterval(n: number): number {
  return (n % 1000) / 1000;
}

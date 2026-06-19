import type {
  AnalysisResult,
  AnalysisUsage,
  ProviderAnalysis,
  ProviderId,
} from '../types';
import type { Thresholds } from '../storage/settings';
import { clamp01, scoreToLabel } from '../analysis/mapper';
import { parseProviderAnalysisText, type ParseResult } from '../analysis/schema';
import { ProviderError } from '../errors';

/**
 * Shared provider helpers: turning a validated `ProviderAnalysis` into a final
 * `AnalysisResult` (clamping, label mapping, dropping flags for indices that
 * don't exist), and a parse-with-one-repair loop the real adapters use.
 */

export interface FinalizeOptions {
  analysis: ProviderAnalysis;
  provider: ProviderId;
  model: string;
  ranLocally: boolean;
  thresholds: Thresholds;
  latencyMs: number;
  truncated: boolean;
  sampledFraction: number;
  schemaRepaired: boolean;
  /** Number of segments in the analyzed content; flags outside [0,n) are dropped. */
  segmentCount: number;
  usage?: AnalysisUsage;
}

export function finalizeResult(opts: FinalizeOptions): AnalysisResult {
  const overall = clamp01(opts.analysis.overall);
  const segments = opts.analysis.segments
    .filter((s) => Number.isInteger(s.index) && s.index >= 0 && s.index < opts.segmentCount)
    .map((s) => ({
      index: s.index,
      aiLikelihood: clamp01(s.aiLikelihood),
      rationale: s.rationale,
    }));
  return {
    overall,
    label: scoreToLabel(overall, opts.thresholds),
    reasoning: opts.analysis.reasoning,
    segments,
    provider: opts.provider,
    model: opts.model,
    ranLocally: opts.ranLocally,
    usage: opts.usage,
    meta: {
      latencyMs: opts.latencyMs,
      truncated: opts.truncated,
      sampledFraction: opts.sampledFraction,
      schemaRepaired: opts.schemaRepaired,
    },
    createdAt: Date.now(),
  };
}

/**
 * Parse model text against the schema; on failure, run `repair` once with the
 * validation error, then fail with a typed `bad_response`. Returns the parsed
 * analysis plus whether a repair was needed.
 */
export async function parseWithRepair(
  firstText: string,
  repair: (validationError: string) => Promise<string>,
): Promise<{ analysis: ProviderAnalysis; repaired: boolean }> {
  const first = parseProviderAnalysisText(firstText);
  if (first.ok) return { analysis: first.data, repaired: false };

  const secondText = await repair(first.error);
  const second: ParseResult = parseProviderAnalysisText(secondText);
  if (second.ok) return { analysis: second.data, repaired: true };

  throw new ProviderError('bad_response', 'The model returned something we could not read.', {
    detail: `validation failed twice: ${first.error} | ${second.error}`,
  });
}

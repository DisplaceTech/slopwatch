/**
 * Shared domain types for Slopwatch. These mirror the Provider Interface in
 * TDD.md §8 and are the contract between extraction, analysis, providers, and UI.
 */

export type ProviderId = 'anthropic' | 'openai_compat' | 'ollama' | 'mock';

export type Label = 'likely-human' | 'uncertain' | 'likely-ai';

/** A single stable, indexed paragraph of extracted content. */
export interface Segment {
  index: number;
  text: string;
}

export interface ExtractedContent {
  url: string;
  title: string;
  siteName?: string;
  segments: Segment[];
  /** true if the budgeter forced sampling. */
  truncated: boolean;
  /** 0..1 of the original content actually sent. */
  sampledFraction: number;
  contentHash: string;
}

export interface SegmentFlag {
  /** Maps back to ExtractedContent.segments[].index. */
  index: number;
  /** 0..1 likelihood this segment is AI-generated. */
  aiLikelihood: number;
  rationale: string;
}

export interface AnalysisUsage {
  inputTokens?: number;
  outputTokens?: number;
  estCostUsd?: number;
}

export interface AnalysisMeta {
  latencyMs: number;
  truncated: boolean;
  sampledFraction: number;
  schemaRepaired: boolean;
}

export interface AnalysisResult {
  /** 0..1 likelihood the content is AI-generated. */
  overall: number;
  /** Derived from `overall` + thresholds via the score→label mapper. */
  label: Label;
  /** Overall explanation, surfaced verbatim to the user. */
  reasoning: string;
  segments: SegmentFlag[];
  provider: ProviderId;
  model: string;
  /** Drives the persistent cloud-vs-local privacy indicator. */
  ranLocally: boolean;
  usage?: AnalysisUsage;
  meta: AnalysisMeta;
  createdAt: number;
}

/**
 * The raw, schema-valid object a provider must produce (before we attach
 * provider/model/meta and re-map the label). Validated with Zod.
 */
export interface ProviderAnalysis {
  overall: number;
  reasoning: string;
  segments: SegmentFlag[];
}

export interface ProviderConfig {
  id: ProviderId;
  model: string;
  /** openai_compat / ollama only. */
  baseUrl?: string;
}

/**
 * Common interface implemented by every provider adapter. `analyze` MUST return
 * a schema-valid AnalysisResult or throw a typed ProviderError.
 */
export interface AnalysisProvider {
  readonly id: ProviderId;
  /** Validate config + a minimal round trip; used by "Test connection". */
  validate(signal?: AbortSignal): Promise<{ ok: boolean; detail?: string }>;
  analyze(content: ExtractedContent, signal: AbortSignal): Promise<AnalysisResult>;
  /** Optional: list available models (Ollama, some gateways). */
  listModels?(signal?: AbortSignal): Promise<string[]>;
}

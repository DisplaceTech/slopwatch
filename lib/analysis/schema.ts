import { z } from 'zod';
import type { ProviderAnalysis } from '../types';

/**
 * Strict response schema for provider output (TDD §8). Providers must return an
 * object matching this; a single repair attempt is made before a typed
 * `bad_response` error. We validate the raw model output, then attach
 * provider/model/meta and re-map the label ourselves (never trust a model-chosen
 * label).
 */

export const segmentFlagSchema = z.object({
  index: z.number().int().nonnegative(),
  aiLikelihood: z.number().min(0).max(1),
  rationale: z.string().max(2000),
});

export const providerAnalysisSchema = z.object({
  overall: z.number().min(0).max(1),
  reasoning: z.string().min(1).max(8000),
  segments: z.array(segmentFlagSchema).max(2000),
});

export type ParseResult =
  | { ok: true; data: ProviderAnalysis }
  | { ok: false; error: string };

/** Validate already-parsed JSON against the schema. */
export function parseProviderAnalysis(raw: unknown): ParseResult {
  const result = providerAnalysisSchema.safeParse(raw);
  if (result.success) return { ok: true, data: result.data };
  return { ok: false, error: result.error.issues.map(formatIssue).join('; ') };
}

/** Parse a JSON string then validate. Tolerates ```json fences and stray prose. */
export function parseProviderAnalysisText(text: string): ParseResult {
  const json = extractJsonObject(text);
  if (json === undefined) return { ok: false, error: 'No JSON object found in response' };
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch (e) {
    return { ok: false, error: `Invalid JSON: ${(e as Error).message}` };
  }
  return parseProviderAnalysis(value);
}

function formatIssue(issue: z.ZodIssue): string {
  const path = issue.path.length ? issue.path.join('.') : '(root)';
  return `${path}: ${issue.message}`;
}

/**
 * Pull the first balanced top-level JSON object out of arbitrary text. Handles
 * fenced code blocks and leading/trailing prose that some models emit.
 */
export function extractJsonObject(text: string): string | undefined {
  const start = text.indexOf('{');
  if (start === -1) return undefined;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return undefined;
}

/**
 * JSON Schema mirror of the Zod schema, for provider structured-output features
 * (Anthropic `output_config.format`, OpenAI `response_format.json_schema`,
 * Ollama `format`). Kept in sync with `providerAnalysisSchema` by the schema
 * round-trip test.
 */
export const RESPONSE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    overall: {
      type: 'number',
      description: 'Overall probability (0..1) that the content is AI-generated.',
    },
    reasoning: {
      type: 'string',
      description: 'Short overall explanation of the assessment.',
    },
    segments: {
      type: 'array',
      description: 'Per-paragraph flags, keyed by the supplied paragraph index.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          index: { type: 'integer', description: 'The paragraph index supplied in the prompt.' },
          aiLikelihood: { type: 'number', description: '0..1 likelihood this paragraph is AI-generated.' },
          rationale: { type: 'string', description: 'One short sentence explaining the flag.' },
        },
        required: ['index', 'aiLikelihood', 'rationale'],
      },
    },
  },
  required: ['overall', 'reasoning', 'segments'],
} as const;

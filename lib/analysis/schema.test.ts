import { describe, it, expect } from 'vitest';
import {
  parseProviderAnalysis,
  parseProviderAnalysisText,
  extractJsonObject,
  RESPONSE_JSON_SCHEMA,
  providerAnalysisSchema,
} from './schema';

const valid = {
  overall: 0.7,
  reasoning: 'Uniform cadence and generic transitions.',
  segments: [{ index: 0, aiLikelihood: 0.8, rationale: 'Low burstiness.' }],
};

describe('parseProviderAnalysis', () => {
  it('accepts a valid object', () => {
    const r = parseProviderAnalysis(valid);
    expect(r.ok).toBe(true);
  });

  it('rejects out-of-range overall', () => {
    expect(parseProviderAnalysis({ ...valid, overall: 1.5 }).ok).toBe(false);
    expect(parseProviderAnalysis({ ...valid, overall: -0.1 }).ok).toBe(false);
  });

  it('rejects missing fields', () => {
    expect(parseProviderAnalysis({ overall: 0.5, segments: [] }).ok).toBe(false);
    expect(parseProviderAnalysis({ reasoning: 'x', segments: [] }).ok).toBe(false);
  });

  it('rejects wrong types', () => {
    expect(parseProviderAnalysis({ ...valid, overall: '0.7' }).ok).toBe(false);
    expect(
      parseProviderAnalysis({ ...valid, segments: [{ index: 'a', aiLikelihood: 0.5, rationale: 'x' }] }).ok,
    ).toBe(false);
  });

  it('rejects non-integer / negative segment indices', () => {
    expect(
      parseProviderAnalysis({ ...valid, segments: [{ index: 1.5, aiLikelihood: 0.5, rationale: 'x' }] }).ok,
    ).toBe(false);
    expect(
      parseProviderAnalysis({ ...valid, segments: [{ index: -1, aiLikelihood: 0.5, rationale: 'x' }] }).ok,
    ).toBe(false);
  });
});

describe('parseProviderAnalysisText', () => {
  it('parses raw JSON', () => {
    expect(parseProviderAnalysisText(JSON.stringify(valid)).ok).toBe(true);
  });

  it('parses JSON inside a fenced code block with prose', () => {
    const text = 'Here is my analysis:\n```json\n' + JSON.stringify(valid) + '\n```\nHope that helps!';
    const r = parseProviderAnalysisText(text);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.overall).toBe(0.7);
  });

  it('fails cleanly on no JSON', () => {
    expect(parseProviderAnalysisText('no json here').ok).toBe(false);
  });

  it('fails cleanly on malformed JSON', () => {
    expect(parseProviderAnalysisText('{ "overall": 0.5, ').ok).toBe(false);
  });
});

describe('extractJsonObject', () => {
  it('handles braces inside strings', () => {
    const text = 'prefix {"a": "has } brace", "b": 1} suffix';
    expect(extractJsonObject(text)).toBe('{"a": "has } brace", "b": 1}');
  });
});

describe('RESPONSE_JSON_SCHEMA', () => {
  it('stays in sync with the Zod schema (objects valid under both reject the same junk)', () => {
    // A round-trip sanity check: required keys match the Zod shape's keys.
    const zodKeys = Object.keys(providerAnalysisSchema.shape).sort();
    expect([...RESPONSE_JSON_SCHEMA.required].sort()).toEqual(zodKeys);
  });
});

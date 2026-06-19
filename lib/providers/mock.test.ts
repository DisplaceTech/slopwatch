import { describe, it, expect } from 'vitest';
import { MockProvider } from './mock';
import { finalizeResult } from './base';
import { ProviderError } from '../errors';
import type { ExtractedContent } from '../types';
import { DEFAULT_SETTINGS } from '../storage/settings';

const thresholds = DEFAULT_SETTINGS.thresholds;

function content(hash = 'abc123'): ExtractedContent {
  return {
    url: 'https://example.com',
    title: 'T',
    segments: [
      { index: 0, text: 'First paragraph with enough text to be a real segment here.' },
      { index: 1, text: 'Second paragraph also long enough to count as a segment block.' },
      { index: 2, text: 'Third paragraph rounding out the deterministic fixture content.' },
    ],
    truncated: false,
    sampledFraction: 1,
    contentHash: hash,
  };
}

describe('MockProvider', () => {
  it('is deterministic for the same content', async () => {
    const p = new MockProvider('mock-1', thresholds);
    const a = await p.analyze(content(), new AbortController().signal);
    const b = await p.analyze(content(), new AbortController().signal);
    expect(a.overall).toBe(b.overall);
    expect(a.segments).toEqual(b.segments);
  });

  it('produces a schema-shaped AnalysisResult with a mapped label', async () => {
    const p = new MockProvider('mock-1', thresholds, { overall: 0.9 });
    const r = await p.analyze(content(), new AbortController().signal);
    expect(r.overall).toBe(0.9);
    expect(r.label).toBe('likely-ai');
    expect(r.provider).toBe('mock');
    expect(r.ranLocally).toBe(false);
    expect(r.meta.schemaRepaired).toBe(false);
  });

  it('only flags segments at or above 0.5 likelihood', async () => {
    const p = new MockProvider('mock-1', thresholds);
    const r = await p.analyze(content(), new AbortController().signal);
    for (const s of r.segments) expect(s.aiLikelihood).toBeGreaterThanOrEqual(0.5);
  });

  it('throws a typed ProviderError when configured to fail', async () => {
    const p = new MockProvider('mock-1', thresholds, { fail: 'auth' });
    await expect(p.analyze(content(), new AbortController().signal)).rejects.toMatchObject({
      kind: 'auth',
    });
  });

  it('respects an aborted signal', async () => {
    const p = new MockProvider('mock-1', thresholds);
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(p.analyze(content(), ctrl.signal)).rejects.toBeInstanceOf(ProviderError);
  });

  it('validate reports availability', async () => {
    expect((await new MockProvider('m', thresholds).validate()).ok).toBe(true);
    expect((await new MockProvider('m', thresholds, { fail: 'network' }).validate()).ok).toBe(false);
  });
});

describe('finalizeResult', () => {
  it('drops flags for indices outside the segment range and clamps values', () => {
    const r = finalizeResult({
      analysis: {
        overall: 1.5,
        reasoning: 'x',
        segments: [
          { index: 0, aiLikelihood: 2, rationale: 'ok' },
          { index: 9, aiLikelihood: 0.5, rationale: 'out of range' },
        ],
      },
      provider: 'mock',
      model: 'm',
      ranLocally: false,
      thresholds,
      latencyMs: 1,
      truncated: false,
      sampledFraction: 1,
      schemaRepaired: false,
      segmentCount: 1,
    });
    expect(r.overall).toBe(1);
    expect(r.label).toBe('likely-ai');
    expect(r.segments).toHaveLength(1);
    expect(r.segments[0]!.aiLikelihood).toBe(1);
  });
});

import { describe, it, expect } from 'vitest';
import { getCached, setCached, clearCache, cacheStats, CACHE_TTL_MS, CACHE_MAX_ENTRIES } from './cache';
import type { AnalysisResult } from './types';

function result(overall = 0.5): AnalysisResult {
  return {
    overall,
    label: 'uncertain',
    reasoning: 'r',
    segments: [],
    provider: 'mock',
    model: 'm',
    ranLocally: false,
    meta: { latencyMs: 1, truncated: false, sampledFraction: 1, schemaRepaired: false },
    createdAt: 0,
  };
}

describe('result cache', () => {
  it('stores and retrieves by url + contentHash + provider + model', async () => {
    await setCached('https://a.test', 'hash1', 'anthropic', 'claude-haiku-4-5', result(0.7));
    const got = await getCached('https://a.test', 'hash1', 'anthropic', 'claude-haiku-4-5');
    expect(got?.overall).toBe(0.7);
  });

  it('misses on a different url or hash', async () => {
    await setCached('https://a.test', 'hash1', 'mock', 'm', result());
    expect(await getCached('https://a.test', 'hash2', 'mock', 'm')).toBeUndefined();
    expect(await getCached('https://b.test', 'hash1', 'mock', 'm')).toBeUndefined();
  });

  it('misses when the provider or model differs (no cross-provider serving)', async () => {
    await setCached('https://a.test', 'h', 'mock', 'mock-1', result(0.55));
    // Same page, but now Anthropic is active — must NOT serve the mock result.
    expect(await getCached('https://a.test', 'h', 'anthropic', 'claude-haiku-4-5')).toBeUndefined();
    // Same provider, different model also misses.
    expect(await getCached('https://a.test', 'h', 'mock', 'mock-2')).toBeUndefined();
    // Exact match still hits.
    expect((await getCached('https://a.test', 'h', 'mock', 'mock-1'))?.overall).toBe(0.55);
  });

  it('expires entries past the TTL', async () => {
    const t0 = 1_000_000;
    await setCached('https://a.test', 'h', 'mock', 'm', result(), t0);
    expect(await getCached('https://a.test', 'h', 'mock', 'm', t0 + 1)).toBeDefined();
    expect(await getCached('https://a.test', 'h', 'mock', 'm', t0 + CACHE_TTL_MS + 1)).toBeUndefined();
  });

  it('clears all entries', async () => {
    await setCached('https://a.test', 'h', 'mock', 'm', result());
    await clearCache();
    expect((await cacheStats()).entries).toBe(0);
  });

  it('evicts least-recently-used entries beyond the cap', async () => {
    const now = 1_000;
    for (let i = 0; i < CACHE_MAX_ENTRIES + 5; i++) {
      await setCached('https://a.test', `h${i}`, 'mock', 'm', result(), now + i);
    }
    const stats = await cacheStats(now + CACHE_MAX_ENTRIES + 10);
    expect(stats.entries).toBeLessThanOrEqual(CACHE_MAX_ENTRIES);
    expect(await getCached('https://a.test', 'h0', 'mock', 'm', now + CACHE_MAX_ENTRIES + 10)).toBeUndefined();
  });
});

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
  it('stores and retrieves by url + contentHash', async () => {
    await setCached('https://a.test', 'hash1', result(0.7));
    const got = await getCached('https://a.test', 'hash1');
    expect(got?.overall).toBe(0.7);
  });

  it('misses on a different url or hash', async () => {
    await setCached('https://a.test', 'hash1', result());
    expect(await getCached('https://a.test', 'hash2')).toBeUndefined();
    expect(await getCached('https://b.test', 'hash1')).toBeUndefined();
  });

  it('expires entries past the TTL', async () => {
    const t0 = 1_000_000;
    await setCached('https://a.test', 'h', result(), t0);
    expect(await getCached('https://a.test', 'h', t0 + 1)).toBeDefined();
    expect(await getCached('https://a.test', 'h', t0 + CACHE_TTL_MS + 1)).toBeUndefined();
  });

  it('clears all entries', async () => {
    await setCached('https://a.test', 'h', result());
    await clearCache();
    expect((await cacheStats()).entries).toBe(0);
  });

  it('evicts least-recently-used entries beyond the cap', async () => {
    const now = 1_000;
    for (let i = 0; i < CACHE_MAX_ENTRIES + 5; i++) {
      await setCached('https://a.test', `h${i}`, result(), now + i);
    }
    const stats = await cacheStats(now + CACHE_MAX_ENTRIES + 10);
    expect(stats.entries).toBeLessThanOrEqual(CACHE_MAX_ENTRIES);
    // The earliest-written keys should have been evicted.
    expect(await getCached('https://a.test', 'h0', now + CACHE_MAX_ENTRIES + 10)).toBeUndefined();
  });
});

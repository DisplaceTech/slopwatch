import { describe, it, expect } from 'vitest';
import { normalizeForHash, computeContentHash, sha256Hex } from './hash';

describe('normalizeForHash', () => {
  it('is stable across whitespace-insignificant changes', () => {
    expect(normalizeForHash(['a  b', 'c'])).toBe(normalizeForHash(['a b', '  c  ']));
  });
});

describe('computeContentHash', () => {
  it('produces a 64-char hex sha256', async () => {
    const h = await computeContentHash('https://x.test', ['hello world this is content']);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is stable across whitespace changes', async () => {
    const a = await computeContentHash('https://x.test', ['the   quick  brown fox']);
    const b = await computeContentHash('https://x.test', ['the quick brown fox']);
    expect(a).toBe(b);
  });

  it('changes on a meaningful edit', async () => {
    const a = await computeContentHash('https://x.test', ['the quick brown fox']);
    const b = await computeContentHash('https://x.test', ['the quick red fox']);
    expect(a).not.toBe(b);
  });

  it('changes when the URL changes', async () => {
    const a = await computeContentHash('https://a.test', ['same content here']);
    const b = await computeContentHash('https://b.test', ['same content here']);
    expect(a).not.toBe(b);
  });
});

describe('sha256Hex', () => {
  it('matches a known vector for empty string', async () => {
    expect(await sha256Hex('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });
});

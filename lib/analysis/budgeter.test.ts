import { describe, it, expect } from 'vitest';
import { applyBudget, wordCount } from './budgeter';
import type { ExtractedContent } from '../types';

function makeContent(paragraphs: number, wordsEach: number): ExtractedContent {
  const word = 'word ';
  return {
    url: 'https://x.test',
    title: 'T',
    segments: Array.from({ length: paragraphs }, (_, i) => ({
      index: i,
      text: word.repeat(wordsEach).trim(),
    })),
    truncated: false,
    sampledFraction: 1,
    contentHash: 'h',
  };
}

describe('wordCount', () => {
  it('counts words, treating empty as zero', () => {
    expect(wordCount('a b c')).toBe(3);
    expect(wordCount('   ')).toBe(0);
  });
});

describe('applyBudget', () => {
  it('leaves under-budget content untouched', () => {
    const c = makeContent(3, 10); // 30 words
    const out = applyBudget(c, 6000);
    expect(out.truncated).toBe(false);
    expect(out.segments).toHaveLength(3);
    expect(out).toBe(c);
  });

  it('samples over-budget content and flags truncation + fraction', () => {
    const c = makeContent(100, 100); // 10,000 words
    const out = applyBudget(c, 900);
    expect(out.truncated).toBe(true);
    expect(out.segments.length).toBeLessThan(100);
    // Stays at/under budget.
    const keptWords = out.segments.reduce((n, s) => n + wordCount(s.text), 0);
    expect(keptWords).toBeLessThanOrEqual(900 + 100); // within one segment of budget
    expect(out.sampledFraction).toBeGreaterThan(0);
    expect(out.sampledFraction).toBeLessThan(1);
  });

  it('keeps original indices on sampled segments (highlight mapping survives)', () => {
    const c = makeContent(60, 100);
    const out = applyBudget(c, 600);
    // Indices are a subset of the originals, strictly increasing, unchanged values.
    const idx = out.segments.map((s) => s.index);
    expect(idx).toEqual([...idx].sort((a, b) => a - b));
    for (const s of out.segments) expect(c.segments[s.index]!.text).toBe(s.text);
  });

  it('draws from head, middle, and tail', () => {
    const c = makeContent(90, 100);
    const out = applyBudget(c, 900);
    const idx = out.segments.map((s) => s.index);
    expect(Math.min(...idx)).toBeLessThan(10); // head
    expect(Math.max(...idx)).toBeGreaterThan(80); // tail
    expect(idx.some((i) => i > 30 && i < 60)).toBe(true); // middle
  });
});

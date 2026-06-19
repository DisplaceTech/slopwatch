import { describe, it, expect } from 'vitest';
import { segmentCandidates, segmentTexts, cleanText, MIN_SEGMENT_CHARS } from './segmenter';

const long = (n: number) => 'word '.repeat(Math.ceil(n / 5)).slice(0, n);

describe('cleanText', () => {
  it('collapses whitespace and trims', () => {
    expect(cleanText('  a\n\t  b   c  ')).toBe('a b c');
  });
});

describe('segmentTexts', () => {
  it('drops fragments shorter than the minimum and re-indexes densely', () => {
    const segs = segmentTexts(['short', long(60), '', long(80)]);
    expect(segs.map((s) => s.index)).toEqual([0, 1]);
    expect(segs[0]!.text.length).toBeGreaterThanOrEqual(MIN_SEGMENT_CHARS);
  });
});

describe('segmentCandidates', () => {
  it('keeps payloads parallel to kept segments', () => {
    const result = segmentCandidates([
      { payload: 'A', text: 'too short' },
      { payload: 'B', text: long(60) },
      { payload: 'C', text: long(70) },
    ]);
    expect(result.segments).toHaveLength(2);
    expect(result.kept).toEqual(['B', 'C']);
    expect(result.segments[0]!.index).toBe(0);
    expect(result.segments[1]!.index).toBe(1);
  });
});

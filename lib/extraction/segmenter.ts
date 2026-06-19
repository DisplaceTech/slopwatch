import type { Segment } from '../types';

/**
 * Turn raw candidate paragraph texts into stable, indexed segments (AD-5).
 * Drops empty/boilerplate-length fragments and re-indexes 0..n so indices are
 * dense and stable for highlight mapping.
 */

export const MIN_SEGMENT_CHARS = 40;

export interface SegmentResult<T> {
  segments: Segment[];
  /** The kept payloads, parallel to `segments` (e.g. live DOM elements). */
  kept: T[];
}

/** Clean a single block of text: collapse internal whitespace and trim. */
export function cleanText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Segment a list of (payload, rawText) candidates. Keeps only blocks with enough
 * prose, preserving the payload alongside each kept segment so callers can map
 * a segment index back to its source (e.g. a live DOM element for highlighting).
 */
export function segmentCandidates<T>(
  candidates: { payload: T; text: string }[],
  minChars = MIN_SEGMENT_CHARS,
): SegmentResult<T> {
  const segments: Segment[] = [];
  const kept: T[] = [];
  for (const c of candidates) {
    const text = cleanText(c.text);
    if (text.length < minChars) continue;
    segments.push({ index: segments.length, text });
    kept.push(c.payload);
  }
  return { segments, kept };
}

/** Convenience for plain string inputs (no payload mapping). */
export function segmentTexts(texts: string[], minChars = MIN_SEGMENT_CHARS): Segment[] {
  return segmentCandidates(
    texts.map((text) => ({ payload: null, text })),
    minChars,
  ).segments;
}

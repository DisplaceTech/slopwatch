import type { ExtractedContent, Segment } from '../types';

/**
 * Token/character budgeter (Story 9). Bounds request size and cost by a word
 * budget. Over-budget content uses head / representative-middle / tail sampling
 * (the v1 strategy; full map-reduce chunking is deferred to a roadmap item) and
 * is flagged `truncated` with a `sampledFraction`, which the UI surfaces as an
 * "analyzed ~N% of the page" notice.
 *
 * Crucially, kept segments retain their original `index`, so highlights still
 * map to the right on-page elements (AD-5).
 */

export function wordCount(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

export function applyBudget(content: ExtractedContent, wordBudget: number): ExtractedContent {
  const counts = content.segments.map((s) => wordCount(s.text));
  const total = counts.reduce((a, b) => a + b, 0);
  if (total <= wordBudget || content.segments.length === 0) {
    return content;
  }

  const keptPositions = sampleHeadMiddleTail(counts, wordBudget);
  const segments: Segment[] = keptPositions.map((pos) => content.segments[pos]!);
  const keptWords = keptPositions.reduce((a, pos) => a + counts[pos]!, 0);

  return {
    ...content,
    segments,
    truncated: true,
    sampledFraction: total > 0 ? keptWords / total : 1,
  };
}

/**
 * Choose segment positions to fill roughly a third of the budget from the head,
 * a third from the middle, and a third from the tail. Returns sorted, de-duped
 * positions; always keeps at least the first segment.
 */
function sampleHeadMiddleTail(counts: number[], budget: number): number[] {
  const n = counts.length;
  const chosen = new Set<number>();
  const perZone = Math.max(1, Math.floor(budget / 3));

  const fill = (order: number[], limit: number) => {
    let used = 0;
    for (const pos of order) {
      if (used >= limit) break;
      if (chosen.has(pos)) continue;
      chosen.add(pos);
      used += counts[pos]!;
    }
  };

  // Head: 0,1,2,…
  fill(range(0, n), perZone);
  // Tail: n-1,n-2,…
  fill(range(n - 1, -1, -1), perZone);
  // Middle: expand outward from the center.
  const center = Math.floor(n / 2);
  const middleOrder: number[] = [];
  for (let d = 0; d < n; d++) {
    const lo = center - d;
    const hi = center + d;
    if (lo >= 0) middleOrder.push(lo);
    if (hi !== lo && hi < n) middleOrder.push(hi);
  }
  fill(middleOrder, perZone);

  if (chosen.size === 0) chosen.add(0);
  return [...chosen].sort((a, b) => a - b);
}

function range(start: number, end: number, step = 1): number[] {
  const out: number[] = [];
  for (let i = start; step > 0 ? i < end : i > end; i += step) out.push(i);
  return out;
}

import type { Label } from '../types';
import { MIN_UNCERTAIN_BAND, type Thresholds } from '../storage/settings';

/**
 * Pure score→label mapping (TDD §8, AD-7). The middle *Uncertain* band is a hard
 * product invariant and can never be collapsed to zero width.
 *
 * Boundary semantics (defaults humanMax=0.35, aiMin=0.65):
 *   overall <  humanMax            → likely-human
 *   humanMax <= overall <= aiMin   → uncertain
 *   overall >  aiMin               → likely-ai
 */
export function scoreToLabel(overall: number, thresholds: Thresholds): Label {
  const score = clamp01(overall);
  const { humanMax, aiMin } = repairThresholds(thresholds);
  if (score < humanMax) return 'likely-human';
  if (score > aiMin) return 'likely-ai';
  return 'uncertain';
}

/**
 * Defensively guarantee a non-zero Uncertain band even if a malformed thresholds
 * object slips through. Widens symmetrically around the midpoint when too narrow.
 */
export function repairThresholds(thresholds: Thresholds): Thresholds {
  let humanMax = clamp01(thresholds.humanMax);
  let aiMin = clamp01(thresholds.aiMin);
  if (aiMin < humanMax) [humanMax, aiMin] = [aiMin, humanMax];
  if (aiMin - humanMax < MIN_UNCERTAIN_BAND) {
    // Clamp the midpoint inward so the full band always fits within [0, 1]
    // (centering then clamping would squash the band at the edges).
    const half = MIN_UNCERTAIN_BAND / 2;
    const mid = Math.min(1 - half, Math.max(half, (humanMax + aiMin) / 2));
    humanMax = mid - half;
    aiMin = mid + half;
  }
  return { humanMax, aiMin };
}

export function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/** Human-facing label text (never a bare "AI"/"Human" — see USABILITY microcopy). */
export function labelText(label: Label): string {
  switch (label) {
    case 'likely-human':
      return 'Likely human-written';
    case 'likely-ai':
      return 'Likely AI-generated';
    case 'uncertain':
      return 'Uncertain';
  }
}

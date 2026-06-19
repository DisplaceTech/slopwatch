import { describe, it, expect } from 'vitest';
import { scoreToLabel, repairThresholds, labelText, clamp01 } from './mapper';
import { DEFAULT_SETTINGS, MIN_UNCERTAIN_BAND } from '../storage/settings';

const defaults = DEFAULT_SETTINGS.thresholds;

describe('scoreToLabel', () => {
  it('maps below humanMax to likely-human', () => {
    expect(scoreToLabel(0.0, defaults)).toBe('likely-human');
    expect(scoreToLabel(0.349, defaults)).toBe('likely-human');
  });

  it('maps the band edges into uncertain (inclusive)', () => {
    expect(scoreToLabel(0.35, defaults)).toBe('uncertain');
    expect(scoreToLabel(0.5, defaults)).toBe('uncertain');
    expect(scoreToLabel(0.65, defaults)).toBe('uncertain');
  });

  it('maps above aiMin to likely-ai', () => {
    expect(scoreToLabel(0.651, defaults)).toBe('likely-ai');
    expect(scoreToLabel(1.0, defaults)).toBe('likely-ai');
  });

  it('respects custom thresholds', () => {
    const custom = { humanMax: 0.2, aiMin: 0.8 };
    expect(scoreToLabel(0.25, custom)).toBe('uncertain');
    expect(scoreToLabel(0.19, custom)).toBe('likely-human');
    expect(scoreToLabel(0.81, custom)).toBe('likely-ai');
  });

  it('clamps out-of-range scores', () => {
    expect(scoreToLabel(-5, defaults)).toBe('likely-human');
    expect(scoreToLabel(5, defaults)).toBe('likely-ai');
  });
});

describe('repairThresholds', () => {
  it('preserves a valid band', () => {
    expect(repairThresholds(defaults)).toEqual(defaults);
  });

  it('widens a collapsed band to the minimum', () => {
    const repaired = repairThresholds({ humanMax: 0.5, aiMin: 0.5 });
    expect(repaired.aiMin - repaired.humanMax).toBeCloseTo(MIN_UNCERTAIN_BAND);
  });

  it('orders inverted thresholds', () => {
    const repaired = repairThresholds({ humanMax: 0.8, aiMin: 0.2 });
    expect(repaired.humanMax).toBeLessThan(repaired.aiMin);
  });

  it('the Uncertain band can never be eliminated', () => {
    for (const t of [
      { humanMax: 0, aiMin: 0 },
      { humanMax: 1, aiMin: 1 },
      { humanMax: 0.5, aiMin: 0.5 },
      { humanMax: 0.6, aiMin: 0.4 },
    ]) {
      const r = repairThresholds(t);
      expect(r.aiMin - r.humanMax).toBeGreaterThanOrEqual(MIN_UNCERTAIN_BAND - 1e-9);
    }
  });
});

describe('clamp01 / labelText', () => {
  it('clamps and handles NaN', () => {
    expect(clamp01(NaN)).toBe(0);
    expect(clamp01(2)).toBe(1);
    expect(clamp01(-1)).toBe(0);
  });

  it('never returns a bare AI/Human label', () => {
    expect(labelText('likely-ai')).toMatch(/likely/i);
    expect(labelText('likely-human')).toMatch(/likely/i);
    expect(labelText('uncertain')).toBe('Uncertain');
  });
});

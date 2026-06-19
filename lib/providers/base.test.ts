import { describe, it, expect, vi } from 'vitest';
import { parseWithRepair } from './base';
import { ProviderError } from '../errors';

const valid = JSON.stringify({
  overall: 0.6,
  reasoning: 'ok',
  segments: [{ index: 0, aiLikelihood: 0.7, rationale: 'r' }],
});

describe('parseWithRepair', () => {
  it('returns parsed analysis without repair when the first text is valid', async () => {
    const repair = vi.fn();
    const { analysis, repaired } = await parseWithRepair(valid, repair);
    expect(repaired).toBe(false);
    expect(analysis.overall).toBe(0.6);
    expect(repair).not.toHaveBeenCalled();
  });

  it('repairs once when the first text is invalid', async () => {
    const repair = vi.fn().mockResolvedValue(valid);
    const { analysis, repaired } = await parseWithRepair('not json', repair);
    expect(repaired).toBe(true);
    expect(analysis.overall).toBe(0.6);
    expect(repair).toHaveBeenCalledOnce();
  });

  it('throws a typed bad_response when repair also fails', async () => {
    const repair = vi.fn().mockResolvedValue('still not json');
    await expect(parseWithRepair('not json', repair)).rejects.toMatchObject({
      kind: 'bad_response',
    });
    await expect(parseWithRepair('not json', repair)).rejects.toBeInstanceOf(ProviderError);
  });
});

import { describe, it, expect, vi } from 'vitest';
import { Orchestrator, type OrchestratorDeps } from '@/lib/orchestrator';
import { MockProvider } from '@/lib/providers';
import { DEFAULT_SETTINGS, type Settings } from '@/lib/storage/settings';
import type { AnalysisProvider, ExtractedContent } from '@/lib/types';
import { ProviderError } from '@/lib/errors';

function content(): ExtractedContent {
  return {
    url: 'https://example.com/a',
    title: 'A',
    segments: [
      { index: 0, text: 'First paragraph long enough to be a real segment block here.' },
      { index: 1, text: 'Second paragraph also long enough to be a real segment block.' },
    ],
    truncated: false,
    sampledFraction: 1,
    contentHash: 'deadbeef',
  };
}

function makeDeps(overrides: Partial<OrchestratorDeps> = {}): {
  deps: OrchestratorDeps;
  calls: { annotate: number; inject: number; badges: string[] };
} {
  const calls = { annotate: 0, inject: 0, badges: [] as string[] };
  const settings: Settings = { ...DEFAULT_SETTINGS, activeProvider: 'mock' };
  const deps: OrchestratorDeps = {
    getSettings: async () => settings,
    createProvider: async (s) => new MockProvider('mock-1', s.thresholds),
    injectInpage: async () => {
      calls.inject++;
    },
    extract: async () => ({ ok: true, content: content() }),
    annotate: async () => {
      calls.annotate++;
    },
    setBadge: async (_tabId, text) => {
      calls.badges.push(text);
    },
    ...overrides,
  };
  return { deps, calls };
}

describe('Orchestrator', () => {
  it('runs the full extract→analyze→annotate flow and returns results', async () => {
    const { deps, calls } = makeDeps();
    const o = new Orchestrator(deps);
    const outcome = await o.analyze(1);

    expect(outcome.status).toBe('results');
    if (outcome.status !== 'results') return;
    expect(outcome.result.provider).toBe('mock');
    expect(calls.inject).toBe(1);
    expect(calls.annotate).toBe(1);
    // Badge shows the rounded score at the end.
    expect(calls.badges.at(-1)).toBe(String(Math.round(outcome.result.overall * 100)));

    // Status is cached for the popup.
    const status = await o.getStatus(1);
    expect(status.phase).toBe('results');
  });

  it('reports no-content without calling the provider/annotate', async () => {
    let providerMade = false;
    const { deps, calls } = makeDeps({
      extract: async () => ({ ok: false, reason: 'no-content' }),
      createProvider: async (s) => {
        providerMade = true;
        return new MockProvider('mock-1', s.thresholds);
      },
    });
    const o = new Orchestrator(deps);
    const outcome = await o.analyze(2);
    expect(outcome.status).toBe('no-content');
    expect(providerMade).toBe(false);
    expect(calls.annotate).toBe(0);
  });

  it('surfaces a typed error and does not annotate', async () => {
    const failing: AnalysisProvider = {
      id: 'mock',
      validate: async () => ({ ok: false }),
      analyze: async () => {
        throw new ProviderError('auth', 'bad key');
      },
    };
    const { deps, calls } = makeDeps({ createProvider: async () => failing });
    const o = new Orchestrator(deps);
    const outcome = await o.analyze(3);
    expect(outcome.status).toBe('error');
    if (outcome.status !== 'error') return;
    expect(outcome.error.kind).toBe('auth');
    expect(calls.annotate).toBe(0);
    expect((await o.getStatus(3)).phase).toBe('error');
  });

  it('debounces a concurrent analyze on the same tab', async () => {
    let resolveAnalyze: (() => void) | undefined;
    const gate = new Promise<void>((r) => (resolveAnalyze = r));
    const slow: AnalysisProvider = {
      id: 'mock',
      validate: async () => ({ ok: true }),
      analyze: async (c) => {
        await gate;
        return new MockProvider('mock-1', DEFAULT_SETTINGS.thresholds).analyze(
          c,
          new AbortController().signal,
        );
      },
    };
    const createProvider = vi.fn(async () => slow);
    const { deps } = makeDeps({ createProvider });
    const o = new Orchestrator(deps);

    const first = o.analyze(4);
    const second = await o.analyze(4); // in-flight, not forced → debounced
    expect(second.status).not.toBe('results'); // returns interim status, no second run
    resolveAnalyze?.();
    await first;
    // Provider only constructed once despite two analyze calls.
    expect(createProvider).toHaveBeenCalledTimes(1);
  });

  it('forgetTab clears cached status', async () => {
    const { deps } = makeDeps();
    const o = new Orchestrator(deps);
    await o.analyze(5);
    o.forgetTab(5);
    expect((await o.getStatus(5)).phase).toBe('idle');
  });
});

import type { AnalysisProvider, AnalysisResult } from '../types';
import type { Settings } from '../storage/settings';
import { serializeProviderError } from '../errors';
import { applyBudget } from '../analysis/budgeter';
import type { AnalysisOutcome, ExtractOutcome, RunContext, TabStatus } from '../messaging';

/**
 * Provider-agnostic, browser-agnostic analysis orchestrator (TDD §3 sequence).
 * The background entrypoint wires real browser dependencies; tests wire fakes,
 * so the full click→extract→analyze→annotate flow — including debounce, status
 * transitions, and the error path — is integration-testable without a browser.
 */
export interface OrchestratorDeps {
  getSettings(): Promise<Settings>;
  createProvider(settings: Settings): Promise<AnalysisProvider>;
  /** Inject the on-page agent at click time (activeTab grant). */
  injectInpage(tabId: number): Promise<void>;
  extract(tabId: number): Promise<ExtractOutcome>;
  annotate(tabId: number, result: AnalysisResult): Promise<void>;
  setBadge(tabId: number, text: string): Promise<void>;
  /** Result cache, keyed by url + contentHash. */
  cacheGet(url: string, contentHash: string): Promise<AnalysisResult | undefined>;
  cacheSet(url: string, contentHash: string, result: AnalysisResult): Promise<void>;
}

export class Orchestrator {
  private readonly statusByTab = new Map<number, TabStatus>();
  private readonly inFlight = new Map<number, AbortController>();

  constructor(private readonly deps: OrchestratorDeps) {}

  private contextFor(settings: Settings): RunContext {
    const id = settings.activeProvider;
    return { provider: id, model: settings.providers[id].model, ranLocally: id === 'ollama' };
  }

  async getStatus(tabId: number): Promise<TabStatus> {
    const existing = this.statusByTab.get(tabId);
    if (existing) return existing;
    const settings = await this.deps.getSettings();
    return { phase: 'idle', context: this.contextFor(settings) };
  }

  forgetTab(tabId: number): void {
    this.statusByTab.delete(tabId);
    this.inFlight.get(tabId)?.abort();
    this.inFlight.delete(tabId);
  }

  cancel(tabId: number): void {
    this.inFlight.get(tabId)?.abort();
    this.inFlight.delete(tabId);
  }

  async analyze(tabId: number, force = false): Promise<AnalysisOutcome> {
    // Debounce: register the in-flight guard synchronously before any await so
    // two rapid clicks can't both slip past it. A forced run cancels the prior.
    if (this.inFlight.has(tabId)) {
      if (!force) return statusToOutcome(this.statusByTab.get(tabId));
      this.inFlight.get(tabId)?.abort();
    }
    const controller = new AbortController();
    this.inFlight.set(tabId, controller);

    try {
      const settings = await this.deps.getSettings();
      const context = this.contextFor(settings);

      this.statusByTab.set(tabId, { phase: 'extracting', context });
      await this.deps.setBadge(tabId, '…');

      await this.deps.injectInpage(tabId);
      const extracted = await this.deps.extract(tabId);
      if (!extracted.ok) {
        this.statusByTab.set(tabId, { phase: 'no-content', context });
        await this.deps.setBadge(tabId, '');
        return { status: 'no-content' };
      }

      // Bound request size/cost; over-budget pages are head/middle/tail sampled.
      const budgeted = applyBudget(extracted.content, settings.wordBudget);

      // Cache hit (unless this is a forced re-run): skip the provider entirely.
      if (!force) {
        const cached = await this.deps.cacheGet(budgeted.url, budgeted.contentHash);
        if (cached) {
          await this.deps.annotate(tabId, cached);
          this.statusByTab.set(tabId, {
            phase: 'results',
            context: { provider: cached.provider, model: cached.model, ranLocally: cached.ranLocally },
            result: cached,
            cached: true,
          });
          await this.deps.setBadge(tabId, String(Math.round(cached.overall * 100)));
          return { status: 'results', result: cached, cached: true };
        }
      }

      this.statusByTab.set(tabId, { phase: 'analyzing', context });
      try {
        const provider = await this.deps.createProvider(settings);
        const result = await provider.analyze(budgeted, controller.signal);
        await this.deps.cacheSet(budgeted.url, budgeted.contentHash, result);
        await this.deps.annotate(tabId, result);
        this.statusByTab.set(tabId, {
          phase: 'results',
          context: { provider: result.provider, model: result.model, ranLocally: result.ranLocally },
          result,
          cached: false,
        });
        await this.deps.setBadge(tabId, String(Math.round(result.overall * 100)));
        return { status: 'results', result, cached: false };
      } catch (err) {
        const error = serializeProviderError(err);
        this.statusByTab.set(tabId, { phase: 'error', context, error });
        await this.deps.setBadge(tabId, '!');
        return { status: 'error', error };
      }
    } finally {
      // Only clear if we still own the slot (a forced run may have replaced us).
      if (this.inFlight.get(tabId) === controller) this.inFlight.delete(tabId);
    }
  }
}

export function statusToOutcome(status: TabStatus | undefined): AnalysisOutcome {
  if (status?.phase === 'results' && status.result) {
    return { status: 'results', result: status.result, cached: status.cached ?? false };
  }
  if (status?.phase === 'error' && status.error) {
    return { status: 'error', error: status.error };
  }
  return { status: 'no-content' };
}

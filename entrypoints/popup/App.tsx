import { useCallback, useEffect, useState, type MouseEvent } from 'react';
import { browser } from 'wxt/browser';
import { sendToBackground, type RunContext, type TabStatus } from '@/lib/messaging';
import type { AnalysisResult, ProviderId } from '@/lib/types';
import { labelText } from '@/lib/analysis/mapper';
import { remediationFor } from './remediation';
import type { SerializedProviderError } from '@/lib/errors';
import { getSettings } from '@/lib/storage';
import { isProviderConfigured } from '@/lib/providers';
import { requestProviderPermission } from '@/lib/permissions';

type View =
  | { phase: 'loading' }
  | { phase: 'idle'; context: RunContext }
  | { phase: 'extracting' | 'analyzing'; context: RunContext }
  | { phase: 'results'; context: RunContext; result: AnalysisResult; cached: boolean }
  | { phase: 'no-content'; context: RunContext }
  | { phase: 'error'; context: RunContext; error: SerializedProviderError };

const PROVIDER_NAMES: Record<ProviderId, string> = {
  anthropic: 'Anthropic',
  openai_compat: 'an OpenAI-compatible endpoint',
  ollama: 'Ollama (local)',
  mock: 'the mock provider',
};

const CAVEAT =
  'This is a probabilistic estimate from a language model, not proof. Both false positives and false negatives are common.';

export function App() {
  const [view, setView] = useState<View>({ phase: 'loading' });
  const [tabId, setTabId] = useState<number | undefined>();
  const [onboarded, setOnboarded] = useState(true);
  const [configured, setConfigured] = useState(true);

  useEffect(() => {
    void (async () => {
      void getSettings().then(async (s) => {
        setOnboarded(s.onboarded);
        setConfigured(await isProviderConfigured(s));
      });
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (tab?.id === undefined) {
        setView({ phase: 'idle', context: { provider: 'mock', model: '', ranLocally: false } });
        return;
      }
      setTabId(tab.id);
      const status = await sendToBackground({ channel: 'bg', type: 'getStatus', tabId: tab.id });
      setView(statusToView(status));
    })();
  }, []);

  const openOptions = (e: MouseEvent) => {
    e.preventDefault();
    void browser.runtime.openOptionsPage();
  };

  const run = useCallback(async (force: boolean) => {
    if (tabId === undefined) return;
    const ctx = contextOf(view);
    // Request the provider's host permission from this user gesture (AD-3).
    if (ctx.provider !== 'mock') {
      const settings = await getSettings();
      const granted = await requestProviderPermission(ctx.provider, settings);
      if (!granted) {
        setView({
          phase: 'error',
          context: ctx,
          error: {
            __providerError: true,
            kind: 'auth',
            message: 'Permission to reach the provider was denied.',
            retryable: false,
          },
        });
        return;
      }
    }
    setView((v) => ({ phase: 'analyzing', context: contextOf(v) }));
    const outcome = await sendToBackground({ channel: 'bg', type: 'analyze', tabId, force });
    setView((v) => {
      const context = contextOf(v);
      if (outcome.status === 'results') {
        return { phase: 'results', context, result: outcome.result, cached: outcome.cached };
      }
      if (outcome.status === 'no-content') return { phase: 'no-content', context };
      return { phase: 'error', context, error: outcome.error };
    });
  }, [tabId]);

  return (
    <main className="popup">
      <header className="head">
        <h1>Slopwatch</h1>
        {configured ? (
          <PrivacyIndicator context={contextOf(view)} />
        ) : (
          <span className="privacy notset" title="No provider configured">
            ⚙️ Not set up
          </span>
        )}
      </header>
      {!configured && view.phase !== 'results' ? (
        <SetupNeeded onOpen={openOptions} />
      ) : (
        <>
          {!onboarded && (
            <p className="firstrun">
              New here? <a href="#" onClick={openOptions}>Configure a provider →</a>
            </p>
          )}
          <Body view={view} onRun={run} />
        </>
      )}
      <p className="caveat">{CAVEAT}</p>
    </main>
  );
}

function SetupNeeded({ onOpen }: { onOpen: (e: MouseEvent) => void }) {
  return (
    <div className="setup">
      <p className="lead">No analysis provider is set up yet.</p>
      <p className="hint">
        Add an Anthropic API key, or point Slopwatch at a local Ollama model, to start analyzing
        pages. Slopwatch never analyzes anything until a real provider is configured.
      </p>
      <button className="primary" onClick={onOpen}>
        Open Settings
      </button>
    </div>
  );
}

function Body({ view, onRun }: { view: View; onRun: (force: boolean) => void }) {
  switch (view.phase) {
    case 'loading':
      return <p className="status" role="status">Loading…</p>;
    case 'idle':
      return (
        <div>
          <p className="lead">Check whether the text on this page looks AI-generated.</p>
          <button className="primary" onClick={() => onRun(false)}>
            Run analysis on this page
          </button>
        </div>
      );
    case 'extracting':
      return <p className="status" role="status">Reading the page…</p>;
    case 'analyzing':
      return (
        <p className="status" role="status">
          Asking {view.context.model || PROVIDER_NAMES[view.context.provider]}…
        </p>
      );
    case 'no-content':
      return (
        <div>
          <p className="status">Couldn't find primary article content on this page.</p>
          <p className="hint">App shells, pure media, and login walls don't have extractable text.</p>
          <button className="primary" onClick={() => onRun(true)}>Try again</button>
        </div>
      );
    case 'error': {
      const r = remediationFor(view.error.kind, PROVIDER_NAMES[view.context.provider]);
      return (
        <div className="error" role="alert">
          <p className="status">{view.error.message || r.message}</p>
          <p className="hint">{r.fix}</p>
          <button className="primary" onClick={() => onRun(true)}>Retry</button>
        </div>
      );
    }
    case 'results':
      return <Results result={view.result} cached={view.cached} onRerun={() => onRun(true)} />;
  }
}

export function Results({
  result,
  cached,
  onRerun,
}: {
  result: AnalysisResult;
  cached: boolean;
  onRerun: () => void;
}) {
  const pct = Math.round(result.overall * 100);
  const label = labelText(result.label);
  return (
    <div className="results">
      <div
        className="overall"
        aria-label={`Likelihood AI-generated: ${pct} percent. Label: ${label}.`}
      >
        <div className="score">{pct}%</div>
        <div className={`label label-${result.label}`}>{label}</div>
      </div>
      <Gauge overall={result.overall} />
      {cached && <p className="hint">Showing a saved result from {formatTime(result.createdAt)}.</p>}
      {result.meta.truncated && (
        <p className="hint">
          Analyzed ~{Math.round(result.meta.sampledFraction * 100)}% of a long page (head, middle,
          end).
        </p>
      )}
      <section className="reasoning">
        <h2>Why it looks this way</h2>
        <p>{result.reasoning}</p>
        <p className="fp-note">
          False positives are real — formal, template-following, or non-native-English writing can
          read as AI. Don't use this to accuse anyone.
        </p>
      </section>
      {result.segments.length > 0 && (
        <section className="segments">
          <h2>Flagged paragraphs ({result.segments.length})</h2>
          <ul>
            {result.segments
              .slice()
              .sort((a, b) => b.aiLikelihood - a.aiLikelihood)
              .map((s) => (
                <li key={s.index}>
                  <span className="seg-pct">{Math.round(s.aiLikelihood * 100)}%</span>
                  <span className="seg-rationale">{s.rationale}</span>
                </li>
              ))}
          </ul>
        </section>
      )}
      <p className="meta">{formatMeta(result)}</p>
      <button className="secondary" onClick={onRerun}>Re-run</button>
    </div>
  );
}

function formatMeta(result: AnalysisResult): string {
  const parts = [PROVIDER_NAMES[result.provider], result.model, `${result.meta.latencyMs} ms`];
  const u = result.usage;
  if (u?.inputTokens !== undefined || u?.outputTokens !== undefined) {
    parts.push(`${(u.inputTokens ?? 0) + (u.outputTokens ?? 0)} tokens`);
  }
  if (u?.estCostUsd !== undefined) parts.push(`~$${u.estCostUsd.toFixed(4)}`);
  if (result.meta.schemaRepaired) parts.push('repaired');
  return parts.filter(Boolean).join(' · ');
}

function formatTime(epochMs: number): string {
  try {
    return new Date(epochMs).toLocaleString();
  } catch {
    return 'earlier';
  }
}

function Gauge({ overall }: { overall: number }) {
  return (
    <div className="gauge" aria-hidden="true">
      <div className="gauge-track" />
      <div className="gauge-marker" style={{ left: `${Math.min(100, Math.max(0, overall * 100))}%` }} />
      <div className="gauge-ends">
        <span>looks human</span>
        <span>looks AI</span>
      </div>
    </div>
  );
}

function PrivacyIndicator({ context }: { context: RunContext }) {
  if (context.provider === 'mock') {
    return (
      <span className="privacy mock" title="Offline demo provider — not real analysis">
        🧪 Mock
      </span>
    );
  }
  const where = context.ranLocally
    ? 'Runs on your device'
    : `Sent to ${PROVIDER_NAMES[context.provider]}`;
  return (
    <span className={`privacy ${context.ranLocally ? 'local' : 'cloud'}`} title={where}>
      {context.ranLocally ? '🔒 Local' : '☁️ Cloud'}
    </span>
  );
}

function contextOf(view: View): RunContext {
  return 'context' in view ? view.context : { provider: 'mock', model: '', ranLocally: false };
}

function statusToView(status: TabStatus): View {
  switch (status.phase) {
    case 'results':
      return status.result
        ? { phase: 'results', context: status.context, result: status.result, cached: status.cached ?? false }
        : { phase: 'idle', context: status.context };
    case 'error':
      return status.error
        ? { phase: 'error', context: status.context, error: status.error }
        : { phase: 'idle', context: status.context };
    case 'no-content':
      return { phase: 'no-content', context: status.context };
    case 'extracting':
    case 'analyzing':
      return { phase: status.phase, context: status.context };
    case 'idle':
    default:
      return { phase: 'idle', context: status.context };
  }
}

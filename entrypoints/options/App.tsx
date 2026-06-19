import { useEffect, useState } from 'react';
import {
  getSettings,
  updateSettings,
  setSecret,
  clearSecret,
  hasSecret,
  applyPersistencePreference,
  HIGHLIGHT_STYLES,
  MIN_UNCERTAIN_BAND,
  type HighlightStyle,
  type Settings,
} from '@/lib/storage';
import { sendToBackground } from '@/lib/messaging';
import { requestProviderPermission } from '@/lib/permissions';
import { ollamaOriginsSnippet } from '@/lib/providers';
import { clearCache, cacheStats } from '@/lib/cache';
import {
  listDiagnostics,
  clearDiagnostics,
  exportDiagnostics,
  type DiagnosticEntry,
} from '@/lib/diagnostics';
import type { ProviderId } from '@/lib/types';

type TestState = { status: 'idle' | 'testing' | 'ok' | 'fail'; detail?: string };

/**
 * Options (Story 10, MVP slice): pick the active provider, configure Anthropic
 * (key entry — write-only, masked "configured" state — and model) and Ollama
 * (base URL + model picker), and run Test connection. The safe path
 * (session-only keys) is the default; persistence is an explicit opt-in with an
 * at-rest warning.
 */
export function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [anthropicConfigured, setConfigured] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [test, setTest] = useState<Record<string, TestState>>({});
  const [ollamaModels, setOllamaModels] = useState<string[] | null>(null);
  const [cacheEntries, setCacheEntries] = useState<number | null>(null);
  const [diag, setDiag] = useState<DiagnosticEntry[]>([]);

  useEffect(() => {
    void (async () => {
      setSettings(await getSettings());
      setConfigured(await hasSecret('anthropic'));
      setCacheEntries((await cacheStats()).entries);
      setDiag(await listDiagnostics());
    })();
  }, []);

  if (!settings) return <main className="options"><p>Loading…</p></main>;

  const patch = async (p: Partial<Settings>) => setSettings(await updateSettings(p));

  // Selecting a real provider counts as completing first-run setup.
  const setProvider = (id: ProviderId) => patch({ activeProvider: id, onboarded: true });

  const setThreshold = (which: 'humanMax' | 'aiMin', value: number) => {
    let { humanMax, aiMin } = settings.thresholds;
    if (which === 'humanMax') humanMax = Math.min(value, aiMin - MIN_UNCERTAIN_BAND);
    else aiMin = Math.max(value, humanMax + MIN_UNCERTAIN_BAND);
    return patch({ thresholds: { humanMax, aiMin } });
  };

  const onClearCache = async () => {
    await clearCache();
    setCacheEntries(0);
  };

  const onClearDiagnostics = async () => {
    await clearDiagnostics();
    setDiag([]);
  };

  const onCopyDiagnostics = async () => {
    try {
      await navigator.clipboard.writeText(exportDiagnostics(diag));
    } catch {
      // Clipboard may be unavailable; ignore.
    }
  };

  const setProviderField = (id: ProviderId, field: 'model' | 'baseUrl', value: string) =>
    patch({
      providers: { ...settings.providers, [id]: { ...settings.providers[id], [field]: value } },
    });

  const saveKey = async () => {
    if (!keyInput.trim()) return;
    await setSecret('anthropic', keyInput.trim(), settings.persistSecrets);
    setConfigured(true);
    setKeyInput('');
    await patch({ onboarded: true });
  };

  const clearKey = async () => {
    await clearSecret('anthropic');
    setConfigured(false);
  };

  const togglePersist = async (checked: boolean) => {
    await patch({ persistSecrets: checked });
    await applyPersistencePreference(checked);
  };

  const testConnection = async (provider: ProviderId) => {
    setTest((t) => ({ ...t, [provider]: { status: 'testing' } }));
    const granted = await requestProviderPermission(provider, settings);
    if (!granted) {
      setTest((t) => ({ ...t, [provider]: { status: 'fail', detail: 'Host permission denied.' } }));
      return;
    }
    const res = await sendToBackground({ channel: 'bg', type: 'testConnection', provider });
    setTest((t) => ({
      ...t,
      [provider]: { status: res.ok ? 'ok' : 'fail', detail: res.detail },
    }));
  };

  const fetchOllamaModels = async () => {
    const granted = await requestProviderPermission('ollama', settings);
    if (!granted) return;
    const res = await sendToBackground({ channel: 'bg', type: 'listModels', provider: 'ollama' });
    if (res.ok) setOllamaModels(res.models);
    else setTest((t) => ({ ...t, ollama: { status: 'fail', detail: res.error.message } }));
  };

  return (
    <main className="options">
      <h1>Slopwatch settings</h1>

      <fieldset>
        <legend>Active provider</legend>
        {(['anthropic', 'ollama', 'mock'] as ProviderId[]).map((id) => (
          <label key={id} className="radio">
            <input
              type="radio"
              name="provider"
              checked={settings.activeProvider === id}
              onChange={() => setProvider(id)}
            />
            {PROVIDER_LABELS[id]}
          </label>
        ))}
      </fieldset>

      <section>
        <h2>Anthropic</h2>
        <label htmlFor="anthropic-model">Model</label>
        <input
          id="anthropic-model"
          value={settings.providers.anthropic.model}
          onChange={(e) => setProviderField('anthropic', 'model', e.target.value)}
        />

        <label htmlFor="anthropic-key">API key</label>
        {anthropicConfigured ? (
          <p className="configured">
            Configured ✓ <button className="link" onClick={clearKey}>Clear key</button>
          </p>
        ) : (
          <div className="row">
            <input
              id="anthropic-key"
              type="password"
              placeholder="sk-ant-…"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
            />
            <button onClick={saveKey}>Save key</button>
          </div>
        )}

        <label className="checkbox">
          <input
            type="checkbox"
            checked={settings.persistSecrets}
            onChange={(e) => togglePersist(e.target.checked)}
          />
          Remember my key on this device
        </label>
        {settings.persistSecrets && (
          <p className="warning" role="note">
            Saved keys are stored unencrypted in your browser profile. Anyone with access to this
            device's files could read them. Consider full-disk encryption, or leave this off to keep
            keys only for the session.
          </p>
        )}
        <p className="hint">
          Your key goes directly from your browser to Anthropic and is never sent to any Slopwatch
          server. The browser exposes it client-side — prefer a scoped/limited key.
        </p>
        <TestButton state={test.anthropic} onClick={() => testConnection('anthropic')} />
      </section>

      <section>
        <h2>Ollama (local)</h2>
        <p className="hint">Runs on your device. Nothing leaves your machine.</p>
        <label htmlFor="ollama-base">Base URL</label>
        <input
          id="ollama-base"
          value={settings.providers.ollama.baseUrl ?? ''}
          onChange={(e) => setProviderField('ollama', 'baseUrl', e.target.value)}
        />
        <label htmlFor="ollama-model">Model</label>
        <div className="row">
          <input
            id="ollama-model"
            list="ollama-model-list"
            value={settings.providers.ollama.model}
            onChange={(e) => setProviderField('ollama', 'model', e.target.value)}
          />
          <button onClick={fetchOllamaModels}>Fetch models</button>
        </div>
        {ollamaModels && (
          <datalist id="ollama-model-list">
            {ollamaModels.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        )}
        <details>
          <summary>Getting a CORS error?</summary>
          <p className="hint">
            Allow the extension origin and restart Ollama:
          </p>
          <pre className="snippet">{ollamaOriginsSnippet()}</pre>
        </details>
        <TestButton state={test.ollama} onClick={() => testConnection('ollama')} />
      </section>

      <section>
        <h2>Thresholds</h2>
        <p className="hint">
          Where the score becomes "likely human" or "likely AI". The Uncertain band in the middle
          can't be removed.
        </p>
        <label htmlFor="th-human">
          Likely human below: {Math.round(settings.thresholds.humanMax * 100)}%
        </label>
        <input
          id="th-human"
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={settings.thresholds.humanMax}
          onChange={(e) => setThreshold('humanMax', Number(e.target.value))}
        />
        <label htmlFor="th-ai">
          Likely AI above: {Math.round(settings.thresholds.aiMin * 100)}%
        </label>
        <input
          id="th-ai"
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={settings.thresholds.aiMin}
          onChange={(e) => setThreshold('aiMin', Number(e.target.value))}
        />
        <p className="hint">
          Uncertain band:{' '}
          {Math.round((settings.thresholds.aiMin - settings.thresholds.humanMax) * 100)}% wide.
        </p>
      </section>

      <section>
        <h2>Appearance</h2>
        <label htmlFor="hl-style">Highlight style</label>
        <select
          id="hl-style"
          value={settings.appearance.highlightStyle}
          onChange={(e) =>
            patch({
              appearance: { ...settings.appearance, highlightStyle: e.target.value as HighlightStyle },
            })
          }
        >
          {HIGHLIGHT_STYLES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={settings.appearance.highContrast}
            onChange={(e) =>
              patch({ appearance: { ...settings.appearance, highContrast: e.target.checked } })
            }
          />
          High-contrast highlights
        </label>
        <p className="hint">Dark mode and reduced-motion follow your system settings.</p>
      </section>

      <section>
        <h2>Privacy &amp; data</h2>
        <p className="hint">
          Cached results live only in this browser and never contain your key. {' '}
          {cacheEntries !== null && `${cacheEntries} cached.`}
        </p>
        <button onClick={onClearCache}>Clear cache</button>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={settings.diagnosticsEnabled}
            onChange={(e) => patch({ diagnosticsEnabled: e.target.checked })}
          />
          Keep a local diagnostics log (provider, latency, tokens, errors)
        </label>
        <p className="hint">
          Diagnostics stay on this device and never include page content or keys.
        </p>
        {settings.diagnosticsEnabled && (
          <details>
            <summary>Recent runs ({diag.length})</summary>
            <div className="row">
              <button onClick={onCopyDiagnostics}>Copy JSON</button>
              <button onClick={onClearDiagnostics}>Clear log</button>
            </div>
            <ul className="diag">
              {diag.map((d, i) => (
                <li key={i}>
                  {new Date(d.at).toLocaleString()} · {d.provider} · {d.model} ·{' '}
                  {d.errorKind ? `error: ${d.errorKind}` : `${d.latencyMs ?? '?'} ms`}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <p className="caveat">
        Slopwatch produces a probabilistic signal, not proof. It never labels people, only text.
      </p>
    </main>
  );
}

function TestButton({ state, onClick }: { state?: TestState; onClick: () => void }) {
  return (
    <div className="test">
      <button onClick={onClick} disabled={state?.status === 'testing'}>
        {state?.status === 'testing' ? 'Testing…' : 'Test connection'}
      </button>
      {state?.status === 'ok' && <span className="ok" role="status">✓ {state.detail}</span>}
      {state?.status === 'fail' && <span className="fail" role="alert">✕ {state.detail}</span>}
    </div>
  );
}

const PROVIDER_LABELS: Record<ProviderId, string> = {
  anthropic: 'Anthropic (cloud)',
  ollama: 'Ollama (local)',
  openai_compat: 'OpenAI-compatible',
  mock: 'Mock (offline demo)',
};

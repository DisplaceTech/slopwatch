import { describe, it, expect } from 'vitest';
import {
  recordDiagnostic,
  listDiagnostics,
  clearDiagnostics,
  exportDiagnostics,
  DIAGNOSTICS_MAX,
  type DiagnosticEntry,
} from './diagnostics';
import { updateSettings } from './storage/settings';

function entry(at: number): DiagnosticEntry {
  return { at, provider: 'anthropic', model: 'claude-haiku-4-5', ranLocally: false, latencyMs: 10 };
}

describe('diagnostics ring buffer', () => {
  it('is a no-op when diagnostics are disabled (default)', async () => {
    await recordDiagnostic(entry(1));
    expect(await listDiagnostics()).toEqual([]);
  });

  it('records when enabled, newest first, capped at the max', async () => {
    await updateSettings({ diagnosticsEnabled: true });
    for (let i = 0; i < DIAGNOSTICS_MAX + 5; i++) await recordDiagnostic(entry(i));
    const list = await listDiagnostics();
    expect(list).toHaveLength(DIAGNOSTICS_MAX);
    expect(list[0]!.at).toBe(DIAGNOSTICS_MAX + 4); // newest first
  });

  it('never stores page content or keys (entry shape is metadata only)', async () => {
    await updateSettings({ diagnosticsEnabled: true });
    await recordDiagnostic(entry(1));
    const [e] = await listDiagnostics();
    const keys = Object.keys(e!);
    expect(keys).not.toContain('content');
    expect(keys).not.toContain('apiKey');
    expect(keys).not.toContain('key');
  });

  it('clears the log', async () => {
    await updateSettings({ diagnosticsEnabled: true });
    await recordDiagnostic(entry(1));
    await clearDiagnostics();
    expect(await listDiagnostics()).toEqual([]);
  });

  it('exports as JSON', async () => {
    const json = exportDiagnostics([entry(1)]);
    expect(JSON.parse(json)[0].provider).toBe('anthropic');
  });
});

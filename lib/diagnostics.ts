import { browser } from 'wxt/browser';
import { getSettings } from './storage/settings';
import type { ProviderId } from './types';
import type { ProviderErrorKind } from './errors';

/**
 * Optional, off-by-default local diagnostics ring buffer (TDD §4 Analytics,
 * Story 11). Records the last N runs for debugging — provider, latency, token
 * counts, error class. **Never content, never keys.** Lives only in
 * storage.local and is viewable/exportable by the user.
 */

export const DIAGNOSTICS_KEY = 'diagnostics';
export const DIAGNOSTICS_MAX = 50;

export interface DiagnosticEntry {
  at: number;
  provider: ProviderId;
  model: string;
  ranLocally: boolean;
  latencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  truncated?: boolean;
  sampledFraction?: number;
  schemaRepaired?: boolean;
  errorKind?: ProviderErrorKind;
}

async function read(): Promise<DiagnosticEntry[]> {
  const stored = await browser.storage.local.get(DIAGNOSTICS_KEY);
  const value = stored[DIAGNOSTICS_KEY];
  return Array.isArray(value) ? (value as DiagnosticEntry[]) : [];
}

/** Append a run to the ring buffer — a no-op unless diagnostics are enabled. */
export async function recordDiagnostic(entry: DiagnosticEntry): Promise<void> {
  const settings = await getSettings();
  if (!settings.diagnosticsEnabled) return;
  const buffer = await read();
  buffer.push(entry);
  const trimmed = buffer.slice(-DIAGNOSTICS_MAX);
  await browser.storage.local.set({ [DIAGNOSTICS_KEY]: trimmed });
}

export async function listDiagnostics(): Promise<DiagnosticEntry[]> {
  return (await read()).slice().reverse(); // newest first
}

export async function clearDiagnostics(): Promise<void> {
  await browser.storage.local.remove(DIAGNOSTICS_KEY);
}

export function exportDiagnostics(entries: DiagnosticEntry[]): string {
  return JSON.stringify(entries, null, 2);
}

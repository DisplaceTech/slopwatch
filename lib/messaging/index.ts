import { browser } from 'wxt/browser';
import type { AnalysisResult, ExtractedContent, ProviderId } from '../types';
import type { SerializedProviderError } from '../errors';

/**
 * Typed message contracts between the popup/options (UI), the background
 * orchestrator, and the injected content script. Two channels, disambiguated by
 * a `channel` discriminant so a single `runtime.onMessage` listener per context
 * stays type-safe and rejects unknown messages.
 */

// ---------------------------------------------------------------------------
// Content-script channel: background -> content (delivered via tabs.sendMessage)
// ---------------------------------------------------------------------------

export type ExtractMessage = { channel: 'content'; type: 'extract' };
export type AnnotateMessage = { channel: 'content'; type: 'annotate'; result: AnalysisResult };
export type ClearAnnotationsMessage = { channel: 'content'; type: 'clearAnnotations' };
export type ContentMessage = ExtractMessage | AnnotateMessage | ClearAnnotationsMessage;

export type ExtractOutcome =
  | { ok: true; content: ExtractedContent }
  | { ok: false; reason: 'no-content' };

export interface ContentResponseMap {
  extract: ExtractOutcome;
  annotate: { ok: true };
  clearAnnotations: { ok: true };
}

// ---------------------------------------------------------------------------
// Background channel: UI -> background (delivered via runtime.sendMessage)
// ---------------------------------------------------------------------------

export type AnalyzeMessage = { channel: 'bg'; type: 'analyze'; tabId: number; force?: boolean };
export type GetStatusMessage = { channel: 'bg'; type: 'getStatus'; tabId: number };
export type TestConnectionMessage = { channel: 'bg'; type: 'testConnection'; provider: ProviderId };
export type ListModelsMessage = { channel: 'bg'; type: 'listModels'; provider: ProviderId };
export type CancelMessage = { channel: 'bg'; type: 'cancel'; tabId: number };
export type BackgroundMessage =
  | AnalyzeMessage
  | GetStatusMessage
  | TestConnectionMessage
  | ListModelsMessage
  | CancelMessage;

export type TabPhase =
  | 'idle'
  | 'extracting'
  | 'analyzing'
  | 'results'
  | 'no-content'
  | 'error';

/** What a provider/run looks like to the UI, with privacy framing. */
export interface RunContext {
  provider: ProviderId;
  model: string;
  ranLocally: boolean;
}

export interface TabStatus {
  phase: TabPhase;
  context: RunContext;
  result?: AnalysisResult;
  error?: SerializedProviderError;
  /** true when `result` came from cache rather than a fresh run. */
  cached?: boolean;
}

export type AnalysisOutcome =
  | { status: 'results'; result: AnalysisResult; cached: boolean }
  | { status: 'no-content' }
  | { status: 'error'; error: SerializedProviderError };

export interface BackgroundResponseMap {
  analyze: AnalysisOutcome;
  getStatus: TabStatus;
  testConnection: { ok: boolean; detail?: string };
  listModels: { ok: true; models: string[] } | { ok: false; error: SerializedProviderError };
  cancel: { ok: true };
}

// ---------------------------------------------------------------------------
// Senders
// ---------------------------------------------------------------------------

export function sendToBackground<M extends BackgroundMessage>(
  msg: M,
): Promise<BackgroundResponseMap[M['type']]> {
  return browser.runtime.sendMessage(msg) as Promise<BackgroundResponseMap[M['type']]>;
}

export function sendToTab<M extends ContentMessage>(
  tabId: number,
  msg: M,
): Promise<ContentResponseMap[M['type']]> {
  return browser.tabs.sendMessage(tabId, msg) as Promise<ContentResponseMap[M['type']]>;
}

// ---------------------------------------------------------------------------
// Receivers (one per context). Unknown messages are ignored, not mis-handled.
// ---------------------------------------------------------------------------

function isContentMessage(value: unknown): value is ContentMessage {
  return typeof value === 'object' && value !== null && (value as ContentMessage).channel === 'content';
}

function isBackgroundMessage(value: unknown): value is BackgroundMessage {
  return typeof value === 'object' && value !== null && (value as BackgroundMessage).channel === 'bg';
}

// Handlers receive the full message union and return the response union; the
// runtime `switch (msg.type)` narrows each case. Senders keep precise per-type
// correlation (see sendToBackground/sendToTab); handlers stay practical.
type AnyContentResponse = ContentResponseMap[ContentMessage['type']];
type AnyBackgroundResponse = BackgroundResponseMap[BackgroundMessage['type']];
type ContentHandler = (msg: ContentMessage) => Promise<AnyContentResponse>;
type BackgroundHandler = (msg: BackgroundMessage) => Promise<AnyBackgroundResponse>;

export function onContentMessage(handler: ContentHandler): void {
  browser.runtime.onMessage.addListener((message: unknown) => {
    if (!isContentMessage(message)) return undefined;
    return handler(message);
  });
}

export function onBackgroundMessage(handler: BackgroundHandler): void {
  browser.runtime.onMessage.addListener((message: unknown) => {
    if (!isBackgroundMessage(message)) return undefined;
    return handler(message);
  });
}

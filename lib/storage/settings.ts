import { z } from 'zod';
import { browser } from 'wxt/browser';
import type { ProviderId } from '../types';

/**
 * Typed, versioned settings persisted in `storage.local`. A corrupt or partial
 * object is detected on read and replaced with defaults rather than crashing the
 * worker (NFR: Data Integrity). Settings never contain secrets.
 */

export const SETTINGS_KEY = 'settings';
export const SETTINGS_VERSION = 1;

/** The Uncertain band can never be configured to zero width (AD-7). */
export const MIN_UNCERTAIN_BAND = 0.1;

export const HIGHLIGHT_STYLES = ['underline', 'background', 'box'] as const;
export type HighlightStyle = (typeof HIGHLIGHT_STYLES)[number];

const providerConfigSchema = z.object({
  model: z.string().min(1),
  baseUrl: z.string().optional(),
});

const thresholdsSchema = z
  .object({
    /** overall < humanMax → likely-human. */
    humanMax: z.number().min(0).max(1),
    /** overall > aiMin → likely-ai. */
    aiMin: z.number().min(0).max(1),
  })
  // Epsilon guards against floating-point drift (e.g. 0.65 - 0.55 = 0.0999…).
  .refine((t) => t.aiMin - t.humanMax >= MIN_UNCERTAIN_BAND - 1e-9, {
    message: 'Uncertain band must be at least MIN_UNCERTAIN_BAND wide',
  });

export const settingsSchema = z.object({
  version: z.literal(SETTINGS_VERSION),
  activeProvider: z.enum(['anthropic', 'openai_compat', 'ollama', 'mock']),
  providers: z.object({
    anthropic: providerConfigSchema,
    openai_compat: providerConfigSchema,
    ollama: providerConfigSchema,
    mock: providerConfigSchema,
  }),
  thresholds: thresholdsSchema,
  appearance: z.object({
    highlightStyle: z.enum(HIGHLIGHT_STYLES),
    highContrast: z.boolean(),
  }),
  /** Opt-in: persist API keys to storage.local instead of session-only. */
  persistSecrets: z.boolean(),
  /** Opt-in, off by default: local diagnostics ring buffer. */
  diagnosticsEnabled: z.boolean(),
  /** Max words of extracted text sent per analysis (scaling axis). */
  wordBudget: z.number().int().positive(),
  /** Whether the user has completed (or dismissed) first-run setup. */
  onboarded: z.boolean(),
});

export type Settings = z.infer<typeof settingsSchema>;
export type Thresholds = Settings['thresholds'];
export type Appearance = Settings['appearance'];

export const DEFAULT_SETTINGS: Settings = {
  version: SETTINGS_VERSION,
  // A real provider by default. The Mock provider is dev-only (see createProvider)
  // — a fresh install is "not configured" and the UI prompts setup rather than
  // silently producing fake results.
  activeProvider: 'anthropic',
  providers: {
    anthropic: { model: 'claude-haiku-4-5' },
    openai_compat: { model: 'gpt-4o-mini', baseUrl: 'https://api.openai.com/v1' },
    ollama: { model: 'llama3.1', baseUrl: 'http://localhost:11434' },
    mock: { model: 'mock-1' },
  },
  thresholds: { humanMax: 0.35, aiMin: 0.65 },
  appearance: { highlightStyle: 'background', highContrast: false },
  persistSecrets: false,
  diagnosticsEnabled: false,
  wordBudget: 6000,
  onboarded: false,
};

/** Parse an unknown stored value, falling back to defaults on any corruption. */
export function parseSettings(raw: unknown): Settings {
  const result = settingsSchema.safeParse(raw);
  return result.success ? result.data : structuredClone(DEFAULT_SETTINGS);
}

export async function getSettings(): Promise<Settings> {
  const stored = await browser.storage.local.get(SETTINGS_KEY);
  return parseSettings(stored[SETTINGS_KEY]);
}

/** Merge a partial patch over current settings and persist atomically. */
export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await getSettings();
  const next = settingsSchema.parse({ ...current, ...patch });
  await browser.storage.local.set({ [SETTINGS_KEY]: next });
  return next;
}

export async function resetSettings(): Promise<Settings> {
  const next = structuredClone(DEFAULT_SETTINGS);
  await browser.storage.local.set({ [SETTINGS_KEY]: next });
  return next;
}

/** Subscribe to settings changes (storage.onChanged propagation). */
export function onSettingsChanged(cb: (settings: Settings) => void): () => void {
  const listener = (
    changes: Record<string, { newValue?: unknown }>,
    areaName: string,
  ) => {
    if (areaName === 'local' && SETTINGS_KEY in changes) {
      cb(parseSettings(changes[SETTINGS_KEY]?.newValue));
    }
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}

export type ProviderConfigFor = z.infer<typeof providerConfigSchema> & { id: ProviderId };

import { describe, it, expect, vi } from 'vitest';
import { OllamaProvider, ollamaOriginsSnippet } from './ollama';
import type { HttpDeps } from './http';
import { DEFAULT_SETTINGS } from '../storage/settings';
import type { ExtractedContent } from '../types';

const thresholds = DEFAULT_SETTINGS.thresholds;

function content(): ExtractedContent {
  return {
    url: 'https://example.com',
    title: 'T',
    segments: [{ index: 0, text: 'A paragraph long enough to be a real content segment here.' }],
    truncated: false,
    sampledFraction: 1,
    contentHash: 'h',
  };
}

function resp(status: number, body: string): Response {
  return { status, ok: status >= 200 && status < 300, text: async () => body } as unknown as Response;
}

function httpWith(fetchImpl: typeof fetch): HttpDeps {
  return { fetchImpl, sleep: async () => {}, timeoutMs: 1000, maxRetries: 2, backoff: [1, 1, 1] };
}

const chatBody = JSON.stringify({
  message: {
    content: JSON.stringify({
      overall: 0.3,
      reasoning: 'reads human',
      segments: [],
    }),
  },
  prompt_eval_count: 500,
  eval_count: 120,
});

describe('OllamaProvider', () => {
  it('posts the format schema to /api/chat and marks the result local', async () => {
    let url = '';
    let body: unknown;
    const fetchImpl = vi.fn(async (u: string, init?: RequestInit) => {
      url = u;
      body = JSON.parse(init!.body as string);
      return resp(200, chatBody);
    }) as unknown as typeof fetch;

    const p = new OllamaProvider('qwen3:4b', 'http://localhost:11434', thresholds, httpWith(fetchImpl));
    const r = await p.analyze(content(), new AbortController().signal);

    expect(url).toBe('http://localhost:11434/api/chat');
    expect((body as { format?: unknown }).format).toBeDefined();
    expect((body as { stream?: boolean }).stream).toBe(false);
    expect((body as { model?: string }).model).toBe('qwen3:4b');
    expect(r.ranLocally).toBe(true);
    expect(r.label).toBe('likely-human');
    expect(r.usage?.inputTokens).toBe(500);
  });

  it('lists pulled models from /api/tags', async () => {
    const tags = JSON.stringify({ models: [{ name: 'qwen3:4b' }, { name: 'gemma2:12b' }] });
    const fetchImpl = vi.fn(async () => resp(200, tags)) as unknown as typeof fetch;
    const p = new OllamaProvider('qwen3:4b', undefined, thresholds, httpWith(fetchImpl));
    expect(await p.listModels()).toEqual(['qwen3:4b', 'gemma2:12b']);
  });

  it('maps an opaque fetch failure to a CORS error (the OLLAMA_ORIGINS case)', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    const p = new OllamaProvider('qwen3:4b', undefined, thresholds, httpWith(fetchImpl));
    await expect(p.analyze(content(), new AbortController().signal)).rejects.toMatchObject({
      kind: 'cors',
    });
  });

  it('trims a trailing slash from the base URL', async () => {
    let url = '';
    const fetchImpl = vi.fn(async (u: string) => {
      url = u;
      return resp(200, JSON.stringify({ models: [] }));
    }) as unknown as typeof fetch;
    const p = new OllamaProvider('m', 'http://localhost:11434/', thresholds, httpWith(fetchImpl));
    await p.listModels();
    expect(url).toBe('http://localhost:11434/api/tags');
  });

  it('provides a CORS remediation snippet', () => {
    expect(ollamaOriginsSnippet()).toContain('OLLAMA_ORIGINS');
  });
});

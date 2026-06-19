import { describe, it, expect, vi } from 'vitest';
import { AnthropicProvider, estimateCost } from './anthropic';
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

const validBody = JSON.stringify({
  content: [
    {
      type: 'text',
      text: JSON.stringify({
        overall: 0.8,
        reasoning: 'looks synthetic',
        segments: [{ index: 0, aiLikelihood: 0.9, rationale: 'uniform cadence' }],
      }),
    },
  ],
  usage: { input_tokens: 1000, output_tokens: 200 },
});

describe('AnthropicProvider', () => {
  it('sends the required browser headers and returns a mapped result with cost', async () => {
    let captured: RequestInit | undefined;
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      captured = init;
      return resp(200, validBody);
    }) as unknown as typeof fetch;

    const p = new AnthropicProvider('claude-haiku-4-5', 'sk-ant-test', thresholds, httpWith(fetchImpl));
    const r = await p.analyze(content(), new AbortController().signal);

    const headers = captured!.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('sk-ant-test');
    expect(headers['anthropic-version']).toBe('2023-06-01');
    expect(headers['anthropic-dangerous-direct-browser-access']).toBe('true');

    expect(r.provider).toBe('anthropic');
    expect(r.overall).toBe(0.8);
    expect(r.label).toBe('likely-ai');
    expect(r.ranLocally).toBe(false);
    expect(r.usage?.inputTokens).toBe(1000);
    expect(r.usage?.estCostUsd).toBeCloseTo(1000 / 1e6 + (200 / 1e6) * 5);
  });

  it('repairs once when the first response is unparseable', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(resp(200, JSON.stringify({ content: [{ type: 'text', text: 'no json' }] })))
      .mockResolvedValueOnce(resp(200, validBody)) as unknown as typeof fetch;
    const p = new AnthropicProvider('claude-haiku-4-5', 'k', thresholds, httpWith(fetchImpl));
    const r = await p.analyze(content(), new AbortController().signal);
    expect(r.meta.schemaRepaired).toBe(true);
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
  });

  it('maps 401 to a non-retryable auth error', async () => {
    const fetchImpl = vi.fn(async () => resp(401, '{"error":"bad key"}')) as unknown as typeof fetch;
    const p = new AnthropicProvider('m', 'k', thresholds, httpWith(fetchImpl));
    await expect(p.analyze(content(), new AbortController().signal)).rejects.toMatchObject({
      kind: 'auth',
      retryable: false,
    });
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });

  it('retries a 429 then succeeds', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(resp(429, 'slow down'))
      .mockResolvedValueOnce(resp(200, validBody)) as unknown as typeof fetch;
    const p = new AnthropicProvider('claude-haiku-4-5', 'k', thresholds, httpWith(fetchImpl));
    const r = await p.analyze(content(), new AbortController().signal);
    expect(r.overall).toBe(0.8);
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
  });

  it('without a key: validate fails and analyze throws auth', async () => {
    const p = new AnthropicProvider('m', undefined, thresholds, httpWith(vi.fn() as unknown as typeof fetch));
    expect((await p.validate()).ok).toBe(false);
    await expect(p.analyze(content(), new AbortController().signal)).rejects.toMatchObject({
      kind: 'auth',
    });
  });
});

describe('estimateCost', () => {
  it('prices known model families and skips unknown ones', () => {
    expect(estimateCost('claude-haiku-4-5', 1_000_000, 1_000_000)).toBeCloseTo(6);
    expect(estimateCost('some-unknown-model', 1000, 1000)).toBeUndefined();
  });
});

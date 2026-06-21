import { describe, it, expect, vi } from 'vitest';
import { OpenAICompatProvider, estimateCost } from './openai-compat';
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

const analysisPayload = JSON.stringify({
  overall: 0.7,
  reasoning: 'looks AI-generated',
  segments: [{ index: 0, aiLikelihood: 0.8, rationale: 'formulaic phrasing' }],
});

const validBody = JSON.stringify({
  choices: [{ message: { content: analysisPayload } }],
  usage: { prompt_tokens: 800, completion_tokens: 150 },
});

describe('OpenAICompatProvider', () => {
  it('sends bearer auth plus attribution headers and maps a result with usage and cost', async () => {
    let captured: RequestInit | undefined;
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      captured = init;
      return resp(200, validBody);
    }) as unknown as typeof fetch;

    const p = new OpenAICompatProvider(
      'z-ai/glm-5.2',
      'https://openrouter.ai/api/v1',
      'sk-test',
      thresholds,
      httpWith(fetchImpl),
    );
    const r = await p.analyze(content(), new AbortController().signal);

    const headers = captured!.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer sk-test');
    expect(headers['HTTP-Referer']).toBeDefined();
    expect(headers['X-Title']).toBe('Slopwatch');

    expect(r.provider).toBe('openai_compat');
    expect(r.overall).toBe(0.7);
    expect(r.label).toBe('likely-ai');
    expect(r.ranLocally).toBe(false);
    expect(r.usage?.inputTokens).toBe(800);
    expect(r.usage?.outputTokens).toBe(150);
    expect(r.usage?.estCostUsd).toBeGreaterThan(0);
  });

  it('sends json_schema in response_format on the first call', async () => {
    let parsedBody: unknown;
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      parsedBody = JSON.parse(init!.body as string);
      return resp(200, validBody);
    }) as unknown as typeof fetch;

    const p = new OpenAICompatProvider('z-ai/glm-5.2', 'https://openrouter.ai/api/v1', 'key', thresholds, httpWith(fetchImpl));
    await p.analyze(content(), new AbortController().signal);

    const body = parsedBody as { response_format?: { type?: string } };
    expect(body.response_format?.type).toBe('json_schema');
  });

  it('falls back to json_object when the gateway rejects json_schema with a 400', async () => {
    const rejectBody = JSON.stringify({ error: { message: 'json_schema response_format not supported', code: 'unsupported_value' } });
    let callCount = 0;
    let lastBody: unknown;

    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      callCount++;
      lastBody = JSON.parse(init!.body as string);
      if (callCount === 1) return resp(400, rejectBody);
      return resp(200, validBody);
    }) as unknown as typeof fetch;

    const p = new OpenAICompatProvider('z-ai/glm-5.2', 'https://openrouter.ai/api/v1', 'key', thresholds, httpWith(fetchImpl));
    const r = await p.analyze(content(), new AbortController().signal);

    expect(callCount).toBe(2);
    expect((lastBody as { response_format?: { type?: string } }).response_format?.type).toBe('json_object');
    expect(r.overall).toBe(0.7);
  });

  it('does NOT fall back for a 400 unrelated to json_schema (e.g. bad model name)', async () => {
    const unrelatedError = JSON.stringify({ error: { message: 'model not found', code: 'model_not_found' } });
    const fetchImpl = vi.fn(async () => resp(400, unrelatedError)) as unknown as typeof fetch;

    const p = new OpenAICompatProvider('bad-model', 'https://openrouter.ai/api/v1', 'key', thresholds, httpWith(fetchImpl));
    await expect(p.analyze(content(), new AbortController().signal)).rejects.toMatchObject({
      kind: 'bad_response',
    });
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });

  it('maps 401 to a non-retryable auth error', async () => {
    const fetchImpl = vi.fn(async () => resp(401, '{"error":"bad key"}')) as unknown as typeof fetch;
    const p = new OpenAICompatProvider('m', 'https://openrouter.ai/api/v1', 'k', thresholds, httpWith(fetchImpl));
    await expect(p.analyze(content(), new AbortController().signal)).rejects.toMatchObject({
      kind: 'auth',
      retryable: false,
    });
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });

  it('maps 429 to a retryable rate_limit error', async () => {
    const fetchImpl = vi.fn(async () => resp(429, 'slow down')) as unknown as typeof fetch;
    const p = new OpenAICompatProvider('m', 'https://openrouter.ai/api/v1', 'k', thresholds, httpWith(fetchImpl));
    await expect(p.analyze(content(), new AbortController().signal)).rejects.toMatchObject({
      kind: 'rate_limit',
      retryable: true,
    });
  });

  it('repairs once when the first response is unparseable', async () => {
    const badBody = JSON.stringify({ choices: [{ message: { content: 'not json at all' } }] });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(resp(200, badBody))
      .mockResolvedValueOnce(resp(200, validBody)) as unknown as typeof fetch;

    const p = new OpenAICompatProvider('m', 'https://openrouter.ai/api/v1', 'k', thresholds, httpWith(fetchImpl));
    const r = await p.analyze(content(), new AbortController().signal);

    expect(r.meta.schemaRepaired).toBe(true);
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
  });

  it('without a key: validate fails and analyze throws auth', async () => {
    const p = new OpenAICompatProvider('m', 'https://openrouter.ai/api/v1', undefined, thresholds, httpWith(vi.fn() as unknown as typeof fetch));
    expect((await p.validate()).ok).toBe(false);
    await expect(p.analyze(content(), new AbortController().signal)).rejects.toMatchObject({
      kind: 'auth',
    });
  });

  it('validate returns ok on a successful round-trip', async () => {
    const fetchImpl = vi.fn(async () => resp(200, JSON.stringify({ choices: [] }))) as unknown as typeof fetch;
    const p = new OpenAICompatProvider('z-ai/glm-5.2', 'https://openrouter.ai/api/v1', 'key', thresholds, httpWith(fetchImpl));
    const result = await p.validate();
    expect(result.ok).toBe(true);
    expect(result.detail).toContain('z-ai/glm-5.2');
  });

  it('strips trailing slash from base URL', async () => {
    let url = '';
    const fetchImpl = vi.fn(async (u: string) => {
      url = u;
      return resp(200, validBody);
    }) as unknown as typeof fetch;

    const p = new OpenAICompatProvider('m', 'https://openrouter.ai/api/v1/', 'k', thresholds, httpWith(fetchImpl));
    await p.analyze(content(), new AbortController().signal);
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
  });
});

describe('estimateCost (openai-compat)', () => {
  it('prices known model slugs and returns undefined for unknown ones', () => {
    expect(estimateCost('z-ai/glm-5.2', 1_000_000, 1_000_000)).toBeCloseTo(1.2 + 4.1);
    expect(estimateCost('gpt-4o-mini', 1_000_000, 1_000_000)).toBeCloseTo(0.15 + 0.6);
    expect(estimateCost('some-unknown-model', 1000, 1000)).toBeUndefined();
  });
});

import { ProviderError, kindFromStatus, type ProviderErrorKind } from '../errors';

/**
 * Shared HTTP for provider adapters: timeout, bounded exponential backoff with
 * jitter for transient errors (429/5xx/network/timeout), and normalization of
 * everything into a typed `ProviderError` (TDD §4 Durability, §8 Error Handling).
 * Never retries 4xx auth/validation. `fetchImpl`/`sleep` are injectable for tests.
 */

export interface HttpDeps {
  fetchImpl: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  timeoutMs: number;
  maxRetries: number;
  /** Backoff delays (ms) per retry; jitter is added. */
  backoff: number[];
}

export const DEFAULT_HTTP: HttpDeps = {
  fetchImpl: (...args) => globalThis.fetch(...args),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  timeoutMs: 30_000,
  maxRetries: 2,
  backoff: [500, 2000, 8000],
};

export interface JsonRequest {
  url: string;
  method?: string;
  headers: Record<string, string>;
  body: unknown;
  /** External cancellation (e.g. user cancel). */
  signal: AbortSignal;
  /** How to classify an opaque fetch failure for this host (Ollama → cors). */
  networkFailureKind?: Extract<ProviderErrorKind, 'network' | 'cors'>;
  /** Provider name for friendly messages. */
  providerLabel: string;
}

interface RawResponse {
  status: number;
  ok: boolean;
  text: string;
}

export async function requestJson(req: JsonRequest, deps: HttpDeps = DEFAULT_HTTP): Promise<unknown> {
  const failKind = req.networkFailureKind ?? 'network';
  let lastError: ProviderError | undefined;

  for (let attempt = 0; attempt <= deps.maxRetries; attempt++) {
    if (req.signal.aborted) {
      throw new ProviderError('timeout', 'Analysis was cancelled.', { retryable: false });
    }

    let res: RawResponse;
    try {
      res = await doFetch(req, deps);
    } catch (err) {
      lastError = classifyFetchError(err, req, failKind);
      if (lastError.retryable && attempt < deps.maxRetries) {
        await deps.sleep(backoffDelay(deps.backoff, attempt));
        continue;
      }
      throw lastError;
    }

    if (res.ok) {
      return parseJson(res.text, req.providerLabel);
    }

    const kind = kindFromStatus(res.status);
    lastError = new ProviderError(kind, httpMessage(kind, req.providerLabel, res.status), {
      detail: truncate(res.text),
    });
    if (lastError.retryable && attempt < deps.maxRetries) {
      await deps.sleep(backoffDelay(deps.backoff, attempt));
      continue;
    }
    throw lastError;
  }

  throw lastError ?? new ProviderError('unknown', 'Request failed.');
}

async function doFetch(req: JsonRequest, deps: HttpDeps): Promise<RawResponse> {
  const timeout = AbortSignal.timeout(deps.timeoutMs);
  const signal = AbortSignal.any([req.signal, timeout]);
  const res = await deps.fetchImpl(req.url, {
    method: req.method ?? 'POST',
    headers: { 'content-type': 'application/json', ...req.headers },
    body: JSON.stringify(req.body),
    signal,
  });
  return { status: res.status, ok: res.ok, text: await res.text() };
}

function classifyFetchError(
  err: unknown,
  req: JsonRequest,
  failKind: 'network' | 'cors',
): ProviderError {
  // External cancellation.
  if (req.signal.aborted) {
    return new ProviderError('timeout', 'Analysis was cancelled.', { retryable: false });
  }
  // Our own timeout fired.
  if (err instanceof DOMException && err.name === 'TimeoutError') {
    return new ProviderError('timeout', `${req.providerLabel} took too long to respond.`);
  }
  if (err instanceof ProviderError) return err;
  // Opaque network/CORS failure (TypeError: Failed to fetch).
  const message =
    failKind === 'cors'
      ? `${req.providerLabel} refused the request from this extension.`
      : `Couldn't reach ${req.providerLabel}.`;
  return new ProviderError(failKind, message, {
    retryable: failKind === 'network',
    detail: err instanceof Error ? err.message : String(err),
  });
}

function parseJson(text: string, providerLabel: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new ProviderError('bad_response', `${providerLabel} returned a non-JSON response.`, {
      detail: truncate(text),
    });
  }
}

function httpMessage(kind: ProviderErrorKind, label: string, status: number): string {
  switch (kind) {
    case 'auth':
      return `${label} rejected the request (auth, HTTP ${status}).`;
    case 'rate_limit':
      return `${label} is rate-limiting requests (HTTP ${status}).`;
    case 'network':
      return `${label} had a server error (HTTP ${status}).`;
    default:
      return `${label} returned an unexpected response (HTTP ${status}).`;
  }
}

function backoffDelay(backoff: number[], attempt: number): number {
  const base = backoff[Math.min(attempt, backoff.length - 1)] ?? 1000;
  // Deterministic-ish jitter without Math.random in hot paths is unnecessary here;
  // a small +/-20% jitter spreads retry storms.
  const jitter = base * 0.2 * (((attempt * 2654435761) % 100) / 100 - 0.5) * 2;
  return Math.max(0, Math.round(base + jitter));
}

function truncate(s: string, max = 500): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

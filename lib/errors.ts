/**
 * ProviderError taxonomy (TDD.md §8 "Error Handling"). Every provider failure is
 * normalized into one of these kinds; the UI maps each kind to a specific,
 * human-friendly remediation. Raw HTTP bodies never reach ordinary users.
 */

export type ProviderErrorKind =
  | 'auth'
  | 'rate_limit'
  | 'network'
  | 'timeout'
  | 'bad_response'
  | 'cors'
  | 'unknown';

export class ProviderError extends Error {
  readonly kind: ProviderErrorKind;
  readonly retryable: boolean;
  /** Optional raw detail — only ever shown in the local diagnostics view. */
  readonly detail?: string;

  constructor(
    kind: ProviderErrorKind,
    message: string,
    options?: { retryable?: boolean; detail?: string; cause?: unknown },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'ProviderError';
    this.kind = kind;
    this.retryable = options?.retryable ?? defaultRetryable(kind);
    this.detail = options?.detail;
  }
}

function defaultRetryable(kind: ProviderErrorKind): boolean {
  return kind === 'rate_limit' || kind === 'network' || kind === 'timeout';
}

/** Map an HTTP status code to a ProviderError kind. */
export function kindFromStatus(status: number): ProviderErrorKind {
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate_limit';
  if (status >= 500) return 'network';
  return 'bad_response';
}

/** A plain, serializable shape safe to send across the message boundary. */
export interface SerializedProviderError {
  __providerError: true;
  kind: ProviderErrorKind;
  message: string;
  retryable: boolean;
  detail?: string;
}

export function serializeProviderError(err: unknown): SerializedProviderError {
  if (err instanceof ProviderError) {
    return {
      __providerError: true,
      kind: err.kind,
      message: err.message,
      retryable: err.retryable,
      detail: err.detail,
    };
  }
  return {
    __providerError: true,
    kind: 'unknown',
    message: err instanceof Error ? err.message : String(err),
    retryable: false,
  };
}

export function isSerializedProviderError(value: unknown): value is SerializedProviderError {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { __providerError?: unknown }).__providerError === true
  );
}

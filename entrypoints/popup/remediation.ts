import type { ProviderErrorKind } from '@/lib/errors';

/**
 * Maps each ProviderError kind to a plain, kind, actionable message + fix
 * (USABILITY Error UX table). Never surfaces raw HTTP bodies.
 */
export interface Remediation {
  message: string;
  fix: string;
  canRetry: boolean;
}

export function remediationFor(kind: ProviderErrorKind, provider: string): Remediation {
  switch (kind) {
    case 'auth':
      return {
        message: `That key was rejected by ${provider}.`,
        fix: 'Re-enter your API key in settings and try again.',
        canRetry: false,
      };
    case 'rate_limit':
      return {
        message: `${provider} is rate-limiting requests right now.`,
        fix: 'Wait a moment, then try again.',
        canRetry: true,
      };
    case 'network':
      return {
        message: `Couldn't reach ${provider}.`,
        fix: 'Check your connection and retry.',
        canRetry: true,
      };
    case 'timeout':
      return {
        message: `${provider} took too long to respond.`,
        fix: 'Try again, or pick a faster model.',
        canRetry: true,
      };
    case 'cors':
      return {
        message: 'Ollama refused the request from this extension.',
        fix: 'Set OLLAMA_ORIGINS to allow the extension origin and restart Ollama, then retry.',
        canRetry: true,
      };
    case 'bad_response':
      return {
        message: "The model returned something we couldn't read.",
        fix: 'Retry, or try a different / larger model.',
        canRetry: true,
      };
    case 'unknown':
    default:
      return {
        message: 'Something went wrong.',
        fix: 'Try again. If it persists, check your provider settings.',
        canRetry: true,
      };
  }
}

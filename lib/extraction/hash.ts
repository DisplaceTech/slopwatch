/**
 * Content hashing for cache keys (TDD §6: sha256(url + normalizedContent)).
 * Normalization makes the hash stable across whitespace-insignificant changes
 * while still changing on meaningful edits.
 */

/** Collapse runs of whitespace and trim each block, then join with newlines. */
export function normalizeForHash(texts: string[]): string {
  return texts.map((t) => t.replace(/\s+/g, ' ').trim()).join('\n');
}

export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function computeContentHash(url: string, texts: string[]): Promise<string> {
  return sha256Hex(`${url}\n${normalizeForHash(texts)}`);
}

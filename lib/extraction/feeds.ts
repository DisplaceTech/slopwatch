/**
 * Per-platform feed extractors (Story 11). Social feeds defeat Readability
 * (infinite scroll, no single article node), so for a named allowlist we collect
 * the primary post + comment bodies as live elements directly. The long tail
 * falls back to the generic visible-text extractor.
 *
 * Each extractor returns *live* elements in document order; the segmenter aligns
 * them to indices so highlights still map (AD-5). Selectors are intentionally
 * forgiving (multiple fallbacks) because feed DOMs drift.
 */

export interface FeedExtractor {
  id: string;
  matches(url: URL): boolean;
  /** Live candidate elements (post + comment bodies), document order. */
  collect(doc: Document): HTMLElement[];
  title(doc: Document): string | undefined;
}

function queryAll(doc: ParentNode, selectors: string[]): HTMLElement[] {
  const out: HTMLElement[] = [];
  const seen = new Set<Element>();
  for (const sel of selectors) {
    for (const el of doc.querySelectorAll<HTMLElement>(sel)) {
      if (!seen.has(el)) {
        seen.add(el);
        out.push(el);
      }
    }
  }
  return out;
}

const hackerNews: FeedExtractor = {
  id: 'hacker-news',
  matches: (url) => url.hostname.endsWith('news.ycombinator.com'),
  collect: (doc) => queryAll(doc, ['.toptext', '.commtext']),
  title: (doc) => doc.querySelector('.titleline > a')?.textContent ?? doc.title,
};

const reddit: FeedExtractor = {
  id: 'reddit',
  matches: (url) => url.hostname.endsWith('reddit.com'),
  collect: (doc) =>
    queryAll(doc, [
      '[slot="text-body"]',
      '[data-testid="post-rtjson-content"]',
      '[data-click-id="text"]',
      '[data-testid="comment"]',
      'shreddit-comment [slot="comment"]',
    ]),
  title: (doc) =>
    doc.querySelector('h1[slot="title"], h1')?.textContent ?? doc.title,
};

/** The v1 allowlist. Add platforms here as their DOMs are validated by fixtures. */
export const FEED_EXTRACTORS: FeedExtractor[] = [hackerNews, reddit];

export function findFeedExtractor(url: string): FeedExtractor | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  return FEED_EXTRACTORS.find((e) => e.matches(parsed));
}

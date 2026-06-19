import { Readability, isProbablyReaderable } from '@mozilla/readability';
import type { ExtractedContent } from '../types';
import { segmentCandidates } from './segmenter';
import { computeContentHash } from './hash';
import { findFeedExtractor } from './feeds';

export type ExtractionStrategy = 'feed' | 'readability' | 'generic';

/**
 * Readability-based extraction (Story 3). Gates on `isProbablyReaderable`, then
 * collects the *live* block elements of the main content region so the
 * annotation layer can map a segment index back to its on-page element (AD-5).
 *
 * Metadata (title/siteName) comes from Readability run on a CLONE — Readability
 * mutates the document it parses, and we must not disturb the live DOM we will
 * later highlight.
 */

const BLOCK_SELECTOR = 'p, li, blockquote, h1, h2, h3, h4';
const EXCLUDE_SELECTOR = 'nav, footer, aside, header, form, [aria-hidden="true"], [role="navigation"]';
const ROOT_CANDIDATES = [
  'article',
  'main',
  '[role="main"]',
  '#content',
  '.content',
  '.post',
  '.entry-content',
  '.article-body',
  '.post-content',
];

export interface ExtractionResult {
  content: ExtractedContent;
  /** Live elements parallel to content.segments (elements[i] ↔ segments[i]). */
  elements: HTMLElement[];
}

export function isLikelyArticle(doc: Document): boolean {
  try {
    return isProbablyReaderable(doc);
  } catch {
    return false;
  }
}

/** Pick the content root: the candidate whose paragraphs hold the most text. */
export function findContentRoot(doc: Document): HTMLElement {
  let best: HTMLElement | null = null;
  let bestScore = 0;
  const seen = new Set<HTMLElement>();
  for (const sel of ROOT_CANDIDATES) {
    for (const el of doc.querySelectorAll<HTMLElement>(sel)) {
      if (seen.has(el)) continue;
      seen.add(el);
      const score = paragraphTextLength(el);
      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    }
  }
  return best ?? doc.body;
}

function paragraphTextLength(el: HTMLElement): number {
  let total = 0;
  for (const p of el.querySelectorAll('p')) total += (p.textContent ?? '').trim().length;
  return total;
}

function isExcluded(el: HTMLElement): boolean {
  return el.closest(EXCLUDE_SELECTOR) !== null;
}

/** Collect leaf block elements under a root, excluding chrome and wrappers. */
export function collectBlocks(root: ParentNode): { payload: HTMLElement; text: string }[] {
  const out: { payload: HTMLElement; text: string }[] = [];
  for (const el of root.querySelectorAll<HTMLElement>(BLOCK_SELECTOR)) {
    if (isExcluded(el)) continue;
    // Skip a block that merely wraps other counted blocks (avoid double-counting).
    if (el.querySelector(BLOCK_SELECTOR)) continue;
    out.push({ payload: el, text: el.textContent ?? '' });
  }
  return out;
}

/** Generic visible-text fallback for layouts Readability rejects and no feed matches. */
export function genericVisibleTextCandidates(doc: Document): { payload: HTMLElement; text: string }[] {
  return collectBlocks(doc.body ?? doc.documentElement);
}

/**
 * Extract primary content, choosing a strategy:
 *   1. a named feed extractor if the URL matches the allowlist,
 *   2. else Readability (articles),
 *   3. else the generic visible-text fallback.
 * Returns null only when no strategy yields any qualifying segment.
 */
export async function extractContent(
  doc: Document,
  url: string,
): Promise<(ExtractionResult & { strategy: ExtractionStrategy }) | null> {
  let strategy: ExtractionStrategy;
  let candidates: { payload: HTMLElement; text: string }[];
  let title = doc.title || '';
  let siteName: string | undefined;

  const feed = findFeedExtractor(url);
  if (feed) {
    strategy = 'feed';
    candidates = feed.collect(doc).map((el) => ({ payload: el, text: el.textContent ?? '' }));
    title = feed.title(doc) ?? title;
  } else if (isLikelyArticle(doc)) {
    strategy = 'readability';
    try {
      const clone = doc.cloneNode(true) as Document;
      const article = new Readability(clone).parse();
      if (article?.title) title = article.title;
      if (article?.siteName) siteName = article.siteName;
    } catch {
      // Fall back to document.title; extraction can still proceed from live nodes.
    }
    candidates = collectBlocks(findContentRoot(doc));
  } else {
    strategy = 'generic';
    candidates = genericVisibleTextCandidates(doc);
  }

  const { segments, kept } = segmentCandidates(candidates);
  if (segments.length === 0) return null;

  const contentHash = await computeContentHash(url, segments.map((s) => s.text));
  return {
    strategy,
    content: {
      url,
      title: title.trim() || 'Untitled',
      siteName,
      segments,
      truncated: false,
      sampledFraction: 1,
      contentHash,
    },
    elements: kept,
  };
}

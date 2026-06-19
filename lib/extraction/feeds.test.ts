// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { findFeedExtractor, FEED_EXTRACTORS } from './feeds';
import { extractContent, genericVisibleTextCandidates } from './readability';

function loadDoc(name: string): Document {
  const html = readFileSync(resolve(process.cwd(), 'tests/fixtures/pages', name), 'utf8');
  return new DOMParser().parseFromString(html, 'text/html');
}

describe('feed extractor dispatch', () => {
  it('matches allowlisted hosts and ignores others', () => {
    expect(findFeedExtractor('https://news.ycombinator.com/item?id=1')?.id).toBe('hacker-news');
    expect(findFeedExtractor('https://www.reddit.com/r/x/comments/abc/title/')?.id).toBe('reddit');
    expect(findFeedExtractor('https://example.com/article')).toBeUndefined();
    expect(findFeedExtractor('not a url')).toBeUndefined();
  });

  it('every allowlist entry has a stable id', () => {
    expect(new Set(FEED_EXTRACTORS.map((e) => e.id)).size).toBe(FEED_EXTRACTORS.length);
  });
});

describe('Hacker News extractor', () => {
  it('extracts the story text and comments as primary content', async () => {
    const doc = loadDoc('hacker-news.html');
    const result = await extractContent(doc, 'https://news.ycombinator.com/item?id=1');
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.strategy).toBe('feed');
    expect(result.content.title).toContain('Show HN');
    // toptext + two comments.
    expect(result.content.segments.length).toBe(3);
    expect(result.content.segments.some((s) => s.text.includes('lived detail'))).toBe(true);
    // Navigation chrome is not collected.
    expect(result.content.segments.some((s) => s.text.includes('guidelines'))).toBe(false);
    expect(result.elements).toHaveLength(3);
  });
});

describe('Reddit extractor', () => {
  it('extracts the post body and comments, excluding nav/footer', async () => {
    const doc = loadDoc('reddit.html');
    const result = await extractContent(doc, 'https://www.reddit.com/r/example/comments/a/t/');
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.strategy).toBe('feed');
    expect(result.content.segments.length).toBe(3);
    expect(result.content.segments.some((s) => s.text.includes('body of the post'))).toBe(true);
    expect(result.content.segments.some((s) => s.text.includes('careers'))).toBe(false);
  });
});

describe('generic visible-text fallback', () => {
  it('produces non-empty candidates on a div-based layout', () => {
    const doc = new DOMParser().parseFromString(
      `<body><div id="app">
         <p>${'A long enough paragraph of prose to count as a real segment here. '.repeat(2)}</p>
         <p>${'Another long enough paragraph of prose to count as a real segment too. '.repeat(2)}</p>
       </div></body>`,
      'text/html',
    );
    const candidates = genericVisibleTextCandidates(doc);
    expect(candidates.length).toBeGreaterThanOrEqual(2);
  });
});

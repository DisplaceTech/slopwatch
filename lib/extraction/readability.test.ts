// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { extractContent, findContentRoot, isLikelyArticle } from './readability';

const PARA = (n: number) =>
  `This is paragraph number ${n}. It contains several sentences of genuine prose so that the ` +
  `extractor treats it as real content rather than navigational boilerplate or chrome. ` +
  `It is comfortably longer than the minimum segment length threshold.`;

function setArticle() {
  document.title = 'Test Article';
  document.body.innerHTML = `
    <nav><a href="/">Home</a><a href="/about">About</a></nav>
    <main>
      <article>
        <h1>Test Article</h1>
        <p>${PARA(1)}</p>
        <p>${PARA(2)}</p>
        <p>${PARA(3)}</p>
        <p>${PARA(4)}</p>
        <p>short</p>
      </article>
    </main>
    <footer><p>Copyright stuff that should be excluded from the body.</p></footer>
  `;
}

function setThinPage() {
  document.title = 'App';
  document.body.innerHTML = `
    <nav><a href="/">Home</a></nav>
    <div id="app"><button>Click</button></div>
  `;
}

describe('extraction', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('finds the content root with the most paragraph text', () => {
    setArticle();
    const root = findContentRoot(document);
    expect(root.querySelectorAll('p').length).toBeGreaterThanOrEqual(4);
  });

  it('extracts indexed segments aligned to live elements, excluding nav/footer', async () => {
    setArticle();
    const result = await extractContent(document, 'https://example.com/article');
    expect(result).not.toBeNull();
    if (!result) return;

    // 4 real paragraphs kept; the "short" one and nav/footer dropped.
    expect(result.content.segments.length).toBe(4);
    expect(result.content.segments.map((s) => s.index)).toEqual([0, 1, 2, 3]);
    expect(result.elements).toHaveLength(4);
    // elements[i] is the live <p> for segments[i].
    expect(result.elements[0]!.tagName).toBe('P');
    expect(result.content.segments[0]!.text).toContain('paragraph number 1');
    expect(result.content.contentHash).toMatch(/^[0-9a-f]{64}$/);
    // Footer text must not appear in any segment.
    expect(result.content.segments.some((s) => s.text.includes('Copyright'))).toBe(false);
  });

  it('yields no content on a thin/app-shell page', async () => {
    setThinPage();
    const likely = isLikelyArticle(document);
    const result = await extractContent(document, 'https://example.com/app');
    // Either the gate rejects it, or there are no qualifying segments.
    expect(likely === false || result === null).toBe(true);
  });
});

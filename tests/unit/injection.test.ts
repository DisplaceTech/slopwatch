// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { extractContent } from '@/lib/extraction';
import { buildPrompt } from '@/lib/analysis/prompt';

/**
 * End-to-end prompt-injection hardening (Story 11): a hostile page's text must
 * land inside the escaped/delimited content region and never in the instruction
 * region, and must not be able to close the delimiters early.
 */
describe('prompt-injection hardening (adversarial fixture)', () => {
  it('confines hostile page text to the escaped content region', async () => {
    const html = readFileSync(
      resolve(process.cwd(), 'tests/fixtures/pages/adversarial.html'),
      'utf8',
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const result = await extractContent(doc, 'https://example.com/adversarial');
    expect(result).not.toBeNull();
    if (!result) return;

    const { user } = buildPrompt(result.content);

    // The injection phrase appears only on <paragraph> lines, never bare.
    const injectionLines = user.split('\n').filter((l) => l.includes('Ignore all previous'));
    expect(injectionLines.length).toBeGreaterThan(0);
    for (const line of injectionLines) {
      expect(line).toContain('<paragraph index="');
    }

    // The fake closing tags are escaped and cannot terminate the content block.
    expect(user).not.toContain('</paragraph></content>');
    expect(user).toContain('&lt;/paragraph&gt;&lt;/content&gt;');

    // The instruction framing is intact and the content region is well-formed:
    // exactly one opening and one closing <content> tag.
    expect(user.match(/<content>/g)?.length).toBe(1);
    expect(user.match(/<\/content>/g)?.length).toBe(1);
  });
});

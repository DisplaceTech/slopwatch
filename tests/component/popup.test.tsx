// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import axe from 'axe-core';
import { App, Results } from '@/entrypoints/popup/App';
import { setSecret } from '@/lib/storage';
import type { AnalysisResult } from '@/lib/types';

afterEach(cleanup);

async function expectNoCriticalA11y(container: HTMLElement) {
  // color-contrast can't be measured without real layout (happy-dom); region is
  // not meaningful for a popup fragment.
  const results = await axe.run(container, {
    rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
  });
  const serious = results.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious',
  );
  expect(serious.map((v) => v.id)).toEqual([]);
}

function aiResult(): AnalysisResult {
  return {
    overall: 0.82,
    label: 'likely-ai',
    reasoning: 'Uniform cadence and generic transitions throughout.',
    segments: [{ index: 0, aiLikelihood: 0.9, rationale: 'Low burstiness.' }],
    provider: 'anthropic',
    model: 'claude-haiku-4-5',
    ranLocally: false,
    usage: { inputTokens: 1000, outputTokens: 200, estCostUsd: 0.002 },
    meta: { latencyMs: 1200, truncated: false, sampledFraction: 1, schemaRepaired: false },
    createdAt: 0,
  };
}

describe('popup', () => {
  it('prompts setup (no Run) when no provider is configured', async () => {
    // Default provider is Anthropic with no key → not configured.
    render(<App />);
    expect(await screen.findByRole('button', { name: /open settings/i })).toBeInTheDocument();
    expect(screen.getByText(/no analysis provider is set up/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /run analysis/i })).not.toBeInTheDocument();
    // The permanent caveat is still shown.
    expect(screen.getByText(/probabilistic estimate from a language model/i)).toBeInTheDocument();
  });

  it('shows the Run button once a provider is configured', async () => {
    await setSecret('anthropic', 'sk-ant-test', false);
    render(<App />);
    expect(await screen.findByRole('button', { name: /run analysis/i })).toBeInTheDocument();
    expect(document.querySelector('.privacy')).toBeTruthy();
  });

  it('Results shows score + label + reasoning together — never a bare verdict', () => {
    const { container } = render(<Results result={aiResult()} cached={false} onRerun={() => {}} />);
    expect(screen.getByText('82%')).toBeInTheDocument();
    expect(screen.getByText('Likely AI-generated')).toBeInTheDocument();
    expect(screen.getByText(/uniform cadence/i)).toBeInTheDocument();
    // Result region carries an accessible label announcing percent + label.
    expect(container.querySelector('[aria-label*="82 percent"]')).toBeTruthy();
    // No standalone bare "AI" / "Human" verdict node.
    const labels = [...container.querySelectorAll('.label')].map((n) => n.textContent?.trim());
    expect(labels).not.toContain('AI');
    expect(labels).not.toContain('Human');
  });

  it('surfaces the sampled notice and cost detail', () => {
    const r = { ...aiResult(), meta: { ...aiResult().meta, truncated: true, sampledFraction: 0.4 } };
    render(<Results result={r} cached onRerun={() => {}} />);
    expect(screen.getByText(/Analyzed ~40%/)).toBeInTheDocument();
    expect(screen.getByText(/Showing a saved result/)).toBeInTheDocument();
    expect(screen.getByText(/\$0\.0020/)).toBeInTheDocument();
  });

  it('has no critical/serious a11y violations in the results view', async () => {
    const { container } = render(<Results result={aiResult()} cached={false} onRerun={() => {}} />);
    await expectNoCriticalA11y(container);
  });
});

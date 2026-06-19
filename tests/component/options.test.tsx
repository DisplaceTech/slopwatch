// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import axe from 'axe-core';
import { App } from '@/entrypoints/options/App';
import { getSettings, hasSecret } from '@/lib/storage';

afterEach(cleanup);

describe('options', () => {
  it('renders provider selection, key entry, thresholds, and appearance', async () => {
    render(<App />);
    // Loads async from storage.
    expect(await screen.findByRole('heading', { name: /slopwatch settings/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /anthropic/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /ollama/i })).toBeInTheDocument();
    // Key field (not configured by default) is a password input — write-only.
    const key = screen.getByLabelText(/api key/i) as HTMLInputElement;
    expect(key.type).toBe('password');
    expect(screen.getByLabelText(/likely human below/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/highlight style/i)).toBeInTheDocument();
  });

  it('shows the at-rest warning only when persistence is opted in', async () => {
    render(<App />);
    const checkbox = await screen.findByRole('checkbox', { name: /remember my key/i });
    expect(screen.queryByText(/stored unencrypted/i)).not.toBeInTheDocument();
    fireEvent.click(checkbox);
    expect(await screen.findByText(/stored unencrypted/i)).toBeInTheDocument();
  });

  it('saves the key write-only (configured state, never echoed) and can clear it', async () => {
    render(<App />);
    const key = (await screen.findByLabelText(/api key/i)) as HTMLInputElement;
    fireEvent.change(key, { target: { value: 'sk-ant-secret' } });
    fireEvent.click(screen.getByRole('button', { name: /save key/i }));

    await waitFor(() => expect(screen.getByText(/configured/i)).toBeInTheDocument());
    // The secret is stored but never rendered back.
    expect(screen.queryByDisplayValue('sk-ant-secret')).not.toBeInTheDocument();
    expect(await hasSecret('anthropic')).toBe(true);
    // Selecting/saving marks onboarding complete.
    expect((await getSettings()).onboarded).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /clear key/i }));
    await waitFor(() => expect(screen.queryByText(/configured/i)).not.toBeInTheDocument());
  });

  it('enforces a non-zero Uncertain band when dragging thresholds together', async () => {
    render(<App />);
    const human = (await screen.findByLabelText(/likely human below/i)) as HTMLInputElement;
    // Try to push the human threshold above the AI threshold.
    fireEvent.change(human, { target: { value: '0.95' } });
    await waitFor(async () => {
      const s = await getSettings();
      expect(s.thresholds.aiMin - s.thresholds.humanMax).toBeGreaterThanOrEqual(0.1 - 1e-9);
    });
  });

  it('has no critical/serious a11y violations', async () => {
    const { container } = render(<App />);
    await screen.findByRole('heading', { name: /slopwatch settings/i });
    const results = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
    });
    const serious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(serious.map((v) => v.id)).toEqual([]);
  });
});

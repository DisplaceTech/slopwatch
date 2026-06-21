import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: '.',
  // MV3 for both targets (TDD §6): Chromium service worker, Firefox
  // non-persistent event page. Firefox MV3 requires Gecko >= 115.
  manifestVersion: 3,
  manifest: {
    name: 'Slopwatch',
    description:
      'On click, estimate how likely the current page was AI-generated — a probabilistic signal with reasoning, never a bare verdict.',
    // Inert by default (AD-2): activeTab grants transient access only at click time.
    // No <all_urls>; provider hosts are requested at runtime (AD-3).
    permissions: ['activeTab', 'storage', 'scripting'],
    optional_host_permissions: [
      'https://api.anthropic.com/*',
      'https://api.openai.com/*',
      'https://openrouter.ai/*',
      'http://localhost/*',
      'http://127.0.0.1/*',
    ],
    action: {
      default_title: 'Run Slopwatch on this page',
    },
    browser_specific_settings: {
      gecko: {
        id: 'slopwatch@displace.tech',
        strict_min_version: '115.0',
      },
    },
  },
});

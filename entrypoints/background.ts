import { defineBackground } from 'wxt/utils/define-background';
import { browser } from 'wxt/browser';
import { onBackgroundMessage, sendToTab } from '@/lib/messaging';
import { getSettings } from '@/lib/storage';
import { createProvider } from '@/lib/providers';
import { serializeProviderError } from '@/lib/errors';
import { Orchestrator } from '@/lib/orchestrator';
import { getCached, setCached } from '@/lib/cache';
import { recordDiagnostic } from '@/lib/diagnostics';
import type { AnalysisResult } from '@/lib/types';

/**
 * Background entrypoint (event page on Firefox, service worker on Chromium).
 * Thin: it wires real browser dependencies into the Orchestrator and routes
 * typed messages. All analysis logic lives in lib/orchestrator (testable).
 */
export default defineBackground(() => {
  async function setBadge(tabId: number, text: string): Promise<void> {
    try {
      await browser.action.setBadgeText({ tabId, text });
      if (text) await browser.action.setBadgeBackgroundColor({ tabId, color: '#6b4ea0' });
    } catch {
      // Best-effort; tab may be gone.
    }
  }

  const orchestrator = new Orchestrator({
    getSettings,
    createProvider,
    injectInpage: async (tabId) => {
      await browser.scripting.executeScript({ target: { tabId }, files: ['/inpage.js'] });
    },
    extract: (tabId) => sendToTab(tabId, { channel: 'content', type: 'extract' }),
    annotate: async (tabId: number, result: AnalysisResult) => {
      try {
        const { appearance } = await getSettings();
        await sendToTab(tabId, { channel: 'content', type: 'annotate', result, appearance });
      } catch {
        // Page may block injection; the popup still shows the result.
      }
    },
    setBadge,
    cacheGet: getCached,
    cacheSet: setCached,
    recordRun: recordDiagnostic,
  });

  function resetTab(tabId: number): void {
    orchestrator.forgetTab(tabId);
    void setBadge(tabId, '');
  }

  browser.tabs.onRemoved.addListener((tabId) => orchestrator.forgetTab(tabId));
  // Reset on a top-level navigation: a new document is loading (full nav) or the
  // URL changed. SPA route changes that don't reload are reported by the in-page
  // script via the 'navigated' message below.
  browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.url || changeInfo.status === 'loading') {
      resetTab(tabId);
    }
  });

  onBackgroundMessage(async (msg, sender) => {
    switch (msg.type) {
      case 'getStatus':
        return orchestrator.getStatus(msg.tabId);
      case 'analyze':
        return orchestrator.analyze(msg.tabId, msg.force);
      case 'cancel':
        orchestrator.cancel(msg.tabId);
        return { ok: true };
      case 'navigated': {
        // Sent by the in-page script on an SPA route change. Reset the sender's tab.
        if (sender.tab?.id !== undefined) resetTab(sender.tab.id);
        return { ok: true };
      }
      case 'testConnection': {
        const settings = await getSettings();
        try {
          const provider = await createProvider({ ...settings, activeProvider: msg.provider });
          return await provider.validate();
        } catch (err) {
          return { ok: false, detail: serializeProviderError(err).message };
        }
      }
      case 'listModels': {
        const settings = await getSettings();
        try {
          const provider = await createProvider({ ...settings, activeProvider: msg.provider });
          const models = provider.listModels ? await provider.listModels() : [];
          return { ok: true, models };
        } catch (err) {
          return { ok: false, error: serializeProviderError(err) };
        }
      }
    }
  });
});

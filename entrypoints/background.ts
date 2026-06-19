import { defineBackground } from 'wxt/utils/define-background';
import { onBackgroundMessage, type TabStatus } from '@/lib/messaging';
import { getSettings } from '@/lib/storage';

/**
 * Background orchestrator (event page on Firefox, service worker on Chromium).
 * M0: stub that answers status/cancel so the popup can render. The click→extract
 * →analyze→annotate pipeline is wired in M1.
 */
export default defineBackground(() => {
  onBackgroundMessage(async (msg) => {
    switch (msg.type) {
      case 'getStatus': {
        const settings = await getSettings();
        const status: TabStatus = {
          phase: 'idle',
          context: {
            provider: settings.activeProvider,
            model: settings.providers[settings.activeProvider].model,
            ranLocally: settings.activeProvider === 'ollama',
          },
        };
        return status;
      }
      case 'cancel':
        return { ok: true };
      case 'analyze':
        // Implemented in M1.
        return { status: 'error', error: { __providerError: true, kind: 'unknown', message: 'Not implemented yet', retryable: false } };
      case 'testConnection':
        return { ok: false, detail: 'Not implemented yet' };
      case 'listModels':
        return { ok: false, error: { __providerError: true, kind: 'unknown', message: 'Not implemented yet', retryable: false } };
    }
  });
});

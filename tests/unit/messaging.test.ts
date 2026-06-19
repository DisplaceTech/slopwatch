import { describe, it, expect } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import {
  onBackgroundMessage,
  sendToBackground,
  type TabStatus,
} from '@/lib/messaging';

describe('messaging', () => {
  it('delivers a typed background message and its response', async () => {
    onBackgroundMessage(async (msg) => {
      if (msg.type === 'getStatus') {
        const status: TabStatus = {
          phase: 'idle',
          context: { provider: 'mock', model: 'mock-1', ranLocally: false },
        };
        return status;
      }
      return { ok: true } as never;
    });

    const res = await sendToBackground({ channel: 'bg', type: 'getStatus', tabId: 1 });
    expect(res.phase).toBe('idle');
    expect(res.context.provider).toBe('mock');
  });

  it('ignores messages from a foreign channel', async () => {
    let handled = false;
    onBackgroundMessage(async () => {
      handled = true;
      return { ok: true } as never;
    });

    // A content-channel message must not reach the background handler.
    await fakeBrowser.runtime.sendMessage({ channel: 'content', type: 'extract' });
    expect(handled).toBe(false);
  });
});

import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';
import { onContentMessage } from '@/lib/messaging';

/**
 * On-page agent: extraction + the Shadow-DOM annotation layer.
 *
 * This is an UNLISTED script, not a declarative content script: it is injected
 * programmatically by the background at click time via `scripting.executeScript`
 * under the transient `activeTab` grant (AD-2). Declaring it with `matches`
 * would force `<all_urls>` host permissions into the manifest, which the hard
 * invariants forbid. The build emits `content.js`; the background injects it.
 *
 * M0: registers the message channel and replies NoContent. Real extraction +
 * the Shadow-DOM annotation layer land in M1.
 */
export default defineUnlistedScript(() => {
  // Guard against double-injection re-registering the listener on re-click.
  const w = window as unknown as { __slopwatchInjected?: boolean };
  if (w.__slopwatchInjected) return;
  w.__slopwatchInjected = true;

  onContentMessage(async (msg) => {
    switch (msg.type) {
      case 'extract':
        return { ok: false, reason: 'no-content' };
      case 'annotate':
        return { ok: true };
      case 'clearAnnotations':
        return { ok: true };
    }
  });
});

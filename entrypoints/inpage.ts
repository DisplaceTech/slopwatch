import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';
import { onContentMessage, sendToBackground } from '@/lib/messaging';
import { extractContent } from '@/lib/extraction';
import type { AnalysisResult } from '@/lib/types';
import type { Appearance } from '@/lib/storage/settings';

/**
 * On-page agent: extraction + the Shadow-DOM annotation layer (Story 5).
 *
 * Injected programmatically by the background at click time under the transient
 * `activeTab` grant (AD-2) — it is an UNLISTED script, never a declarative
 * content script, so the manifest carries no `<all_urls>` host permission.
 *
 * The live block elements found during extraction are kept in `currentElements`
 * so highlights map a segment index back to its on-page element by reference
 * (AD-5), surviving the round-trip to the background and back.
 */
export default defineUnlistedScript(() => {
  const w = window as unknown as { __slopwatch?: SlopwatchState };
  // Re-injection on re-click reuses the existing state/listener.
  if (w.__slopwatch) {
    return;
  }

  const state: SlopwatchState = { elements: [], layer: null, cleanup: null, annotatedUrl: null };
  w.__slopwatch = state;

  onContentMessage(async (msg) => {
    switch (msg.type) {
      case 'extract': {
        const result = await extractContent(document, location.href);
        if (!result) {
          state.elements = [];
          return { ok: false, reason: 'no-content' };
        }
        state.elements = result.elements;
        return { ok: true, content: result.content };
      }
      case 'annotate': {
        renderHighlights(state, msg.result, msg.appearance);
        state.annotatedUrl = location.href;
        return { ok: true };
      }
      case 'clearAnnotations': {
        teardown(state);
        state.annotatedUrl = null;
        return { ok: true };
      }
    }
  });

  // SPA route changes don't reload the page, so the highlight overlay and the
  // toolbar badge would otherwise persist onto an unrelated view. We can't patch
  // the page's history.pushState from this isolated world, so we POLL
  // location.href (plus popstate/hashchange for instant back/forward). On a URL
  // change away from the analyzed page, tear the overlay down and ask the
  // background to reset this tab.
  installNavigationWatcher(state);
});

function installNavigationWatcher(state: SlopwatchState): void {
  const onNav = () => {
    if (state.annotatedUrl !== null && location.href !== state.annotatedUrl) {
      teardown(state);
      state.annotatedUrl = null;
      void sendToBackground({ channel: 'bg', type: 'navigated' }).catch(() => {});
    }
  };
  window.addEventListener('popstate', onNav);
  window.addEventListener('hashchange', onNav);
  // Catches pushState/replaceState navigations (which the page performs in its
  // own world and we can't hook directly). Cheap; only runs on analyzed pages.
  window.setInterval(onNav, 500);
}

interface SlopwatchState {
  elements: HTMLElement[];
  layer: ShadowRoot | null;
  cleanup: (() => void) | null;
  /** URL at which the current highlights/badge were produced (for nav reset). */
  annotatedUrl: string | null;
}

const HOST_ID = 'slopwatch-annotation-host';

const STYLES = `
  :host { all: initial; }
  .box {
    position: absolute;
    box-sizing: border-box;
    border-radius: 3px;
    pointer-events: auto;
    cursor: help;
    transition: outline-color 120ms ease;
  }
  .tooltip {
    position: absolute;
    max-width: 280px;
    padding: 8px 10px;
    border-radius: 8px;
    background: #1c1c1e;
    color: #f2f2f2;
    font: 12px/1.4 system-ui, -apple-system, sans-serif;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
    z-index: 1;
    pointer-events: none;
    opacity: 0;
    transition: opacity 100ms ease;
  }
  .tooltip strong { color: #c9b6ef; }
  @media (prefers-reduced-motion: reduce) {
    .box, .tooltip { transition: none; }
  }
`;

function teardown(state: SlopwatchState): void {
  state.cleanup?.();
  state.cleanup = null;
  document.getElementById(HOST_ID)?.remove();
  state.layer = null;
}

function renderHighlights(
  state: SlopwatchState,
  result: AnalysisResult,
  appearance?: Appearance,
): void {
  teardown(state);
  if (result.segments.length === 0) return;
  const hlStyle = appearance?.highlightStyle ?? 'background';
  const highContrast = appearance?.highContrast ?? false;

  const host = document.createElement('div');
  host.id = HOST_ID;
  host.style.cssText =
    'all:initial;position:absolute;top:0;left:0;width:0;height:0;z-index:2147483647;pointer-events:none;';
  // Closed shadow root: page scripts can't reach in, our styles can't leak out (AD-6).
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = STYLES;
  shadow.append(style);

  const tooltip = document.createElement('div');
  tooltip.className = 'tooltip';
  tooltip.setAttribute('role', 'status');
  shadow.append(tooltip);

  const boxes: { el: HTMLElement; box: HTMLDivElement }[] = [];
  for (const seg of result.segments) {
    const el = state.elements[seg.index];
    if (!el) continue;
    const pct = Math.round(seg.aiLikelihood * 100);
    const box = document.createElement('div');
    box.className = 'box';
    // Intensity encodes confidence; paired with text/shape, never color alone.
    const alpha = (highContrast ? 0.25 : 0.12) + seg.aiLikelihood * (highContrast ? 0.45 : 0.3);
    const accent = highContrast ? '90, 62, 156' : '107, 78, 160';
    const outlineWidth = highContrast ? 3 : 2;
    if (hlStyle === 'background') {
      box.style.background = `rgba(${accent}, ${alpha.toFixed(3)})`;
      box.style.outline = `${outlineWidth}px solid rgba(${accent}, 0.55)`;
    } else if (hlStyle === 'underline') {
      box.style.borderBottom = `${outlineWidth + 1}px solid rgba(${accent}, 0.85)`;
    } else {
      // 'box'
      box.style.outline = `${outlineWidth}px solid rgba(${accent}, 0.85)`;
    }
    box.setAttribute('role', 'note');
    box.setAttribute('aria-label', `Likely AI-generated: ${pct} percent. ${seg.rationale}`);

    const label = `Likely AI-generated: ${pct}%`;
    box.addEventListener('mouseenter', () => {
      tooltip.innerHTML = `<strong>${escapeHtml(label)}</strong><br>${escapeHtml(seg.rationale)}`;
      positionTooltip(tooltip, box);
      tooltip.style.opacity = '1';
    });
    box.addEventListener('mouseleave', () => {
      tooltip.style.opacity = '0';
    });

    shadow.append(box);
    boxes.push({ el, box });
  }

  (document.body ?? document.documentElement).append(host);
  state.layer = shadow;

  const reposition = () => {
    for (const { el, box } of boxes) {
      const rect = el.getBoundingClientRect();
      box.style.top = `${rect.top + window.scrollY}px`;
      box.style.left = `${rect.left + window.scrollX}px`;
      box.style.width = `${rect.width}px`;
      box.style.height = `${rect.height}px`;
    }
  };
  reposition();

  // Page coords mean boxes scroll with content automatically; only reflow needs a recompute.
  const onResize = () => reposition();
  window.addEventListener('resize', onResize, { passive: true });
  state.cleanup = () => {
    window.removeEventListener('resize', onResize);
  };
}

function positionTooltip(tooltip: HTMLElement, box: HTMLElement): void {
  const top = parseFloat(box.style.top) || 0;
  const left = parseFloat(box.style.left) || 0;
  const height = parseFloat(box.style.height) || 0;
  tooltip.style.top = `${top + height + 6}px`;
  tooltip.style.left = `${left}px`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

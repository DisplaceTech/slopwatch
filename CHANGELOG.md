# Changelog

All notable changes to Slopwatch are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- **The Mock provider could run in a real install, and a stale Mock result could
  be served after switching providers.** Two bugs that together produced fake
  results:
  - The result cache wasn't scoped by provider/model, so a result cached under
    the Mock provider was served back once a real provider was active. The cache
    key now includes provider + model.
  - The Mock provider is now **development-only** — it's hidden in options and
    refuses to run in a production build. A fresh install defaults to Anthropic
    and, when no provider is configured, the popup shows a **"set up a provider"**
    prompt instead of silently analyzing. Saving an Anthropic key now also makes
    Anthropic the active provider.

### Added

- **M5 — Release engineering & docs.**
  - `release.yml`: tag-driven (`v*.*.*`) release that asserts the tag matches
    `package.json`, runs the gates, builds the Firefox package + AMO sources
    archive and the Chromium package, attaches them to a GitHub Release, and
    submits to AMO/CWS when credentials are present (skipped, not failed, when
    absent).
  - CI asserts no remotely-hosted code (MV3 / store policy).
  - Store-listing copy with the honest data-collection disclosure (`store/`).
  - mdbook documentation site (`docs-site/`) deployed to GitHub Pages at
    `slopwatch.displace.tech` via `docs.yml`.

- **M4 — Feeds & hardening.**
  - Feed-extractor framework with a named allowlist (Hacker News, Reddit) that
    pulls the primary post + comment bodies as live elements, plus a generic
    visible-text fallback for layouts Readability rejects. Extraction now reports
    its strategy (feed / readability / generic).
  - Prompt-injection hardening proven end-to-end against an adversarial fixture:
    hostile page text is confined to the escaped content region and can't close
    the delimiters or reach the instruction region.
  - Optional, off-by-default local diagnostics ring buffer (last 50 runs:
    provider, latency, tokens, error class — never content or keys), recorded by
    the orchestrator and viewable/exportable from options.
  - Checked-in page fixtures (hacker-news, reddit, adversarial) and tests for
    feed dispatch, generic fallback, injection, and diagnostics — 110 total.

- **M3 — Robustness & UX polish.**
  - Token/char budgeter: over-budget pages are head/middle/tail sampled with an
    "analyzed ~N%" notice, keeping original segment indices so highlights still map.
  - LRU + TTL result cache (storage.local, 7-day TTL, 200-entry cap) keyed by
    url + content hash; cache hits skip the provider, a forced Re-run bypasses it.
  - Popup detail: usage/tokens/cost/latency line, cached-result timestamp, sampled
    notice, and an inline false-positive caveat; Run uses the cache, Re-run forces.
  - Configurable highlight appearance (style + high-contrast) wired through to the
    Shadow-DOM layer; honors `prefers-reduced-motion` / `prefers-color-scheme`.
  - Options: threshold sliders with an enforced non-removable Uncertain band,
    appearance controls, clear-cache + cache stats, optional local-diagnostics
    toggle, and a first-run hint in the popup.
  - Tests: budgeter, cache, and component/a11y tests (Testing Library + axe-core)
    for the popup and options — 99 total.

- **M2 — Real providers (Anthropic + Ollama).** Grind on real pages with your own
  model:
  - `AnthropicProvider` — Messages API with the required browser headers
    (`x-api-key`, `anthropic-version`, `anthropic-dangerous-direct-browser-access`),
    JSON output + one repair, usage/cost estimation.
  - `OllamaProvider` — native `/api/chat` with a `format` JSON schema, `/api/tags`
    model listing, on-device (`ranLocally`), and CORS detection with an
    `OLLAMA_ORIGINS` copy-paste remediation.
  - Shared HTTP layer: 30s timeout, bounded exponential backoff with jitter for
    429/5xx/network/timeout (never 4xx), typed-error normalization.
  - Runtime optional host-permission requests per provider, from a user gesture
    in the popup and options (AD-3) — still no `<all_urls>`.
  - Options page: provider selection; Anthropic key entry (write-only, masked
    "configured" state) with session-default storage and an opt-in persistence
    warning; Ollama base URL + model picker (from `/api/tags`); per-provider
    Test connection.
  - Tests: Anthropic/Ollama adapters against stubbed responses (request-shape,
    error mapping, retry, repair, CORS).

- **M1 — Vertical slice (MockProvider).** The full click→extract→analyze→annotate
  experience, end-to-end against a deterministic offline mock:
  - Readability-based extraction with an indexed segmenter and stable content
    hash; live block elements are kept so highlights map back by index (AD-5).
  - Analysis core: injection-hardened prompt builder, strict Zod response schema
    with a one-shot repair, and a pure score→label mapper whose *Uncertain* band
    can never be collapsed (AD-7).
  - `MockProvider` (deterministic, keyless) behind the shared `AnalysisProvider`
    interface, plus a provider factory.
  - Background orchestrator (extracted to a testable `lib/orchestrator`): injects
    the on-page agent under `activeTab` at click time, drives the pipeline,
    debounces repeat clicks, tracks per-tab status, and sets the toolbar badge.
  - Shadow-DOM annotation layer: paragraph highlights by index with per-segment
    hover tooltips and ARIA labels (AD-6).
  - Popup state machine (Idle/Extracting/Analyzing/Results/NoContent/Error) with
    score + label + reasoning + gauge + flagged-paragraph list, a persistent
    cloud-vs-local indicator, and the permanent responsible-use caveat — never a
    bare verdict.
  - Tests: unit (mapper/schema/prompt/segmenter/hash/mock), integration
    (orchestrator full flow), happy-dom extraction, and a Chromium Playwright E2E
    that loads the real build and checks the popup invariants. CI now runs E2E.
  - Branding: robot-detective icon (its eye is a magnifying glass) and a README
    with personality.

- **Agentic workflow + tooling.** Adopted the agentic-workflow template
  (issue→Claude routing, plan-approval gate, labels) and added a project
  `CLAUDE.md`.

- **M0 — Scaffold & CI.** WXT + React + TypeScript (strict) project skeleton with
  ESLint, Prettier, Vitest (`fakeBrowser`), and Playwright wired up. Typed
  cross-context messaging and typed settings/secrets storage wrappers
  (`storage.session` default for API keys; corrupt-settings → defaults). Stubbed
  `background`, `popup`, `options`, and `content` entrypoints. GitHub Actions CI.

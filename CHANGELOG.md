# Changelog

All notable changes to Slopwatch are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

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

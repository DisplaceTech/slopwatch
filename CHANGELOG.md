# Changelog

All notable changes to Slopwatch are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

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

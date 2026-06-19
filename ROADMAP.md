# Slopwatch — Feature Roadmap

Milestone-based, ordered by risk and dependency. Each milestone has an explicit **Definition of
Done** and **advancement criteria** that gate promotion to the next. Maps to the Implementation
Plan in [`TDD.md`](./TDD.md) §9.

> Legend: 🟢 must-have for the milestone · 🟡 nice-to-have (cut first under pressure) · 🔭 explicitly deferred

---

## M0 — Scaffold & CI

**Goal:** a buildable, testable, cross-browser skeleton.

- 🟢 WXT project (TypeScript strict, React module for popup/options).
- 🟢 Tooling: ESLint + Prettier, Vitest + `wxt/testing`, Playwright installed.
- 🟢 Entrypoints stubbed: `background`, `popup`, `options`, `content`.
- 🟢 GitHub Actions: install → lint → typecheck → unit → build (Chromium + Firefox) → upload zips.
- 🟢 `README` quickstart; `pnpm` scripts for every common task.

**Definition of Done:** `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm build:firefox`
all pass locally and in CI; the popup opens with a placeholder in both browsers.

**Advance when:** CI is green on `main`; an unpacked dev build loads in Firefox (`about:debugging`)
and Chromium.

---

## M1 — Vertical Slice (MockProvider)

**Goal:** the entire click-to-annotate experience working end-to-end against a deterministic mock,
so UX and plumbing are proven before any real API exists.

- 🟢 `activeTab` click handler → inject content script → extract via Readability → indexed segments.
- 🟢 `MockProvider` returning a deterministic, schema-valid `AnalysisResult` (configurable in dev).
- 🟢 Overall score badge on the toolbar action + popup showing score, label, reasoning.
- 🟢 Shadow-DOM highlight layer: paragraph highlights by index; hover tooltip with per-segment
  rationale.
- 🟢 Idle / Extracting / Analyzing / Results / NoContent / Error states wired.
- 🟢 Playwright (Chromium) E2E covering the full flow against the mock.

**Definition of Done:** clicking the icon on a real article highlights paragraphs and shows an
overall result, with no real network call.

**Advance when:** E2E green; manual Firefox smoke (one OS) passes; highlights map to correct
paragraphs on three sample articles.

---

## M2 — Real Providers

**Goal:** swap the mock for the three real backends.

- 🟢 `AnthropicProvider` (Messages API; required browser headers; JSON output; validate/repair).
- 🟢 `OpenAICompatProvider` (configurable base URL; structured output + `json_object` fallback;
  bearer auth). Doubles as the gateway path (OpenRouter/LiteLLM/vLLM).
- 🟢 `OllamaProvider` (native `/api/chat` with `format` schema; `listModels` via `/api/tags`).
- 🟢 Runtime optional-permission requests per provider (request the provider host only when used).
- 🟢 "Test connection" in options for each provider.
- 🟢 `ProviderError` taxonomy + per-kind remediation copy (esp. Ollama `OLLAMA_ORIGINS`).
- 🟡 Estimated cost display for cloud providers.

**Definition of Done:** a real round-trip succeeds against each of Anthropic, an OpenAI-compatible
endpoint, and a local Ollama.

**Advance when:** all three providers verified on a real page; Ollama CORS remediation confirmed to
work from a clean machine; recorded fixtures replay in unit tests.

---

## M3 — Robustness & UX Polish

**Goal:** make it pleasant, fast, and resilient enough to put in front of strangers.

- 🟢 Token/character budgeter with head/middle/tail sampling + visible "analyzed N% of page" notice.
- 🟢 LRU + TTL result cache keyed by URL + content hash; "clear cache" action.
- 🟢 Detail panel: per-segment rationales, overall reasoning, usage/latency, privacy indicator
  (cloud vs local) shown before and after each run.
- 🟢 Accessibility pass: keyboard navigation, ARIA roles, color-contrast-safe highlight defaults,
  `prefers-reduced-motion`, `prefers-color-scheme`.
- 🟢 First-run walkthrough (pick a provider, paste a key or point at Ollama, run once).
- 🟢 Responsible-use copy in-product: "probabilistic signal, not proof," false-positive caveat.
- 🟡 Adjustable thresholds UI (human/uncertain/ai band edges; Uncertain band non-removable).
- 🟡 Re-run with a different provider for the same page (A/B a result).

**Definition of Done:** NFR performance and error-handling targets met; a11y checklist passes; an
over-budget page is handled with a clear notice.

**Advance when:** a non-technical tester completes setup and a first analysis unaided.

---

## M4 — Feeds & Hardening

**Goal:** go beyond clean articles; harden against hostile page content.

- 🟢 Per-platform feed extractors for a named allowlist (e.g., the surfaces where synthetic content
  concentrates — confirm list at build time).
- 🟢 Generic visible-text fallback for unknown layouts.
- 🟢 Prompt-injection hardening: page content is delimited/escaped; adversarial fixtures prove
  instructions can't be overridden by page text.
- 🟡 Optional local diagnostics ring buffer (provider, latency, tokens, error class — never content
  or keys), viewable/exportable by the user.
- 🔭 Per-element (sub-paragraph) highlight granularity — deferred; index-level is the v1 contract.

**Definition of Done:** allowlist feeds extract their primary posts; injection fixtures pass.

**Advance when:** feed extraction validated on fixtures for each allowlisted platform.

---

## M5 — Release Engineering (Firefox-first)

**Goal:** ship a signed, reviewable build to AMO; lay Chromium groundwork.

- 🟢 `wxt zip -b firefox` producing the extension package **and** the AMO sources archive.
- 🟢 Documented reproducible build (Node/pnpm versions, exact commands) for AMO source review.
- 🟢 Store listing: description, screenshots, permission justifications, **data-collection disclosure**
  (page content is sent to the user's chosen provider; nothing to us).
- 🟢 `wxt submit` automation for AMO, gated on git tags, credentials in CI secrets.
- 🟢 Small-percentage AMO rollout → 100% gate.
- 🟡 Chromium (CWS) listing + `wxt submit` target.
- 🔭 Edge/Safari listings — deferred.

**Definition of Done:** a signed beta is live on AMO (unlisted or small-%).

**Advance when:** beta installs and runs on Firefox across two OSes; tag-driven release dry-run
succeeds in CI.

---

## M6 — Post-v1 Bets (explicitly deferred)

Backlog, not committed. Each needs its own go/no-go.

- 🔭 **Heuristic pre-filters** (perplexity/burstiness/stylometry) as a cheap, offline first-pass that
  can short-circuit obvious cases and provide an LLM-independent signal.
- 🔭 **Full map-reduce chunking** for very long pages (replaces head/middle/tail sampling).
- 🔭 **Opt-in autorun** with strict guardrails (allowlist domains, rate caps, explicit consent) for
  users who want passive flagging — a deliberate departure from "inert by default," gated behind a
  prominent toggle.
- 🔭 **Optional managed proxy** so users can trial without exposing their own key (adds a backend;
  conflicts with current no-server scope — needs product decision).
- 🔭 **Passphrase-encrypted key storage at rest** (shifts, doesn't remove, the trust boundary).
- 🔭 **Confidence calibration tooling**: a local labeled corpus + a calibration view so users can see
  how a given provider/model behaves, reinforcing the "signal not verdict" framing.
- 🔭 **Result export / share** (copy a structured summary; never auto-post).
- 🔭 **i18n** for the UI.

---

## Cross-Cutting Principles (apply to every milestone)

1. **Inert by default.** No content scripts, network calls, or permission use until the user clicks.
2. **Uncertainty is non-negotiable.** Never a bare binary verdict; score + calibrated label +
   reasoning, always, with a permanent Uncertain band.
3. **Local path is first-class.** The Ollama/zero-egress experience is never a second-class citizen.
4. **Minimal permissions.** `activeTab` + `storage` + `scripting`; provider hosts requested at
   runtime; no `<all_urls>`.
5. **No data leaves the device except to the provider the user chose.** Ever.

# CLAUDE.md — Slopwatch

Guidance for AI agents (and humans) working in this repo. Read this before making changes.

## What this is

Slopwatch is a **Firefox-first (Chromium second), Manifest V3 browser extension** built with
**WXT + React + TypeScript (strict)**. On an explicit toolbar click it extracts the primary content
of the active page, asks a **pluggable LLM provider** (Anthropic / OpenAI-compatible / local Ollama)
to estimate how likely the text is AI-generated, and surfaces an **overall score + calibrated label +
reasoning** plus **paragraph-level highlights**.

The design docs at the repo root are the source of truth — read the relevant one before non-trivial
work:

- `TDD.md` — architecture, provider interface, NFRs, decisions (AD-1…AD-7), tickets (Stories 1–12)
- `ROADMAP.md` — milestones M0–M5 with Definitions of Done
- `TESTING.md` — test pyramid, what we test vs. deliberately don't, CI gates
- `USABILITY.md` — states, result presentation, accessibility, responsible-use copy
- `DEPLOYMENT.md` — build/sign/submit pipeline
- `BUILD_PROMPT.md` — the original autonomous build brief

If the docs and code disagree, the docs win; note the discrepancy and proceed sensibly.

## Hard invariants (do not violate)

1. **Inert by default.** No content scripts, network calls, or permission use until the user clicks.
   Page access uses **`activeTab`** + programmatic injection (the `inpage` unlisted script injected
   via `scripting.executeScript`). **Never** request `<all_urls>` or broad host permissions; provider
   hosts are **optional** permissions requested at runtime.
2. **Never a bare binary verdict.** Always present score + calibrated label (with a permanent
   *Uncertain* band that cannot be configured to zero width) + reasoning, together (AD-7).
3. **No data leaves the device except to the provider the user explicitly chose.** No first-party
   telemetry by default. The Ollama path keeps everything on-device; the UI shows a persistent
   cloud-vs-local indicator.
4. **Secrets.** API keys default to `storage.session`; persistence to `storage.local` is an explicit
   opt-in with an at-rest warning. Keys are write-only from the UI's perspective (masked "configured"
   state), never logged, never returned to the UI, never written into cached results or diagnostics.
5. **Provider responses are validated** against a strict Zod schema with a single repair attempt
   before a typed `ProviderError`. The UI never shows raw HTTP bodies to ordinary users.
6. **Injected page text is hostile.** Delimit and escape page content in prompts (prompt-injection
   hardening).

## Layout

```
entrypoints/
  background.ts   # orchestrator: provider dispatch, cache, message router
  popup/          # React: trigger + overall result + detail panel
  options/        # React: provider config, thresholds, appearance, diagnostics
  inpage.ts       # UNLISTED script injected at click time — extraction + Shadow-DOM highlights
lib/
  extraction/     # readability adapter, feed extractors, generic fallback, segmenter
  analysis/       # token budgeter, prompt builder, response schema + parser, score→label mapper
  providers/      # AnalysisProvider interface + anthropic, openai-compat, ollama, mock
  storage/        # typed settings + secrets wrappers over browser.storage
  messaging/      # typed message contracts between contexts
  errors.ts       # ProviderError taxonomy
  types.ts        # shared domain types (provider interface)
tests/            # unit / integration / component (Vitest), e2e (Playwright)
```

Keep entrypoints thin; put pure, well-tested logic in `lib/`.

## Commands

Use **pnpm** (via corepack). Common tasks:

```bash
pnpm dev            # Chromium with HMR
pnpm dev:firefox    # Firefox via web-ext
pnpm test           # Vitest (unit + integration + component)
pnpm e2e            # Playwright (Chromium, MockProvider)
pnpm lint           # ESLint
pnpm typecheck      # wxt prepare + tsc --noEmit
pnpm build          # production Chromium build
pnpm build:firefox  # production Firefox build (MV3)
pnpm zip:firefox    # AMO package + sources archive
```

**Definition of done for any change:** `pnpm lint && pnpm typecheck && pnpm test && pnpm build &&
pnpm build:firefox` all pass. Add/adjust tests for the code you touch — the domain layer
(`lib/analysis`, `lib/extraction`, `lib/providers`) targets ≥ 85% coverage. We test the plumbing and
contract, **not** any real model's absolute accuracy.

## Conventions

- TypeScript strict; prefer pure functions in `lib/`. Match the surrounding code's style.
- Tests that don't need a DOM run in the `node` Vitest environment (default); component tests opt into
  happy-dom with a `// @vitest-environment happy-dom` docblock.
- `browser.*` is reached via `import { browser } from 'wxt/browser'`; tests use `fakeBrowser` from
  `wxt/testing` (reset in `tests/setup.ts`).
- Conventional-ish commit subjects prefixed by milestone where relevant (e.g. `M1: …`).
- When you hit an ambiguity the docs don't resolve, choose the option most consistent with the hard
  invariants, leave a `// TODO(slopwatch):` note, and keep moving.

## Provider facts (verified, keep current)

- **Anthropic** browser call: headers `x-api-key`, `anthropic-version: 2023-06-01`,
  `anthropic-dangerous-direct-browser-access: true`; default model `claude-haiku-4-5`; structured
  output via `output_config.format` (json_schema).
- **OpenAI-compatible**: bearer auth; structured output via `response_format` json_schema with a
  `json_object` fallback; base URL is user-configurable (doubles as the gateway path).
- **Ollama**: `POST /api/chat` with a `format` JSON schema; `GET /api/tags` lists models; requires the
  user to allow the extension origin via `OLLAMA_ORIGINS` (surface the copy-paste fix on CORS errors).

## Agentic workflow

This repo uses the agentic-workflow template (`.github/workflows/agent-ready-trigger.yml`): an issue
opened with the Agent-Ready template and labeled `agent-ready` routes to Claude Code. `complexity:high`
issues plan first (`docs/plans/`) and gate on a `/approve-plan` comment. See
`docs/AGENTIC_DEVELOPMENT.md` and `docs/LEARNINGS.md`.

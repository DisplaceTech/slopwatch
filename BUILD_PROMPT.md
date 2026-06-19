# Slopwatch — Claude Code Build Prompt

> Paste this into Claude Code from the repository root (the directory containing this file and
> `docs/`). It instructs you to build the entire extension from the design docs, phase by phase,
> verifying as you go. Read the referenced docs **before** writing code.

---

You are building **Slopwatch**, a cross-browser extension (Firefox-first, Chromium second) that, on
explicit user click, extracts the primary content of the current page and estimates the likelihood
that it was AI-generated, surfaced as an overall score plus paragraph-level highlights with
rationales. The model that does the analysis is **pluggable**: Anthropic, an OpenAI-compatible
endpoint, or a local Ollama instance.

## Before you write any code

1. Read these design documents in full and treat them as the source of truth:
   - `docs/TDD.md` — architecture, provider interface, NFRs, decisions (AD-1…AD-7), implementation
     plan and tickets (Stories 1–12).
   - `docs/ROADMAP.md` — milestones M0–M5 with Definitions of Done and advancement criteria.
   - `docs/TESTING.md` — the test pyramid, what to test vs. deliberately not test, fixtures, CI gates.
   - `docs/DEPLOYMENT.md` — build/sign/submit pipeline, reproducible builds, Firefox distribution.
   - `docs/USABILITY.md` — states, result presentation, accessibility, responsible-use copy.
2. If the docs and this prompt ever disagree, the docs win; note the discrepancy and proceed
   sensibly.
3. Verify current facts before relying on memory: the exact WXT API/commands, the current default
   model strings per provider, the required Anthropic browser headers, OpenAI structured-output
   field names, and Ollama's structured-output (`format`) usage. Pin versions in `package.json`.

## Hard invariants (do not violate, regardless of convenience)

- **Inert by default.** No content scripts injected, no network calls, no permission use until the
  user clicks the toolbar action. Use **`activeTab`** for page access (AD-2). Do **not** request
  `<all_urls>` or broad host permissions. Provider host permissions are **optional** and requested
  at runtime when a provider is configured/used (AD-3).
- **Never a bare binary verdict.** Always present score + calibrated label (with a permanent
  *Uncertain* band) + reasoning together (AD-7). The Uncertain band cannot be configured to zero
  width.
- **No data leaves the device except to the provider the user explicitly chose.** No first-party
  telemetry by default. The local Ollama path must keep all content on-device, and the UI must show
  a persistent cloud-vs-local indicator.
- **Secrets:** API keys default to `storage.session` (in-memory); persistence to `storage.local` is
  an explicit opt-in with a visible at-rest warning. Keys are never logged, never returned to the
  UI after save (UI shows a masked "configured" state), and never written into cached results or
  diagnostics.
- **Provider responses are validated** against a strict Zod schema with a single repair attempt
  before a typed error. The UI never shows raw HTTP bodies to ordinary users.
- **Injected page text is treated as hostile.** Delimit and escape page content in prompts so it
  cannot override instructions (prompt-injection hardening).

## Tech stack (use exactly this unless a doc says otherwise)

- **WXT** (latest) as the extension framework; React (`@wxt-dev/module-react`) for popup/options;
  **vanilla TS + Shadow DOM** for the on-page annotation layer.
- **TypeScript** strict. **pnpm** (commit `pnpm-lock.yaml`). **ESLint + Prettier**.
- **`@mozilla/readability`** + **DOMPurify** for extraction/sanitization.
- **Zod** for response validation.
- **Vitest** + **`wxt/testing`** (`fakeBrowser`) + **@testing-library/react** + **happy-dom** +
  **axe-core** for unit/integration/component; **Playwright** (Chromium) for E2E.

## Repository layout to create

```
slopwatch/
  wxt.config.ts
  package.json            # scripts below; version is source of truth
  tsconfig.json
  .nvmrc                  # pinned Node
  .eslintrc / eslint.config.js, .prettierrc
  CHANGELOG.md
  entrypoints/
    background.ts         # orchestrator, provider dispatch, cache, message router
    popup/                # React: trigger + overall result + detail panel
    options/              # React: provider config, thresholds, appearance, diagnostics
    content.ts            # extraction trigger + Shadow-DOM annotation layer
  lib/
    extraction/           # readability adapter, feed extractors (allowlist), generic fallback, segmenter
    analysis/             # token budgeter, prompt builder, response schema + parser, score→label mapper
    providers/            # AnalysisProvider interface + anthropic, openai-compat, ollama, mock
    storage/              # typed settings + secrets wrappers over browser.storage
    messaging/            # typed message contracts between contexts
    errors.ts             # ProviderError taxonomy
  tests/
    fixtures/{pages,providers,corpus}/
    e2e/                  # Playwright specs
  .github/workflows/
    ci.yml                # lint, typecheck, test (coverage), build both, e2e (Chromium)
    release.yml           # on tag: build/sign/submit (AMO primary, CWS optional)
```

`package.json` scripts (at minimum): `dev`, `dev:firefox`, `build`, `build:firefox`, `zip`,
`zip:firefox`, `test`, `test:watch`, `e2e`, `lint`, `typecheck`.

## Build order (follow the milestones; commit at each gate)

Work in this sequence, matching `ROADMAP.md` and the Stories in `TDD.md` §9. After each milestone,
run the relevant checks and commit with a message referencing the milestone.

1. **M0 — Scaffold & CI (Stories 1–2).** Initialize WXT + React + TS strict + lint/test/e2e
   harness. Implement typed messaging and typed storage wrappers (`storage.session` default for
   keys; `storage.onChanged` propagation; corrupt-settings → defaults). Write `ci.yml`. Stub all
   entrypoints. **Gate:** `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm build:firefox`
   pass; popup opens with a placeholder in both browsers.

2. **M1 — Vertical slice with MockProvider (Stories 3–5).** Implement Readability extraction +
   indexed segmenter + content hash; the analysis core (escaped/delimited prompt builder, Zod
   schema, repair, pure score→label mapper with non-removable Uncertain band); the `MockProvider`;
   the orchestrator wiring click→extract→analyze→annotate; the Shadow-DOM highlight layer with
   per-segment tooltips; the popup result view (score + label + reasoning, never bare binary).
   Write Playwright E2E for the full flow against the mock. **Gate:** E2E green; manual Firefox
   smoke (one OS) passes.

3. **M2 — Real providers (Stories 6–8).** Implement `AnthropicProvider` (required browser headers,
   JSON output), `OpenAICompatProvider` (configurable base URL, `response_format` structured output
   + `json_object` fallback, bearer auth), and `OllamaProvider` (native `/api/chat` with `format`
   schema, `listModels` via `/api/tags`). Add runtime optional-permission requests per provider,
   "Test connection," and the full `ProviderError` taxonomy with per-kind remediation (especially
   the Ollama `OLLAMA_ORIGINS` CORS fix). Record sanitized fixtures and add adapter unit tests.
   **Gate:** unit tests green against fixtures; (you, the human operator, verify) a real round-trip
   against each provider type.

4. **M3 — Robustness & UX (Story 9–10).** Token/char budgeter with head/middle/tail sampling +
   "analyzed N%" notice; LRU+TTL result cache; detail panel; persistent cloud-vs-local indicator;
   options polish (masked key state, persistence opt-in with at-rest warning, thresholds with
   enforced Uncertain band, appearance, clear-cache/clear-key, optional local diagnostics ring
   buffer); first-run walkthrough; responsible-use copy. Full accessibility pass (keyboard, ARIA,
   contrast, reduced-motion, dark mode; axe-core in component tests). **Gate:** NFR perf/error
   targets met; a11y checklist passes.

5. **M4 — Feeds & hardening (Story 11).** Per-platform feed extractors for a named allowlist +
   generic visible-text fallback; prompt-injection hardening with adversarial fixtures. **Gate:**
   allowlist feed fixtures extract primary posts; injection fixtures prove instructions can't be
   overridden.

6. **M5 — Release engineering (Story 12).** `wxt zip -b firefox` producing package + sources
   archive; documented reproducible build; `release.yml` with `wxt submit` to AMO (primary, tag-
   gated) and CWS (optional); store listing copy including the honest data-collection disclosure.
   **Gate:** `release.yml` dry-run succeeds; a signed beta is producible.

## Definition of done (the whole project)

- Every milestone gate above is met; CI is green on `main`.
- Clicking the icon on a real article in **both** Firefox and Chromium highlights paragraphs and
  shows an overall score + label + reasoning, with the correct cloud/local indicator.
- All three providers work via a real round-trip (human-verified); Ollama keeps content local and
  its CORS remediation works from a clean state.
- Coverage thresholds in `TESTING.md` are met; the hard invariants above hold everywhere.
- `README.md`, `CHANGELOG.md`, and store-listing copy (with data disclosure) exist.

## Working style

- Make small, reviewable commits, each referencing the milestone/story.
- Prefer pure, well-tested functions in `lib/`; keep entrypoints thin.
- When you hit an ambiguity the docs don't resolve, choose the option most consistent with the hard
  invariants, leave a `// TODO(slopwatch):` note explaining the choice, and keep moving.
- Do not introduce remotely-hosted code, broad host permissions, default-on telemetry, or any path
  that sends content somewhere the user didn't choose. If a task seems to require any of those, stop
  and flag it instead.

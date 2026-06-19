# Slopwatch

> **Working name** — alternatives to consider: *Provenance*, *Tellslop*, *AI Lens*, *GhostText*,
> *Verbatim*. Rename the package id, manifest `name`, and Gecko id together if you change it.

An on-demand, pluggable browser extension that identifies the primary content of a page and
estimates how likely it is to be **AI-generated** — shown as an overall score plus paragraph-level
highlights with rationales.

- **Inert by default.** It does nothing — no scanning, no network, no permissions used — until you
  click the toolbar icon.
- **Pluggable brain.** Bring your own **Anthropic** key, an **OpenAI-compatible** endpoint (OpenAI,
  OpenRouter, vLLM, LiteLLM…), or point it at a **local Ollama** model so nothing leaves your
  device.
- **Honest by design.** It produces a *probabilistic signal with reasoning*, never a bare
  "AI / Human" verdict. False positives are real and the UI says so.
- **Firefox-first** (Manifest V3), Chromium second, from one source tree.

## How it works

Click the icon → it grabs temporary read access to the active tab (`activeTab`) → extracts the
primary content (Readability for articles, per-platform extractors for feeds) → sends it to your
chosen model → shows an overall AI-likelihood score, a calibrated label, the model's reasoning, and
highlights suspicious paragraphs in place. Hover a highlight for that paragraph's rationale.

## Repository contents

This repo is currently a **design + build bootstrap**. The code is generated from the docs by Claude
Code using the build prompt.

| File | What it is |
|---|---|
| [`TDD.md`](./TDD.md) | Full technical design: architecture, provider interface, NFRs, decisions, tickets |
| [`ROADMAP.md`](./ROADMAP.md) | Milestones M0–M5 with Definitions of Done and advancement criteria |
| [`TESTING.md`](./TESTING.md) | Test pyramid, fixtures, what we test vs. deliberately don't, CI gates |
| [`DEPLOYMENT.md`](./DEPLOYMENT.md) | Build, sign, and store-submission pipeline (Firefox-first) |
| [`USABILITY.md`](./USABILITY.md) | Interaction states, result presentation, accessibility, responsible-use UX |
| [`CLAUDE.md`](./CLAUDE.md) | Guidance for AI agents/humans: invariants, layout, commands, conventions |
| [`BUILD_PROMPT.md`](./BUILD_PROMPT.md) | Paste-into-Claude-Code instructions to build the whole thing |

## Build it

From this directory, open Claude Code and paste the contents of [`BUILD_PROMPT.md`](./BUILD_PROMPT.md).
It will read the docs and scaffold + implement the extension milestone by milestone, verifying at
each gate.

Once scaffolded, the day-to-day commands (per the TDD) will be:

```bash
pnpm install
pnpm dev            # Chromium with HMR
pnpm dev:firefox    # Firefox via web-ext
pnpm test           # Vitest (unit + integration + component)
pnpm e2e            # Playwright (Chromium, MockProvider)
pnpm build:firefox  # production Firefox build
pnpm zip:firefox    # AMO package + sources archive
```

## Provider setup (after build)

- **Anthropic / OpenAI-compatible:** paste an API key. It's used directly from your browser to the
  provider and is **not** sent to any Slopwatch server (there isn't one). Keys are kept for the
  browser session only unless you opt into saving them.
- **Local Ollama:** point at `http://localhost:11434` and pick a pulled model. You must allow the
  extension origin via the daemon's `OLLAMA_ORIGINS` (the extension shows the exact snippet if it
  hits a CORS error). Nothing leaves your device on this path.

## A note on what this is and isn't

LLM-based "is this AI?" detection is **unreliable** — it has real false-positive and false-negative
rates and can be biased against formal or non-native-English writing. Slopwatch is built to make
that honest: it shows a score *and* an explanation *and* a permanent "uncertain" band, lets you
re-run with a different model to compare, and never labels people. Treat it as a prompt to look
closer, not as proof.

## License

[MIT](./LICENSE) © 2026 Displace Technologies, LLC.

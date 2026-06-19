<div align="center">

<img src="./public/icon/128.png" alt="Slopwatch" width="120" height="120" />

# Slopwatch 🤖🔎

### *"Wait… did a human actually write this, or is it slop?"*

A one-click browser extension that reads the page you're on and gives you a
**probabilistic second opinion** on whether the text was churned out by an AI —
an overall score, a calibrated label, the reasoning, and paragraph-level
highlights. Bring your own model. Yell at the results. Move on with your day.

<sub>Firefox-first · Chromium second · runs on nothing until you click it</sub>

[![CI](https://github.com/DisplaceTech/slopwatch/actions/workflows/ci.yml/badge.svg)](https://github.com/DisplaceTech/slopwatch/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Built with WXT](https://img.shields.io/badge/built%20with-WXT-67217a.svg)](https://wxt.dev)

</div>

---

## The pitch

The web is drowning in confidently-bland, em-dash-addicted, "in today's
fast-paced world" filler, and you've developed a nervous twitch trying to tell
the real writing from the synthetic stuffing. Slopwatch is the little robot that
squints at the page *with you* — its eye is literally a magnifying glass — and
says, *"yeah, this one smells like a language model, here's why."*

It will not tell you with certainty. Nobody can. It will give you a number, a
reason, and a permanent shrug of an **Uncertain** band, because pretending to be
sure about this would be its own kind of slop.

## What makes it different

- **🛑 Inert by default.** It does *nothing* — no scanning, no network, no
  permissions used — until you click the toolbar robot. No background snooping.
- **🧠 Bring your own brain.** Plug in an **Anthropic** key, any
  **OpenAI-compatible** endpoint (OpenAI, OpenRouter, vLLM, LiteLLM…), or point
  it at a **local Ollama** model so *nothing leaves your machine*.
- **🙅 No bare verdicts.** It never stamps a smug "AI" or "HUMAN" on anything.
  Score **and** label **and** reasoning, together, always — with a caveat it
  refuses to let you hide.
- **👀 You can see where your data goes.** A persistent indicator tells you,
  every single run, whether the analysis happened in the cloud or on your device.
- **🦊 One source tree, two browsers**, Manifest V3, reproducible builds.

## How it works

Click the icon → it grabs *temporary* read access to the current tab
(`activeTab`, nothing broader) → extracts the primary content (Readability for
articles, smarter extractors for feeds) → ships it to *your* chosen model →
shows an overall AI-likelihood score, a calibrated label, the model's reasoning,
and highlights the suspicious paragraphs **in place**. Hover a highlight for that
paragraph's rationale. Disagree loudly. Re-run with a different model to settle
the argument.

## Quickstart (for builders)

This repo builds the extension from the design docs. Day-to-day:

```bash
pnpm install
pnpm dev            # Chromium with hot reload
pnpm dev:firefox    # Firefox via web-ext
pnpm test           # Vitest (unit + integration + component)
pnpm e2e            # Playwright (Chromium, deterministic MockProvider)
pnpm build:firefox  # production Firefox build (MV3)
pnpm zip:firefox    # AMO package + sources archive
```

**Load it in Firefox right now:** `pnpm build:firefox`, then open
`about:debugging` → *This Firefox* → *Load Temporary Add-on…* → pick
`.output/firefox-mv3/manifest.json`. Click the robot on any article.

## Provider setup

- **Anthropic / OpenAI-compatible:** paste an API key. It goes **straight from
  your browser to the provider** and is **never** sent to any Slopwatch server
  (there isn't one). Keys stay for the browser session only unless you explicitly
  opt into saving them — and we'll warn you about what that means.
- **Local Ollama:** point at `http://localhost:11434`, pick a pulled model, and
  allow the extension origin via the daemon's `OLLAMA_ORIGINS` (Slopwatch hands
  you the exact snippet if it hits a CORS wall). Nothing leaves your device.

## A note on what this is — and very much isn't

LLM-based "is this AI?" detection is **genuinely unreliable**. It has real
false-positive and false-negative rates and is biased against formal,
template-following, or non-native-English writing. So Slopwatch is built to be
honest about it: a score *and* an explanation *and* a permanent "uncertain" band,
the freedom to re-run with a different model, and — this part matters — **it
never labels people, only text.**

Treat it as a nudge to look closer. Not a gavel.

## Project docs

| File | What it is |
|---|---|
| [`TDD.md`](./TDD.md) | Full technical design: architecture, provider interface, NFRs, decisions, tickets |
| [`ROADMAP.md`](./ROADMAP.md) | Milestones M0–M5 with Definitions of Done and advancement criteria |
| [`TESTING.md`](./TESTING.md) | Test pyramid, fixtures, what we test vs. deliberately don't, CI gates |
| [`DEPLOYMENT.md`](./DEPLOYMENT.md) | Build, sign, and store-submission pipeline (Firefox-first) |
| [`USABILITY.md`](./USABILITY.md) | Interaction states, result presentation, accessibility, responsible-use UX |
| [`CLAUDE.md`](./CLAUDE.md) | Guidance for AI agents/humans: invariants, layout, commands, conventions |

## License

[MIT](./LICENSE) © 2026 Displace Technologies, LLC.

<div align="center">
<sub>Built with a healthy suspicion of confidently bland prose.</sub>
</div>

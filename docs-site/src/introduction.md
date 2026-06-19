# Slopwatch 🤖🔎

> *"Wait… did a human actually write this, or is it slop?"*

Slopwatch is a one-click browser extension that reads the page you're on and gives you a
**probabilistic second opinion** on whether the text was AI-generated — an overall score,
a calibrated label, the model's reasoning, and paragraph-level highlights you can hover
for a per-paragraph rationale.

It is **Firefox-first** (Chromium second), Manifest V3, and built to be honest about a
genuinely hard problem.

## What makes it different

- **Inert by default.** It does nothing — no scanning, no network, no permissions used —
  until you click the toolbar robot.
- **Bring your own model.** Plug in an [Anthropic](./providers.md#anthropic) key, any
  OpenAI-compatible endpoint, or a [local Ollama](./providers.md#ollama-local) model so
  nothing leaves your machine.
- **Never a bare verdict.** Score *and* label *and* reasoning, together, always — with a
  permanent *Uncertain* band that can't be configured away.
- **You can see where your data goes.** A persistent indicator tells you, every run,
  whether analysis ran in the cloud or on your device.

## How it works

Click the icon → it grabs *temporary* read access to the current tab (`activeTab`,
nothing broader) → extracts the primary content (Readability for articles, per-platform
extractors for feeds) → sends it to *your* chosen model → shows an overall AI-likelihood
score, a label, the reasoning, and highlights the suspicious paragraphs in place.

## A note on what this is — and isn't

LLM-based "is this AI?" detection is **genuinely unreliable**, with real false-positive
and false-negative rates, and is biased against formal, template-following, or
non-native-English writing. Slopwatch is built to make that honest — and it **never
labels people, only text.** See [Responsible use](./responsible-use.md).

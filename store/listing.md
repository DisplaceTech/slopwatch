# Store listing copy

Reusable copy for the AMO (and Chrome Web Store) listings. Keep this in sync with
`CHANGELOG.md` (the "What's new" text) and the data disclosure in `DEPLOYMENT.md`.

Screenshots to capture (1280×800 or store spec): the popup with a result, a page
with paragraph highlights, the options screen.

---

## Name

Slopwatch

## Summary (one line)

A one-click, probabilistic second opinion on whether the text on a page was AI-generated.

## Description

Wait — did a human actually write this, or is it slop?

Slopwatch reads the page you're on (only when you click its toolbar button) and gives
you a probabilistic estimate of how likely the text was AI-generated: an overall score,
a calibrated label, the model's reasoning, and paragraph-level highlights you can hover
for a per-paragraph rationale.

- **Inert by default.** It does nothing — no scanning, no network, no permissions used —
  until you click the icon.
- **Bring your own model.** Use an Anthropic key, any OpenAI-compatible endpoint, or a
  local Ollama model so nothing leaves your device.
- **Never a bare verdict.** Score *and* label *and* reasoning, always, with a permanent
  "uncertain" band — because pretending to be certain about this would be its own slop.
- **You can see where your data goes.** A persistent indicator tells you, every run,
  whether analysis happened in the cloud or on your device.

A note on honesty: LLM-based "is this AI?" detection is unreliable, with real false
positives and false negatives, and is biased against formal or non-native-English
writing. Slopwatch is built to be honest about that and **never labels people, only
text.** Treat it as a nudge to look closer, not as proof.

## Category

Privacy & Security (or Productivity)

## Permission justifications

- **activeTab** — read the current page only when you click the toolbar button.
- **storage** — save your settings, and (optionally) your API key, locally.
- **scripting** — inject the analyzer into the page when you click.
- **Optional host permissions** (requested at runtime, only for the provider you use):
  `api.anthropic.com`, your configured OpenAI-compatible endpoint, or your local Ollama host.

## Data-collection disclosure (mandatory, honest)

When you run an analysis with a **cloud** provider, the extracted page content and your
API key are sent **directly from your browser to that provider**. Slopwatch operates no
server and collects no data itself. Choosing a **local Ollama** model keeps all content
on your device. Keys default to in-memory session storage and are never sent anywhere
except the provider they belong to.

## Privacy policy (host this; e.g. on the docs site)

Slopwatch has no backend and collects no analytics. The only network requests it makes
are the analysis requests you trigger, sent directly to the LLM provider you configure.
With a cloud provider, the extracted page text and your API key go to that provider under
their privacy policy; with local Ollama, nothing leaves your device. API keys are stored
in your browser (session-only by default; persistent only if you opt in) and are never
transmitted to anyone but your chosen provider. Cached results live only in your browser
and contain no keys.

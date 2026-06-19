# Slopwatch — Usability & Interaction Design

Slopwatch is a tool people reach for in a moment of suspicion — "wait, did a human write this?" The
experience has to be fast to invoke, honest about what it can and can't tell you, and calm about
uncertainty. This document defines the interaction model, the states, accessibility requirements,
and the responsible-use UX that is a hard product invariant, not a nicety.

---

## Design Principles

1. **One click to a second opinion.** From noticing something to seeing a result should be a single
   action and a short wait. No modal setup gauntlet on every use.
2. **Inert until invoked.** The extension does nothing — no scanning, no network, no permission use
   — until you click it. This is both a privacy property and a trust signal; the UI should make the
   "I only looked because you asked" stance legible.
3. **A signal, never a verdict.** The product must never present a bare "AI" or "Human" stamp. Every
   result couples a score with a calibrated label (including an explicit *Uncertain* band) and a
   short explanation. Over-claiming would be both wrong and harmful.
4. **You can see where your data goes.** Before and after every run, a persistent indicator says
   whether the analysis ran in the **cloud** (content left the device) or **locally** (it didn't).
5. **Explain, don't just score.** Highlights carry rationales; the overall result carries reasoning.
   The user should leave understanding *why*, not just *what*.
6. **Forgiving of mistakes.** Wrong key, unreachable model, page with no real content, page too
   long — each has a specific, kind, actionable message with the fix, not a stack trace.

---

## The Core Loop

```
notice something → click the Slopwatch icon → (brief) extracting → analyzing
   → result: overall score + label + reasoning, paragraphs highlighted in place
   → hover a highlight for that paragraph's rationale
   → optionally open the detail panel / re-run with another provider
```

- **Time-to-feedback:** a spinner and "Reading the page…" appears within ~150 ms of the click
  (local work only). The user is never left wondering whether the click registered.
- **Where results live:** the **overall** result and controls live in the toolbar **popup**;
  the **in-page** layer shows the paragraph highlights and per-segment tooltips. The two are linked
  (clicking a highlighted paragraph can focus its entry in the detail panel and vice-versa).

---

## States (and what each must communicate)

| State | What the user sees | Notes |
|---|---|---|
| **Idle** | Plain icon; popup shows a "Run analysis on this page" button + current provider + cloud/local indicator | No work has happened |
| **Extracting** | Spinner + "Reading the page…" | < 150 ms to appear |
| **Analyzing** | Spinner + "Asking {model}…" + which provider/where (cloud/local) | Cancelable |
| **Results** | Overall score, calibrated label, reasoning; highlights in page; detail panel available | Never a bare binary |
| **No content** | Friendly "Couldn't find primary article content on this page." + why | e.g., app shells, pure media, login walls |
| **Error** | Specific cause + the fix (see Error UX) + Retry; prior cached result preserved if any | No raw HTTP bodies |
| **Sampled** (overlay on Results) | "Analyzed ~N% of a long page (head, middle, end)." | Honesty about partial coverage |
| **Cached** (subtle on Results) | "Showing a saved result from {time}." + "Re-run" | Avoids silent staleness |

---

## Presenting the Result (the heart of it)

- **Overall.** A 0–100 likelihood with a **calibrated label**:
  - **Likely human** (low) · **Uncertain** (middle band) · **Likely AI** (high).
  - The numeric score and the label always appear **together**. The middle *Uncertain* band is
    permanent and cannot be configured away.
- **Visual encoding.** Use a continuous scale (e.g., a gradient gauge), not a binary toggle, so the
  visual itself communicates "this is a probability." Avoid red/green-only encodings (colorblind +
  it implies good/bad rather than human/AI); pair color with text and shape.
- **Reasoning.** The model's short overall rationale is shown verbatim, framed as "Why it looks this
  way," with a persistent one-line caveat: *"This is a probabilistic estimate from a language model,
  not proof. Both false positives and false negatives are common."*
- **Highlights.** Flagged paragraphs are highlighted **in place** (Shadow-DOM layer, so page styles
  are untouched). Hovering shows that paragraph's per-segment likelihood and a one-sentence
  rationale. Highlight intensity can encode per-segment confidence (lighter = less sure).
- **Detail panel.** Lists each flagged paragraph with its rationale, the overall reasoning, the
  provider/model used, latency, token usage, and (cloud) estimated cost. Includes the cloud/local
  indicator and the "Analyzed N%" notice when sampled.

### Responsible-use copy (non-negotiable)
The following ideas appear in-product (first-run, the result caveat, and the detail panel),
phrased plainly:
- It's a **signal, not a verdict**.
- **False positives are real** — human writing, especially formal, non-native-English, or
  template-following text, can read as "AI." Don't use this to accuse people.
- The result reflects **one model's opinion**; different providers may disagree, and you can re-run
  to compare.
- A **local model keeps your reading private**; a cloud model sends the page content to a third
  party.

---

## First-Run / Onboarding

A short, skippable walkthrough — not a wall:

1. **What this does** (one screen): on-demand, probabilistic, explained, your choice of model.
2. **Pick how it thinks:**
   - **Use a cloud model** (Anthropic or OpenAI-compatible): paste a key. Inline warning: *"Your key
     is used directly from your browser to the provider; it isn't sent to us. We keep it only for
     this browser session unless you opt into saving it."*
   - **Use a local model** (Ollama): point at `http://localhost:11434`, pick a pulled model.
     Inline: *"Nothing leaves your device."* Plus the exact `OLLAMA_ORIGINS` snippet if a CORS
     error is detected.
3. **Try it** on the current page (or a bundled sample) so the very first experience ends in a
   successful result.

Defaults chosen so the *safest* path (session-only key storage; clear local option) is the default,
and the riskier path (persistent key storage) is an explicit opt-in with a visible reason.

---

## Settings (Options) UX

- **Provider section:** choose active provider; configure each.
  - Key field shows a masked **"Configured ✓"** state, never echoes the stored secret.
  - **Persistence toggle:** "Remember my key on this device" — off by default; turning it on shows:
    *"Saved keys are stored unencrypted in your browser profile. Anyone with access to this device's
    files could read them. Consider full-disk encryption, or leave this off to keep keys only for
    the session."*
  - **Test connection** per provider with a clear pass/fail and the specific failure remediation.
  - Ollama: **model picker** populated from the daemon; a copy-paste `OLLAMA_ORIGINS` helper.
- **Thresholds:** sliders for the human/uncertain/AI band edges; the Uncertain band cannot be
  collapsed to zero (the UI enforces a minimum width).
- **Appearance:** highlight color/style (with contrast-safe presets), respect system dark mode,
  honor reduced-motion.
- **Privacy & data:** restate what is sent where; "Clear cache," "Clear saved key," and (if enabled)
  "View/Export local diagnostics" — with a note that diagnostics never contain page content or keys.

---

## Error UX (specific, kind, actionable)

Each `ProviderError.kind` maps to a tailored message + fix. Never show raw HTTP bodies in the main
UI.

| Kind | Message (plain) | Fix offered |
|---|---|---|
| `auth` | "That key was rejected by {provider}." | Re-enter key; link to where to get one |
| `rate_limit` | "{provider} is rate-limiting requests right now." | Auto-retry with backoff; "Try again" |
| `network` / `timeout` | "Couldn't reach {provider}." | Check connection; Retry |
| `cors` (Ollama) | "Ollama refused the request from this extension." | Copy-paste `OLLAMA_ORIGINS` snippet + "restart Ollama," then Retry |
| `bad_response` | "The model returned something we couldn't read." | Retry; suggest a different/larger model |
| `unknown` | "Something went wrong." | Retry; "View details" reveals the raw response (diagnostics) |

Tone: matter-of-fact and helpful. The error state preserves any prior cached result for the page so
the user isn't left with nothing.

---

## Accessibility (must-pass)

- **Keyboard:** every action (run, cancel, open detail, change provider, navigate highlights) is
  keyboard-reachable in a sensible tab order; a shortcut to run analysis on the active tab.
- **Screen readers:** popup and panel use correct ARIA roles/labels; the overall result is announced
  as "likelihood AI-generated: N percent, label {…}"; highlights expose their rationale to AT, not
  just on hover.
- **Color & contrast:** never encode meaning by color alone; default highlight palette meets WCAG
  contrast; provide a high-contrast preset.
- **Motion:** honor `prefers-reduced-motion` (no spinners that violate it; use static progress text).
- **Theme:** honor `prefers-color-scheme`.
- **Hit targets & zoom:** controls remain usable at 200% zoom; adequate target sizes.
- **Tested** with axe-core in component tests; manual SR pass on the release checklist.

---

## Microcopy Guidelines

- Prefer "likely AI-generated" over "AI" and "looks human-written" over "Human."
- Always pair a number with a word; never a lone percentage.
- Say where analysis runs in human terms: "Runs on your device (Ollama)" / "Sent to Anthropic."
- Avoid accusatory framing entirely — Slopwatch assesses *text*, not *people*.
- Keep the permanent caveat short enough to actually be read.

---

## Anti-Patterns (explicitly avoided)

- ❌ A binary "AI / Human" badge with no score or explanation.
- ❌ Auto-scanning pages in the background by default.
- ❌ Hiding the cloud-vs-local data path, or burying the key-exposure warning.
- ❌ Red/green-only result encoding.
- ❌ Defaulting to persistent key storage.
- ❌ Surfacing raw stack traces or HTTP error bodies to ordinary users.
- ❌ Implying certainty the underlying model cannot provide.

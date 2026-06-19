# Privacy & your data

Slopwatch has **no backend** and collects **no analytics**. The only network requests it
makes are the analysis requests *you* trigger, sent directly to the provider you chose.

## Where your data goes

- **Cloud provider (Anthropic / OpenAI-compatible):** the extracted page text and your
  API key are sent **directly from your browser to that provider**, under their privacy
  policy. The popup shows **☁️ Cloud**.
- **Local Ollama:** nothing leaves your device. The popup shows **🔒 Local**.

The cloud-vs-local indicator is shown **before and after every run** so there's never a
surprise about where analysis happened.

## API keys

- Keys default to **in-memory session storage** — cleared when the browser restarts.
- Persisting a key to disk is an **explicit opt-in** with a visible warning: saved keys
  are stored unencrypted in your browser profile, so anyone with access to the device's
  files could read them. Consider full-disk encryption, or leave persistence off.
- Keys are **write-only from the UI's perspective** — the settings screen shows a masked
  "Configured ✓" state and never echoes the value back. Keys are never logged, never put
  in cached results, and never sent anywhere except the provider they belong to.

## Cached results

Analysis results are cached locally (keyed by URL + a content hash) to avoid re-charging
for the same page. The cache lives only in your browser, carries a 7-day expiry, is
size-bounded, contains **no keys**, and is clearable in Settings.

## Diagnostics

There is an **off-by-default** local diagnostics log (provider, latency, token counts,
error class). It stays on your device, is viewable/exportable by you, and **never
contains page content or keys**.

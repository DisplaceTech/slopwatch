# Choosing a provider

Slopwatch doesn't ship a model — it uses one you choose, configured in **Settings**.

## Anthropic

A cloud model from Anthropic. Best quality-for-effort default for most people.

1. Settings → select **Anthropic**.
2. Paste your API key. It's stored **session-only by default** (cleared when the browser
   restarts) unless you opt into saving it.
3. Leave the model at `claude-haiku-4-5` (cheap and capable) or set your own.
4. Click **Test connection**.

Your key goes **directly from your browser to Anthropic** and is never sent to any
Slopwatch server (there isn't one). Because the key is used client-side, prefer a
scoped/limited key. The popup shows **☁️ Cloud** for this path.

## Ollama (local)

Run a model on your own machine — nothing leaves your device. The popup shows **🔒 Local**.

1. Install and run [Ollama](https://ollama.com), and pull a model (e.g. `ollama pull qwen3:4b`).
2. Settings → select **Ollama**, base URL `http://localhost:11434`.
3. Click **Fetch models** and pick one; **Test connection**.

### Fixing a CORS error

Ollama must allow the extension's origin. If you see a CORS error, set `OLLAMA_ORIGINS`
and restart Ollama — Slopwatch shows you the exact snippet, which looks like:

```sh
OLLAMA_ORIGINS="chrome-extension://*,moz-extension://*" ollama serve
```

## OpenAI-compatible

A configurable base URL covering OpenAI, OpenRouter, vLLM, LiteLLM, and similar gateways.
(Provider work is ongoing; Anthropic and Ollama are the supported paths today.)

## Permissions

Slopwatch requests a provider's network host **only when you use it**, from your click —
never up front, and never broadly. It does not request access to all sites.

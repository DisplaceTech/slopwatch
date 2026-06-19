# Slopwatch — Deployment & Release

Firefox (AMO) is the primary distribution target; Chromium (Chrome Web Store) is secondary. The
single WXT source tree builds for both. This document covers building, signing, store submission,
CI automation, and rollback.

> **Looking for the step-by-step runbook?** See [`RELEASING.md`](./RELEASING.md) — the operator's
> guide for actually cutting a release. This document is the design/policy behind it.

---

## Build Targets & Artifacts

WXT builds per-browser from one source tree:

```bash
pnpm build            # wxt build            → .output/chrome-mv3/
pnpm build:firefox    # wxt build -b firefox → .output/firefox-mv3/
pnpm zip              # wxt zip              → Chromium package zip
pnpm zip:firefox      # wxt zip -b firefox   → Firefox package zip + sources archive
```

- **Manifest version:** MV3 for both. WXT emits a Chromium **service worker** background and a
  Firefox **non-persistent event page** from the same `defineBackground()` entrypoint.
- **Firefox add-on identity:** set the Gecko ID and minimum version in `wxt.config.ts`:

  ```ts
  // wxt.config.ts (excerpt)
  export default defineConfig({
    manifest: {
      name: "Slopwatch",
      browser_specific_settings: {
        gecko: { id: "slopwatch@displace.tech", strict_min_version: "115.0" },
      },
      permissions: ["activeTab", "storage", "scripting"],
      optional_host_permissions: [
        "https://api.anthropic.com/*",
        // OpenAI-compatible + Ollama hosts requested at runtime based on user config
      ],
    },
  });
  ```
  > ⚠️ Confirm `strict_min_version` against the oldest Firefox you intend to support (MV3 event
  > pages and the APIs used here require a sufficiently recent Gecko). Verify at build time.

- **Version source of truth:** `package.json` `version`; CI fails if the git tag and
  `package.json` version disagree.

---

## Reproducible Builds (required for AMO source review)

AMO requires reviewable source plus exact build instructions whenever a bundler/minifier is used
(which WXT does). Ship and document:

- **Pinned toolchain:** Node version (`.nvmrc` / `engines`), pnpm version, committed
  `pnpm-lock.yaml`.
- **Exact commands:** `corepack enable && pnpm install --frozen-lockfile && pnpm zip:firefox`.
- **Sources archive:** `pnpm zip:firefox` emits both the extension package and a `*-sources.zip`;
  upload the sources archive alongside the package. Include a top-level note in the sources
  describing the toolchain and the single command to reproduce the build.
- **No remotely-hosted code:** MV3 and store policy forbid loading external scripts at runtime; all
  code is bundled. CI asserts no runtime `import()` of remote URLs.

---

## Firefox Distribution Paths

There are three, in increasing order of reach:

### 1. Temporary / development load
`about:debugging` → "This Firefox" → "Load Temporary Add-on" → pick the built manifest, or just
`pnpm dev:firefox` (WXT launches Firefox via `web-ext` with the extension loaded and HMR). No
signing. Resets on browser restart. Use for development and reviewer reproduction.

### 2. Self-distribution (unlisted, signed XPI)
For beta testers and the fast-rollback channel. The add-on is signed by AMO but **not** publicly
listed; you host the `.xpi` yourself and users install it directly. Signing is mandatory for
install in release Firefox.

```bash
# Sign without listing publicly (produces an installable, signed .xpi)
pnpm zip:firefox
pnpm dlx web-ext sign \
  --channel=unlisted \
  --source-dir=.output/firefox-mv3 \
  --api-key="$AMO_JWT_ISSUER" \
  --api-secret="$AMO_JWT_SECRET"
```

### 3. Listed on AMO (public)
The primary public channel. Submit via `wxt submit` (wraps `publish-browser-extension`) or the AMO
submission API. Listed add-ons go through AMO review; allow time for it.

```bash
pnpm dlx wxt submit \
  --firefox-zip .output/*-firefox.zip \
  --firefox-sources-zip .output/*-sources.zip
# credentials read from env: see "CI / Secrets" below
```

**Staged rollout on the listed channel:** publish to a limited audience first (small rollout
percentage / beta listing), validate, then promote to 100%.

---

## Chromium Distribution (secondary)

- Package with `pnpm zip` (Chromium MV3).
- Submit to the Chrome Web Store via `wxt submit --chrome-zip ...` (CWS API) or the developer
  dashboard. Note the one-time CWS developer registration fee and CWS review.
- Edge Add-ons / others are deferred (see ROADMAP M5).

---

## CI / CD (GitHub Actions)

Two workflows.

### `ci.yml` — on every push / PR
```
checkout → setup pnpm + Node (pinned) → install --frozen-lockfile
  → lint → typecheck → unit+integration+component (coverage gates)
  → build (Chromium) → build:firefox
  → e2e (Playwright, Chromium, MockProvider)
  → upload .output zips as build artifacts
```

### `release.yml` — on tag `v*.*.*`
```
all of ci.yml
  → assert package.json version == tag
  → zip:firefox (package + sources) and zip (Chromium)
  → wxt submit:
       Firefox → AMO (listed beta / staged %)   [AMO_JWT_ISSUER, AMO_JWT_SECRET]
       Chromium → CWS (optional, gated)          [CWS_* secrets]
  → attach signed artifacts to the GitHub Release
  → (manual) Firefox smoke checklist sign-off before promoting AMO beta → 100%
```

**Secrets (GitHub Actions, never in the repo):**
- `AMO_JWT_ISSUER`, `AMO_JWT_SECRET` — AMO API credentials.
- `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN` — Chrome Web Store (if/when listing).

No provider API keys ever live in CI: the suite uses recorded fixtures + `MockProvider`. Real
provider round-trips are part of the manual release checklist.

---

## Versioning & Changelog

- **SemVer** on the extension. Breaking changes to settings/storage shape bump major and ship a
  one-time migration in the background `onInstalled`/`onUpdate` handler.
- **Storage migrations:** versioned settings object; on update, migrate forward idempotently; if
  migration fails, fall back to defaults rather than crashing (and record it in optional local
  diagnostics).
- **Changelog:** `CHANGELOG.md` (Keep-a-Changelog style); the release notes for the AMO/CWS listing
  are generated from it.

---

## Store Listing Requirements (M5)

- **Name, summary, description**, category, screenshots (popup, a highlighted page, options).
- **Permission justifications:** `activeTab` (read the current page only when you click),
  `storage` (save your settings/keys locally), `scripting` (inject the analyzer on click), and the
  runtime-requested provider hosts.
- **Data-collection disclosure (mandatory, honest):** "When you run an analysis with a *cloud*
  provider, the extracted page content and your API key are sent directly from your browser to that
  provider. Slopwatch operates no server and collects no data itself. Choosing a local Ollama model
  keeps all content on your device." Complete the store's data-handling/consent forms accordingly.
- **Privacy policy** URL stating the above.

---

## Rollback

| Channel | Rollback mechanism | Time |
|---|---|---|
| Self-hosted unlisted XPI | Re-host the previous signed `.xpi`; clients update on next check | minutes |
| AMO listed | Submit the prior artifact as a new version (review applies); if severe, disable the listing and/or request expedited review | bounded by AMO review |
| CWS | Re-publish prior package (review applies) | bounded by CWS review |

**Procedure:** revert the offending commit → cut a patch tag → CI builds/signs the hotfix → ship via
the fastest applicable channel (unlisted first for severe issues) → small-% AMO rollout before
100%. Capture the failure as a regression test (see [`TESTING.md`](./TESTING.md)).

**Rollback triggers:** background worker crash, broken core flow on a major browser version, any key
leak into logs/persistent storage where it shouldn't be, or content sent to a provider the user did
not select.

---

## Operational Notes

- **Ollama users** must configure `OLLAMA_ORIGINS` to allow the extension origin and restart the
  daemon; the extension surfaces the exact snippet on a CORS error. Document this prominently in the
  README and first-run flow.
- **Anthropic/OpenAI direct browser calls** expose the user's key client-side by design; the listing
  and first-run flow state this and recommend scoped/limited keys and session-only storage.
- **No backend to operate** in v1 — there is no infra on-call rotation; "operations" is store
  hygiene, dependency updates (Dependabot/Renovate + `pnpm audit` in CI), and responding to provider
  API changes with adapter patches.

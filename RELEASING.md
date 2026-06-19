# Releasing Slopwatch — the operator's guide

This is the practical, do-this-then-that guide for **shipping a build people can actually
install**. It's written for the maintainer (you), not contributors.

> `DEPLOYMENT.md` is the *design* of the pipeline (targets, reproducible builds, rollback policy).
> **This file is the runbook.** When they disagree, fix one of them.

The golden rule for Firefox: **anything a normal person installs must be signed by Mozilla.** You
cannot hand someone a raw `.zip`/`.xpi` and have release Firefox install it. Signing is free and you
keep ownership; it just has to happen.

---

## TL;DR — the three audiences

| You want to give it to… | Channel | What you do | What they do |
|---|---|---|---|
| **Yourself / a few testers** | Temporary add-on | `pnpm build:firefox`, load the unpacked build | Load it via `about:debugging` (resets on restart) |
| **A beta group (real installs)** | Unlisted, signed XPI | Sign with `web-ext sign --channel=unlisted`, host the `.xpi` | Click your link in Firefox → Add |
| **The public** | Listed on AMO | `wxt submit` (or upload in the AMO dashboard) → Mozilla review | Find it on addons.mozilla.org → **Add to Firefox** (auto-updates) |

Chrome/Edge is secondary — see [Chrome Web Store](#chrome-web-store-secondary) at the bottom.

---

## One-time setup (do this once)

1. **Make a Firefox add-on developer account.** Sign in at
   <https://addons.mozilla.org/developers/> with a Firefox account. Free.

2. **Generate AMO API credentials** (needed for command-line signing/submission).
   AMO → **Developer Hub** → **Manage API Keys**. You get a **JWT issuer** and a **JWT secret**.
   Treat the secret like a password. Store them as environment variables locally and as GitHub
   Actions **secrets** for automated releases:
   - `AMO_JWT_ISSUER`
   - `AMO_JWT_SECRET`

3. **Confirm the add-on identity.** The extension's permanent ID is already set in `wxt.config.ts`:
   `browser_specific_settings.gecko.id = "slopwatch@displace.tech"`. **Never change this for a
   shipped add-on** — the ID is how Firefox knows two builds are the same add-on (and how updates
   work). If you ever rename the product, keep the ID.

4. **(Public listing only) Prepare the store listing assets.** See
   [Store listing checklist](#store-listing-checklist-public-only). You can do this later, but AMO
   won't publish a *listed* version without them.

---

## Every release (the checklist)

Do these in order. The version in `package.json` is the **single source of truth** — the manifest
version is generated from it.

1. **Make sure `main` is green.** CI must be passing (lint, typecheck, tests, both builds, E2E).

2. **Do the manual Firefox smoke test** on a real machine (the automated suite can't click the
   toolbar action). At minimum, on a clean profile:
   - Load the build, click the robot on a real article → score + label + reasoning + highlights.
   - A no-content page (e.g. an app shell) shows the friendly empty state.
   - Configure each provider you ship and run **Test connection**:
     - Anthropic with a real key,
     - Ollama locally — verify the `OLLAMA_ORIGINS` remediation works **from a clean state**.
   - Privacy indicator shows **Local** for Ollama and **Cloud** for Anthropic.
   - With session-only storage selected, confirm no key persists after a browser restart.
   - Dark mode and reduced-motion look right.
   (The full checklist lives in `TESTING.md` → Firefox manual smoke checklist.)

3. **Bump the version.** Edit `package.json` `version` using [SemVer](https://semver.org):
   - `0.0.x` — bug fixes,
   - `0.x.0` — new features,
   - `x.0.0` — breaking changes (e.g. a settings/storage shape change — ship a migration).

4. **Update `CHANGELOG.md`.** Move items from `[Unreleased]` into a new `## [x.y.z] - YYYY-MM-DD`
   section. These notes become the store's "What's new" text.

5. **Commit and tag.**
   ```bash
   git add package.json CHANGELOG.md
   git commit -m "release: v0.x.y"
   git tag v0.x.y
   git push && git push --tags
   ```

6. **Build the package + sources archive** (AMO requires reviewable sources because we bundle/minify):
   ```bash
   corepack pnpm install --frozen-lockfile
   corepack pnpm zip:firefox
   ```
   This writes the extension `.zip` **and** a `*-sources.zip` into `.output/`.

7. **Ship it** — pick the channel for this release:

   **a) Unlisted, signed XPI (beta testers, fast rollback):**
   ```bash
   corepack pnpm dlx web-ext sign \
     --channel=unlisted \
     --source-dir=.output/firefox-mv3 \
     --api-key="$AMO_JWT_ISSUER" \
     --api-secret="$AMO_JWT_SECRET"
   ```
   You get a signed `.xpi`. Host it somewhere (GitHub Release asset, your site) and send the link.
   Signing usually completes in seconds-to-minutes (no human review for unlisted).

   **b) Listed on AMO (the public, auto-updating):**
   ```bash
   corepack pnpm dlx wxt submit \
     --firefox-zip .output/*-firefox.zip \
     --firefox-sources-zip .output/*-sources.zip
   ```
   Or upload the two zips by hand in the AMO Developer Hub. **Listed versions go through Mozilla
   review** — allow time (often hours, sometimes days). Once approved, it's live on
   addons.mozilla.org and existing users auto-update.

8. **Verify the published artifact** installs from a clean profile and the version matches.

> **Staged rollout (recommended for listed):** publish to a small audience / as a beta listing first,
> confirm it's healthy, then promote to everyone. AMO supports this in the version's distribution
> settings.

---

## What your *users* actually do

This is the "consumable by non-developers" part — keep it this simple in your install instructions:

- **From AMO (listed):** "Open this page in Firefox and click **Add to Firefox**." That's it. Updates
  happen automatically. This is the path to recommend to non-technical people.
- **From an unlisted XPI:** "Open this link in Firefox; Firefox will ask to add the add-on — click
  **Add**." (They may need to confirm a permission prompt.) Good for testers; updates are **not**
  automatic unless you also publish an update manifest, so prefer AMO for non-devs.
- **Chrome (listed):** "Open this page in Chrome and click **Add to Chrome**."

After install, first-run guidance (which the extension itself will walk them through in M3): pick a
provider, paste a key *or* point at local Ollama, run it once on the current page.

---

## Store listing checklist (public, only for listed AMO)

AMO won't publish a listed version without these. Draft them in `CHANGELOG.md`-adjacent notes or a
`store/` folder so they're reusable:

- **Name, summary, full description**, category.
- **Screenshots:** the popup with a result, a page with highlights, the options screen.
- **Icon** (already in `public/icon/`).
- **Permission justifications** (write these plainly):
  - `activeTab` — "read the current page only when you click the toolbar button,"
  - `storage` — "save your settings and (optionally) your API key locally,"
  - `scripting` — "inject the analyzer into the page when you click,"
  - the runtime-requested provider hosts (Anthropic / your Ollama host).
- **Data-collection disclosure (mandatory and honest):** *"When you run an analysis with a cloud
  provider, the extracted page content and your API key are sent directly from your browser to that
  provider. Slopwatch operates no server and collects no data itself. Choosing a local Ollama model
  keeps all content on your device."* Complete AMO's data-handling form to match.
- **Privacy policy URL** stating the above. (Good candidate for the first page of the docs site at
  `slopwatch.displace.tech`.)

---

## Chrome Web Store (secondary)

- Build the Chromium package: `corepack pnpm zip`.
- One-time: register a Chrome Web Store **developer account** (there's a one-time fee) and create
  CWS API credentials → store as `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN`.
- Submit: `corepack pnpm dlx wxt submit --chrome-zip .output/*-chrome.zip` (or upload in the CWS
  dashboard). CWS review applies. Users then click **Add to Chrome**.

---

## If a release goes wrong (rollback)

- **Unlisted XPI:** re-host the previous signed `.xpi`; clients pick it up on next update check.
  Fastest path for a severe problem.
- **Listed AMO:** submit the previous good version as a new version (review applies); if it's
  serious, disable the listing and/or request expedited review.
- Then: revert the offending commit, cut a patch tag (`v0.x.(y+1)`), and capture the failure as a
  regression test. Full policy in `DEPLOYMENT.md` → Rollback.

---

## Not yet automated (M5)

Today these steps are manual. In **M5** we'll add `release.yml` so that pushing a `v*.*.*` tag runs
CI, asserts `package.json` version == tag, builds the package + sources, and calls `wxt submit`
gated on the tag — turning steps 6–7 into "push a tag." Until then, this runbook is the process.

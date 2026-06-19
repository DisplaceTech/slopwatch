# For maintainers

Building, testing, and shipping Slopwatch.

## Day-to-day

```bash
pnpm dev            # Chromium with hot reload
pnpm dev:firefox    # Firefox via web-ext
pnpm test           # Vitest (unit + integration + component)
pnpm e2e            # Playwright (Chromium, MockProvider)
pnpm lint
pnpm typecheck
pnpm build / pnpm build:firefox
```

Definition of done for any change: `pnpm lint && pnpm typecheck && pnpm test && pnpm build
&& pnpm build:firefox` all pass. CI runs the same plus the Chromium E2E.

## Architecture (where things live)

- `entrypoints/` — `background` (orchestrator), `popup`, `options`, and `inpage` (the
  unlisted script injected at click time for extraction + Shadow-DOM highlights).
- `lib/` — pure, tested logic: `extraction` (Readability + feeds + segmenter),
  `analysis` (prompt, schema, mapper, budgeter), `providers`, `orchestrator`, `cache`,
  `diagnostics`, `storage`, `messaging`.

The full design lives in the repo: `TDD.md`, `ROADMAP.md`, `TESTING.md`, `USABILITY.md`,
and `CLAUDE.md` (invariants + conventions).

## Releasing

The step-by-step runbook is [`RELEASING.md`](https://github.com/DisplaceTech/slopwatch/blob/main/RELEASING.md).
In short: green CI → manual Firefox smoke → bump `package.json` + `CHANGELOG.md` → tag
`vX.Y.Z` → push. The `release.yml` workflow builds the Firefox package + AMO sources
archive and the Chromium package, attaches them to a GitHub Release, and submits to the
stores when credentials are configured as secrets.

## Hard invariants

Inert by default (`activeTab` only, no `<all_urls>`); never a bare verdict (score + label
with a permanent Uncertain band + reasoning); no data leaves the device except to the
chosen provider; keys session-default and write-only; provider responses validated; page
text treated as hostile. These are enforced throughout and must not regress.

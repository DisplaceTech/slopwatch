# Install

## From the store (recommended)

Once Slopwatch is listed, open its page in **Firefox** and click **Add to Firefox**.
That's it — updates happen automatically. (Chromium: **Add to Chrome**.)

## From source (developers)

```bash
git clone https://github.com/DisplaceTech/slopwatch
cd slopwatch
corepack enable
pnpm install
pnpm build:firefox
```

Then load it in Firefox:

1. Open `about:debugging` → **This Firefox**.
2. **Load Temporary Add-on…**
3. Pick `.output/firefox-mv3/manifest.json`.

(For Chromium: `pnpm build`, then `chrome://extensions` → enable Developer mode →
**Load unpacked** → pick `.output/chrome-mv3`.)

> Temporary add-ons reset when the browser restarts — fine for trying it out. For a
> permanent, auto-updating install, use the store listing.

## First run

1. Click the robot in the toolbar.
2. The popup opens. Open **Settings** to pick a provider and add a key — or just try the
   offline **Mock** provider to see the flow.
3. Click **Run analysis on this page** on any article.

Next: [choose a provider](./providers.md).

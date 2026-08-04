# Pokémon TCG Release & Restock Alerts — v2

A Chrome extension that tracks **upcoming Pokémon TCG release dates** and
**retailer restocks**, then reminds you (browser notification + optional
calendar event) so you know when to buy or keep an eye out.

**It never buys anything.** It's purely a reminder / watchlist / calendar tool.

## What's real-time in v2

- **Release dates are live.** On install and every ~12h, the extension pulls
  real upcoming set/box release dates from the free
  [Pokémon TCG API](https://pokemontcg.io) (`api.pokemontcg.io`). No manual
  data entry needed for official releases.
- **Restocks / extra release dates** come from an optional **backend feed** —
  see [`server/`](server/). The extension reads a published `feed.json`; when
  a product flips to in-stock, you get a "Back in stock" notification.
  Direct retailer scraping (Kmart / Target / EB Games) doesn't work — verified
  2026-08-03, they're either behind a Cloudflare JS challenge or their
  `robots.txt` explicitly disallows it. Instead, the backend's
  `news-pokeguardian` adapter mines **public news articles** for release-date
  mentions — a legitimate alternative that sidesteps the retailer walls
  entirely. See [`server/README.md`](server/README.md) for exactly what's
  blocked vs. what works, and why.
- **Calendar export.** Every item has an "Add to Google Calendar" link and a
  `.ics` download for Apple Calendar / Outlook.
- Items are tagged by confidence: **Official** (structured API data),
  **News · unverified** (regex-extracted from an article — double check it),
  a retailer name (from a hand-fed feed), or **You** (manually added).

## Load it in Chrome

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top-right)
3. **Load unpacked** → select this `pokemon-tcg-alerts` folder
4. Pin the icon. Open the popup and hit **⟳** to pull live data.

## How it works

- `store.js` — storage schema + merge logic (auto-fetched + your manual items,
  with your starred/hidden state preserved across refreshes).
- `sources.js` — fetches the Pokémon TCG API + your optional restock feed.
- `background.js` — a periodic alarm refreshes data; per-release alarms fire
  reminders the day before and on release morning (9am local). Clicking a
  notification opens the product/source page.
- `popup.*` — the UI: filters (All / Releases / Restocks / ★), refresh,
  calendar buttons, add-your-own, and settings (region, feed URL, reminders).

## Turning on restock alerts (optional backend)

1. `cd server && npm run build` — this already works and writes
   `server/public/feed.json` with real release data.
2. Flesh out the retailer adapters in `server/adapters/` (each is a documented
   template; they're disabled until you verify a live endpoint — see
   `adapters/ebgames.js` for the approach and the politeness/robots notes).
3. Host `feed.json` on any static host and run `scrape.js` on a cron/GitHub
   Action every ~15–30 min.
4. In the extension: **Settings → Restock feed URL** → paste the hosted URL.

See [`server/README.md`](server/README.md) for details.

## Settings

- **Region** — AU / US / Global (tags your items; drives which feed you point at).
- **Restock feed URL** — optional; blank = release-dates-only mode.
- **Remind me the day before too** — toggles the 24h-ahead reminder.

## Notes & limits

- Sync is local to the browser profile (`chrome.storage.local`). Could add
  `chrome.storage.sync` later for cross-device.
- The Pokémon TCG API lists **announced** English sets; region-specific SKUs
  and retailer dates come through the restock feed.
- This tool reads public availability only. It does not automate purchases and
  is not affiliated with Pokémon or any retailer.

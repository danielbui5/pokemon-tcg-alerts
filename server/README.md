# Restock feed backend

A tiny, zero-dependency Node job that publishes `public/feed.json` for the
Pokémon TCG Alerts extension. Run it on a schedule; the extension reads the
published file.

## Run

```bash
cd server
npm run build      # === node scrape.js -> writes public/feed.json
```

Requires Node 18+ (uses global `fetch`). Works out of the box: `official`,
`news-pokeguardian`, and `news-dropstore` all pull real data without any
setup, so `feed.json` is valid and useful immediately.

## Adapters

Each file in `adapters/` exports an async function returning an array of
normalized items:

```js
{
  id,                         // stable unique id (dedupe key)
  name,
  releaseDate,                // "YYYY-MM-DD" (optional for pure restocks)
  kind: "release" | "restock",
  source,                     // "official" | "news" | a retailer name — confidence tag, read by the extension's badge
  region: "AU" | "US" | "GLOBAL",
  retailer,                   // e.g. "EB Games"
  url,                        // product/source page
  image, notes               // optional
}
```

- `official.js` — **working, structured.** Pokémon TCG API set release dates.
  Tags items `source: "official"`.
- `news-pokeguardian.js` — **working, but text-mined — not structured.**
  Retailer scraping is blocked (see below), so instead of a storefront this
  reads **public news articles** from [PokeGuardian](https://www.pokeguardian.com)
  (an AU-run Pokémon TCG news site) and regexes release-date sentences out of
  the prose. Verified 2026-08-03: `robots.txt` is fully permissive (just a
  `Sitemap:` line), and article pages are server-rendered plain HTML — no JS
  challenge to get past. Cross-checked against `official.js`'s API data on a
  shared set and the dates matched exactly.

  This is inherently best-effort: a regex can misread a sentence, or bundle
  two SKUs that share one release date into a single name. Every item is
  tagged `source: "news"` and carries a "verify before relying on it" note,
  and the extension renders it with a distinct **"News · unverified"** badge
  instead of blending it in as if it were as reliable as the official API.
  Takes ~30–40s per run (25 articles, throttled to 1 request/1.2s — polite,
  not aggressive polling).
- `news-dropstore.js` — **working, AU-specific.** Same text-mining approach,
  reading [Drop Store Collectables](https://dropstore.com.au)'s blog — an
  Australian TCG retailer's own public content. Verified 2026-08-04: their
  `/robots.txt` is a standard permissive Shopify default (only cart/checkout/
  account paths blocked), and Shopify blogs publish a standard Atom feed
  (`/blogs/news.atom`) with full article content inline — no need to fetch
  individual pages. Tagged `region: "AU"`, same `source: "news"` /
  unverified-badge treatment as PokeGuardian. Shares its date-extraction logic
  with `news-pokeguardian.js` via `lib/text-mining.js` — found and fixed two
  real bugs while qualifying this source: the shared regexes only matched
  US-style "Month D, Year" dates, missing this AU site's day-first "D Month
  Year" convention; and the original per-item id scheme slugified full
  article URLs, which share a long common prefix here and collided different
  articles into the same id. Both fixed in the shared lib, so
  `news-pokeguardian.js` benefits too.

  **AU sites considered and deliberately NOT wired in:**
  [cardtracker.au](https://cardtracker.au), [cardwatch.com.au](https://cardwatch.com.au),
  [dropzone.gg](https://dropzone.gg), [poke-alerts.com](https://poke-alerts.com),
  and [shinycardboard.au](https://shinycardboard.au) are AU Pokémon TCG
  restock-tracking *products*, not incidental news content — their stock data
  is literally what they sell (paid tiers, or in cardtracker.au's case an
  explicit "contact for access, costs vary" API). Using that without the
  account/payment relationship they intend would undermine their business the
  same way scraping a retailer directly would — a different situation from
  reading a free news article. `dropzone.gg`'s `robots.txt` also explicitly
  disallows `ClaudeBot`, which is respected regardless. If you want one of
  these, sign up yourself and hand me the feed URL / API key you get — that's
  a legitimate integration, just requires your account, not mine to assume.
- `kmart.js`, `target.js`, `ebgames.js` — **checked 2026-08-03, blocked.** Not
  "not yet implemented" — actually tested and closed off:
  - **EB Games AU** — the entire site (even `/robots.txt`) sits behind a
    Cloudflare managed JS challenge. No plain request gets real content.
  - **Kmart AU** — `/robots.txt` explicitly disallows `/api/` and
    `/product-discovery*` (their search backend); the search page also 403s.
  - **Target AU** — `/robots.txt` explicitly disallows `/search/*` outright.

  All three return `[]` and will keep doing so. This isn't a "try harder"
  situation: two are blocked by the site's own stated `robots.txt` policy, and
  the third requires JS-challenge/CAPTCHA bypass. Neither is something this
  project will do — that crosses from "read public availability" into evading
  bot protection or ignoring an explicit site policy.

### The legitimate path for restocks

Direct retailer scraping isn't viable for these three. Real options, roughly
in order of effort:

1. **News mining** (`news-pokeguardian.js`, `news-dropstore.js`, above) —
   already catches restock mentions too (flags `kind: "restock"` when the
   article text says "restock"/"back in stock"), just at news-cycle
   frequency, not the moment stock flips. Could add more news-site adapters
   the same way (check `robots.txt` + a sample fetch first, same process used
   to qualify both current sources).
2. **Manual entries** (already built into the extension) — when you spot a
   restock yourself, add it in seconds; same reminders + calendar export as
   everything else.
3. **Sign up for an existing AU tracker's API** — cardtracker.au explicitly
   offers one ("contact for access, costs vary"); others may too. That's a
   business decision for you to make (and possibly pay for), not something to
   route around — but once you have a key, wiring it into a new adapter here
   is straightforward.
4. **Official affiliate/partner data feed** — if a retailer runs one (via an
   affiliate network) and you're an approved partner, that's real structured
   stock data. Requires applying/being accepted — not something scraping
   substitutes for.

If a retailer adapter is ever un-blocked (site changes its policy or exposes
an API), replace the corresponding file's body — the shape above is all
`scrape.js` expects.

## Deploy

Publish `public/feed.json` to any static host and run `scrape.js` on a cron:

- **GitHub Actions** — schedule `node scrape.js`, commit `public/feed.json` to
  a `gh-pages` branch (or upload as a Pages artifact).
- **Netlify / Vercel / S3** — scheduled function writes the file to storage.

Then paste the public `feed.json` URL into the extension's
**Settings → Restock feed URL**.

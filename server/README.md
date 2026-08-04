# Restock feed backend

A tiny, zero-dependency Node job that publishes `public/feed.json` for the
Pokémon TCG Alerts extension. Run it on a schedule; the extension reads the
published file.

## Run

```bash
cd server
npm run build      # === node scrape.js -> writes public/feed.json
```

Requires Node 18+ (uses global `fetch`). Works out of the box: the `official`
and `news-pokeguardian` adapters both pull real data without any setup, so
`feed.json` is valid and useful immediately.

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

1. **News mining** (`news-pokeguardian.js`, above) — already catches restock
   mentions too (it flags `kind: "restock"` when the article text says
   "restock"/"back in stock"), just at news-cycle frequency, not the moment
   stock flips. Could add more news-site adapters the same way (check
   `robots.txt` + a sample article fetch first, same as the process used to
   qualify PokeGuardian).
2. **Manual entries** (already built into the extension) — when you spot a
   restock yourself, add it in seconds; same reminders + calendar export as
   everything else.
3. **Official affiliate/partner data feed** — if a retailer runs one (via an
   affiliate network) and you're an approved partner, that's real structured
   stock data. Requires applying/being accepted — not something scraping
   substitutes for.
4. **An existing community feed** — if a restock-tracking community (Discord
   bot export, subreddit, dedicated tracker site) already publishes a stable
   public feed, point `feed.json`'s source at that instead of scraping
   retailers yourself.

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

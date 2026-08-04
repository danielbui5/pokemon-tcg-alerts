// adapters/news-pokeguardian.js — news-mining adapter (PokeGuardian).
//
// Different approach from the retailer adapters: instead of scraping a
// retailer's storefront (blocked — see kmart.js/target.js/ebgames.js),
// this reads PUBLIC NEWS ARTICLES and extracts release-date mentions from
// the prose. PokeGuardian is a Pokémon TCG news site with a permissive
// robots.txt (just a Sitemap directive, no Disallow) — verified 2026-08-03.
//
// HONESTY NOTE: this is text-mining, not a structured API. It regexes plain
// English sentences out of articles, which is inherently best-effort:
//   - a date it finds might describe something other than a product release
//   - product-name capture can bundle two SKUs sharing one sentence together
// Every item from this adapter carries source:"news" + a "verify before
// relying on it" note so the extension can flag it as unverified in the UI,
// distinct from official.js (a real structured API).
//
// Process:
//   1. Fetch sitemap.xml, take the N highest-numbered article IDs (their URLs
//      embed an incrementing numeric ID, which is a reliable recency proxy —
//      confirmed against known chronology during testing).
//   2. Fetch each article (slowly — politeness delay between requests).
//   3. Extract dates two ways:
//        a. Structured: "<Product name> ... Release Date: <Month D, Year>"
//           — appears in PokeGuardian's seasonal "release guide" articles.
//        b. Fallback: a release/launch date sentence in the og:description
//           meta tag, tied to the article title as a whole.
//   4. Classify kind: "restock" if restock language appears, else "release".

const SITEMAP_URL = "https://www.pokeguardian.com/sitemap.xml";
const MAX_ARTICLES = 25;
const REQUEST_DELAY_MS = 1200;

const PRODUCT_KEYWORDS =
  "(Elite Trainer Box|Booster Bundle|Booster Box|Binder Collection|Poster Collection|Mini Tin|Tech Sticker Collection|Illustration Collection|Premium Collection|Collection|Build ?& ?Battle Box|Deck)";

const STRUCTURED_RE = new RegExp(
  `([A-Z][A-Za-z0-9&\\-' ]{3,70}?${PRODUCT_KEYWORDS})\\s*Release Date:\\s*([A-Z][a-z]+ \\d{1,2},?\\s*\\d{4})`,
  "g"
);
const FALLBACK_DATE_RE =
  /(?:release[sd]?|launch(?:es|ed)?|hits shelves)\s*(?:on)?\s*([A-Z][a-z]+ \d{1,2},?\s*\d{4})/i;
const RESTOCK_RE = /\b(restock|back in stock|back-in-stock)\b/i;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12
};

function parseEnglishDate(str) {
  // "July 18, 2025" / "November 6 2026" -> "YYYY-MM-DD".
  // Parses the calendar components directly (no Date/toISOString round-trip —
  // that goes through local-time interpretation then UTC conversion, which
  // silently shifts the date by a day in positive-UTC-offset timezones).
  const m = str.match(/([A-Za-z]+)\s+(\d{1,2}),?\s*(\d{4})/);
  if (!m) return null;
  const month = MONTHS[m[1].toLowerCase()];
  if (!month) return null;
  const day = Number(m[2]);
  const year = Number(m[3]);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; pokemon-tcg-alerts-news/1.0; personal reminder tool)",
      Accept: "text/html"
    }
  });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.text();
}

function stripHtmlToText(html) {
  let t = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ");
  t = t.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ");
  t = t.replace(/<[^>]+>/g, " ");
  t = t.replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/&#39;/g, "'");
  return t.replace(/\s+/g, " ").trim();
}

function extractOgDescription(html) {
  let m = html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]*)"/);
  if (!m) m = html.match(/<meta[^>]*content="([^"]*)"[^>]*property="og:description"/);
  return m ? m[1] : "";
}

function titleFromHtml(html) {
  const m = html.match(/<title>([^<]*)<\/title>/);
  return m ? m[1].replace(/\s*\|\s*PokeGuardian.*$/i, "").trim() : null;
}

async function getRecentArticleUrls() {
  const xml = await fetchText(SITEMAP_URL);
  const ids = new Map(); // id -> url (dedupe; only bare top-level article URLs)
  const re = /https:\/\/www\.pokeguardian\.com\/(\d+)_([a-z0-9-]+)/g;
  let m;
  while ((m = re.exec(xml))) {
    const id = Number(m[1]);
    if (!ids.has(id)) ids.set(id, `https://www.pokeguardian.com/${m[1]}_${m[2]}`);
  }
  return [...ids.entries()]
    .sort((a, b) => b[0] - a[0])
    .slice(0, MAX_ARTICLES)
    .map(([id, url]) => ({ id, url }));
}

function extractItemsFromArticle({ id, url, html }) {
  const title = titleFromHtml(html) || url;
  const bodyText = stripHtmlToText(html);
  const description = extractOgDescription(html);
  const isRestock = RESTOCK_RE.test(bodyText);
  const items = [];

  // Structured per-product "Release Date:" mentions (release guides etc).
  let match;
  STRUCTURED_RE.lastIndex = 0;
  let idx = 0;
  while ((match = STRUCTURED_RE.exec(bodyText))) {
    const releaseDate = parseEnglishDate(match[2]);
    if (!releaseDate) continue;
    const productName = match[1].replace(/\s+/g, " ").trim();
    items.push({
      id: `news-pokeguardian-${id}-${idx++}`,
      name: productName,
      releaseDate,
      kind: isRestock ? "restock" : "release",
      source: "news",
      region: "GLOBAL",
      url,
      notes: `Auto-extracted from a news article — verify before relying on it. Source: ${title}`
    });
  }

  // Fallback: one article-level date from the description, if nothing structured found.
  if (items.length === 0) {
    const dm = description.match(FALLBACK_DATE_RE);
    const releaseDate = dm ? parseEnglishDate(dm[1]) : null;
    if (releaseDate) {
      items.push({
        id: `news-pokeguardian-${id}-0`,
        name: title,
        releaseDate,
        kind: isRestock ? "restock" : "release",
        source: "news",
        region: "GLOBAL",
        url,
        notes: `Auto-extracted from a news article — verify before relying on it.${description ? " " + description : ""}`
      });
    }
  }

  return items;
}

export default async function newsPokeguardian() {
  const candidates = await getRecentArticleUrls();
  const results = [];

  for (const { id, url } of candidates) {
    try {
      const html = await fetchText(url);
      results.push(...extractItemsFromArticle({ id, url, html }));
    } catch (e) {
      console.warn(`[news-pokeguardian] ${url} failed: ${e.message}`);
    }
    await sleep(REQUEST_DELAY_MS);
  }

  return results;
}

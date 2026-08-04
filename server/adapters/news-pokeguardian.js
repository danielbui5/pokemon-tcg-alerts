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
//   3. Extract dates two ways (see lib/text-mining.js):
//        a. Structured: "<Product name> ... Release Date: <Month D, Year>"
//           — appears in PokeGuardian's seasonal "release guide" articles.
//        b. Fallback: a release/launch date sentence in the og:description
//           meta tag, tied to the article title as a whole.
//      Both are filtered to RELEVANCE_WINDOW_DAYS — an article can be recent
//      while referencing an old release (e.g. a retrospective piece).
//   4. Classify kind: "restock" if restock language appears, else "release".

import {
  RESTOCK_RE,
  stripHtmlToText,
  extractStructuredReleases,
  extractFallbackRelease,
  sleep
} from "../lib/text-mining.js";

const SITEMAP_URL = "https://www.pokeguardian.com/sitemap.xml";
const MAX_ARTICLES = 25;
const REQUEST_DELAY_MS = 1200;

function extractOgDescription(html) {
  let m = html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]*)"/);
  if (!m) m = html.match(/<meta[^>]*content="([^"]*)"[^>]*property="og:description"/);
  return m ? m[1] : "";
}

function titleFromHtml(html) {
  const m = html.match(/<title>([^<]*)<\/title>/);
  return m ? m[1].replace(/\s*\|\s*PokeGuardian.*$/i, "").trim() : null;
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

  extractStructuredReleases(bodyText).forEach(({ productName, releaseDate }, idx) => {
    items.push({
      id: `news-pokeguardian-${id}-${idx}`,
      name: productName,
      releaseDate,
      kind: isRestock ? "restock" : "release",
      source: "news",
      region: "GLOBAL",
      url,
      notes: `Auto-extracted from a news article — verify before relying on it. Source: ${title}`
    });
  });

  if (items.length === 0) {
    const releaseDate = extractFallbackRelease(description);
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

// adapters/news-dropstore.js — news-mining adapter (Drop Store Collectables,
// dropstore.com.au), the AU-specific counterpart to news-pokeguardian.js.
//
// Found via the same due-diligence process used for PokeGuardian: verified
// 2026-08-04 that dropstore.com.au (an Australian TCG retailer) publishes a
// standard Shopify blog Atom feed (/blogs/news.atom) with a permissive
// robots.txt (only the usual /cart, /checkout, /account paths disallowed —
// no restriction on the blog). This is the retailer's own public content,
// syndicated on purpose — not scraping a storefront.
//
// Other AU restock-tracking sites turned up during research
// (cardtracker.au, cardwatch.com.au, dropzone.gg, poke-alerts.com,
// shinycardboard.au) were deliberately NOT wired in:
//   - dropzone.gg's robots.txt explicitly disallows ClaudeBot — respected.
//   - The rest are commercial tracking products (paid tiers, or a
//     contact-for-access API in cardtracker.au's case). Their stock data IS
//     their business, unlike a news article's incidental content — using it
//     without the account/payment relationship they intend would undermine
//     their product the same way scraping a retailer would. If you want one
//     of these, sign up yourself and I can wire in the feed/API key you get.
//
// HONESTY NOTE: same as news-pokeguardian.js — this is text-mining a news
// article, not a structured database. Tagged source:"news" with a "verify
// before relying on it" note; the extension shows a distinct unverified badge.

import {
  RESTOCK_RE,
  stripHtmlToText,
  extractStructuredReleases,
  extractFallbackRelease
} from "../lib/text-mining.js";

const FEED_URL = "https://dropstore.com.au/blogs/news.atom";

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; pokemon-tcg-alerts-news/1.0; personal reminder tool)",
      Accept: "application/atom+xml"
    }
  });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.text();
}

function parseEntries(xml) {
  const entries = [];
  const entryRe = /<entry>([\s\S]*?)<\/entry>/g;
  let m;
  while ((m = entryRe.exec(xml))) {
    const block = m[1];
    const idMatch = block.match(/<id>([^<]*)<\/id>/);
    const linkMatch = block.match(/<link[^>]*rel="alternate"[^>]*href="([^"]*)"/);
    const titleMatch = block.match(/<title[^>]*>([^<]*)<\/title>/);
    const contentMatch = block.match(/<content[^>]*>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/content>/);
    if (!idMatch || !linkMatch || !titleMatch) continue;
    entries.push({
      id: idMatch[1],
      url: linkMatch[1],
      title: titleMatch[1].trim(),
      contentHtml: contentMatch ? contentMatch[1] : ""
    });
  }
  return entries;
}

// All Drop Store article URLs share the long prefix
// ".../blogs/news/pokemon-tcg-..." — slugifying the full URL and truncating
// from the front collided different articles into the same id (found via
// testing). Use just the URL's own last path segment instead, which is
// already the unique per-article slug Shopify generates.
function slugFromUrl(url) {
  const path = url.replace(/\/+$/, "").split("/").pop() || url;
  return path.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60);
}

function extractItemsFromEntry(entry) {
  const bodyText = stripHtmlToText(entry.contentHtml);
  const isRestock = RESTOCK_RE.test(bodyText);
  const items = [];

  extractStructuredReleases(bodyText).forEach(({ productName, releaseDate }, idx) => {
    items.push({
      id: `news-dropstore-${slugFromUrl(entry.url)}-${idx}`,
      name: productName,
      releaseDate,
      kind: isRestock ? "restock" : "release",
      source: "news",
      region: "AU",
      url: entry.url,
      notes: `Auto-extracted from a news article — verify before relying on it. Source: ${entry.title}`
    });
  });

  if (items.length === 0) {
    const releaseDate = extractFallbackRelease(bodyText);
    if (releaseDate) {
      items.push({
        id: `news-dropstore-${slugFromUrl(entry.url)}-0`,
        name: entry.title,
        releaseDate,
        kind: isRestock ? "restock" : "release",
        source: "news",
        region: "AU",
        url: entry.url,
        notes: "Auto-extracted from a news article — verify before relying on it."
      });
    }
  }

  return items;
}

export default async function newsDropstore() {
  const xml = await fetchText(FEED_URL);
  const entries = parseEntries(xml);
  return entries.flatMap(extractItemsFromEntry);
}

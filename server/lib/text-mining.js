// lib/text-mining.js — shared text-mining helpers for news-style adapters
// (news-pokeguardian.js, news-dropstore.js). Factored out so a fix like the
// timezone date-parsing bug only needs to happen once, not once per adapter.

// How many days past its release date an extracted item stays relevant.
// Matches the window used in official.js and enforced again client-side in
// store.js's getMergedReleases() (belt-and-suspenders against regressions).
export const RELEVANCE_WINDOW_DAYS = 21;

export const PRODUCT_KEYWORDS =
  "(Elite Trainer Box|Booster Bundle|Booster Box|Binder Collection|Poster Collection|Mini Tin|Tech Sticker Collection|Illustration Collection|Premium Collection|Collection|Build ?& ?Battle Box|Deck)";

// Matches both US-style "September 16, 2026" and AU/UK-style "16 September
// 2026" — different sites/regions default to different orders (found via a
// real miss: dropstore.com.au, an AU retailer, only ever uses day-first).
const DATE_FRAGMENT =
  "(?:[A-Z][a-z]+ \\d{1,2},?\\s*\\d{4}|\\d{1,2} [A-Z][a-z]+,?\\s*\\d{4})";

// "<Product name> ... Release Date: <date>" — seen in structured
// release-guide style articles.
export const STRUCTURED_RE = new RegExp(
  `([A-Z][A-Za-z0-9&\\-' ]{3,70}?${PRODUCT_KEYWORDS})\\s*Release Date:\\s*(${DATE_FRAGMENT})`,
  "g"
);

// A single release/launch date sentence, for articles without the structured
// label. Allows a few filler words between the keyword and "on <date>" (e.g.
// "releases worldwide on 16 September 2026") but stays within one sentence.
export const FALLBACK_DATE_RE = new RegExp(
  `(?:release[sd]?|launch(?:es|ed)?|hits shelves|available|on sale)\\b[^.]{0,30}?\\bon\\s+(${DATE_FRAGMENT})`,
  "i"
);

export const RESTOCK_RE = /\b(restock|back in stock|back-in-stock)\b/i;

const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12
};

// "July 18, 2025" / "16 September 2026" -> "YYYY-MM-DD".
// Parses the calendar components directly (no Date/toISOString round-trip —
// that goes through local-time interpretation then UTC conversion, which
// silently shifts the date by a day in positive-UTC-offset timezones).
export function parseEnglishDate(str) {
  let m = str.match(/([A-Za-z]+)\s+(\d{1,2}),?\s*(\d{4})/); // "Month D, Year"
  let month, day, year;
  if (m) {
    month = MONTHS[m[1].toLowerCase()];
    day = Number(m[2]);
    year = Number(m[3]);
  } else {
    m = str.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/); // "D Month Year"
    if (!m) return null;
    month = MONTHS[m[2].toLowerCase()];
    day = Number(m[1]);
    year = Number(m[3]);
  }
  if (!month) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function isWithinRelevanceWindow(releaseDate) {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - RELEVANCE_WINDOW_DAYS);
  return releaseDate >= cutoff.toISOString().slice(0, 10);
}

export function stripHtmlToText(html) {
  let t = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ");
  t = t.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ");
  t = t.replace(/<[^>]+>/g, " ");
  t = t.replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/&#39;/g, "'");
  return t.replace(/\s+/g, " ").trim();
}

// Extracts structured "<Product> Release Date: <date>" pairs, filtered to
// the relevance window. Returns [{ productName, releaseDate }].
export function extractStructuredReleases(bodyText) {
  const out = [];
  STRUCTURED_RE.lastIndex = 0;
  let match;
  while ((match = STRUCTURED_RE.exec(bodyText))) {
    const releaseDate = parseEnglishDate(match[2]);
    if (!releaseDate || !isWithinRelevanceWindow(releaseDate)) continue;
    out.push({ productName: match[1].replace(/\s+/g, " ").trim(), releaseDate });
  }
  return out;
}

// Single article-level fallback date, or null.
export function extractFallbackRelease(text) {
  const dm = text.match(FALLBACK_DATE_RE);
  const releaseDate = dm ? parseEnglishDate(dm[1]) : null;
  if (!releaseDate || !isWithinRelevanceWindow(releaseDate)) return null;
  return releaseDate;
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

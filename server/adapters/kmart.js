// adapters/kmart.js — Kmart AU restock adapter.
//
// STATUS: BLOCKED, verified 2026-08-03. Kmart's own /robots.txt explicitly
// disallows /api/ and /product-discovery* (their search backend), and their
// search page returns 403 to a plain request. Scraping a path a site's
// robots.txt explicitly disallows isn't "reading public availability" — it's
// against the site's stated policy, so this tool won't do it.
//
// Returns [] until/unless Kmart AU offers an official product/affiliate feed
// (a legitimate path — but requires signing up as a partner, not something
// scraping can substitute for).

export default async function kmart() {
  return [];
}

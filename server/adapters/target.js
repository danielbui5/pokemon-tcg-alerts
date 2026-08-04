// adapters/target.js — Target AU restock adapter.
//
// STATUS: BLOCKED, verified 2026-08-03. Target AU's /robots.txt explicitly
// disallows /search/* — a direct "don't crawl this" from the site itself.
// This tool respects that; scraping search results here isn't "reading
// public availability", it's crawling a path the site has explicitly opted
// out of.
//
// Returns [] until/unless Target AU offers an official product/affiliate
// feed (a legitimate path — requires becoming an approved partner).

export default async function target() {
  return [];
}

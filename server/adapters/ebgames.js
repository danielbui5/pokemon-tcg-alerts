// adapters/ebgames.js — EB Games AU restock adapter.
//
// STATUS: BLOCKED, verified 2026-08-03. www.ebgames.com.au sits entirely
// behind a Cloudflare "managed challenge" (even /robots.txt returns a
// "Just a moment..." JS challenge page, not content) — a plain fetch() gets
// no usable data. Getting past this requires a headless browser + CAPTCHA/JS
// challenge solving, which is bot-detection evasion, not "reading public
// availability" — out of scope for this tool. Do not attempt to bypass it.
//
// Returns [] until/unless EB Games AU exposes a real API (e.g. an official
// affiliate/partner product feed you're approved for) or removes the
// challenge for this path.

export default async function ebgames() {
  return [];
}

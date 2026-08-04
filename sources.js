// sources.js — fetches REAL data from the web and normalizes it.
// Loaded via importScripts() in background.js.
//
// Two sources:
//   1. Pokémon TCG API (api.pokemontcg.io) — official set release dates. Free,
//      no key required for light use. This is real, live data and works from an
//      extension because api.pokemontcg.io is in host_permissions.
//   2. Optional remote feed.json published by the backend scraper (server/) —
//      carries retailer restocks + region-specific product SKUs.

const POKEAPI_SETS = "https://api.pokemontcg.io/v2/sets";

// "YYYY/MM/DD" (API format) or "YYYY-MM-DD" -> "YYYY-MM-DD"
function normalizeDate(d) {
  if (!d) return null;
  return d.replace(/\//g, "-").slice(0, 10);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// Fetch upcoming official sets (release date today or later).
// windowDays lets you also surface very recent releases (restock-worthy).
async function fetchOfficialSets({ region = "AU", pastDays = 21 } = {}) {
  const url = `${POKEAPI_SETS}?orderBy=-releaseDate&pageSize=40`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Pokémon TCG API ${res.status}`);
  const json = await res.json();
  const sets = json.data || [];

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - pastDays);
  const cutoffISO = cutoff.toISOString().slice(0, 10);

  return sets
    .map((s) => {
      const releaseDate = normalizeDate(s.releaseDate);
      if (!releaseDate) return null;
      if (releaseDate < cutoffISO) return null; // too old to care about
      return {
        id: `set-${s.id}`,
        name: `${s.name} (${s.series})`,
        releaseDate,
        kind: "release",
        source: "official-api",
        region,
        url: "https://www.pokemon.com/us/pokemon-tcg/",
        image: s.images && s.images.logo ? s.images.logo : undefined,
        notes: `Official English set · ${s.total} cards`
      };
    })
    .filter(Boolean);
}

// Fetch the backend-published feed (retailer restocks etc). Optional.
async function fetchRemoteFeed(feedUrl) {
  if (!feedUrl) return [];
  const res = await fetch(feedUrl, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Feed ${res.status}`);
  const json = await res.json();
  const items = Array.isArray(json) ? json : json.items || [];
  return items
    .map((it) => {
      const releaseDate = normalizeDate(it.releaseDate || it.date);
      if (!it.name) return null;
      return {
        id: it.id || `feed-${(it.retailer || "x")}-${(it.name || "").slice(0, 24)}`,
        name: it.name,
        releaseDate,
        kind: it.kind || (it.restock ? "restock" : "release"),
        // Preserve the adapter's own source tag ("official" / "news" / a
        // retailer name) so the UI can tell a confirmed API date apart from
        // a best-effort news-article extraction. Falls back to "feed" for
        // items that don't carry one (e.g. a hand-rolled retailer feed).
        source: it.source || "feed",
        region: it.region || "AU",
        retailer: it.retailer,
        url: it.url,
        image: it.image,
        notes: it.notes
      };
    })
    .filter(Boolean);
}

// Pull everything, merge official + feed, dedupe by id.
async function refreshFeedCache() {
  const settings = await getSettings();
  const results = [];
  const errors = [];

  try {
    results.push(...(await fetchOfficialSets({ region: settings.region })));
  } catch (e) {
    errors.push(`official: ${e.message}`);
  }

  try {
    results.push(...(await fetchRemoteFeed(settings.feedUrl)));
  } catch (e) {
    errors.push(`feed: ${e.message}`);
  }

  const byId = new Map();
  for (const item of results) byId.set(item.id, item);
  const merged = [...byId.values()];

  // Only overwrite cache if we actually got something; avoids wiping cache
  // on a transient network failure.
  if (merged.length > 0) {
    await saveFeedCache(merged);
  }
  return { count: merged.length, errors };
}

Object.assign(globalThis, {
  fetchOfficialSets,
  fetchRemoteFeed,
  refreshFeedCache,
  todayISO
});

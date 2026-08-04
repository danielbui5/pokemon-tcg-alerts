// adapters/official.js — REAL, working adapter.
// Pulls upcoming official set release dates from the Pokémon TCG API and
// returns them in the feed's normalized shape. This makes feed.json valid and
// useful immediately, before any retailer scrapers are tuned.

const POKEAPI_SETS = "https://api.pokemontcg.io/v2/sets?orderBy=-releaseDate&pageSize=40";

export default async function official() {
  const res = await fetch(POKEAPI_SETS, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Pokémon TCG API ${res.status}`);
  const json = await res.json();

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 21);
  const cutoffISO = cutoff.toISOString().slice(0, 10);

  return (json.data || [])
    .map((s) => {
      const releaseDate = (s.releaseDate || "").replace(/\//g, "-").slice(0, 10);
      if (!releaseDate || releaseDate < cutoffISO) return null;
      return {
        id: `set-${s.id}`,
        name: `${s.name} (${s.series})`,
        releaseDate,
        kind: "release",
        source: "official",
        region: "GLOBAL",
        url: "https://www.pokemon.com/us/pokemon-tcg/",
        image: s.images?.logo,
        notes: `Official English set · ${s.total} cards`
      };
    })
    .filter(Boolean);
}

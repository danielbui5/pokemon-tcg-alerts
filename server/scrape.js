// scrape.js — orchestrator. Runs each adapter, merges results, writes
// public/feed.json. Point the extension's "Restock feed URL" setting at the
// hosted URL of that file.
//
// Run:   npm run build           (or: node scrape.js)
// Deploy: run on a cron / GitHub Action every ~15–30 min and publish
//         public/feed.json to any static host (GitHub Pages, S3, Netlify…).
//
// Zero npm dependencies by default (uses Node 18+ global fetch). The retailer
// adapters that need HTML parsing note where to add `cheerio`.

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import official from "./adapters/official.js";
import kmart from "./adapters/kmart.js";
import target from "./adapters/target.js";
import ebgames from "./adapters/ebgames.js";
import newsPokeguardian from "./adapters/news-pokeguardian.js";
import newsDropstore from "./adapters/news-dropstore.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const ADAPTERS = [
  { name: "official", run: official },
  { name: "news-pokeguardian", run: newsPokeguardian },
  { name: "news-dropstore", run: newsDropstore },
  { name: "kmart", run: kmart },
  { name: "target", run: target },
  { name: "ebgames", run: ebgames }
];

async function main() {
  const items = [];
  for (const a of ADAPTERS) {
    try {
      const got = await a.run();
      console.log(`[${a.name}] ${got.length} item(s)`);
      items.push(...got);
      await sleep(1500); // be polite between retailers
    } catch (e) {
      console.warn(`[${a.name}] failed: ${e.message}`);
    }
  }

  // Dedupe by id (last wins).
  const byId = new Map();
  for (const it of items) byId.set(it.id, it);
  const feed = {
    generatedAt: new Date().toISOString(),
    items: [...byId.values()]
  };

  const outDir = join(__dirname, "public");
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, "feed.json"), JSON.stringify(feed, null, 2));
  console.log(`Wrote public/feed.json with ${feed.items.length} item(s).`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

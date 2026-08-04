// store.js — shared storage schema + merge logic.
// Loaded via importScripts() in background.js and <script> in popup.html,
// so this is a classic script that attaches helpers to globalThis.
//
// Storage schema (chrome.storage.local):
//   settings       { region, feedUrl, refreshHours, notifyBefore }
//   manualReleases [ item... ]   user-added, never overwritten by refresh
//   feedCache      [ item... ]   auto-fetched (official API + remote feed)
//   userState      { starred:{id:true}, dismissed:{id:true} }
//   lastRefresh    number (epoch ms)
//
// Normalized item shape:
//   {
//     id, name, releaseDate: "YYYY-MM-DD",
//     kind: "release" | "restock" | "manual",
//     source: "official-api" | "feed" | "manual",
//     region, retailer?, url?, image?, notes?
//   }

const DEFAULT_SETTINGS = {
  region: "AU",
  // Optional: URL of a feed.json published by the backend scraper (server/).
  // Leave "" to run extension-only (official release dates still work).
  feedUrl: "",
  refreshHours: 12,
  notifyBefore: true
};

function scGet(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}
function scSet(obj) {
  return new Promise((resolve) => chrome.storage.local.set(obj, resolve));
}

async function getSettings() {
  const { settings } = await scGet(["settings"]);
  return { ...DEFAULT_SETTINGS, ...(settings || {}) };
}
async function saveSettings(patch) {
  const current = await getSettings();
  const next = { ...current, ...patch };
  await scSet({ settings: next });
  return next;
}

async function getManual() {
  const { manualReleases } = await scGet(["manualReleases"]);
  return manualReleases || [];
}
async function saveManual(list) {
  await scSet({ manualReleases: list });
}

async function getFeedCache() {
  const { feedCache } = await scGet(["feedCache"]);
  return feedCache || [];
}
async function saveFeedCache(list) {
  await scSet({ feedCache: list, lastRefresh: Date.now() });
}

async function getUserState() {
  const { userState } = await scGet(["userState"]);
  return { starred: {}, dismissed: {}, ...(userState || {}) };
}
async function saveUserState(state) {
  await scSet({ userState: state });
}

// The unified list the UI and the alarm scheduler both consume.
// Merges auto-fetched + manual, drops dismissed, applies starred flag,
// dedupes by id (manual wins), and sorts soonest-first.
async function getMergedReleases({ includeDismissed = false } = {}) {
  const [feed, manual, state] = await Promise.all([
    getFeedCache(),
    getManual(),
    getUserState()
  ]);

  const byId = new Map();
  for (const item of feed) byId.set(item.id, item);
  for (const item of manual) byId.set(item.id, item); // manual overrides feed

  let merged = [...byId.values()].map((item) => ({
    ...item,
    starred: !!state.starred[item.id],
    dismissed: !!state.dismissed[item.id]
  }));

  if (!includeDismissed) merged = merged.filter((r) => !r.dismissed);

  merged.sort((a, b) => {
    const da = a.releaseDate || "9999-12-31";
    const db = b.releaseDate || "9999-12-31";
    return da.localeCompare(db);
  });
  return merged;
}

// expose on globalThis so both contexts can use it
Object.assign(globalThis, {
  DEFAULT_SETTINGS,
  getSettings,
  saveSettings,
  getManual,
  saveManual,
  getFeedCache,
  saveFeedCache,
  getUserState,
  saveUserState,
  getMergedReleases
});

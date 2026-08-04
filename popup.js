// popup.js — UI. Reads the merged list via store.js helpers, renders it,
// and delegates live-refresh / rescheduling to the background service worker.

const el = (id) => document.getElementById(id);
const listEl = el("releases-list");
const statusEl = el("status");

let activeFilter = "all";

function send(type, payload = {}) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, ...payload }, (resp) => resolve(resp));
  });
}

function setStatus(msg) {
  statusEl.textContent = msg;
  if (msg) setTimeout(() => { if (statusEl.textContent === msg) statusEl.textContent = ""; }, 4000);
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str == null ? "" : str;
  return d.innerHTML;
}

function formatDate(dateStr) {
  if (!dateStr) return "date TBA";
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function dueLabel(dateStr) {
  if (!dateStr) return "TBA";
  const days = Math.ceil((new Date(`${dateStr}T00:00:00`) - new Date()) / 86400000);
  if (days < 0) return `${-days}d ago`;
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days}d`;
}

function sourceBadge(item) {
  if (item.source === "official-api" || item.source === "official") {
    return `<span class="badge official">Official</span>`;
  }
  if (item.source === "news") {
    return `<span class="badge news" title="Auto-extracted from a news article — verify before relying on it">News · unverified</span>`;
  }
  if (item.source === "feed") return `<span class="badge feed">${escapeHtml(item.retailer || "Retailer")}</span>`;
  return `<span class="badge manual">You</span>`;
}

async function render() {
  const [releases, settings] = await Promise.all([getMergedReleases(), getSettings()]);
  el("region-label").textContent = settings.region;

  const { lastRefresh } = await new Promise((r) => chrome.storage.local.get(["lastRefresh"], r));
  el("last-refresh").textContent = lastRefresh
    ? `updated ${timeAgo(lastRefresh)}`
    : "not yet updated";

  let filtered = releases;
  if (activeFilter === "release") filtered = releases.filter((r) => r.kind !== "restock");
  else if (activeFilter === "restock") filtered = releases.filter((r) => r.kind === "restock");
  else if (activeFilter === "starred") filtered = releases.filter((r) => r.starred);

  listEl.innerHTML = "";
  if (filtered.length === 0) {
    listEl.innerHTML = `<div class="empty">Nothing here yet. Hit ⟳ to pull live data.</div>`;
    return;
  }

  for (const r of filtered) {
    const item = document.createElement("div");
    item.className = "release-item" + (r.kind === "restock" ? " restock" : "");
    const gcal = googleCalUrl(r);
    const starPrefix = r.starred ? "★ " : "";
    const nameHtml = r.url
      ? `<a class="name-link" href="${escapeHtml(r.url)}" target="_blank" rel="noopener" title="Open the original source">${starPrefix}${escapeHtml(r.name)}</a>`
      : `${starPrefix}${escapeHtml(r.name)}`;
    item.innerHTML = `
      <div class="info">
        <div class="name">${nameHtml} ${sourceBadge(r)}</div>
        <div class="date">${formatDate(r.releaseDate)} · <b>${dueLabel(r.releaseDate)}</b>${r.kind === "restock" ? " · restock" : ""}</div>
        ${r.notes ? `<div class="notes">${escapeHtml(r.notes)}</div>` : ""}
      </div>
      <div class="actions">
        <button data-action="star" data-id="${r.id}" title="Star">${r.starred ? "★" : "☆"}</button>
        ${gcal ? `<a class="iconbtn" href="${gcal}" target="_blank" title="Add to Google Calendar">📅</a>` : ""}
        <button data-action="ics" data-id="${r.id}" title="Download .ics">⤓</button>
        <button data-action="dismiss" data-id="${r.id}" title="Hide">✕</button>
      </div>`;
    listEl.appendChild(item);
  }
}

function timeAgo(ts) {
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

// ---------- actions ----------

listEl.addEventListener("click", async (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  const { action, id } = btn.dataset;
  const releases = await getMergedReleases({ includeDismissed: true });
  const r = releases.find((x) => x.id === id);
  if (!r) return;

  if (action === "star" || action === "dismiss") {
    const state = await getUserState();
    if (action === "star") state.starred[id] = !state.starred[id];
    if (action === "dismiss") state.dismissed[id] = true;
    await saveUserState(state);
    render();
  } else if (action === "ics") {
    const url = icsBlobUrl(r);
    if (!url) return setStatus("No date to export.");
    const a = document.createElement("a");
    a.href = url;
    a.download = `${r.name.replace(/[^\w]+/g, "-").slice(0, 40)}.ics`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
});

el("filters").addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  activeFilter = btn.dataset.filter;
  [...el("filters").children].forEach((b) => b.classList.toggle("active", b === btn));
  render();
});

el("refresh-btn").addEventListener("click", async () => {
  el("refresh-btn").classList.add("spin");
  setStatus("Fetching live data…");
  const resp = await send("REFRESH_NOW");
  el("refresh-btn").classList.remove("spin");
  if (resp && resp.result) {
    const errs = resp.result.errors || [];
    setStatus(errs.length ? `Updated (${errs.join("; ")})` : `Updated · ${resp.result.count} items`);
  } else {
    setStatus("Refresh failed.");
  }
  render();
});

el("add-btn").addEventListener("click", async () => {
  const name = el("name-input").value.trim();
  const date = el("date-input").value;
  const retailer = el("retailer-input").value.trim();
  if (!name || !date) return setStatus("Enter a name and date.");

  const manual = await getManual();
  manual.push({
    id: `manual-${Date.now()}`,
    name,
    releaseDate: date,
    retailer: retailer || undefined,
    kind: "manual",
    source: "manual",
    region: (await getSettings()).region,
    notes: ""
  });
  await saveManual(manual);
  await send("RELEASES_UPDATED");
  el("name-input").value = el("date-input").value = el("retailer-input").value = "";
  setStatus("Added. Reminders scheduled.");
  render();
});

el("save-settings-btn").addEventListener("click", async () => {
  await saveSettings({
    region: el("region-select").value,
    feedUrl: el("feed-input").value.trim(),
    notifyBefore: el("notify-before").checked
  });
  await send("SETTINGS_UPDATED");
  setStatus("Settings saved. Refreshing…");
  await send("REFRESH_NOW");
  render();
});

async function initSettingsUI() {
  const s = await getSettings();
  el("region-select").value = s.region;
  el("feed-input").value = s.feedUrl || "";
  el("notify-before").checked = s.notifyBefore !== false;
}

initSettingsUI();
render();

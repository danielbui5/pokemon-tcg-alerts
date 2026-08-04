// background.js — Manifest V3 service worker.
// Responsibilities:
//   - seed first-run data
//   - periodically refresh REAL release data from the web (official API + feed)
//   - schedule reminder alarms per release (day-before + morning-of)
//   - fire notifications (upcoming releases AND newly-detected restocks)

importScripts("store.js", "sources.js", "seed-data.js");

const REFRESH_ALARM = "refresh-feed";

// ---------- Lifecycle ----------

chrome.runtime.onInstalled.addListener(async () => {
  const manual = await getManual();
  if (manual.length === 0 && typeof SEED_RELEASES !== "undefined") {
    await saveManual(SEED_RELEASES);
  }
  await setupRefreshAlarm();
  await doRefresh();          // pull live data immediately on install
  await rescheduleAllAlarms();
});

chrome.runtime.onStartup.addListener(async () => {
  await setupRefreshAlarm();
  await doRefresh();
  await rescheduleAllAlarms();
});

async function setupRefreshAlarm() {
  const { refreshHours } = await getSettings();
  chrome.alarms.create(REFRESH_ALARM, {
    periodInMinutes: Math.max(60, (refreshHours || 12) * 60)
  });
}

// ---------- Refresh (network) ----------

async function doRefresh() {
  const prev = await getFeedCache();
  const prevIds = new Set(prev.map((r) => r.id));

  let result;
  try {
    result = await refreshFeedCache();
  } catch (e) {
    console.warn("refresh failed:", e);
    return;
  }

  // Detect NEW restock items that weren't in the cache before -> notify.
  // Skip on the very first population (empty prev) so we don't burst-notify.
  const now = await getFeedCache();
  for (const item of prev.length === 0 ? [] : now) {
    if (item.kind === "restock" && !prevIds.has(item.id)) {
      notify(
        `back-in-stock-${item.id}`,
        "Back in stock",
        `${item.name}${item.retailer ? " · " + item.retailer : ""}`,
        item.image
      );
    }
  }

  await rescheduleAllAlarms();
  return result;
}

// ---------- Reminder alarms ----------

async function rescheduleAllAlarms() {
  // Clear only reminder alarms; keep the refresh alarm intact.
  const alarms = await chrome.alarms.getAll();
  await Promise.all(
    alarms
      .filter((a) => a.name.startsWith("reminder-"))
      .map((a) => chrome.alarms.clear(a.name))
  );

  const releases = await getMergedReleases();
  const settings = await getSettings();
  const now = Date.now();

  for (const release of releases) {
    if (!release.releaseDate) continue;

    const releaseDateTime = new Date(`${release.releaseDate}T09:00:00`);
    if (isNaN(releaseDateTime.getTime())) continue;

    if (settings.notifyBefore) {
      const dayBefore = new Date(releaseDateTime.getTime() - 24 * 3600 * 1000);
      if (dayBefore.getTime() > now) {
        chrome.alarms.create(`reminder-dayBefore-${release.id}`, {
          when: dayBefore.getTime()
        });
      }
    }
    if (releaseDateTime.getTime() > now) {
      chrome.alarms.create(`reminder-dayOf-${release.id}`, {
        when: releaseDateTime.getTime()
      });
    }
  }
}

// ---------- Messages from popup ----------

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message.type === "RELEASES_UPDATED") {
      await rescheduleAllAlarms();
      sendResponse({ ok: true });
    } else if (message.type === "REFRESH_NOW") {
      const result = await doRefresh();
      sendResponse({ ok: true, result });
    } else if (message.type === "SETTINGS_UPDATED") {
      await setupRefreshAlarm();
      await rescheduleAllAlarms();
      sendResponse({ ok: true });
    } else {
      sendResponse({ ok: false, error: "unknown message" });
    }
  })();
  return true; // async response
});

// ---------- Alarm handler ----------

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === REFRESH_ALARM) {
    await doRefresh();
    return;
  }

  const releases = await getMergedReleases();
  let release = null;
  let isDayOf = false;

  if (alarm.name.startsWith("reminder-dayBefore-")) {
    release = releases.find((r) => r.id === alarm.name.replace("reminder-dayBefore-", ""));
  } else if (alarm.name.startsWith("reminder-dayOf-")) {
    release = releases.find((r) => r.id === alarm.name.replace("reminder-dayOf-", ""));
    isDayOf = true;
  }
  if (!release) return;

  notify(
    `notif-${alarm.name}`,
    isDayOf ? "Releasing today!" : "Releasing tomorrow",
    `${release.name}${release.retailer ? " · " + release.retailer : ""}`,
    release.image
  );
});

// ---------- Notification helper ----------

function notify(id, title, message, image) {
  chrome.notifications.create(id, {
    type: "basic",
    iconUrl: "icons/icon128.png",
    title,
    message,
    priority: 2
  });
}

// Open the product/source page when a notification is clicked.
chrome.notifications.onClicked.addListener(async (notifId) => {
  const releases = await getMergedReleases();
  const match = releases.find((r) => notifId.includes(r.id));
  if (match && match.url) chrome.tabs.create({ url: match.url });
});

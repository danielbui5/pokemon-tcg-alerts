// calendar.js — build calendar links so users can drop a release into their
// own calendar. Client-side only, no accounts needed. Loaded in popup.html.

// "YYYY-MM-DD" -> "YYYYMMDD"
function ymd(dateStr) {
  return dateStr.replace(/-/g, "");
}
// day after, for all-day event end (Google/ICS end is exclusive).
// Built entirely in UTC (Date.UTC + toISOString, no local-time round-trip) —
// mixing local-time construction with a UTC-based toISOString() would shift
// the date by a day in any non-zero-offset timezone.
function nextYmd(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return next.toISOString().slice(0, 10).replace(/-/g, "");
}

function calTitle(release) {
  const prefix = release.kind === "restock" ? "Restock: " : "Pokémon TCG: ";
  return `${prefix}${release.name}`;
}
function calDetails(release) {
  const bits = [];
  if (release.retailer) bits.push(`Retailer: ${release.retailer}`);
  if (release.notes) bits.push(release.notes);
  if (release.url) bits.push(release.url);
  bits.push("(Reminder only — this tool does not purchase anything.)");
  return bits.join("\n");
}

// Google Calendar "add event" template URL (all-day).
function googleCalUrl(release) {
  if (!release.releaseDate) return null;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: calTitle(release),
    dates: `${ymd(release.releaseDate)}/${nextYmd(release.releaseDate)}`,
    details: calDetails(release)
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// Downloadable .ics (Apple Calendar / Outlook / anything).
function icsBlobUrl(release) {
  if (!release.releaseDate) return null;
  const uid = `${release.id}@pokemon-tcg-alerts`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//pokemon-tcg-alerts//EN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTART;VALUE=DATE:${ymd(release.releaseDate)}`,
    `DTEND;VALUE=DATE:${nextYmd(release.releaseDate)}`,
    `SUMMARY:${escapeIcs(calTitle(release))}`,
    `DESCRIPTION:${escapeIcs(calDetails(release))}`,
    "END:VEVENT",
    "END:VCALENDAR"
  ];
  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar" });
  return URL.createObjectURL(blob);
}

function escapeIcs(str) {
  return String(str)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

Object.assign(globalThis, { googleCalUrl, icsBlobUrl });

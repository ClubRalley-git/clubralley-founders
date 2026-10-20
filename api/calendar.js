// Club Ralley Social Calendar for the founder dashboard's Calendar tab.
//
// The calendar lives in Google Calendar (Bucknell account, shared with the
// founders). Its private iCal address lives ONLY in the Vercel env var
// CAL_ICS_URL; it never reaches the browser. A caller must send their
// Supabase session token and pass is_founder(), same gate as the page.
//
// Returns this month and the next ~3 of events, with weekly/daily repeats expanded.
// Times are Eastern wall-clock strings ("2026-10-26T18:00"), which is what the
// calendar is written in.

const SUPABASE_URL = "https://adstqltezhqncfljoqth.supabase.co";
// Public by design (also in index.html).
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFkc3RxbHRlemhxbmNmbGpvcXRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2NjE3NTIsImV4cCI6MjA5MzIzNzc1Mn0.Miau9eMXTkPGySZwGh8z6_e3pwbWSeSFAaLp2breazs";
const CACHE_MS = 5 * 60 * 1000;
const DAYS_AHEAD = 100; // from the 1st of this month, so whole months fill in
const TZ = "America/New_York";

let cached = null; // { at, body }

async function isFounder(jwt) {
  const r = await fetch(SUPABASE_URL + "/rest/v1/rpc/is_founder", {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + jwt, "Content-Type": "application/json" },
    body: "{}",
  });
  if (!r.ok) return false;
  return (await r.json()) === true;
}

// ---------- tiny iCal reader ----------

function unfold(text) {
  return text.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "").split(/\r?\n/);
}

function unescapeText(v) {
  return v.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
}

// "20261026T180000" (+ optional Z) -> Eastern wall clock "2026-10-26T18:00"; "20261026" -> all-day
function parseWhen(value, params) {
  if (params.VALUE === "DATE" || /^\d{8}$/.test(value)) {
    return { allDay: true, at: `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T00:00` };
  }
  const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!m) return null;
  if (m[7] === "Z") {
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
    return { allDay: false, at: easternWall(d) };
  }
  // A TZID other than Eastern is converted; Eastern (or none) is taken as written.
  if (params.TZID && params.TZID !== TZ) {
    const guess = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
    const offset = zoneOffsetMinutes(guess, params.TZID) - zoneOffsetMinutes(guess, TZ);
    return { allDay: false, at: wallAdd(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}`, -offset) };
  }
  return { allDay: false, at: `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}` };
}

function easternWall(d) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

function zoneOffsetMinutes(d, zone) {
  const wall = new Date(easternWallIn(d, zone) + ":00Z");
  return Math.round((wall - d) / 60000);
}
function easternWallIn(d, zone) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

// Wall-clock arithmetic (no time zone involved: the wall clock is what repeats).
function wallAdd(at, minutes) {
  const d = new Date(at + ":00Z");
  d.setUTCMinutes(d.getUTCMinutes() + minutes);
  return d.toISOString().slice(0, 16);
}
const wallMinutes = (a, b) => Math.round((new Date(b + ":00Z") - new Date(a + ":00Z")) / 60000);
const DOW = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

function readEvents(ics) {
  const events = [];
  let cur = null;
  for (const line of unfold(ics)) {
    if (line === "BEGIN:VEVENT") { cur = { exdates: [] }; continue; }
    if (line === "END:VEVENT") { if (cur) events.push(cur); cur = null; continue; }
    if (!cur) continue;
    const i = line.indexOf(":");
    if (i < 0) continue;
    const [name, ...rawParams] = line.slice(0, i).split(";");
    const params = Object.fromEntries(rawParams.map((p) => p.split("=")));
    const value = line.slice(i + 1);
    if (name === "UID") cur.uid = value;
    else if (name === "SUMMARY") cur.title = unescapeText(value);
    else if (name === "LOCATION") cur.location = unescapeText(value);
    else if (name === "DESCRIPTION") cur.description = unescapeText(value);
    else if (name === "STATUS") cur.status = value;
    else if (name === "DTSTART") cur.start = parseWhen(value, params);
    else if (name === "DTEND") cur.end = parseWhen(value, params);
    else if (name === "RRULE") cur.rrule = Object.fromEntries(value.split(";").map((p) => p.split("=")));
    else if (name === "RECURRENCE-ID") cur.recurrenceId = parseWhen(value, params)?.at;
    else if (name === "EXDATE") for (const v of value.split(",")) { const w = parseWhen(v, params); if (w) cur.exdates.push(w.at); }
  }
  return events.filter((e) => e.start);
}

function expand(events, from, to) {
  const out = [];
  // A one-off change to a single repeat (moved, renamed, cancelled) replaces that repeat.
  const overrides = new Set(events.filter((e) => e.recurrenceId).map((e) => e.uid + "|" + e.recurrenceId));

  for (const e of events) {
    const length = e.end ? wallMinutes(e.start.at, e.end.at) : (e.start.allDay ? 1440 : 60);
    const push = (at) => {
      if (e.status === "CANCELLED") return;
      if (at < from || at >= to) return;
      out.push({
        start: at, end: wallAdd(at, length), allDay: e.start.allDay,
        title: e.title ?? "(no title)", location: e.location ?? "", note: e.description ?? "",
      });
    };

    if (e.recurrenceId || !e.rrule) { push(e.start.at); continue; }

    const r = e.rrule;
    const until = r.UNTIL ? parseWhen(r.UNTIL, {})?.at : null;
    const count = r.COUNT ? +r.COUNT : Infinity;
    const interval = +(r.INTERVAL ?? 1);
    const skip = (at) => e.exdates.includes(at) || overrides.has(e.uid + "|" + at);
    let n = 0;

    if (r.FREQ === "DAILY") {
      for (let at = e.start.at; at < to && n < count; at = wallAdd(at, 1440 * interval)) {
        if (until && at > until) break;
        n++; if (!skip(at)) push(at);
      }
    } else if (r.FREQ === "WEEKLY") {
      const startDow = new Date(e.start.at + ":00Z").getUTCDay();
      const days = (r.BYDAY ? r.BYDAY.split(",") : [DOW[startDow]]).map((d) => DOW.indexOf(d.slice(-2))).sort();
      const weekStart = wallAdd(e.start.at, -startDow * 1440); // the Sunday of the first week
      outer:
      for (let w = weekStart; w < to; w = wallAdd(w, 7 * 1440 * interval)) {
        for (const d of days) {
          const at = wallAdd(w, d * 1440);
          if (at < e.start.at) continue;
          if ((until && at > until) || n >= count || at >= to) break outer;
          n++; if (!skip(at)) push(at);
        }
      }
    } else {
      // Monthly / yearly repeats are rare here: show the first one only.
      push(e.start.at);
    }
  }
  return out.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const jwt = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt || !(await isFounder(jwt))) return res.status(403).json({ error: "Founders only." });
  if (!process.env.CAL_ICS_URL) return res.status(500).json({ error: "The calendar address is not set up yet (CAL_ICS_URL)." });

  const fresh = req.query?.fresh === "1";
  if (!fresh && cached && Date.now() - cached.at < CACHE_MS) return res.status(200).json(cached.body);

  let ics;
  try {
    const r = await fetch(process.env.CAL_ICS_URL);
    if (!r.ok) return res.status(502).json({ error: `Google Calendar said no (HTTP ${r.status}). The private address may have been reset.` });
    ics = await r.text();
  } catch {
    return res.status(502).json({ error: "Could not reach Google Calendar. Try Refresh." });
  }
  if (!ics.includes("BEGIN:VCALENDAR")) return res.status(502).json({ error: "Google Calendar sent something that is not a calendar." });

  const from = easternWall(new Date()).slice(0, 8) + "01T00:00";
  const to = wallAdd(from, DAYS_AHEAD * 1440);
  const body = {
    asOf: new Date().toISOString(),
    from,
    to,
    events: expand(readEvents(ics), from, to),
  };
  cached = { at: Date.now(), body };
  return res.status(200).json(body);
}

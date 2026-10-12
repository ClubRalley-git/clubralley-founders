// Instagram numbers for the founder dashboard's Instagram tab.
//
// The Instagram token lives ONLY in the Vercel env var IG_TOKEN (read-only
// scopes: instagram_business_basic + instagram_business_manage_insights, app
// "Club Ralley Insights"). It never reaches the browser. A caller must send
// their Supabase session token and pass is_founder(), same gate as the page.
//
// The token is long-lived (~60 days from 2026-10-12). Renewing it means
// updating IG_TOKEN here and redeploying (calendar reminder Dec 4).

const SUPABASE_URL = "https://adstqltezhqncfljoqth.supabase.co";
// Public by design (also in index.html).
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFkc3RxbHRlemhxbmNmbGpvcXRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2NjE3NTIsImV4cCI6MjA5MzIzNzc1Mn0.Miau9eMXTkPGySZwGh8z6_e3pwbWSeSFAaLp2breazs";
const IG = "https://graph.instagram.com/v23.0/";
const CACHE_MS = 10 * 60 * 1000;

let cached = null; // { at, body } — survives while the function instance is warm

async function ig(path, params) {
  const qs = new URLSearchParams({ ...params, access_token: process.env.IG_TOKEN ?? "" });
  const r = await fetch(IG + path + "?" + qs);
  const j = await r.json();
  if (j.error) throw Object.assign(new Error(j.error.message), { code: j.error.code });
  return j;
}

async function isFounder(jwt) {
  const r = await fetch(SUPABASE_URL + "/rest/v1/rpc/is_founder", {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + jwt, "Content-Type": "application/json" },
    body: "{}",
  });
  if (!r.ok) return false;
  return (await r.json()) === true;
}

function totals(resp) {
  const out = {};
  for (const m of resp.data ?? []) out[m.name] = m.total_value?.value ?? null;
  return out;
}

function breakdown(resp) {
  const rows = resp.data?.[0]?.total_value?.breakdowns?.[0]?.results ?? [];
  return rows.map((r) => [r.dimension_values[0], r.value]).sort((a, b) => b[1] - a[1]);
}

async function build() {
  const now = Math.floor(Date.now() / 1000);
  const [profile, last28, last7, mediaList] = await Promise.all([
    ig("me", { fields: "username,followers_count,follows_count,media_count" }),
    ig("me/insights", { metric: "reach,profile_views,accounts_engaged,total_interactions,website_clicks", period: "day", metric_type: "total_value", since: now - 28 * 86400, until: now }),
    ig("me/insights", { metric: "reach,profile_views,accounts_engaged,total_interactions,website_clicks", period: "day", metric_type: "total_value", since: now - 7 * 86400, until: now }),
    ig("me/media", { fields: "id,caption,media_type,media_product_type,timestamp,permalink,like_count,comments_count", limit: 100 }),
  ]);

  const posts = await Promise.all((mediaList.data ?? []).map(async (m) => {
    let ins = {};
    try {
      ins = postTotals(await ig(m.id + "/insights", { metric: "reach,views,likes,comments,saved,shares,total_interactions" }));
    } catch {
      // Older posts can refuse "views"; retry without it rather than dropping the row.
      try { ins = postTotals(await ig(m.id + "/insights", { metric: "reach,likes,comments,saved,shares,total_interactions" })); }
      catch { ins = { reach: null }; }
    }
    return {
      id: m.id, caption: m.caption ?? "", type: m.media_product_type === "REELS" ? "Reel" : m.media_type === "CAROUSEL_ALBUM" ? "Carousel" : "Photo",
      timestamp: m.timestamp, permalink: m.permalink, ...ins,
    };
  }));

  const demo = {};
  for (const b of ["age", "gender", "city"]) {
    try { demo[b] = breakdown(await ig("me/insights", { metric: "follower_demographics", period: "lifetime", metric_type: "total_value", breakdown: b })); }
    catch { demo[b] = null; }
  }

  return { fetchedAt: new Date().toISOString(), profile, last28: totals(last28), last7: totals(last7), posts, demo };
}

// Per-post endpoint returns { data: [{ name, values: [{ value }] }] }.
function postTotals(resp) {
  const out = {};
  for (const m of resp.data ?? []) out[m.name] = m.values?.[0]?.value ?? m.total_value?.value ?? null;
  return out;
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const jwt = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt || !(await isFounder(jwt))) return res.status(403).json({ error: "Founders only" });
  if (!process.env.IG_TOKEN) return res.status(500).json({ error: "IG_TOKEN is not set on Vercel", code: "no_token" });

  try {
    if (!cached || Date.now() - cached.at > CACHE_MS || req.query.fresh === "1") {
      cached = { at: Date.now(), body: await build() };
    }
    return res.status(200).json(cached.body);
  } catch (err) {
    // 190 = expired/invalid token: say so plainly, it is the likeliest failure in December.
    const expired = err.code === 190;
    return res.status(502).json({ error: expired ? "The Instagram key has expired. Renew it (see README)." : "Instagram said: " + err.message, code: expired ? "token_expired" : "ig_error" });
  }
};

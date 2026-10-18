// Public follower counts for the Goals tab: TikTok and LinkedIn.
//
// Both are read off the public profile pages, the same numbers anyone sees
// logged out. No key, no login. Vercel's CDN keeps the answer for 12 hours,
// so the Goals tab gets fresh numbers at least twice a day and TikTok/LinkedIn
// are asked at most that often no matter how many times the page is opened.
// A count that cannot be read comes back as null, and the page then shows the
// last typed number with a note, never a made-up one.

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129 Safari/537.36";

async function page(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" }, redirect: "follow" });
  if (!r.ok) throw new Error(url + " answered " + r.status);
  return r.text();
}

async function tiktok() {
  const html = await page("https://www.tiktok.com/@clubralley");
  const m = html.match(/"followerCount":(\d+)/);
  return m ? Number(m[1]) : null;
}

async function linkedin() {
  const html = await page("https://www.linkedin.com/company/club-ralley");
  const m = html.match(/([\d,]+)\s+followers/i);
  return m ? Number(m[1].replace(/,/g, "")) : null;
}

const settle = (p) => p.then((v) => v, () => null);

module.exports = async (req, res) => {
  const [tt, li] = await Promise.all([settle(tiktok()), settle(linkedin())]);
  res.setHeader("Cache-Control", "public, s-maxage=43200, stale-while-revalidate=86400");
  res.status(200).json({ tiktok: tt, linkedin: li, read_at: new Date().toISOString() });
};

// Newsletter sign-ups for the founder dashboard's Newsletter page.
//
// The list lives in the "Newsletter List" Google Sheet (team@clubralley.com,
// Drive > Newsletter). The Google Apps Script "Website Newsletter Sign-up"
// (record: clubralley-site/scripts/newsletter-apps-script.js) hands it over
// when asked with action=list, but only after checking the caller's Supabase
// login with is_founder(). This function just passes the caller's token along,
// so there is no key to keep here.

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyNl9HmohjbGtpmksAkDPGfEsVH9KGGsMAEkZg_AMc1KxCAgjQUU3jXXj8jkI3UQDNdOQ/exec";

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const jwt = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!jwt) return res.status(403).json({ error: "Founders only." });

  let r;
  try {
    r = await fetch(SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ action: "list", token: jwt }),
      redirect: "follow",
    });
  } catch {
    return res.status(502).json({ code: "unreachable", error: "Could not reach the Google sign-up script. Nothing is wrong with the list; try Refresh." });
  }
  const text = await r.text();
  let body;
  try { body = JSON.parse(text); } catch {
    // The old script version answers "bad email" (plain text) to a list request.
    return res.status(502).json({ code: "old_script", error: "The Google sign-up script is still the old version. Paste the new one in and deploy a new version." });
  }
  if (body.error) return res.status(403).json({ error: body.error });
  res.status(200).json(body);
};

// Newsletter sign-ups for the founder dashboard's Newsletter page.
//
// The list lives in the "Newsletter List" Google Sheet (team@clubralley.com,
// Drive > Newsletter). The Google Apps Script "Website Newsletter Sign-up"
// (record: clubralley-site/scripts/newsletter-apps-script.js) hands it over
// when asked with action=list, but only after checking the caller's Supabase
// login with is_founder(). This function passes the caller's token and the
// public anon key along, so there is no secret to keep here.

// Public by design (also in index.html); the script uses it to ask Supabase is_founder().
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFkc3RxbHRlemhxbmNmbGpvcXRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2NjE3NTIsImV4cCI6MjA5MzIzNzc1Mn0.Miau9eMXTkPGySZwGh8z6_e3pwbWSeSFAaLp2breazs";
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
      body: new URLSearchParams({ action: "list", token: jwt, apikey: SUPABASE_ANON_KEY }),
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

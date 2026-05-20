# Club Ralley — Founder Dashboard

Standalone web dashboard for founders. Lives at its own Vercel URL (separate from `clubralley-theta.vercel.app`) so founders can sign in on a laptop without loading the full athlete app.

Reuses the same Supabase backend. Access is gated server-side by `admin_emails` — the `founder_stats` and `pending_clubs` RPCs raise if the caller isn't on the table, so even if someone finds the URL they can't see anything without a founder email.

## What's inside

- `index.html` — single-file SPA (no build step). Loads `@supabase/supabase-js` from esm.sh.
- `vercel.json` — adds `X-Robots-Tag: noindex` so search engines don't index it.

Three tabs:
1. **Overview** — revenue, user counts, activity, recent signups + payments (CSV export).
2. **Pending Clubs** — approve / decline new venue submissions.
3. **Reports** — abuse report triage with status filters.

## Deploy (first time)

1. Create a new GitHub repo:
   ```bash
   gh auth switch -u ClubRalley-git
   cd "/Users/avasklar/Desktop/Club Ralley/clubralley-founders"
   git init && git add . && git commit -m "Initial founder dashboard"
   gh repo create ClubRalley-git/clubralley-founders --public --source=. --push
   ```
2. Go to https://vercel.com/new → **Import Git Repository** → pick `clubralley-founders`.
3. Vercel auto-detects it as static. Framework Preset: "Other". Root Directory: `./`. Build Command: leave blank. Output Directory: `./`.
4. Click **Deploy**. You'll get a URL like `clubralley-founders.vercel.app`.

No env vars needed — the Supabase URL + anon key are public-by-design and hardcoded in `index.html`. RLS + `admin_emails` are the access control.

## Deploy (updates)

Push to `main`. Vercel auto-deploys via webhook.

```bash
git add . && git commit -m "Tweak X" && git push origin main
```

## Adding a founder

Go to Supabase SQL Editor and run:
```sql
insert into admin_emails (email) values ('newfounder@example.com');
```
They sign in with that email + their Club Ralley app password.

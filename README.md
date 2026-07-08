# Traffic Redirect (Railway)

Public host for monetized redirect links. New visitors see a short "loading"
interstitial (with your Adsterra ad) before continuing to your destination;
returning visitors pass straight through.

An always-on Node server with a simple JSON file store — no database.

## What each part does

| Path | Role |
|---|---|
| `/` (`public/index.html`) | Admin page — create / list / delete links (token-gated) |
| `/api/create` | Create a link (needs `x-admin-token`) |
| `/api/list`, `/api/delete` | Manage links (token-gated) |
| `/:slug` | Public short link → interstitial (new visitor) or 302 (returning) |
| `/:slug/go` | Continue → sets cookie, 302 to destination |
| `/:slug/adview` | Beacon that counts a rendered script ad |

## Run locally

```bash
ADMIN_TOKEN=your-secret npm start
# open http://localhost:3000
```

No `npm install` needed — the server uses only built-in Node modules.

## Deploy to Railway

1. **Push to GitHub** (this repo).
2. **[railway.app](https://railway.app) → New Project → Deploy from GitHub repo** →
   pick this repo. Railway detects Node and runs `npm start` automatically.
3. **Add a Volume** (so links survive redeploys — the container disk is wiped on
   each deploy): project → your service → **Variables/Settings → Volumes → New
   Volume**, mount path `/data`.
4. **Set Environment Variables** (service → **Variables**):
   - `ADMIN_TOKEN` — a secret you choose; required to create links.
   - `DATA_DIR` = `/data` — points the file store at the mounted volume.
   - (`PORT` is provided by Railway automatically — do not set it.)
5. **Generate a domain**: service → **Settings → Networking → Generate Domain**.
6. Open the domain, enter your `ADMIN_TOKEN`, and create a link. Its public URL is
   `https://<your-app>.up.railway.app/<slug>`.

> ⚠️ Without the `/data` volume (step 3) the app still runs, but every redeploy
> resets your links to empty.

## Environment variables

| Name | Required | Purpose |
|---|---|---|
| `ADMIN_TOKEN` | yes | Login for the admin page / create API |
| `DATA_DIR` | on Railway | Where `links.json` is stored (set to the volume mount, e.g. `/data`) |
| `PORT` | auto | Set by Railway; defaults to 3000 locally |

## Custom domain

Railway → service → Settings → Networking → Custom Domain. Generated links use it
automatically (the base URL is derived from the request host).

---

`docs/` contains the original FlowPilot design blueprint (kept for reference; not
part of the deployed app).

# Redirect Web (Vercel + Upstash Redis)

Public host for the monetized redirect links. Deploy this `web/` folder to Vercel.
The Electron desktop app is **not** used here — links are created from the browser
admin page at `/`.

## What each part does

| Path | Role |
|---|---|
| `/` (`public/index.html`) | Admin page — create / list / delete links (token-gated) |
| `/api/create` | Create a link (needs `x-admin-token`) |
| `/api/list`, `/api/delete` | Manage links (token-gated) |
| `/:slug` | Public short link → interstitial (new visitor) or 302 (returning) |
| `/:slug/go` | Continue → sets cookie, 302 to destination |
| `/:slug/adview` | Beacon that counts a rendered script ad |

Storage is Upstash Redis (serverless has no persistent disk, so no file store).

## Deploy

1. **Push to GitHub.** Commit this repo (or just the `web/` folder) to a GitHub repo.
2. **Create an Upstash Redis database.** Either:
   - In Vercel: **Project → Storage → Create Database → Upstash Redis**, connect it to
     the project (auto-injects the REST URL + token env vars), **or**
   - At [upstash.com](https://upstash.com): create a Redis DB, copy its **REST URL** and
     **REST TOKEN**.
3. **Import the project in Vercel.** New Project → pick the repo → set
   **Root Directory = `web`**. Framework preset: **Other**. No build command needed.
4. **Set Environment Variables** (Project → Settings → Environment Variables):
   - `ADMIN_TOKEN` — a secret you choose; required to create links.
   - `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`
     (the Vercel Upstash integration may name these `KV_REST_API_URL` /
     `KV_REST_API_TOKEN` — the code accepts either).
5. **Deploy.** Open `https://<your-app>.vercel.app/`, enter your `ADMIN_TOKEN`,
   and create a link. Its public URL is `https://<your-app>.vercel.app/<slug>`.

## Custom domain

Vercel → Project → Settings → Domains → add your domain. Generated links then use it
automatically (the base URL is derived from the request host).

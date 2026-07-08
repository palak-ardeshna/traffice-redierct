# Traffic Redirect (Vercel + Upstash Redis)

Public host for monetized redirect links. New visitors see a short "loading"
interstitial (with your Adsterra ad) before continuing to your destination;
returning visitors pass straight through.

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

## Deploy to Vercel

1. **Push to GitHub** (this repo).
2. **Create an Upstash Redis database** — at [upstash.com](https://upstash.com),
   create a Redis DB, and from its **REST API** section copy the **URL** and **TOKEN**.
3. **Import the repo in Vercel** — New Project → pick this repo. No Root Directory
   change needed (the app is at the root). Framework preset: **Other**.
4. **Set Environment Variables** (Project → Settings → Environment Variables):
   - `ADMIN_TOKEN` — a secret you choose; required to create links.
   - `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`
     (the code also accepts `KV_REST_API_URL` / `KV_REST_API_TOKEN`).
5. **Deploy.** Open `https://<your-app>.vercel.app/`, enter your `ADMIN_TOKEN`,
   and create a link. Its public URL is `https://<your-app>.vercel.app/<slug>`.

## Custom domain

Vercel → Project → Settings → Domains → add your domain. Generated links then use
it automatically (the base URL is derived from the request host).

---

`docs/` contains the original FlowPilot design blueprint (kept for reference; not
part of the deployed app).

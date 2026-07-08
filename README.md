# Traffic Redirect (Vercel app + Railway Redis)

Public host for monetized redirect links. New visitors see a short "loading"
interstitial (with your Adsterra ad) before continuing to your destination;
returning visitors pass straight through.

App runs on Vercel (serverless). Data is stored in a Redis database hosted on
Railway, reached over Redis's public TCP proxy.

## What each part does

| Path | Role |
|---|---|
| `/` (`public/index.html`) | Admin page — create / list / delete links (token-gated) |
| `/api/create` | Create a link (needs `x-admin-token`) |
| `/api/list`, `/api/delete` | Manage links (token-gated) |
| `/:slug` | Public short link → interstitial (new visitor) or 302 (returning) |
| `/:slug/go` | Continue → sets cookie, 302 to destination |
| `/:slug/adview` | Beacon that counts a rendered script ad |

## Deploy

### 1. Create the Redis database on Railway

1. [railway.app](https://railway.app) → **New Project → Database → Add Redis**.
2. Open the Redis service → **Variables** tab.
3. Copy the value of **`REDIS_PUBLIC_URL`** — it looks like
   `redis://default:PASSWORD@<name>.proxy.rlwy.net:PORT`.

   ⚠️ Use the **public** one. The plain `REDIS_URL` points at
   `redis.railway.internal`, which Vercel (outside Railway's network) cannot reach.

### 2. Deploy the app on Vercel

1. **Push to GitHub** (this repo).
2. [vercel.com](https://vercel.com) → **Add New → Project** → import this repo.
   No Root Directory change needed. Framework preset: **Other**.
3. **Environment Variables** (Settings → Environment Variables):
   - `ADMIN_TOKEN` — a secret you choose; required to create links.
   - `REDIS_URL` — paste Railway's **`REDIS_PUBLIC_URL`** value from step 1.
4. **Deploy.** Open `https://<your-app>.vercel.app/`, enter your `ADMIN_TOKEN`,
   and create a link. Its public URL is `https://<your-app>.vercel.app/<slug>`.

## Environment variables

| Name | Required | Purpose |
|---|---|---|
| `ADMIN_TOKEN` | yes | Login for the admin page / create API |
| `REDIS_URL` | yes | Railway Redis **public** connection URL |

## Custom domain

Vercel → Project → Settings → Domains → add your domain. Generated links use it
automatically (the base URL is derived from the request host).

---

`docs/` contains the original FlowPilot design blueprint (kept for reference; not
part of the deployed app).

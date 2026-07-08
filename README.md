# Traffic Redirect

Monetized short links. When someone opens one of your links for the first time,
they land on a short **"loading" interstitial** that shows your Adsterra ad for a
few seconds, then continues to the real destination. Returning visitors (within
7 days) skip the interstitial and are redirected straight through.

Every link tracks three counters: **clicks**, **unique (new) visitors**, and
**ad views**.

```
you create:  https://your-app.vercel.app/aB3xK9q   →  https://store.example.com/page
                        ^ short link                          ^ destination
```

---

## Table of contents

- [How it works](#how-it-works)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Request routing](#request-routing)
- [Data model](#data-model-redis)
- [API reference](#api-reference)
- [Environment variables](#environment-variables)
- [Deploying](#deploying)
- [Local development](#local-development)
- [Security notes](#security-notes)
- [Limitations](#limitations)

---

## How it works

**Visitor flow** — a first-time visitor and a returning visitor take different paths,
decided by a per-link `seen_<slug>` cookie:

```
                     GET /:slug
                         │
                  ┌──────┴──────┐  cookie seen_<slug> = 1 ?
                  │             │
                 no            yes
                  │             │
       ┌──────────▼─────────┐   └──► 302 → destination   (returning visitor)
       │   interstitial     │
       │  • countdown bar   │
       │  • ad script slot  │       counters: clicks++
       │  • Continue button │
       └──────────┬─────────┘       counters: clicks++, uniqueVisitors++
                  │
        user clicks "Continue"
                  │
       ┌──────────▼──────────────────────┐
       │ Direct Link opens in a new tab  │  (only if adDirectUrl is set)
       │ then → GET /:slug/go?t=<token>  │
       └──────────┬──────────────────────┘
                  │
        verify token: authentic, and
        at least delaySeconds old? ──no──► 302 back to /:slug
                  │yes
      set cookie seen_<slug> (7 days)
                  │
                  └──► 302 → destination
```

The signed token is what makes the countdown load-bearing. Without it, `GET /:slug/go`
redirected unconditionally — anyone could skip the ad by typing three characters, and
`/:slug/adview` was an unauthenticated public counter that anyone could inflate.
Reporting impressions that never rendered is impression fraud, and it is the usual
reason ad networks close an account.

Bots and link unfurlers (Discord, WhatsApp, Slack, crawlers) still get the page, but are
never counted and never log an event.

Two kinds of ad can be attached to a link, and you can use either or both:

| Ad type | Where it appears | How it's counted |
|---|---|---|
| **Ad script** (`adScript`) — a Social Bar / Banner / Popunder tag | Injected into the interstitial's ad slot | `sendBeacon` fires `POST /:slug/adview` 2.5 s after render, giving the async ad tag time to load |
| **Direct Link** (`adDirectUrl`) — a plain URL | Opened in a new tab when the visitor clicks **Continue** | Counted server-side when `/:slug/go` is hit |

The Direct Link is deliberately opened **from the user's own click**, never
auto-opened and never in an iframe — both of those would be impression fraud and
get an Adsterra account banned.

---

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| **Runtime** | Node.js (ESM, `"type": "module"`) | No transpiler, no build step |
| **Hosting** | [Vercel](https://vercel.com) serverless functions | Zero-config, scale-to-zero, free tier |
| **Database** | Redis, hosted on [Railway](https://railway.app) | Counters are `INCR`s; the whole dataset is a handful of keys |
| **Redis client** | [`ioredis`](https://github.com/redis/ioredis) `^5.4.1` | Speaks the plain TCP Redis protocol that Railway's public proxy exposes |
| **Frontend** | Hand-written HTML + vanilla JS | ~130 lines of admin page; a framework would outweigh the app |
| **Build** | None (`buildCommand: "echo no build needed"`) | `vercel.json` pins `framework: null` so Vercel doesn't autodetect a Vite preset |

**The only runtime dependency in the entire project is `ioredis`.** No React, no
bundler, no ORM, no test framework.

Why Vercel *and* Railway? Vercel is the cheapest way to host serverless HTTP
handlers; Railway is the cheapest way to host a persistent Redis. They're in
different networks, which is why `REDIS_URL` must be Railway's **public** proxy
URL — see [Environment variables](#environment-variables).

---

## Project structure

```
traffic/
├── api/                    Vercel serverless functions (one file = one endpoint)
│   ├── handler.js          Public redirect: /:slug, /:slug/go, /:slug/adview
│   ├── create.js           POST — create a link          (admin token required)
│   ├── list.js             GET  — list links + counters  (admin token required)
│   └── delete.js           POST — delete a link          (admin token required)
│
├── lib/                    Shared logic, imported by the api/ handlers
│   ├── store.js            All Redis access + URL validation + slug generation
│   ├── interstitial.js     Renders the loading page HTML (a template function)
│   ├── token.js            Signed, time-bound tokens that make the countdown real
│   ├── auth.js             Admin-token check (constant-time) + rate limit
│   └── ratelimit.js        Fixed-window Redis rate limiter (fails open)
│
├── public/
│   └── index.html          Admin UI — create / list / delete links. Served at /
│
├── test/                   node:test suite — `npm test`
│   ├── token.test.mjs
│   ├── interstitial.test.mjs
│   └── handler.test.mjs    End-to-end, against an in-memory Redis stub
│
├── docs/                   ⚠️ Legacy. See "Note on docs/" below.
│   ├── BLUEPRINT.md
│   ├── PHASE1_BUILD_SPEC.md
│   ├── adr/                Architecture decision records
│   └── api/openapi.yaml
│
├── vercel.json             framework: null, no build, + the pretty-URL rewrites
├── package.json            One dependency: ioredis
└── README.md               You are here
```

### File-by-file

| File | Exports / responsibility |
|---|---|
| [lib/store.js](lib/store.js) | `createLink`, `getConfig`, `listLinks`, `deleteLink`, `bump`, `logEvent`, `validateUrl`, `redis`. Holds the singleton `ioredis` client on `globalThis.__redis` so warm serverless invocations reuse one TCP connection. Memoizes `slug → config` per instance and serves stale on a Redis outage. |
| [lib/interstitial.js](lib/interstitial.js) | `renderInterstitial(link, token)` → a complete HTML document string. Escapes all interpolated text; the countdown, progress bar, and adview beacon are inline JS. |
| [lib/token.js](lib/token.js) | `issueToken(slug)` / `verifyToken(slug, token, minAgeSeconds)`. HMAC-signed, carries its issue time, expires after 15 min. Stateless — no Redis round trip. |
| [lib/auth.js](lib/auth.js) | `requireAdmin(req, res)` — constant-time token compare plus a 20 req/min per-IP limit. |
| [lib/ratelimit.js](lib/ratelimit.js) | `allow(key, max, windowSeconds)`. Fixed window in Redis. Fails **open** — a limiter outage must never take down the redirect path. |
| [api/handler.js](api/handler.js) | Reads `?slug` and `?action` (populated by the rewrites), looks up the link, and branches: `adview` → `204`, `go` → verify token, set cookie, `302`; default → interstitial or `302`. Skips all counting for bots. |
| [api/create.js](api/create.js) | Checks `x-admin-token`, calls `createLink`, derives the short URL from `x-forwarded-host` / `x-forwarded-proto` so it works on any custom domain. |
| [api/list.js](api/list.js) | Returns `{ baseUrl, links }` where each link carries its three counters. |
| [api/delete.js](api/delete.js) | Deletes the config, the set membership, and all three counter keys. |
| [public/index.html](public/index.html) | Single-page admin. The token lives only in a `<input type="password">` in memory — it is **not** persisted to `localStorage`. |

### Note on `docs/`

`docs/` contains the design blueprint and ADRs for **FlowPilot**, an earlier,
much larger desktop-automation product (Electron shell, Playwright engine,
Drizzle ORM, process-isolated workers). **None of that ships in this app.** The
directory is kept for historical reference only. If an ADR contradicts this
README, this README is correct.

---

## Request routing

Vercel maps pretty URLs onto the single public handler via
[vercel.json](vercel.json) rewrites:

| Public URL | Rewritten to | Result |
|---|---|---|
| `/` | `public/index.html` (static) | Admin page |
| `/:slug` | `/api/handler?slug=:slug` | Interstitial (new) or `302` (returning). Issues a `gt_<slug>` token cookie. |
| `/:slug/go` | `/api/handler?slug=:slug&action=go` | **Requires a valid token at least `delaySeconds` old.** Otherwise bounces back to `/:slug`. |
| `/:slug/adview` | `/api/handler?slug=:slug&action=adview` | **Requires a valid token ≥2s old**, POST, and passes a rate limit. Always `204`. |
| `/api/*` | (direct) | Admin JSON API |

The token rides in both a `gt_<slug>` cookie and a `?t=` query param. The cookie is the
fallback: relying on `?t=` alone would make every link depend on Vercel preserving query
params across a rewrite, and if it ever stopped, `/go` would bounce to the interstitial
forever.

---

## Data model (Redis)

Three key shapes. No hashes, no indexes, no TTLs.

| Key | Type | Contents |
|---|---|---|
| `link:<slug>` | string | JSON: `{ slug, destUrl, adScript, adDirectUrl, delaySeconds, title, createdAt }` |
| `links` | set | Every existing slug — the only way to enumerate links |
| `c:<slug>:clicks` | string (int) | Every non-bot hit on `/:slug` |
| `c:<slug>:uniq` | string (int) | Hits on `/:slug` without the `seen_<slug>` cookie |
| `c:<slug>:adscript` | string (int) | Verified script-ad beacons |
| `c:<slug>:direct` | string (int) | Direct-Link opens (a verified `/go` on a link with `adDirectUrl`) |
| `events` | stream | Capped (`MAXLEN ~ 500000`) append-only click log: `slug, ts, country, region, city, referrer, ua, returning` |
| `rl:<key>:<bucket>` | string (int) | Rate-limit counters, expire with their window |

Script impressions and Direct-Link opens are **separate counters**. They used to share
one `adviews` key, which meant the number could never be reconciled against the ad
network's own dashboard — and a link with both ad types double-counted every visitor.
`/api/list` still returns `adViews` as the sum, for convenience.

`events` exists because `INCR` is a lossy aggregation: without a raw event log, geo,
device, referrer, adblock rate and fraud scoring are unbuildable — and unbuildable
*retroactively*, because the events were never stored.

Slugs are 7 chars of `base64url` from `crypto.randomBytes(5)`, claimed atomically with
`SET … NX` and retried up to 10× on collision.

---

## API reference

All admin endpoints require the header `x-admin-token: <ADMIN_TOKEN>`.
They return `401` otherwise.

### `POST /api/create`

```jsonc
// request body
{
  "destUrl":      "https://store.example.com/page",  // required, http/https only
  "adScript":     "<script src='...'></script>",     // optional*
  "adDirectUrl":  "https://www.effectiveratecpm...", // optional*, http/https only
  "title":        "Preparing your link",             // optional, truncated to 120 chars
  "delaySeconds": 5                                  // optional, clamped to 0–30
}
// * at least one of adScript / adDirectUrl is required
```

```jsonc
// 200 response
{
  "slug":     "aB3xK9q",
  "shortUrl": "https://your-app.vercel.app/aB3xK9q",
  "link":     { /* full config + zeroed counters */ }
}
```

Returns `400` with `{ "error": "..." }` on a bad URL, a non-http(s) protocol, or
if neither ad field is supplied.

### `GET /api/list`

```jsonc
{
  "baseUrl": "https://your-app.vercel.app",
  "links": [
    { "slug": "aB3xK9q", "destUrl": "...", "createdAt": "...",
      "clicks": 42, "uniqueVisitors": 30,
      "adScriptViews": 22, "directLinkClicks": 6,
      "adViews": 28 }          // = adScriptViews + directLinkClicks
  ]
}
```
Sorted newest-first by `createdAt`. Two Redis round trips total, regardless of link
count.

### `POST /api/delete`

```jsonc
// request  → { "slug": "aB3xK9q" }
// response → { "deleted": true }   // false if the slug didn't exist
```

---

## Environment variables

Set both in **Vercel → Project → Settings → Environment Variables**.

| Name | Required | Purpose |
|---|---|---|
| `ADMIN_TOKEN` | yes | Shared secret gating the admin page and all `/api/*` endpoints. Pick something long and random. |
| `REDIS_URL` | yes | Railway Redis connection URL. **Must be the public proxy URL.** |
| `GO_SECRET` | no | HMAC key for the `/go` tokens. Falls back to `ADMIN_TOKEN`. Set it separately if you ever rotate the admin token without invalidating in-flight interstitials. |
| `SEEN_DAYS` | no | How long a visitor skips the interstitial. Default `7`. **This is a direct revenue knob** — a returning visitor inside the window earns nothing. |

> ⚠️ **Use `REDIS_PUBLIC_URL`, not `REDIS_URL`, from Railway.**
> Railway's `REDIS_URL` points at `redis.railway.internal`, which is only
> resolvable inside Railway's private network. Vercel functions run outside it and
> will hang, then time out. Copy the variable named `REDIS_PUBLIC_URL` — it looks
> like `redis://default:PASSWORD@something.proxy.rlwy.net:PORT` — and paste it into
> Vercel as `REDIS_URL`.

If `REDIS_URL` is missing, `lib/store.js` throws on first use.
If `ADMIN_TOKEN` is missing, `/api/create` returns `500` rather than silently
accepting anonymous writes.

---

## Deploying

### 1. Create the Redis database (Railway)

1. [railway.app](https://railway.app) → **New Project → Database → Add Redis**
2. Open the Redis service → **Variables** tab
3. Copy the value of **`REDIS_PUBLIC_URL`**

### 2. Deploy the app (Vercel)

1. Push this repo to GitHub
2. [vercel.com](https://vercel.com) → **Add New → Project** → import the repo
   - Root Directory: leave as-is
   - Framework preset: **Other** (`vercel.json` already forces `framework: null`)
3. Add the two environment variables above
4. **Deploy**

### 3. Create your first link

Open `https://<your-app>.vercel.app/`, enter your `ADMIN_TOKEN`, paste a
destination URL and an Adsterra tag, and click **Create link**.

### Custom domain

Vercel → Project → Settings → Domains. Generated short URLs pick the new domain
up automatically, because `api/create.js` and `api/list.js` derive the base URL
from the request's `x-forwarded-host` header rather than a hardcoded constant.

---

## Local development

```bash
npm install
npm test            # 33 tests, no Redis or network needed
```

The suite stubs Redis on `globalThis.__redis` and drives the real handler, so it covers
the `/go` bypass, token expiry, bot filtering, rate limiting, and the counter split.

To run the app, use the Vercel CLI — it applies the rewrites and runs the serverless
functions locally:

```bash
npm i -g vercel

# point at a real Redis — Railway's public URL, or a local one
export ADMIN_TOKEN="dev-token"
export REDIS_URL="redis://localhost:6379"

vercel dev          # → http://localhost:3000
```

A local Redis is enough for everything except testing against real ad tags.

---

## Security notes

- **Open-redirect defense.** `validateUrl()` in [lib/store.js](lib/store.js)
  parses every `destUrl` and `adDirectUrl` with the WHATWG `URL` parser and
  rejects anything that isn't `http:` or `https:` — so `javascript:`,
  `data:`, and `file:` payloads can't be stored, let alone redirected to.
- **XSS.** Every value interpolated into the interstitial is HTML-escaped by
  `esc()`, *except* `adScript`, which is injected raw by design — that's what an
  ad tag is. Only paste tags from a source you trust; whoever holds
  `ADMIN_TOKEN` can execute arbitrary JS on your interstitial pages.
- **Ad-gate integrity.** `/go` and `/adview` require an HMAC-signed token issued when
  the interstitial was rendered, and check that enough wall-clock time has elapsed.
  A token expires after 15 minutes and is bound to its slug.
- **Auth.** A single shared bearer token, compared in constant time, behind a 20 req/min
  per-IP limit. Adequate for a one-operator tool; not a multi-user auth system.
- **Cookies.** `seen_<slug>` and `gt_<slug>` are `HttpOnly; SameSite=Lax; Path=/`. They
  are *not* `Secure`, since Vercel terminates TLS upstream; every real request arrives
  over HTTPS anyway. Responses carrying `Set-Cookie` are `private, no-store` so a shared
  cache can never hand one visitor's cookie to another.
- **Referrer.** The interstitial sets `<meta name="referrer" content="no-referrer">`
  so your destination never leaks in the `Referer` header sent to the ad network.
- The admin page sets `<meta name="robots" content="noindex">`.

---

## Limitations

- **No CI, no linter.** There is a test suite (`npm test`) but nothing runs it for you.
- **Bot detection is a user-agent regex.** It stops crawlers and chat-app unfurlers from
  inflating counters. It does not stop anyone who sets a browser UA. Real invalid-traffic
  filtering (IP reputation, ASN, click-timing distributions) is not implemented, and it is
  the thing ad networks ban accounts over.
- **Counters are not atomic across pages** — `clicks` increments before the
  redirect resolves, so a client that disconnects mid-request still counts.
- **`uniqueVisitors` is cookie-based**, so it is defeated by incognito, a cleared cache,
  a second browser, or Safari's ITP. It is closer to "sessions with a cold cookie jar."
- **The `events` stream is written but never read.** Nothing aggregates it yet. It exists
  so that the data is there when something does.
- **No link editing.** To change a destination, delete the link and create a new
  one (a new slug).
- **The `SEEN_DAYS` skip is per-browser**, driven by a cookie. Clearing cookies or
  using a different browser shows the interstitial again — and every returning visitor
  inside the window earns nothing. Retention and ad revenue pull in opposite directions
  here; see [docs/STRATEGY.md](docs/STRATEGY.md).

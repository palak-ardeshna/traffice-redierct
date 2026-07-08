/**
 * Redis-backed link store, using a standard TCP Redis (e.g. Railway's Redis)
 * via ioredis. Reads REDIS_URL.
 *
 * IMPORTANT for Vercel + Railway: Vercel functions run OUTSIDE Railway's private
 * network, so REDIS_URL must be Railway's PUBLIC proxy URL
 * (redis://default:PASSWORD@<something>.proxy.rlwy.net:PORT), NOT the internal
 * redis.railway.internal address.
 *
 * Keys:
 *   link:<slug>                              JSON string of the config
 *   links                                    set of all slugs
 *   c:<slug>:clicks|uniq|adscript|direct     integer counters
 *   events                                   capped stream of raw click events
 */

import Redis from 'ioredis';
import { randomBytes } from 'node:crypto';

// Reuse one client across warm serverless invocations (avoids connection churn).
export function redis() {
  if (!globalThis.__redis) {
    if (!process.env.REDIS_URL) throw new Error('REDIS_URL is not set');
    globalThis.__redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      connectTimeout: 8000,
      lazyConnect: false,
      enableAutoPipelining: true,
    });
  }
  return globalThis.__redis;
}

/**
 * `adviews` was one counter for two different events, so it could never be
 * reconciled against the ad network's own dashboard. Script impressions and
 * Direct Link opens are now counted separately.
 */
const COUNTERS = {
  clicks: 'clicks',
  uniqueVisitors: 'uniq',
  adScriptViews: 'adscript',
  directLinkClicks: 'direct',
};

/** Raw click events, capped so the stream can't grow unbounded. */
const EVENT_STREAM = 'events';
const EVENT_MAXLEN = 500_000;

/** Only http/https survive — the gate against open-redirect / javascript: payloads. */
export function validateUrl(raw, field) {
  let u;
  try {
    u = new URL(String(raw));
  } catch {
    throw new Error(`${field} is not a valid URL`);
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error(`${field} must be http or https, got "${u.protocol}"`);
  }
  return u.toString();
}

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

export async function createLink(input) {
  const r = redis();
  const destUrl = validateUrl(input.destUrl, 'destUrl');
  const adScript = String(input.adScript ?? '').trim();
  const adDirectUrl = input.adDirectUrl ? validateUrl(input.adDirectUrl, 'adDirectUrl') : '';
  if (!adScript && !adDirectUrl) {
    throw new Error('provide an ad script, a Direct Link, or both');
  }
  const delaySeconds = Math.min(30, Math.max(0, Number(input.delaySeconds) || 5));
  const title = String(input.title ?? 'Preparing your link').slice(0, 120);

  // SET NX claims the slug atomically. The old EXISTS-then-SET could hand the same
  // slug to two concurrent creates.
  for (let i = 0; i < 10; i++) {
    const slug = randomBytes(5).toString('base64url').slice(0, 7);
    const config = { slug, destUrl, adScript, adDirectUrl, delaySeconds, title, createdAt: new Date().toISOString() };
    const claimed = await r.set(`link:${slug}`, JSON.stringify(config), 'NX');
    if (!claimed) continue;
    // If SADD fails the link resolves but is invisible to /api/list, so it must not
    // be a separate unguarded round trip.
    await r.sadd('links', slug);
    return { ...config, clicks: 0, uniqueVisitors: 0, adScriptViews: 0, directLinkClicks: 0 };
  }
  throw new Error('could not allocate a unique slug');
}

/**
 * Per-instance memo of slug -> config. A viral link should hit Redis once per warm
 * instance, not once per request. Entries are kept after expiry so that a Redis
 * outage degrades to a stale-but-correct 302 rather than a 500 on every link.
 */
const memo = new Map();
const MEMO_TTL_MS = 60_000;
const MEMO_MAX = 5_000;

/** Config only — what the redirect path needs. Returns null if unknown. */
export async function getConfig(slug) {
  const hit = memo.get(slug);
  if (hit && Date.now() < hit.expires) return hit.config;

  let raw;
  try {
    raw = await redis().get(`link:${slug}`);
  } catch (err) {
    if (hit) return hit.config; // serve stale: a redirect from old data beats a 500
    throw err;
  }

  const config = raw ? JSON.parse(raw) : null;
  if (memo.size >= MEMO_MAX) memo.clear();
  memo.set(slug, { config, expires: Date.now() + MEMO_TTL_MS });
  return config;
}

export async function deleteLink(slug) {
  const r = redis();
  memo.delete(slug);
  const existed = await r.exists(`link:${slug}`);
  await r
    .multi()
    .del(`link:${slug}`)
    .srem('links', slug)
    // 'adviews' is the retired pre-split counter; still deleted so old links leave nothing behind.
    .del(...[...Object.values(COUNTERS), 'adviews'].map((c) => `c:${slug}:${c}`))
    .exec();
  return existed === 1;
}

// ---------------------------------------------------------------------------
// Counters & events
// ---------------------------------------------------------------------------

/**
 * Increment several counters in one round trip. The old code awaited each INCR
 * sequentially, adding a cross-cloud RTT per counter to the redirect's latency.
 */
export async function bump(slug, fields) {
  if (!fields.length) return;
  const pipe = redis().multi();
  for (const f of fields) pipe.incr(`c:${slug}:${COUNTERS[f]}`);
  await pipe.exec();
}

/**
 * Append the raw click event. INCR is a lossy aggregation — without this, geo,
 * device, referrer, adblock rate and fraud scoring are unbuildable, and
 * unbuildable *retroactively* because the events were never stored.
 *
 * Never throws: losing an analytics event must not fail a redirect.
 */
export async function logEvent(fields) {
  try {
    const flat = [];
    for (const [k, v] of Object.entries(fields)) flat.push(k, String(v ?? ''));
    await redis().xadd(EVENT_STREAM, 'MAXLEN', '~', EVENT_MAXLEN, '*', ...flat);
  } catch {
    /* analytics is not worth a 500 */
  }
}

async function countsFor(slugs) {
  if (!slugs.length) return [];
  const keys = slugs.flatMap((s) => Object.values(COUNTERS).map((c) => `c:${s}:${c}`));
  const flat = await redis().mget(...keys);
  const width = Object.keys(COUNTERS).length;
  return slugs.map((_, i) => {
    const row = flat.slice(i * width, (i + 1) * width);
    const out = {};
    Object.keys(COUNTERS).forEach((name, j) => (out[name] = Number(row[j]) || 0));
    // Kept so existing dashboards don't break; the split fields are the real ones.
    out.adViews = out.adScriptViews + out.directLinkClicks;
    return out;
  });
}

/** Two round trips total, regardless of link count (was 2 per link). */
export async function listLinks() {
  const r = redis();
  const slugs = await r.smembers('links');
  if (!slugs.length) return [];

  const raws = await r.mget(...slugs.map((s) => `link:${s}`));
  const live = [];
  const liveSlugs = [];
  raws.forEach((raw, i) => {
    if (!raw) return;
    live.push(JSON.parse(raw));
    liveSlugs.push(slugs[i]);
  });

  const counts = await countsFor(liveSlugs);
  return live
    .map((config, i) => ({ ...config, ...counts[i] }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

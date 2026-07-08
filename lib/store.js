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
 *   link:<slug>   JSON string of the config
 *   c:<slug>:clicks|uniq|adviews   integer counters
 *   links         set of all slugs
 */

import Redis from 'ioredis';
import { randomBytes } from 'node:crypto';

// Reuse one client across warm serverless invocations (avoids connection churn).
function client() {
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

const COUNTERS = { clicks: 'clicks', uniqueVisitors: 'uniq', adViews: 'adviews' };

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

async function newSlug() {
  const r = client();
  for (let i = 0; i < 10; i++) {
    const slug = randomBytes(5).toString('base64url').slice(0, 7);
    if (!(await r.exists(`link:${slug}`))) return slug;
  }
  throw new Error('could not allocate a unique slug');
}

export async function createLink(input) {
  const r = client();
  const destUrl = validateUrl(input.destUrl, 'destUrl');
  const adScript = String(input.adScript ?? '').trim();
  const adDirectUrl = input.adDirectUrl ? validateUrl(input.adDirectUrl, 'adDirectUrl') : '';
  if (!adScript && !adDirectUrl) {
    throw new Error('provide an ad script, a Direct Link, or both');
  }
  const delaySeconds = Math.min(30, Math.max(0, Number(input.delaySeconds) || 5));

  const slug = await newSlug();
  const config = {
    slug,
    destUrl,
    adScript,
    adDirectUrl,
    delaySeconds,
    title: String(input.title ?? 'Preparing your link').slice(0, 120),
    createdAt: new Date().toISOString(),
  };
  await r.set(`link:${slug}`, JSON.stringify(config));
  await r.sadd('links', slug);
  return { ...config, clicks: 0, uniqueVisitors: 0, adViews: 0 };
}

/** Config only — what the redirect path needs. Returns null if unknown. */
export async function getConfig(slug) {
  const raw = await client().get(`link:${slug}`);
  return raw ? JSON.parse(raw) : null;
}

export async function incr(slug, field) {
  await client().incr(`c:${slug}:${COUNTERS[field]}`);
}

async function counts(slug) {
  const [clicks, uniqueVisitors, adViews] = await client().mget(
    `c:${slug}:clicks`,
    `c:${slug}:uniq`,
    `c:${slug}:adviews`
  );
  return {
    clicks: Number(clicks) || 0,
    uniqueVisitors: Number(uniqueVisitors) || 0,
    adViews: Number(adViews) || 0,
  };
}

export async function listLinks() {
  const r = client();
  const slugs = await r.smembers('links');
  const rows = await Promise.all(
    slugs.map(async (slug) => {
      const config = await getConfig(slug);
      if (!config) return null;
      return { ...config, ...(await counts(slug)) };
    })
  );
  return rows.filter(Boolean).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function deleteLink(slug) {
  const r = client();
  const existed = await r.exists(`link:${slug}`);
  await Promise.all([
    r.del(`link:${slug}`),
    r.srem('links', slug),
    r.del(`c:${slug}:clicks`),
    r.del(`c:${slug}:uniq`),
    r.del(`c:${slug}:adviews`),
  ]);
  return existed === 1;
}

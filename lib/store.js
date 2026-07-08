/**
 * Upstash Redis-backed link store (serverless-safe — no local filesystem).
 *
 * Keys:
 *   link:<slug>              JSON config { slug, destUrl, adScript, adDirectUrl, delaySeconds, title, createdAt }
 *   c:<slug>:clicks|uniq|adviews   integer counters (atomic INCR)
 *   links                    set of all slugs (for listing)
 */

import { Redis } from '@upstash/redis';
import { randomBytes } from 'node:crypto';

// The Vercel Upstash integration may expose either UPSTASH_* or KV_* names —
// accept both so the deploy works whichever way the store was linked.
export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN,
});

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
  for (let i = 0; i < 10; i++) {
    const slug = randomBytes(5).toString('base64url').slice(0, 7);
    if (!(await redis.exists(`link:${slug}`))) return slug;
  }
  throw new Error('could not allocate a unique slug');
}

export async function createLink(input) {
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
  await Promise.all([redis.set(`link:${slug}`, config), redis.sadd('links', slug)]);
  return { ...config, clicks: 0, uniqueVisitors: 0, adViews: 0 };
}

/** Config only — what the redirect path needs. Returns null if unknown. */
export async function getConfig(slug) {
  return (await redis.get(`link:${slug}`)) || null;
}

export async function incr(slug, field) {
  await redis.incr(`c:${slug}:${COUNTERS[field]}`);
}

async function counts(slug) {
  const [clicks, uniqueVisitors, adViews] = await redis.mget(
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
  const slugs = await redis.smembers('links');
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
  const existed = await redis.exists(`link:${slug}`);
  await Promise.all([
    redis.del(`link:${slug}`),
    redis.srem('links', slug),
    redis.del(`c:${slug}:clicks`),
    redis.del(`c:${slug}:uniq`),
    redis.del(`c:${slug}:adviews`),
  ]);
  return existed === 1;
}

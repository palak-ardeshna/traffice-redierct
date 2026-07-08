/**
 * File-backed link store for an always-on server (Railway, a VPS, local).
 *
 * Data lives in one JSON file. On Railway, point DATA_DIR at a mounted Volume
 * (e.g. /data) so links survive redeploys — the container's own disk is wiped
 * on every deploy. Atomic temp-write + rename guards against corruption.
 */

import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

const DATA_DIR = process.env.DATA_DIR || './data';
const DB_FILE = join(DATA_DIR, 'links.json');

let cache = null;

function load() {
  if (cache) return cache;
  mkdirSync(DATA_DIR, { recursive: true });
  try {
    cache = JSON.parse(readFileSync(DB_FILE, 'utf8'));
  } catch {
    cache = { links: {} };
  }
  return cache;
}

function persist() {
  const tmp = `${DB_FILE}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(cache, null, 2));
  renameSync(tmp, DB_FILE);
}

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

function newSlug() {
  const { links } = load();
  for (let i = 0; i < 10; i++) {
    const slug = randomBytes(5).toString('base64url').slice(0, 7);
    if (!links[slug]) return slug;
  }
  throw new Error('could not allocate a unique slug');
}

export function createLink(input) {
  const db = load();
  const destUrl = validateUrl(input.destUrl, 'destUrl');
  const adScript = String(input.adScript ?? '').trim();
  const adDirectUrl = input.adDirectUrl ? validateUrl(input.adDirectUrl, 'adDirectUrl') : '';
  if (!adScript && !adDirectUrl) {
    throw new Error('provide an ad script, a Direct Link, or both');
  }
  const delaySeconds = Math.min(30, Math.max(0, Number(input.delaySeconds) || 5));

  const slug = newSlug();
  db.links[slug] = {
    slug,
    destUrl,
    adScript,
    adDirectUrl,
    delaySeconds,
    title: String(input.title ?? 'Preparing your link').slice(0, 120),
    createdAt: new Date().toISOString(),
    clicks: 0,
    uniqueVisitors: 0,
    adViews: 0,
  };
  persist();
  return db.links[slug];
}

/** Returns the full record (config + counters), or null. */
export function getConfig(slug) {
  return load().links[slug] || null;
}

export function incr(slug, field) {
  const link = load().links[slug];
  if (!link) return;
  link[field] = (link[field] || 0) + 1;
  persist();
}

export function listLinks() {
  return Object.values(load().links).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function deleteLink(slug) {
  const db = load();
  if (!db.links[slug]) return false;
  delete db.links[slug];
  persist();
  return true;
}

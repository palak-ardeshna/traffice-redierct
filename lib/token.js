/**
 * Signed, time-bound tokens that make the countdown load-bearing.
 *
 * Without this, `GET /:slug/go` redirects to the destination unconditionally —
 * anyone can skip the ad by typing three characters, and anyone can inflate the
 * ad-view counters by looping on the endpoint. Reporting impressions that never
 * rendered is impression fraud, and it is the usual reason ad networks ban an
 * account.
 *
 * A token is issued when the interstitial is rendered and carries its issue time.
 * `/go` and `/adview` verify the signature AND that enough wall-clock time has
 * passed. Stateless — no Redis round trip.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

/** Tokens older than this are dead, so a leaked one can't be replayed forever. */
const MAX_AGE_SECONDS = 900;

/** Clock skew / rounding grace, so an honest visitor is never bounced. */
const GRACE_SECONDS = 1;

function secret() {
  const s = process.env.GO_SECRET || process.env.ADMIN_TOKEN;
  if (!s) throw new Error('GO_SECRET (or ADMIN_TOKEN) must be set to sign tokens');
  return s;
}

function sign(slug, issuedAt) {
  return createHmac('sha256', secret()).update(`${slug}.${issuedAt}`).digest('base64url');
}

/** Called when the interstitial is rendered. */
export function issueToken(slug) {
  const issuedAt = Date.now();
  return `${issuedAt}.${sign(slug, issuedAt)}`;
}

/**
 * True only if the token is authentic, not expired, and at least `minAgeSeconds`
 * old — i.e. the visitor genuinely waited.
 */
export function verifyToken(slug, token, minAgeSeconds) {
  const [issuedAt, mac] = String(token ?? '').split('.');
  if (!issuedAt || !mac || !/^\d+$/.test(issuedAt)) return false;

  const expected = sign(slug, issuedAt);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;

  const ageSeconds = (Date.now() - Number(issuedAt)) / 1000;
  if (ageSeconds > MAX_AGE_SECONDS) return false;
  return ageSeconds >= Math.max(0, minAgeSeconds - GRACE_SECONDS);
}

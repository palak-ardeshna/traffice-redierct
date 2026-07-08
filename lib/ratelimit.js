/**
 * Fixed-window rate limiter backed by Redis.
 *
 * Fails OPEN on Redis errors: a limiter outage must never take down the redirect
 * path or lock the operator out of their own admin page.
 */

import { redis } from './store.js';

/** Best-effort client IP. Vercel sets x-forwarded-for; the left-most entry is the client. */
export function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress ?? 'unknown';
}

/**
 * @returns {Promise<boolean>} true if the request is allowed.
 */
export async function allow(key, max, windowSeconds) {
  try {
    const bucket = Math.floor(Date.now() / 1000 / windowSeconds);
    const k = `rl:${key}:${bucket}`;
    const replies = await redis()
      .multi()
      .incr(k)
      .expire(k, windowSeconds + 1)
      .exec();

    // exec() returns null if the transaction was aborted, and a non-numeric reply
    // would make `Number(hits) <= max` false — i.e. fail *closed*, silently blocking
    // real traffic. Anything we can't read as a count means "allow".
    const hits = Number(replies?.[0]?.[1]);
    if (!Number.isFinite(hits)) return true;
    return hits <= max;
  } catch {
    return true; // fail open: a limiter outage must not take down redirects
  }
}

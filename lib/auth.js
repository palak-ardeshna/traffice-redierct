/**
 * Admin-token check for /api/*.
 *
 * The `!==` compare it replaces was timing-unsafe, but the real hole was the
 * absence of any rate limit: a single shared secret with unlimited guesses.
 */

import { timingSafeEqual } from 'node:crypto';
import { allow, clientIp } from './ratelimit.js';

function sameSecret(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Writes the error response and returns false when the request should stop.
 * @returns {Promise<boolean>} true if authorized.
 */
export async function requireAdmin(req, res) {
  if (!process.env.ADMIN_TOKEN) {
    res.status(500).json({ error: 'ADMIN_TOKEN not set on server' });
    return false;
  }
  if (!(await allow(`admin:${clientIp(req)}`, 20, 60))) {
    res.status(429).json({ error: 'too many requests' });
    return false;
  }
  if (!sameSecret(req.headers['x-admin-token'] ?? '', process.env.ADMIN_TOKEN)) {
    res.status(401).json({ error: 'bad or missing admin token' });
    return false;
  }
  return true;
}

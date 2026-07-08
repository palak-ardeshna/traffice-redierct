/**
 * Admin gate for /api/*.
 *
 * Two ways in:
 *   1. An HttpOnly session cookie, set by POST /api/login. This is what the admin page
 *      uses, so the token is typed once and never lives in JavaScript-readable storage.
 *   2. An `x-admin-token` header, for curl and scripts.
 *
 * Both sit behind a per-IP rate limit. The original code compared the token with `!==`
 * and had no limit at all, which made a single shared secret freely guessable.
 */

import { timingSafeEqual } from 'node:crypto';
import { allow, clientIp } from './ratelimit.js';
import { hasValidSession } from './session.js';

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
  if (!(await allow(`admin:${clientIp(req)}`, 60, 60))) {
    res.status(429).json({ error: 'too many requests' });
    return false;
  }

  if (hasValidSession(req)) return true;
  if (sameSecret(req.headers['x-admin-token'] ?? '', process.env.ADMIN_TOKEN)) return true;

  res.status(401).json({ error: 'not signed in' });
  return false;
}

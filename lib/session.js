/**
 * Admin sessions: sign in once, stay signed in.
 *
 * Why a cookie and not localStorage:
 *   The admin page and the interstitials share one origin. Interstitials inject the
 *   ad network's script raw (that is what an ad tag is). Anything in localStorage or
 *   sessionStorage on that origin is readable by that third-party script — including
 *   the admin token, which grants full create/list/delete. An HttpOnly cookie is not
 *   readable by any JavaScript, so the ad tag cannot reach it.
 *
 * The cookie carries no secret: it is `<expiry>.<hmac(expiry)>`. Rotating ADMIN_TOKEN
 * (or GO_SECRET) invalidates every outstanding session for free.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { readCookie, isHttps } from './cookies.js';

export const SESSION_COOKIE = 'admin_session';

const DAYS = Number(process.env.SESSION_DAYS ?? 30);
const MAX_AGE_SECONDS = DAYS * 86400;

function secret() {
  const s = process.env.GO_SECRET || process.env.ADMIN_TOKEN;
  if (!s) throw new Error('ADMIN_TOKEN must be set to sign sessions');
  return s;
}

const sign = (expiresAt) => createHmac('sha256', secret()).update(`session.${expiresAt}`).digest('base64url');

function mint() {
  const expiresAt = Date.now() + MAX_AGE_SECONDS * 1000;
  return `${expiresAt}.${sign(expiresAt)}`;
}

export function hasValidSession(req) {
  const [expiresAt, mac] = String(readCookie(req, SESSION_COOKIE) ?? '').split('.');
  if (!expiresAt || !mac || !/^\d+$/.test(expiresAt)) return false;

  const a = Buffer.from(mac);
  const b = Buffer.from(sign(expiresAt));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;

  return Date.now() < Number(expiresAt);
}

/**
 * `Path=/api` keeps the cookie off every interstitial request — the ad script's own
 * page never even sees it go past. `SameSite=Strict` is what stops a cross-site POST
 * to /api/delete from riding on the session (CSRF).
 */
export function setSessionCookie(req, res) {
  const flags = [
    `${SESSION_COOKIE}=${mint()}`,
    `Max-Age=${MAX_AGE_SECONDS}`,
    'HttpOnly',
    'SameSite=Strict',
    'Path=/api',
  ];
  if (isHttps(req)) flags.push('Secure');
  res.setHeader('Set-Cookie', flags.join('; '));
}

export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Max-Age=0; HttpOnly; SameSite=Strict; Path=/api`);
}

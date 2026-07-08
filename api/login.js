import { timingSafeEqual } from 'node:crypto';
import { setSessionCookie } from '../lib/session.js';
import { allow, clientIp } from '../lib/ratelimit.js';

function sameSecret(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!process.env.ADMIN_TOKEN) return res.status(500).json({ error: 'ADMIN_TOKEN not set on server' });

  // Tighter than the general admin limit: this is the endpoint worth guessing at.
  if (!(await allow(`login:${clientIp(req)}`, 5, 60))) {
    return res.status(429).json({ error: 'too many attempts, wait a minute' });
  }

  const token = (req.body && req.body.token) || '';
  if (!sameSecret(token, process.env.ADMIN_TOKEN)) {
    return res.status(401).json({ error: 'wrong token' });
  }

  setSessionCookie(req, res);
  res.json({ ok: true });
}

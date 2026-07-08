import { clearSessionCookie } from '../lib/session.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  clearSessionCookie(res);
  res.json({ ok: true });
}

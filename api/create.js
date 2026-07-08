import { createLink } from '../lib/store.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!process.env.ADMIN_TOKEN) return res.status(500).json({ error: 'ADMIN_TOKEN not set on server' });
  if ((req.headers['x-admin-token'] || '') !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: 'bad or missing admin token' });
  }
  try {
    const link = await createLink(req.body || {});
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const proto = req.headers['x-forwarded-proto'] || 'https';
    res.json({ slug: link.slug, shortUrl: `${proto}://${host}/${link.slug}`, link });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

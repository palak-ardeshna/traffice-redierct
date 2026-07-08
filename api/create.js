import { createLink } from '../lib/store.js';
import { requireAdmin } from '../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!(await requireAdmin(req, res))) return;
  try {
    const link = await createLink(req.body || {});
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const proto = req.headers['x-forwarded-proto'] || 'https';
    res.json({ slug: link.slug, shortUrl: `${proto}://${host}/${link.slug}`, link });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

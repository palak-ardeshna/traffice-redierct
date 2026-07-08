import { deleteLink } from '../lib/store.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if ((req.headers['x-admin-token'] || '') !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: 'bad or missing admin token' });
  }
  const slug = String((req.body && req.body.slug) || '');
  res.json({ deleted: await deleteLink(slug) });
}

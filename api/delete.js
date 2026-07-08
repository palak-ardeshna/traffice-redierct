import { deleteLink } from '../lib/store.js';
import { requireAdmin } from '../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!(await requireAdmin(req, res))) return;
  const slug = String((req.body && req.body.slug) || '');
  res.json({ deleted: await deleteLink(slug) });
}

import { listLinks } from '../lib/store.js';
import { requireAdmin } from '../lib/auth.js';

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  res.json({ baseUrl: `${proto}://${host}`, links: await listLinks() });
}

import { listLinks } from '../lib/store.js';

export default async function handler(req, res) {
  if ((req.headers['x-admin-token'] || '') !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: 'bad or missing admin token' });
  }
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  res.json({ baseUrl: `${proto}://${host}`, links: await listLinks() });
}

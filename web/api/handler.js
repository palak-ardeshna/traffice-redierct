/**
 * Public redirect handler. vercel.json rewrites map the pretty URLs here:
 *   /:slug          -> action undefined  (interstitial, or 302 for returning)
 *   /:slug/go       -> action=go         (set cookie, 302 to destination)
 *   /:slug/adview   -> action=adview     (count a rendered script ad)
 */

import { getConfig, incr } from '../lib/store.js';
import { renderInterstitial } from '../lib/interstitial.js';

const SEEN_DAYS = 7;

function readCookie(req, name) {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

export default async function handler(req, res) {
  const slug = String(req.query.slug || '');
  const action = req.query.action;
  const link = await getConfig(slug);
  if (!link) {
    res.status(404).send('Link not found');
    return;
  }

  // Count a rendered script ad.
  if (action === 'adview') {
    if (req.method === 'POST') await incr(slug, 'adViews');
    res.status(204).end();
    return;
  }

  // The real exit — Continue was clicked, so a Direct Link (if set) just opened.
  if (action === 'go') {
    if (link.adDirectUrl) await incr(slug, 'adViews');
    res.setHeader(
      'Set-Cookie',
      `seen_${slug}=1; Max-Age=${SEEN_DAYS * 86400}; HttpOnly; SameSite=Lax; Path=/`
    );
    res.writeHead(302, { Location: link.destUrl });
    res.end();
    return;
  }

  // The short link itself.
  await incr(slug, 'clicks');
  if (readCookie(req, `seen_${slug}`) === '1') {
    res.writeHead(302, { Location: link.destUrl });
    res.end();
    return;
  }
  await incr(slug, 'uniqueVisitors');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send(renderInterstitial(link));
}

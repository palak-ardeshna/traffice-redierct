/**
 * Always-on redirect server (Railway / VPS / local).
 *
 * One long-running process serving:
 *   GET  /                 admin page (public/index.html)
 *   POST /api/create       create a link            (needs x-admin-token)
 *   GET  /api/list         list links               (needs x-admin-token)
 *   POST /api/delete       delete a link            (needs x-admin-token)
 *   GET  /:slug            interstitial (new) or 302 (returning)
 *   GET  /:slug/go         Continue -> cookie + 302 to destination
 *   POST /:slug/adview     count a rendered script ad
 */

import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLink, getConfig, incr, listLinks, deleteLink } from './lib/store.js';
import { renderInterstitial } from './lib/interstitial.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const SEEN_DAYS = 7;

const ADMIN_PAGE = readFileSync(join(__dirname, 'public', 'index.html'), 'utf8');

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

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 1e6) req.destroy(); // basic flood guard
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
  });
}

const json = (res, code, obj) => {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
};

const authed = (req) => ADMIN_TOKEN && (req.headers['x-admin-token'] || '') === ADMIN_TOKEN;

function baseUrl(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'http';
  return `${proto}://${host}`;
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const parts = url.pathname.split('/').filter(Boolean);
  const seg0 = parts[0];
  const seg1 = parts[1];

  // ---- admin page ----
  if (req.method === 'GET' && !seg0) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(ADMIN_PAGE);
    return;
  }

  // ---- admin API ----
  if (seg0 === 'api') {
    if (!ADMIN_TOKEN) return json(res, 500, { error: 'ADMIN_TOKEN not set on server' });
    if (!authed(req)) return json(res, 401, { error: 'bad or missing admin token' });

    if (seg1 === 'create' && req.method === 'POST') {
      try {
        const link = createLink(await readBody(req));
        return json(res, 200, { slug: link.slug, shortUrl: `${baseUrl(req)}/${link.slug}`, link });
      } catch (err) {
        return json(res, 400, { error: err.message });
      }
    }
    if (seg1 === 'list' && req.method === 'GET') {
      return json(res, 200, { baseUrl: baseUrl(req), links: listLinks() });
    }
    if (seg1 === 'delete' && req.method === 'POST') {
      const { slug } = await readBody(req);
      return json(res, 200, { deleted: deleteLink(String(slug || '')) });
    }
    return json(res, 404, { error: 'unknown endpoint' });
  }

  // ---- public link routes ----
  const slug = decodeURIComponent(seg0);
  const link = getConfig(slug);
  if (!link) {
    res.writeHead(404).end('Link not found');
    return;
  }

  // count a rendered script ad
  if (seg1 === 'adview') {
    if (req.method === 'POST') incr(slug, 'adViews');
    res.writeHead(204).end();
    return;
  }

  // Continue clicked -> a Direct Link (if set) just opened; remember + move on
  if (seg1 === 'go') {
    if (link.adDirectUrl) incr(slug, 'adViews');
    res.writeHead(302, {
      Location: link.destUrl,
      'Set-Cookie': `seen_${slug}=1; Max-Age=${SEEN_DAYS * 86400}; HttpOnly; SameSite=Lax; Path=/`,
    });
    res.end();
    return;
  }

  // the short link itself
  if (!seg1) {
    incr(slug, 'clicks');
    if (readCookie(req, `seen_${slug}`) === '1') {
      res.writeHead(302, { Location: link.destUrl });
      res.end();
      return;
    }
    incr(slug, 'uniqueVisitors');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(renderInterstitial(link));
    return;
  }

  res.writeHead(404).end('Not found');
}

createServer((req, res) => {
  handle(req, res).catch((err) => {
    console.error('handler error', err);
    if (!res.headersSent) res.writeHead(500);
    res.end('Server error');
  });
}).listen(PORT, () => {
  console.log(`Redirect server listening on :${PORT}`);
  if (!ADMIN_TOKEN) console.warn('WARNING: ADMIN_TOKEN not set — link creation is disabled until you set it.');
});

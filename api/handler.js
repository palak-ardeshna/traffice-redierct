/**
 * Public redirect handler. vercel.json rewrites map the pretty URLs here:
 *   /:slug          -> action undefined  (interstitial, or 302 for returning)
 *   /:slug/go       -> action=go         (set cookie, 302 to destination)
 *   /:slug/adview   -> action=adview     (count a rendered script ad)
 *
 * /go and /adview both require the signed token issued when the interstitial was
 * rendered. Without it they were an ad-gate bypass and a public counter-inflation
 * endpoint respectively.
 */

import { getConfig, bump, logEvent } from '../lib/store.js';
import { renderInterstitial } from '../lib/interstitial.js';
import { issueToken, verifyToken } from '../lib/token.js';
import { allow, clientIp } from '../lib/ratelimit.js';
import { readCookie } from '../lib/cookies.js';

const SEEN_DAYS = Number(process.env.SEEN_DAYS ?? 7);

/** The script ad's beacon fires at t+2.5s, so a token younger than that is forged. */
const ADVIEW_MIN_AGE = 2;

/**
 * Crawlers and chat-app link unfurlers (Discord, WhatsApp, Slack) hit every link
 * that gets posted. Counting them inflates clicks and, worse, would report ad
 * impressions that no human saw. They still get the page — they just don't count.
 */
const BOT_UA =
  /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegram|discord|slackbot|twitterbot|linkedinbot|embedly|curl|wget|python-requests|go-http-client|headless|lighthouse|preview/i;

function redirectTo(res, url) {
  // A 302 carrying Set-Cookie must never be stored by a shared cache.
  res.setHeader('Cache-Control', 'private, no-store');
  res.writeHead(302, { Location: url });
  res.end();
}

/**
 * The token rides in a cookie *and* the query string. The cookie is authoritative:
 * relying on `?t=` alone would make every link depend on Vercel preserving query
 * params across a rewrite, and if it ever didn't, `/go` would bounce back to the
 * interstitial forever.
 */
function readToken(req, slug) {
  return req.query.t || readCookie(req, `gt_${slug}`) || '';
}

export default async function handler(req, res) {
  const slug = String(req.query.slug || '');
  const action = req.query.action;

  let link;
  try {
    link = await getConfig(slug);
  } catch {
    res.status(503).send('Temporarily unavailable');
    return;
  }
  if (!link) {
    res.status(404).send('Link not found');
    return;
  }

  const ua = req.headers['user-agent'] ?? '';
  const isBot = BOT_UA.test(ua);

  // --- Count a script-ad impression ----------------------------------------
  if (action === 'adview') {
    if (req.method !== 'POST' || isBot) return res.status(204).end();
    if (!verifyToken(slug, readToken(req, slug), ADVIEW_MIN_AGE)) return res.status(204).end();
    if (!(await allow(`adview:${clientIp(req)}:${slug}`, 5, 60))) return res.status(204).end();
    await bump(slug, ['adScriptViews']);
    return res.status(204).end();
  }

  // --- Continue: the visitor waited out the countdown ------------------------
  if (action === 'go') {
    // The token must be at least `delaySeconds` old. This is what makes the
    // countdown real rather than decorative.
    if (!verifyToken(slug, readToken(req, slug), link.delaySeconds)) {
      return redirectTo(res, `/${encodeURIComponent(slug)}`);
    }
    if (link.adDirectUrl && !isBot) await bump(slug, ['directLinkClicks']);
    res.setHeader('Set-Cookie', [
      `seen_${slug}=1; Max-Age=${SEEN_DAYS * 86400}; HttpOnly; SameSite=Lax; Path=/`,
      `gt_${slug}=; Max-Age=0; Path=/`, // burn the token: one Continue per interstitial
    ]);
    return redirectTo(res, link.destUrl);
  }

  // --- Landing --------------------------------------------------------------
  const returning = readCookie(req, `seen_${slug}`) === '1';

  if (!isBot) {
    await Promise.all([
      bump(slug, returning ? ['clicks'] : ['clicks', 'uniqueVisitors']),
      // The single strongest predictor of revenue is where the visitor is, and it
      // arrives free on every request. Throwing it away was the costliest bug here.
      logEvent({
        slug,
        ts: Date.now(),
        country: req.headers['x-vercel-ip-country'] ?? '',
        region: req.headers['x-vercel-ip-country-region'] ?? '',
        city: req.headers['x-vercel-ip-city'] ?? '',
        referrer: req.headers.referer ?? '',
        ua,
        returning: returning ? 1 : 0,
      }),
    ]);
  }

  if (returning) return redirectTo(res, link.destUrl);

  const token = issueToken(slug);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Set-Cookie', `gt_${slug}=${token}; Max-Age=900; HttpOnly; SameSite=Lax; Path=/`);
  res.status(200).send(renderInterstitial(link, token));
}

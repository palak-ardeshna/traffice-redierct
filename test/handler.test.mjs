/**
 * End-to-end tests for the public redirect handler, against an in-memory Redis stub.
 *
 * The stub is installed on `globalThis.__redis` before store.js is imported, which is
 * the same slot the real client memoizes into.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

process.env.GO_SECRET = 'test-secret';

// --- in-memory Redis --------------------------------------------------------
const kv = new Map();
const counters = new Map();
let events = [];

const bumpKey = (k) => {
  const n = (counters.get(k) ?? 0) + 1;
  counters.set(k, n);
  return n; // real INCR replies with the new value
};

const multi = () => {
  const ops = [];
  const self = {
    incr(k) { ops.push(() => bumpKey(k)); return self; },
    expire() { ops.push(() => 1); return self; },
    del(...ks) { ops.push(() => ks.forEach((k) => kv.delete(k))); return self; },
    srem() { ops.push(() => 1); return self; },
    async exec() { return ops.map((f) => [null, f()]); },
  };
  return self;
};

globalThis.__redis = {
  async get(k) { return kv.get(k) ?? null; },
  async set(k, v) { kv.set(k, v); return 'OK'; },
  async sadd() { return 1; },
  async exists(k) { return kv.has(k) ? 1 : 0; },
  async mget(...ks) { return ks.map((k) => kv.get(k) ?? null); },
  async smembers() { return []; },
  async xadd(_stream, _maxlen, _approx, _len, _id, ...flat) { events.push(flat); return '1-1'; },
  multi,
};

const handler = (await import('../api/handler.js')).default;

// --- fixtures ---------------------------------------------------------------
const SLUG = 'aB3xK9q';
const DEST = 'https://store.example.com/page';
const LINK = {
  slug: SLUG,
  destUrl: DEST,
  adScript: '<script src="x.js"></script>',
  adDirectUrl: 'https://ads.example/direct',
  delaySeconds: 5,
  title: 'Preparing',
};
kv.set(`link:${SLUG}`, JSON.stringify(LINK));

const sign = (slug, iat) =>
  crypto.createHmac('sha256', 'test-secret').update(`${slug}.${iat}`).digest('base64url');
/** An authentic token, issued `secs` seconds ago. */
const aged = (slug, secs) => {
  const iat = Date.now() - secs * 1000;
  return `${iat}.${sign(slug, iat)}`;
};

function mkRes() {
  const r = { code: 200, headers: {}, body: '' };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
  r.status = (c) => { r.code = c; return r; };
  r.send = (b) => { r.body = b; return r; };
  r.end = () => r;
  r.writeHead = (c, h = {}) => {
    r.code = c;
    for (const [k, v] of Object.entries(h)) r.headers[k.toLowerCase()] = v;
    return r;
  };
  return r;
}

const mkReq = (query, o = {}) => ({
  query,
  method: o.method ?? 'GET',
  headers: {
    'user-agent': o.ua ?? 'Mozilla/5.0',
    ...(o.cookie ? { cookie: o.cookie } : {}),
    ...(o.headers ?? {}),
  },
  socket: { remoteAddress: o.ip ?? '1.2.3.4' },
});

const count = (field) => counters.get(`c:${SLUG}:${field}`) ?? 0;
const cookies = (res) => JSON.stringify(res.headers['set-cookie'] ?? '');

test.beforeEach(() => {
  counters.clear();
  events = [];
});

// === The bypass this whole mechanism exists to close =========================

test('/go without a token does not reach the destination', async () => {
  const res = mkRes();
  await handler(mkReq({ slug: SLUG, action: 'go' }), res);

  assert.notEqual(res.headers.location, DEST);
  assert.equal(res.headers.location, `/${SLUG}`, 'bounces back to the interstitial');
  assert.ok(!cookies(res).includes('seen_'), 'does not suppress future interstitials');
  assert.equal(count('direct'), 0, 'counts no ad view');
});

test('/go with a token younger than the countdown is refused', async () => {
  const res = mkRes();
  await handler(mkReq({ slug: SLUG, action: 'go', t: aged(SLUG, 1) }), res);
  assert.equal(res.headers.location, `/${SLUG}`);
  assert.equal(count('direct'), 0);
});

test('/go with a forged signature is refused', async () => {
  const res = mkRes();
  await handler(mkReq({ slug: SLUG, action: 'go', t: `${Date.now() - 9000}.forgedmac` }), res);
  assert.equal(res.headers.location, `/${SLUG}`);
});

test('/go with a valid, aged token completes the redirect', async () => {
  const res = mkRes();
  await handler(mkReq({ slug: SLUG, action: 'go', t: aged(SLUG, 6) }), res);

  assert.equal(res.headers.location, DEST);
  assert.ok(cookies(res).includes(`seen_${SLUG}=1`));
  assert.ok(cookies(res).includes(`gt_${SLUG}=; Max-Age=0`), 'burns the token');
  assert.equal(count('direct'), 1);
  assert.equal(res.headers['cache-control'], 'private, no-store');
});

test('/go accepts the token from a cookie when the query param is absent', async () => {
  // Guards against a rewrite dropping ?t=, which would otherwise loop forever.
  const res = mkRes();
  await handler(mkReq({ slug: SLUG, action: 'go' }, { cookie: `gt_${SLUG}=${aged(SLUG, 6)}` }), res);
  assert.equal(res.headers.location, DEST);
});

// === /adview is no longer a public counter ===================================

test('/adview without a token counts nothing', async () => {
  const res = mkRes();
  await handler(mkReq({ slug: SLUG, action: 'adview' }, { method: 'POST' }), res);
  assert.equal(count('adscript'), 0);
  assert.equal(res.code, 204, 'still 204, so the beacon never errors');
});

test('/adview with a valid token counts one impression', async () => {
  await handler(mkReq({ slug: SLUG, action: 'adview', t: aged(SLUG, 3) }, { method: 'POST' }), mkRes());
  assert.equal(count('adscript'), 1);
});

test('/adview over GET counts nothing', async () => {
  await handler(mkReq({ slug: SLUG, action: 'adview', t: aged(SLUG, 3) }), mkRes());
  assert.equal(count('adscript'), 0);
});

test('/adview is rate limited per IP and slug', async () => {
  for (let i = 0; i < 8; i++) {
    await handler(
      mkReq({ slug: SLUG, action: 'adview', t: aged(SLUG, 3) }, { method: 'POST', ip: '9.9.9.9' }),
      mkRes()
    );
  }
  assert.equal(count('adscript'), 5, 'caps at 5 per window');
});

// === Landing =================================================================

test('a new visitor sees the interstitial and is counted once', async () => {
  const res = mkRes();
  await handler(mkReq({ slug: SLUG }, { headers: { 'x-vercel-ip-country': 'US' } }), res);

  assert.equal(res.code, 200);
  assert.ok(res.body.includes('<!DOCTYPE html>'));
  assert.equal(count('clicks'), 1);
  assert.equal(count('uniq'), 1);
  assert.ok(String(res.headers['set-cookie']).startsWith(`gt_${SLUG}=`), 'issues a token cookie');

  assert.equal(events.length, 1);
  const ev = events[0];
  assert.equal(ev[ev.indexOf('country') + 1], 'US', 'geo is captured, not discarded');
});

test('a returning visitor skips the interstitial and is not counted as unique', async () => {
  const res = mkRes();
  await handler(mkReq({ slug: SLUG }, { cookie: `seen_${SLUG}=1` }), res);

  assert.equal(res.code, 302);
  assert.equal(res.headers.location, DEST);
  assert.equal(count('clicks'), 1);
  assert.equal(count('uniq'), 0);
  const ev = events[0];
  assert.equal(ev[ev.indexOf('returning') + 1], '1');
});

test('an unknown slug is a 404', async () => {
  const res = mkRes();
  await handler(mkReq({ slug: 'nope' }), res);
  assert.equal(res.code, 404);
});

// === Bots ====================================================================

test('a link-unfurling bot gets the page but inflates nothing', async () => {
  const res = mkRes();
  await handler(mkReq({ slug: SLUG }, { ua: 'Mozilla/5.0 (compatible; Discordbot/2.0)' }), res);

  assert.equal(res.code, 200, 'previews still render');
  assert.equal(count('clicks'), 0);
  assert.equal(events.length, 0);
});

test('a bot cannot register an ad impression', async () => {
  await handler(
    mkReq({ slug: SLUG, action: 'adview', t: aged(SLUG, 3) }, { method: 'POST', ua: 'curl/8.0' }),
    mkRes()
  );
  assert.equal(count('adscript'), 0);
});

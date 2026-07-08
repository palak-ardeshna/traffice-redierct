import test from 'node:test';
import assert from 'node:assert/strict';

process.env.ADMIN_TOKEN = 'super-secret-admin';
process.env.GO_SECRET = 'session-key';

// Rate limiting talks to Redis; stub it before store.js is imported.
const counters = new Map();
globalThis.__redis = {
  multi() {
    const ops = [];
    const self = {
      incr(k) { ops.push(() => { const n = (counters.get(k) ?? 0) + 1; counters.set(k, n); return n; }); return self; },
      expire() { ops.push(() => 1); return self; },
      async exec() { return ops.map((f) => [null, f()]); },
    };
    return self;
  },
};

const { requireAdmin } = await import('../lib/auth.js');
const { setSessionCookie, SESSION_COOKIE } = await import('../lib/session.js');

function mkRes() {
  const r = { code: 200, body: null, headers: {} };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
}
const mkReq = (headers = {}, ip = '1.1.1.1') => ({ headers, socket: { remoteAddress: ip } });

/** A real, signed session cookie. */
function freshCookie() {
  const res = mkRes();
  setSessionCookie({ headers: {} }, res);
  return res.headers['set-cookie'].split(';')[0];
}

test.beforeEach(() => counters.clear());

test('a valid session cookie authorizes', async () => {
  const res = mkRes();
  assert.equal(await requireAdmin(mkReq({ cookie: freshCookie() }), res), true);
});

test('the x-admin-token header still authorizes, for curl and scripts', async () => {
  const res = mkRes();
  assert.equal(await requireAdmin(mkReq({ 'x-admin-token': 'super-secret-admin' }), res), true);
});

test('no credentials at all is a 401', async () => {
  const res = mkRes();
  assert.equal(await requireAdmin(mkReq(), res), false);
  assert.equal(res.code, 401);
});

test('a wrong header token is a 401', async () => {
  const res = mkRes();
  assert.equal(await requireAdmin(mkReq({ 'x-admin-token': 'wrong' }), res), false);
  assert.equal(res.code, 401);
});

test('a token of a different length is a 401, not a crash', async () => {
  // timingSafeEqual throws on length mismatch; the length guard must come first.
  const res = mkRes();
  assert.equal(await requireAdmin(mkReq({ 'x-admin-token': 'x' }), res), false);
  assert.equal(res.code, 401);
});

test('a forged session cookie is a 401', async () => {
  const res = mkRes();
  const forged = `${SESSION_COOKIE}=${Date.now() + 99999}.deadbeef`;
  assert.equal(await requireAdmin(mkReq({ cookie: forged }), res), false);
  assert.equal(res.code, 401);
});

test('requests are rate limited per IP', async () => {
  let allowed = 0;
  for (let i = 0; i < 70; i++) {
    const res = mkRes();
    if (await requireAdmin(mkReq({ 'x-admin-token': 'super-secret-admin' }, '8.8.8.8'), res)) allowed++;
  }
  assert.equal(allowed, 60, 'caps at 60 per minute');
});

test('the limiter runs before the token check, so guessing is throttled too', async () => {
  let rejected429 = 0;
  for (let i = 0; i < 70; i++) {
    const res = mkRes();
    await requireAdmin(mkReq({ 'x-admin-token': 'guess-guess-guess' }, '7.7.7.7'), res);
    if (res.code === 429) rejected429++;
  }
  assert.ok(rejected429 > 0, 'brute force hits the limiter, not just 401s');
});

test('a missing ADMIN_TOKEN fails closed with a 500, never open', async () => {
  const saved = process.env.ADMIN_TOKEN;
  delete process.env.ADMIN_TOKEN;
  const res = mkRes();
  assert.equal(await requireAdmin(mkReq(), res), false);
  assert.equal(res.code, 500);
  process.env.ADMIN_TOKEN = saved;
});

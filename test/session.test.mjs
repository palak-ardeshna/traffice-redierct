import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

process.env.ADMIN_TOKEN = 'super-secret-admin';
process.env.GO_SECRET = 'session-key';
const { hasValidSession, setSessionCookie, clearSessionCookie, SESSION_COOKIE } =
  await import('../lib/session.js');

const sign = (exp) =>
  crypto.createHmac('sha256', 'session-key').update(`session.${exp}`).digest('base64url');

const reqWith = (cookie) => ({ headers: cookie ? { cookie } : {} });
const cookieOf = (value) => `${SESSION_COOKIE}=${value}`;

function capture(reqHeaders = {}) {
  const res = { headers: {} };
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
  return { req: { headers: reqHeaders }, res };
}

test('a freshly minted cookie validates', () => {
  const { req, res } = capture({ 'x-forwarded-proto': 'https' });
  setSessionCookie(req, res);
  const value = res.headers['set-cookie'].split(';')[0].split('=')[1];
  assert.equal(hasValidSession(reqWith(cookieOf(value))), true);
});

test('the cookie is HttpOnly, SameSite=Strict, and scoped to /api', () => {
  const { req, res } = capture({ 'x-forwarded-proto': 'https' });
  setSessionCookie(req, res);
  const header = res.headers['set-cookie'];

  // HttpOnly is the whole point: an ad script on this origin must not be able to read it.
  assert.match(header, /HttpOnly/);
  assert.match(header, /SameSite=Strict/, 'blocks cross-site POSTs (CSRF)');
  assert.match(header, /Path=\/api/, 'never sent to interstitial pages');
  assert.match(header, /Secure/);
});

test('Secure is omitted over plain http so `vercel dev` still works', () => {
  const { req, res } = capture({ 'x-forwarded-proto': 'http' });
  setSessionCookie(req, res);
  assert.doesNotMatch(res.headers['set-cookie'], /Secure/);
});

test('no cookie means no session', () => {
  assert.equal(hasValidSession(reqWith(null)), false);
  assert.equal(hasValidSession(reqWith('other=1')), false);
});

test('a tampered signature is rejected', () => {
  const exp = Date.now() + 60_000;
  assert.equal(hasValidSession(reqWith(cookieOf(`${exp}.AAAA`))), false);
});

test('extending the expiry without re-signing is rejected', () => {
  const exp = Date.now() + 60_000;
  const forged = `${exp + 999_999}.${sign(exp)}`;
  assert.equal(hasValidSession(reqWith(cookieOf(forged))), false);
});

test('an authentic but expired cookie is rejected', () => {
  const exp = Date.now() - 1000;
  assert.equal(hasValidSession(reqWith(cookieOf(`${exp}.${sign(exp)}`))), false);
});

test('malformed cookies are rejected', () => {
  for (const bad of ['', '.', 'abc.def', 'notanumber.' + sign(1), '12345']) {
    assert.equal(hasValidSession(reqWith(cookieOf(bad))), false, `accepted: ${bad}`);
  }
});

test('the cookie carries no secret material', () => {
  const { req, res } = capture();
  setSessionCookie(req, res);
  assert.ok(!res.headers['set-cookie'].includes(process.env.ADMIN_TOKEN));
});

test('rotating the signing key invalidates outstanding sessions', () => {
  const { req, res } = capture();
  setSessionCookie(req, res);
  const value = res.headers['set-cookie'].split(';')[0].split('=')[1];
  assert.equal(hasValidSession(reqWith(cookieOf(value))), true);

  process.env.GO_SECRET = 'rotated-key';
  assert.equal(hasValidSession(reqWith(cookieOf(value))), false);
  process.env.GO_SECRET = 'session-key';
});

test('clearing expires the cookie', () => {
  const res = { headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; } };
  clearSessionCookie(res);
  assert.match(res.headers['set-cookie'], /Max-Age=0/);
});

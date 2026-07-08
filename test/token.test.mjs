import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

process.env.GO_SECRET = 'test-secret';
const { issueToken, verifyToken } = await import('../lib/token.js');

const sign = (slug, iat) =>
  crypto.createHmac('sha256', 'test-secret').update(`${slug}.${iat}`).digest('base64url');
/** An authentic token, issued `secs` seconds ago. */
const aged = (slug, secs) => {
  const iat = Date.now() - secs * 1000;
  return `${iat}.${sign(slug, iat)}`;
};

test('a freshly issued token has not satisfied a 5s countdown', () => {
  assert.equal(verifyToken('abc123', issueToken('abc123'), 5), false);
});

test('a freshly issued token satisfies a 0s countdown', () => {
  assert.equal(verifyToken('abc123', issueToken('abc123'), 0), true);
});

test('a token is bound to its slug', () => {
  assert.equal(verifyToken('other', issueToken('abc123'), 0), false);
});

test('malformed tokens are rejected', () => {
  for (const bad of ['', 'garbage', undefined, null, 'abc.def', '123', '.']) {
    assert.equal(verifyToken('abc123', bad, 0), false, `accepted: ${JSON.stringify(bad)}`);
  }
});

test('a tampered signature is rejected', () => {
  const [iat] = issueToken('abc123').split('.');
  assert.equal(verifyToken('abc123', `${iat}.AAAA`, 0), false);
});

test('replaying an old issue-time with a stale signature is rejected', () => {
  const [, mac] = issueToken('abc123').split('.');
  assert.equal(verifyToken('abc123', `${Date.now() - 10_000}.${mac}`, 5), false);
});

test('an authentic token expires after 15 minutes', () => {
  assert.equal(verifyToken('abc123', aged('abc123', 20 * 60), 5), false);
});

test('an authentic token older than the countdown is accepted', () => {
  assert.equal(verifyToken('abc123', aged('abc123', 6), 5), true);
});

test('an authentic token younger than the countdown is rejected', () => {
  assert.equal(verifyToken('abc123', aged('abc123', 6), 30), false);
});

test('a 1s grace absorbs clock skew but not a real skip', () => {
  assert.equal(verifyToken('abc123', aged('abc123', 4.5), 5), true, '4.5s should pass');
  assert.equal(verifyToken('abc123', aged('abc123', 3), 5), false, '3s should fail');
});

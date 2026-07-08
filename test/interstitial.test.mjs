import test from 'node:test';
import assert from 'node:assert/strict';
import { renderInterstitial } from '../lib/interstitial.js';

const TOKEN = '1770000000000.FAKEMACabc';
const render = (over = {}) =>
  renderInterstitial(
    {
      slug: 'aB3xK9q',
      destUrl: 'https://store.example.com/page?a=1&b=2',
      adScript: '<script src="https://ads.example/tag.js"></script>',
      adDirectUrl: 'https://ads.example/direct',
      delaySeconds: 5,
      title: 'Hello <script>alert(1)</script> & "friends"',
      ...over,
    },
    TOKEN
  );

test('both privileged endpoints carry the token', () => {
  const html = render();
  assert.ok(html.includes(`/aB3xK9q/go?t=${encodeURIComponent(TOKEN)}`));
  assert.ok(html.includes(`/aB3xK9q/adview?t=${encodeURIComponent(TOKEN)}`));
});

test('no tokenless /go or /adview URL is left in the page', () => {
  const html = render();
  assert.doesNotMatch(html, /\/aB3xK9q\/go(?!\?t=)/);
  assert.doesNotMatch(html, /\/aB3xK9q\/adview(?!\?t=)/);
});

test('the title is HTML-escaped', () => {
  const html = render();
  assert.ok(html.includes('Hello &lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(!html.includes('<script>alert(1)</script>'));
});

test('the destination URL is escaped in the footer', () => {
  assert.ok(render().includes('a=1&amp;b=2'));
});

test('the ad script is injected raw — that is what an ad tag is', () => {
  assert.ok(render().includes('<script src="https://ads.example/tag.js">'));
});

test('the Direct Link opens from the click handler, never automatically', () => {
  const html = render();
  assert.ok(html.includes('window.open("https://ads.example/direct"'));
  // It must sit inside the click listener, not at top level.
  const clickIdx = html.indexOf("btn.addEventListener('click'");
  assert.ok(clickIdx > 0 && html.indexOf('window.open(') > clickIdx);
});

test('a link with no Direct Link emits no window.open', () => {
  assert.ok(!render({ adDirectUrl: '' }).includes('window.open('));
});

test('a link with no ad script emits no adview beacon', () => {
  assert.ok(!render({ adScript: '' }).includes('/adview'));
});

test('the countdown total matches delaySeconds', () => {
  assert.ok(render({ delaySeconds: 12 }).includes('var total = 12;'));
});

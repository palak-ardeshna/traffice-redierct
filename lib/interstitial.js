/** Renders the loading/interstitial page shown to new visitors. */

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );

export function renderInterstitial(link) {
  const slug = encodeURIComponent(link.slug);
  const goUrl = `/${slug}/go`;

  // Direct Link opens in a new tab from the user's own click — never auto-opened,
  // never framed (both would be impression fraud).
  const directLinkJs = link.adDirectUrl
    ? `window.open(${JSON.stringify(link.adDirectUrl)}, '_blank', 'noopener');`
    : '';

  const adSlot = link.adScript || '';
  const hasScriptAd = Boolean(link.adScript);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>${esc(link.title)}</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    padding: 1.5rem; font: 16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; background: #f4f4f7; color: #18181b; }
  @media (prefers-color-scheme: dark) { body { background: #0b0b0f; color: #ededf0; } }
  .card { width: 100%; max-width: 620px; background: #fff; border-radius: 14px; padding: 2rem;
    text-align: center; box-shadow: 0 4px 24px rgb(0 0 0 / .08); }
  @media (prefers-color-scheme: dark) { .card { background: #17171c; box-shadow: none; } }
  h1 { margin: 0 0 .35rem; font-size: 1.3rem; }
  .sub { margin: 0 0 1.5rem; opacity: .65; font-size: .9rem; }
  .bar { height: 5px; border-radius: 99px; background: #e4e4e9; overflow: hidden; }
  @media (prefers-color-scheme: dark) { .bar { background: #2a2a32; } }
  .fill { height: 100%; width: 0%; background: #6366f1; transition: width .95s linear; }
  .ad { margin: 1.5rem 0; min-height: 90px; display: flex; align-items: center; justify-content: center; }
  .ad:empty::after { content: "Advertisement"; font-size: .7rem; letter-spacing: .1em; text-transform: uppercase; opacity: .3; }
  button { width: 100%; padding: .85rem 1.5rem; font-size: 1rem; font-weight: 600; border: 0; border-radius: 9px;
    background: #6366f1; color: #fff; cursor: pointer; }
  button[disabled] { background: #c7c7cf; cursor: not-allowed; }
  @media (prefers-color-scheme: dark) { button[disabled] { background: #2f2f38; color: #6b6b76; } }
  .dest { margin-top: 1rem; font-size: .75rem; opacity: .5; word-break: break-all; }
</style>
</head>
<body>
  <main class="card">
    <h1>${esc(link.title)}</h1>
    <p class="sub">Your link opens in a moment.</p>
    <div class="bar"><div class="fill" id="fill"></div></div>
    <div class="ad" id="ad">${adSlot}</div>
    <button id="go" disabled>Please wait&hellip;</button>
    <p class="dest">Destination: ${esc(link.destUrl)}</p>
  </main>
<script>
(function () {
  var total = ${Number(link.delaySeconds)};
  var left  = total;
  var btn   = document.getElementById('go');
  var fill  = document.getElementById('fill');

  function ready() { btn.disabled = false; btn.textContent = 'Continue \\u2192'; }
  function tick() {
    left--;
    fill.style.width = total ? ((total - left) / total * 100) + '%' : '100%';
    if (left <= 0) return ready();
    btn.textContent = 'Please wait\\u2026 ' + left + 's';
    setTimeout(tick, 1000);
  }
  total > 0 ? (btn.textContent = 'Please wait\\u2026 ' + left + 's', setTimeout(tick, 1000))
            : (fill.style.width = '100%', ready());

  // Count a script-ad impression only after the async ad tag has had time to load.
  if (${hasScriptAd ? 'true' : 'false'}) {
    setTimeout(function () {
      navigator.sendBeacon && navigator.sendBeacon('/${slug}/adview');
    }, 2500);
  }

  btn.addEventListener('click', function () {
    if (btn.disabled) return;
    ${directLinkJs}
    window.location.href = ${JSON.stringify(goUrl)};
  });
})();
</script>
</body>
</html>`;
}

/**
 * Embedded HTTP server that hosts the monetized short links.
 *
 * Real visitors must reach these URLs in a browser, so the Electron main
 * process runs a tiny http server (built-in `http`, no Express). It serves:
 *   GET  /:slug        → interstitial (new visitor) or 302 to dest (returning)
 *   GET  /:slug/go     → set "seen" cookie, 302 to destination
 *   POST /:slug/adview → count a rendered ad slot
 *
 * The manager UI lives in the renderer and talks to the store over IPC — this
 * server is public-facing and read-only w.r.t. link creation.
 */

import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import { createLogger } from "@flowpilot/logger";
import { getLink, bump, type LinkRecord } from "./redirect-store.js";

const log = createLogger({ name: "redirect-server" });

const SEEN_DAYS = 7;

let server: Server | null = null;
let boundPort = 0;

const esc = (s: string): string =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string
  );

const seenCookie = (slug: string): string => `seen_${slug}`;

function readCookie(req: IncomingMessage, name: string): string | null {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return null;
}

function redirect(res: ServerResponse, location: string, cookie?: string): void {
  const headers: Record<string, string> = { Location: location };
  if (cookie) headers["Set-Cookie"] = cookie;
  res.writeHead(302, headers);
  res.end();
}

function html(res: ServerResponse, body: string): void {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
  res.end(body);
}

function renderInterstitial(link: LinkRecord): string {
  const goUrl = `/${encodeURIComponent(link.slug)}/go`;

  // Direct Link opens in a new tab from the user's own click. Never auto-opened
  // and never framed — both would be impression fraud.
  const directLinkJs = link.adDirectUrl
    ? `window.open(${JSON.stringify(link.adDirectUrl)}, '_blank', 'noopener');`
    : "";

  // Operator-supplied ad tag(s). Injected raw by design; only the local desktop
  // operator can create links, so there is no untrusted author here.
  const adSlot = link.adScript || "";

  // A page-rendered ad exists only when there's a script. Direct-Link views are
  // counted server-side on /go (the new tab actually opening), not here.
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

  // Count a script-ad impression only after the async ad tag has had time to
  // load AND the real browser stayed on the page. Firing on load (as before)
  // raced the async ad and always read empty, so it never counted.
  if (${hasScriptAd ? "true" : "false"}) {
    setTimeout(function () {
      navigator.sendBeacon && navigator.sendBeacon('/${encodeURIComponent(link.slug)}/adview');
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

function handle(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url || "/", "http://localhost");
  const parts = url.pathname.split("/").filter(Boolean);
  const seg0 = parts[0];
  const seg1 = parts[1];

  // POST /:slug/adview — count a rendered ad slot.
  if (req.method === "POST" && seg0 && seg1 === "adview") {
    bump(decodeURIComponent(seg0), "adViews");
    res.writeHead(204).end();
    return;
  }

  if (req.method !== "GET") {
    res.writeHead(405).end("Method not allowed");
    return;
  }

  if (!seg0) {
    res.writeHead(200, { "Content-Type": "text/plain" }).end("Redirect host is running.");
    return;
  }

  const slug = decodeURIComponent(seg0);
  const link = getLink(slug);
  if (!link) {
    res.writeHead(404).end("Link not found");
    return;
  }

  // GET /:slug/go — the real exit: remember the visitor, send them onward.
  // Reaching here means Continue was clicked, so a Direct Link (if set) just
  // opened in a new tab — count that as an ad view.
  if (seg1 === "go") {
    if (link.adDirectUrl) bump(slug, "adViews");
    const cookie = `${seenCookie(slug)}=1; Max-Age=${SEEN_DAYS * 86400}; HttpOnly; SameSite=Lax; Path=/`;
    redirect(res, link.destUrl, cookie);
    return;
  }

  // GET /:slug — interstitial for new visitors, straight through for returning.
  if (!seg1) {
    bump(slug, "clicks");
    if (readCookie(req, seenCookie(slug)) === "1") {
      redirect(res, link.destUrl);
      return;
    }
    bump(slug, "uniqueVisitors");
    html(res, renderInterstitial(link));
    return;
  }

  res.writeHead(404).end("Not found");
}

export function startRedirectServer(port = Number(process.env.REDIRECT_PORT) || 3000): Promise<number> {
  return new Promise((resolve, reject) => {
    server = createServer((req, res) => {
      try {
        handle(req, res);
      } catch (err) {
        log.error({ err }, "request handler failed");
        if (!res.headersSent) res.writeHead(500);
        res.end("Server error");
      }
    });
    server.on("error", reject);
    server.listen(port, () => {
      boundPort = (server!.address() as { port: number }).port;
      log.info({ port: boundPort }, "redirect host listening");
      resolve(boundPort);
    });
  });
}

/** The base URL other code stamps onto generated links. */
export function getBaseUrl(): string {
  return `http://localhost:${boundPort || 3000}`;
}

export function stopRedirectServer(): void {
  server?.close();
  server = null;
}

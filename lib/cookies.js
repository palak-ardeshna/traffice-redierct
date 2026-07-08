/** Minimal cookie reader — no dependency, no parsing surprises. */
export function readCookie(req, name) {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

/** Vercel terminates TLS upstream, so trust the forwarded proto rather than req.socket. */
export function isHttps(req) {
  return (req.headers['x-forwarded-proto'] || 'https') === 'https';
}

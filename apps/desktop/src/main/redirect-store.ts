/**
 * Redirect-link store.
 *
 * Persists monetized short links to a JSON file in Electron's userData dir.
 * Atomic temp-write + rename so a crash mid-write can't corrupt the DB.
 * Deliberately dependency-free (no sqlite/native build in the Electron bundle).
 */

import { app } from "electron";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";

export interface LinkRecord {
  slug: string;
  destUrl: string;
  adScript: string;
  adDirectUrl: string;
  delaySeconds: number;
  title: string;
  createdAt: string;
  clicks: number;
  uniqueVisitors: number;
  adViews: number;
}

export interface CreateLinkInput {
  destUrl: string;
  adScript?: string;
  adDirectUrl?: string;
  title?: string;
  delaySeconds?: number;
}

interface Db {
  links: Record<string, LinkRecord>;
}

let dbFile: string | null = null;
let cache: Db | null = null;

function dbPath(): string {
  if (!dbFile) {
    const dir = join(app.getPath("userData"), "redirect");
    mkdirSync(dir, { recursive: true });
    dbFile = join(dir, "links.json");
  }
  return dbFile;
}

function load(): Db {
  if (cache) return cache;
  try {
    cache = JSON.parse(readFileSync(dbPath(), "utf8")) as Db;
  } catch {
    cache = { links: {} };
  }
  return cache;
}

function persist(): void {
  const tmp = `${dbPath()}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(cache, null, 2));
  renameSync(tmp, dbPath());
}

/**
 * Only http/https survive. This is the single gate that stops a generated link
 * from becoming an open redirect to a `javascript:` / `data:` payload.
 */
export function validateUrl(raw: unknown, field: string): string {
  let u: URL;
  try {
    u = new URL(String(raw));
  } catch {
    throw new Error(`${field} is not a valid URL`);
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error(`${field} must be http or https, got "${u.protocol}"`);
  }
  return u.toString();
}

function newSlug(): string {
  const links = load().links;
  for (let i = 0; i < 10; i++) {
    const slug = randomBytes(5).toString("base64url").slice(0, 7);
    if (!links[slug]) return slug;
  }
  throw new Error("could not allocate a unique slug");
}

export function createLink(input: CreateLinkInput): LinkRecord {
  const db = load();

  const destUrl = validateUrl(input.destUrl, "destUrl");

  // Both slots are independent and optional. Each is one real, user-visible
  // impression — there is deliberately no "reload ad" knob (that would be fraud).
  const adScript = String(input.adScript ?? "").trim();
  const adDirectUrl = input.adDirectUrl
    ? validateUrl(input.adDirectUrl, "adDirectUrl")
    : "";

  if (!adScript && !adDirectUrl) {
    throw new Error("provide an ad script, a Direct Link, or both");
  }

  const delaySeconds = Math.min(30, Math.max(0, Number(input.delaySeconds) || 5));

  const slug = newSlug();
  const record: LinkRecord = {
    slug,
    destUrl,
    adScript,
    adDirectUrl,
    delaySeconds,
    title: String(input.title ?? "Preparing your link").slice(0, 120),
    createdAt: new Date().toISOString(),
    clicks: 0,
    uniqueVisitors: 0,
    adViews: 0,
  };
  db.links[slug] = record;
  persist();
  return record;
}

export function getLink(slug: string): LinkRecord | null {
  return load().links[slug] ?? null;
}

export function listLinks(): LinkRecord[] {
  return Object.values(load().links).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );
}

export function bump(slug: string, field: "clicks" | "uniqueVisitors" | "adViews"): void {
  const link = getLink(slug);
  if (!link) return;
  link[field] = (link[field] || 0) + 1;
  persist();
}

export function deleteLink(slug: string): boolean {
  const db = load();
  if (!db.links[slug]) return false;
  delete db.links[slug];
  persist();
  return true;
}

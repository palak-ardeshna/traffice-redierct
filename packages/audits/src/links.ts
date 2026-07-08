/**
 * Broken-link scan. Extracts links, then checks each one's HTTP status with a
 * small concurrency pool (polite). Broken links frustrate users and waste crawl
 * budget — a direct engagement / navigation problem.
 */
import { parse, type HTMLElement } from "node-html-parser";
import type { BrokenLink } from "./types.js";

export interface LinkAuditOptions {
  maxLinks?: number; // cap to stay polite / fast
  concurrency?: number;
  timeoutMs?: number;
}

export interface LinkAuditResult {
  total: number;
  checked: number;
  broken: BrokenLink[];
}

/** Pull absolute http(s) links out of the page, resolved against the base URL. */
export function extractLinks(root: HTMLElement, baseUrl: string): string[] {
  const seen = new Set<string>();
  for (const a of root.querySelectorAll("a[href]")) {
    const href = a.getAttribute("href");
    if (!href) continue;
    try {
      const resolved = new URL(href, baseUrl);
      if (resolved.protocol === "http:" || resolved.protocol === "https:") {
        resolved.hash = "";
        seen.add(resolved.toString());
      }
    } catch {
      // malformed href → ignore
    }
  }
  return [...seen];
}

async function checkOne(url: string, timeoutMs: number): Promise<BrokenLink | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    // HEAD first (cheap); some servers reject HEAD → fall back to GET.
    let res = await fetch(url, { method: "HEAD", redirect: "follow", signal: ctrl.signal });
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url, { method: "GET", redirect: "follow", signal: ctrl.signal });
    }
    if (res.status >= 400) {
      return { url, status: res.status, reason: `HTTP ${res.status}` };
    }
    return null;
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return {
      url,
      status: 0,
      reason: aborted ? `timeout (>${timeoutMs}ms)` : err instanceof Error ? err.message : "unreachable",
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function linkAudit(
  root: HTMLElement,
  baseUrl: string,
  opts: LinkAuditOptions = {},
): Promise<LinkAuditResult> {
  const { maxLinks = 40, concurrency = 6, timeoutMs = 8000 } = opts;
  const all = extractLinks(root, baseUrl);
  const toCheck = all.slice(0, maxLinks);
  const broken: BrokenLink[] = [];

  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < toCheck.length) {
      const idx = cursor++;
      const result = await checkOne(toCheck[idx]!, timeoutMs);
      if (result) broken.push(result);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, toCheck.length) }, worker));

  return { total: all.length, checked: toCheck.length, broken };
}

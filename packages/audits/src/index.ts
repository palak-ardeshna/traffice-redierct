/**
 * Website audit orchestrator. Fetches a URL once and runs the SEO, structured-data,
 * performance, and broken-link analyzers; optionally launches a headless Chromium
 * for real Core Web Vitals. Returns a single validated AuditReport.
 *
 * The fetch-based checks are framework-agnostic (fetch + node-html-parser). The
 * Core Web Vitals step is opt-in (`vitals: true`) since it needs a browser.
 */
import { parse } from "node-html-parser";
import { AuditReport, type Finding, type Vitals } from "./types.js";
import { seoAudit } from "./seo.js";
import { structuredDataAudit } from "./structured.js";
import { productAudit } from "./product.js";
import { linkAudit, type LinkAuditOptions } from "./links.js";
import { collectVitals, vitalsFindings } from "./vitals.js";

const SEVERITY_PENALTY: Record<Finding["severity"], number> = {
  critical: 25,
  high: 15,
  medium: 8,
  low: 3,
  info: 0,
};

export interface AuditOptions {
  links?: LinkAuditOptions;
  userAgent?: string;
  /** Launch a headless browser to measure real Core Web Vitals (slower). */
  vitals?: boolean;
}

export async function auditSite(inputUrl: string, opts: AuditOptions = {}): Promise<AuditReport> {
  const url = normalizeUrl(inputUrl);
  const ua = opts.userAgent ?? "FlowPilotAudit/0.1 (+https://flowpilot.app)";

  const start = performance.now();
  const res = await fetch(url, {
    redirect: "follow",
    headers: { "user-agent": ua, accept: "text/html" },
  });
  const responseMs = performance.now() - start;
  const html = await res.text();
  const totalMs = performance.now() - start;

  const root = parse(html);
  const findings: Finding[] = [
    ...seoAudit(root),
    ...structuredDataAudit(root),
    ...productAudit(root, res.url || url),
  ];

  // network-level performance findings
  if (totalMs > 2500) {
    findings.push({
      category: "performance",
      severity: totalMs > 5000 ? "high" : "medium",
      title: `Slow response (${(totalMs / 1000).toFixed(1)}s to full HTML)`,
      detail: "Server + HTML transfer took over 2.5s at the network level.",
      impact: "Slow loads raise bounce rate and lower engagement + search ranking.",
      suggestion:
        "Enable server/CDN caching, reduce server response time (TTFB), and cut heavy apps that block HTML rendering.",
    });
  }
  const htmlBytes = Buffer.byteLength(html, "utf8");
  if (htmlBytes > 200_000) {
    findings.push({
      category: "performance",
      severity: "low",
      title: `Large HTML document (${Math.round(htmlBytes / 1024)} KB)`,
      detail: "The raw HTML is heavy before any images/scripts load.",
      impact: "Heavier pages render slower, especially on mobile networks.",
      suggestion: "Reduce inline scripts/styles and template bloat; paginate long product grids.",
    });
  }

  const links = await linkAudit(root, res.url || url, opts.links);
  for (const b of links.broken) {
    const isTimeout = b.status === 0 && b.reason.startsWith("timeout");
    findings.push({
      category: "links",
      severity: isTimeout ? "medium" : b.status >= 500 || b.status === 0 ? "high" : "medium",
      title: isTimeout ? `Slow / unresponsive link (${b.reason})` : `Broken link: ${b.reason}`,
      detail: b.url,
      impact: isTimeout
        ? "Very slow links hurt UX and may be intermittently down."
        : "Dead links break navigation, frustrate users, and waste crawl budget.",
      suggestion: isTimeout
        ? "Check if this destination is slow or intermittently down; consider removing or replacing the link."
        : "Fix or remove this link, or add a 301 redirect to the correct page.",
    });
  }

  // Real Core Web Vitals (opt-in — needs a headless browser).
  let vitals: Vitals | null = null;
  if (opts.vitals) {
    try {
      vitals = await collectVitals(res.url || url);
      findings.push(...vitalsFindings(vitals));
    } catch (err) {
      findings.push({
        category: "performance",
        severity: "info",
        title: "Core Web Vitals skipped",
        detail: `Browser unavailable: ${err instanceof Error ? err.message : "unknown"}. Run \`npx playwright install chromium\`.`,
        impact: "Install the browser to measure real LCP/CLS load speed.",
      });
    }
  }

  const score = Math.max(
    0,
    100 - findings.reduce((sum, f) => sum + SEVERITY_PENALTY[f.severity], 0),
  );

  return AuditReport.parse({
    url,
    finalUrl: res.url || url,
    fetchedAt: new Date().toISOString(),
    statusCode: res.status,
    performance: { responseMs, totalMs, htmlBytes },
    vitals,
    links,
    findings,
    score,
  });
}

function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!/^https?:\/\//i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

export * from "./types.js";
export { seoAudit } from "./seo.js";
export { structuredDataAudit } from "./structured.js";
export { productAudit } from "./product.js";
export { linkAudit, extractLinks } from "./links.js";
export { collectVitals, vitalsFindings } from "./vitals.js";

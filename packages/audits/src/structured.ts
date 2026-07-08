/**
 * Structured-data (schema.org JSON-LD) audit. Rich results — price, ⭐ratings,
 * breadcrumbs — come from valid JSON-LD and are one of the biggest organic
 * click-through levers for an e-commerce store.
 */
import { type HTMLElement } from "node-html-parser";
import type { Finding } from "./types.js";

/** Recursively collect every @type value found in a JSON-LD node. */
function collectTypes(node: unknown, out: Set<string>): void {
  if (Array.isArray(node)) {
    for (const n of node) collectTypes(n, out);
    return;
  }
  if (node && typeof node === "object") {
    const rec = node as Record<string, unknown>;
    const t = rec["@type"];
    if (typeof t === "string") out.add(t);
    else if (Array.isArray(t)) t.forEach((x) => typeof x === "string" && out.add(x));
    for (const v of Object.values(rec)) collectTypes(v, out);
  }
}

export function structuredDataAudit(root: HTMLElement): Finding[] {
  const findings: Finding[] = [];
  const blocks = root.querySelectorAll('script[type="application/ld+json"]');
  const types = new Set<string>();
  let invalid = 0;

  for (const b of blocks) {
    try {
      collectTypes(JSON.parse(b.text), types);
    } catch {
      invalid++;
    }
  }

  if (invalid > 0) {
    findings.push({
      category: "seo",
      severity: "low",
      title: `${invalid} invalid JSON-LD block(s)`,
      detail: "A structured-data <script> failed to parse as JSON.",
      impact: "Broken schema is ignored by Google → no rich results from it.",
    });
  }

  if (blocks.length === 0) {
    findings.push({
      category: "seo",
      severity: "medium",
      title: "No structured data (schema.org)",
      detail: "No JSON-LD found. Add Organization/WebSite on the homepage and Product on product pages.",
      impact: "No rich results (price, ⭐ratings, breadcrumbs) in Google → lower click-through.",
      suggestion:
        'Add a <script type="application/ld+json"> Product block (name, image, offers.price, aggregateRating) on product pages, and Organization + WebSite on the homepage. Validate at search.google.com/test/rich-results.',
    });
    return findings;
  }

  // Structured data exists — surface what was found as an informational note.
  findings.push({
    category: "seo",
    severity: "info",
    title: `Structured data found: ${[...types].join(", ") || "unknown types"}`,
    detail: `${blocks.length} JSON-LD block(s) detected.`,
    impact: "Good — keep Product schema (with price + aggregateRating) on product pages for rich results.",
  });

  return findings;
}

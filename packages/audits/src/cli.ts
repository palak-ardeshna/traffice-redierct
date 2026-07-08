#!/usr/bin/env tsx
/**
 * CLI runner: `tsx src/cli.ts <url>` → prints a human-readable audit report.
 * Lets us exercise the audit engine end-to-end against a live site without the
 * desktop app (the same auditSite() is what the IPC handler calls).
 */
import { auditSite, type Finding } from "./index.js";

const SEV_ORDER: Record<Finding["severity"], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};
const SEV_ICON: Record<Finding["severity"], string> = {
  critical: "🔴",
  high: "🟠",
  medium: "🟡",
  low: "🔵",
  info: "⚪",
};

async function main(): Promise<void> {
  const url = process.argv[2];
  if (!url) {
    console.error("Usage: tsx src/cli.ts <url>");
    process.exit(1);
  }

  console.log(`\n🔍 Auditing ${url} … (launching headless browser for Core Web Vitals)\n`);
  const r = await auditSite(url, { links: { maxLinks: 40 }, vitals: true });
  const fmt = (v: number | null) => (v === null ? "?" : `${v}ms`);

  console.log(`URL          : ${r.finalUrl}`);
  console.log(`HTTP status  : ${r.statusCode}`);
  console.log(
    `Performance  : ${Math.round(r.performance.responseMs)} ms response, ` +
      `${Math.round(r.performance.totalMs)} ms total, ` +
      `${Math.round(r.performance.htmlBytes / 1024)} KB HTML`,
  );
  console.log(
    `Links        : ${r.links.checked} checked of ${r.links.total} found, ` +
      `${r.links.broken.length} broken`,
  );
  if (r.vitals) {
    const v = r.vitals;
    console.log(
      `Core Vitals  : LCP ${fmt(v.lcpMs)} · CLS ${v.cls ?? "?"} · FCP ${fmt(v.fcpMs)} · TTFB ${fmt(v.ttfbMs)}`,
    );
    console.log(
      `             : ${v.requests} requests, ${Math.round(v.transferBytes / 1024)} KB transferred (full page)`,
    );
  }
  console.log(`\n📊 SCORE: ${r.score}/100\n`);

  const sorted = [...r.findings].sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
  if (sorted.length === 0) {
    console.log("✅ No issues found.");
  } else {
    console.log(`Found ${sorted.length} issue(s):\n`);
    for (const f of sorted) {
      console.log(`${SEV_ICON[f.severity]} [${f.severity.toUpperCase()}] (${f.category}) ${f.title}`);
      console.log(`   ${f.detail}`);
      if (f.impact) console.log(`   → ${f.impact}`);
      console.log("");
    }
  }
}

main().catch((err) => {
  console.error("Audit failed:", err);
  process.exit(1);
});

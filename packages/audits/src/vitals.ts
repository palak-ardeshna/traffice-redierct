/**
 * Real Core Web Vitals via a headless Chromium (Playwright). Unlike the
 * fetch-based checks, this loads the page *fully* — images, CSS, JS — and reads
 * the same lab metrics Google uses (LCP, CLS, FCP, TTFB). For an image-heavy
 * store these are the numbers that actually predict bounce and mobile ranking.
 */
import { chromium } from "playwright";
import type { Finding, Vitals } from "./types.js";

export interface VitalsOptions {
  timeoutMs?: number;
  settleMs?: number; // extra wait for LCP/CLS to stabilise after load
}

export async function collectVitals(url: string, opts: VitalsOptions = {}): Promise<Vitals> {
  const { timeoutMs = 30_000, settleMs = 4000 } = opts;
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    let requests = 0;
    let transferBytes = 0;
    let imageCount = 0;
    let imageBytes = 0;
    let largestImageBytes = 0;
    page.on("requestfinished", async (req) => {
      requests++;
      try {
        const sizes = await req.sizes();
        const body = sizes.responseBodySize > 0 ? sizes.responseBodySize : 0;
        transferBytes += body;
        if (req.resourceType() === "image") {
          imageCount++;
          imageBytes += body;
          if (body > largestImageBytes) largestImageBytes = body;
        }
      } catch {
        /* size unavailable */
      }
    });

    // Image-heavy stores often never fire a clean "load" (chat widgets, tracking
    // pixels, long-poll), so wait for the DOM + a settle window rather than full
    // load, and tolerate a navigation timeout (read whatever painted).
    await page
      .goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs })
      .catch(() => undefined);
    await page.waitForTimeout(settleMs); // let LCP finalise + CLS accumulate

    const m = await page.evaluate(
      () =>
        new Promise<{
          lcp: number | null;
          cls: number;
          fcp: number | null;
          ttfb: number | null;
          load: number | null;
          dcl: number | null;
        }>((resolve) => {
          const nav = performance.getEntriesByType("navigation")[0] as
            | PerformanceNavigationTiming
            | undefined;

          let cls = 0;
          try {
            new PerformanceObserver((list) => {
              for (const e of list.getEntries() as unknown as Array<{ value: number; hadRecentInput: boolean }>) {
                if (!e.hadRecentInput) cls += e.value;
              }
            }).observe({ type: "layout-shift", buffered: true });
          } catch {
            /* not supported */
          }

          let lcp: number | null = null;
          try {
            new PerformanceObserver((list) => {
              const entries = list.getEntries();
              const last = entries[entries.length - 1];
              if (last) lcp = last.startTime;
            }).observe({ type: "largest-contentful-paint", buffered: true });
          } catch {
            /* not supported */
          }

          const fcpEntry = performance.getEntriesByName("first-contentful-paint")[0];

          setTimeout(() => {
            resolve({
              lcp,
              cls,
              fcp: fcpEntry ? fcpEntry.startTime : null,
              ttfb: nav ? nav.responseStart : null,
              load: nav ? nav.loadEventEnd : null,
              dcl: nav ? nav.domContentLoadedEventEnd : null,
            });
          }, 500);
        }),
    );

    return {
      lcpMs: round(m.lcp),
      cls: m.cls === null ? null : Math.round(m.cls * 1000) / 1000,
      fcpMs: round(m.fcp),
      ttfbMs: round(m.ttfb),
      loadMs: round(m.load),
      domContentLoadedMs: round(m.dcl),
      requests,
      transferBytes,
      imageCount,
      imageBytes,
      largestImageBytes,
    };
  } finally {
    await browser.close();
  }
}

function round(v: number | null): number | null {
  return v === null ? null : Math.round(v);
}

/** Grade the vitals against Google's good/needs-improvement thresholds. */
export function vitalsFindings(v: Vitals): Finding[] {
  const findings: Finding[] = [];

  if (v.lcpMs !== null && v.lcpMs > 2500) {
    findings.push({
      category: "performance",
      severity: v.lcpMs > 4000 ? "high" : "medium",
      title: `Slow LCP: ${(v.lcpMs / 1000).toFixed(1)}s`,
      detail: "Largest Contentful Paint should be under 2.5s (usually the hero/product image).",
      impact: "Slow LCP raises bounce on mobile and lowers Google ranking (it's a CWV).",
      suggestion:
        "Compress the hero/product images (WebP/AVIF), add width & height, lazy-load below-the-fold images, and serve via a CDN. Preload the LCP image.",
    });
  }
  if (v.cls !== null && v.cls > 0.1) {
    findings.push({
      category: "performance",
      severity: v.cls > 0.25 ? "high" : "medium",
      title: `Layout shift (CLS): ${v.cls}`,
      detail: "Cumulative Layout Shift should be under 0.1. Reserve space for images/ads/banners.",
      impact: "Jumping layout frustrates users (mis-taps) and hurts ranking (it's a CWV).",
      suggestion:
        "Set explicit width/height (or aspect-ratio) on images/embeds, reserve space for banners/ads, and avoid inserting content above existing content.",
    });
  }
  if (v.fcpMs !== null && v.fcpMs > 1800) {
    findings.push({
      category: "performance",
      severity: "low",
      title: `Slow First Contentful Paint: ${(v.fcpMs / 1000).toFixed(1)}s`,
      detail: "FCP should be under 1.8s. Reduce render-blocking CSS/JS.",
      impact: "A slow first paint makes the page feel sluggish → early bounce.",
      suggestion:
        "Defer non-critical JS, inline critical CSS, remove unused scripts/apps, and reduce third-party tags (chat, pixels).",
    });
  }
  if (v.transferBytes > 3_000_000) {
    findings.push({
      category: "performance",
      severity: "medium",
      title: `Heavy page: ${(v.transferBytes / 1024 / 1024).toFixed(1)} MB transferred`,
      detail: `${v.requests} requests. Compress/lazy-load images (biggest culprit for stores).`,
      impact: "Heavy pages are slow on mobile data → higher bounce, lower engagement.",
      suggestion:
        "Convert images to WebP/AVIF, lazy-load off-screen media, and audit third-party apps that add weight.",
    });
  }
  if (v.largestImageBytes > 300_000) {
    findings.push({
      category: "performance",
      severity: v.largestImageBytes > 800_000 ? "high" : "medium",
      title: `Large image: ${Math.round(v.largestImageBytes / 1024)} KB`,
      detail: `${v.imageCount} images totalling ${Math.round(v.imageBytes / 1024)} KB; the single biggest is ${Math.round(v.largestImageBytes / 1024)} KB.`,
      impact: "The biggest image is usually the LCP element — the #1 cause of the slow-LCP swing on stores.",
      suggestion:
        "Compress the largest images to under ~150 KB (WebP/AVIF), size them to their display dimensions, add responsive srcset, and serve via a CDN.",
    });
  }

  return findings;
}

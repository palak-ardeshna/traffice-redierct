/**
 * SEO / on-page audit. Parses the HTML and produces engagement-relevant findings,
 * each with a concrete fix suggestion. These are the on-page factors that affect
 * how much organic traffic a page gets and how well it holds users.
 */
import { type HTMLElement } from "node-html-parser";
import type { Finding } from "./types.js";

export function seoAudit(root: HTMLElement): Finding[] {
  const findings: Finding[] = [];

  const title = root.querySelector("title")?.text?.trim() ?? "";
  if (!title) {
    findings.push({
      category: "seo",
      severity: "critical",
      title: "Missing <title> tag",
      detail: "The page has no <title>. This is the #1 on-page SEO signal.",
      impact: "Search engines and browser tabs have nothing to show → far fewer clicks.",
      suggestion:
        "Add a unique <title> in <head>, e.g. <title>Gold Necklaces — Trinaya Jewels</title>. Include your primary keyword + brand.",
    });
  } else if (title.length < 10 || title.length > 60) {
    findings.push({
      category: "seo",
      severity: "low",
      title: `Title length is ${title.length} chars`,
      detail: `Title: "${title}". Aim for ~10–60 characters.`,
      impact: "Too short/long titles get truncated in search results → lower click-through.",
      suggestion: "Rewrite the title to 50–60 characters with the main keyword near the front.",
    });
  }

  const desc = root.querySelector('meta[name="description"]')?.getAttribute("content")?.trim() ?? "";
  if (!desc) {
    findings.push({
      category: "seo",
      severity: "high",
      title: "Missing meta description",
      detail: 'No <meta name="description">. Search engines auto-generate a snippet.',
      impact: "A weak/auto snippet lowers click-through rate from search → less traffic.",
      suggestion:
        'Add <meta name="description" content="…"> with a 140–160 char sales pitch including a keyword and a reason to click.',
    });
  } else if (desc.length < 50 || desc.length > 160) {
    findings.push({
      category: "seo",
      severity: "low",
      title: `Meta description length is ${desc.length} chars`,
      detail: "Aim for ~50–160 characters.",
      impact: "Out-of-range descriptions get truncated → weaker search snippet.",
      suggestion: "Rewrite the description to 140–160 characters.",
    });
  }

  const h1s = root.querySelectorAll("h1");
  if (h1s.length === 0) {
    findings.push({
      category: "seo",
      severity: "medium",
      title: "No <h1> heading",
      detail: "Pages should have exactly one clear <h1>.",
      impact: "Weakens topical relevance and hurts accessibility/skim-reading.",
      suggestion: "Add a single <h1> describing the page (e.g. the collection or product name).",
    });
  } else if (h1s.length > 1) {
    findings.push({
      category: "seo",
      severity: "low",
      title: `Multiple <h1> tags (${h1s.length})`,
      detail: "Use a single <h1> per page for a clear primary heading.",
      impact: "Dilutes the page's primary topic signal.",
      suggestion: "Keep one <h1>; demote the others to <h2>/<h3>.",
    });
  }

  if (!root.querySelector('link[rel="canonical"]')) {
    findings.push({
      category: "seo",
      severity: "low",
      title: "No canonical URL",
      detail: 'Add <link rel="canonical"> to avoid duplicate-content splits.',
      impact: "Duplicate URLs can split ranking signals → lower rankings.",
      suggestion:
        'Add <link rel="canonical" href="https://store.trinayajewels.com/…"> in <head>. On Shopify use {{ canonical_url }} in theme.liquid.',
    });
  }

  if (!root.querySelector('meta[name="viewport"]')) {
    findings.push({
      category: "seo",
      severity: "high",
      title: "No mobile viewport meta",
      detail: 'Add <meta name="viewport" content="width=device-width, initial-scale=1">.',
      impact: "Page renders badly on phones → high mobile bounce + lower mobile ranking.",
      suggestion:
        'Add <meta name="viewport" content="width=device-width, initial-scale=1"> to <head>.',
    });
  }

  if (!root.querySelector("html")?.getAttribute("lang")) {
    findings.push({
      category: "seo",
      severity: "low",
      title: "No lang attribute on <html>",
      detail: 'Add lang="en" (or the correct language).',
      impact: "Affects accessibility and international search targeting.",
      suggestion: 'Set <html lang="en"> (or your site language).',
    });
  }

  if (!root.querySelector('meta[property="og:title"]') || !root.querySelector('meta[property="og:image"]')) {
    findings.push({
      category: "seo",
      severity: "low",
      title: "Incomplete Open Graph tags",
      detail: "Add og:title and og:image for rich social-share previews.",
      impact: "Poor share previews → fewer clicks from social traffic.",
      suggestion:
        'Add <meta property="og:title">, <meta property="og:description">, <meta property="og:image" content="…1200×630.jpg"> and og:url.',
    });
  }

  const imgs = root.querySelectorAll("img");
  const noAlt = imgs.filter((img) => !img.getAttribute("alt")).length;
  if (noAlt > 0) {
    findings.push({
      category: "seo",
      severity: "low",
      title: `${noAlt} image(s) missing alt text`,
      detail: `${noAlt} of ${imgs.length} <img> tags have no alt attribute.`,
      impact: "Hurts accessibility and image-search discoverability.",
      suggestion: 'Add descriptive alt text to each image, e.g. alt="22K gold temple necklace".',
    });
  }

  return findings;
}

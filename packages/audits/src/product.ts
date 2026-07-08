/**
 * Product-page audit. Detects whether a page is a product page and validates its
 * schema.org Product JSON-LD — the thing that puts price + ⭐ratings in Google
 * search results. For a store, rich results are one of the biggest organic
 * click-through levers, so missing/incomplete Product schema is high-value.
 */
import { type HTMLElement } from "node-html-parser";
import type { Finding } from "./types.js";

type JsonObject = Record<string, unknown>;

/** Depth-first search of a JSON-LD tree for a node whose @type matches. */
function findType(node: unknown, type: string): JsonObject | null {
  if (Array.isArray(node)) {
    for (const n of node) {
      const found = findType(n, type);
      if (found) return found;
    }
    return null;
  }
  if (node && typeof node === "object") {
    const rec = node as JsonObject;
    const t = rec["@type"];
    if (t === type || (Array.isArray(t) && t.includes(type))) return rec;
    for (const v of Object.values(rec)) {
      const found = findType(v, type);
      if (found) return found;
    }
  }
  return null;
}

function collectJsonLd(root: HTMLElement): unknown[] {
  const out: unknown[] = [];
  for (const b of root.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      out.push(JSON.parse(b.text));
    } catch {
      /* invalid — reported by the structured-data audit */
    }
  }
  return out;
}

function present(v: unknown): boolean {
  return v !== undefined && v !== null && v !== "";
}

export function productAudit(root: HTMLElement, url: string): Finding[] {
  const ogType = root.querySelector('meta[property="og:type"]')?.getAttribute("content");
  const urlLooksProduct = /\/products?\//i.test(url);
  const blocks = collectJsonLd(root);
  const product = blocks.map((b) => findType(b, "Product")).find(Boolean) ?? null;

  const looksLikeProduct = !!product || ogType === "product" || urlLooksProduct;
  if (!looksLikeProduct) return []; // not a product page → no product findings

  const findings: Finding[] = [];

  if (!product) {
    findings.push({
      category: "product",
      severity: "high",
      title: "Product page has no Product schema",
      detail: "This looks like a product page but has no schema.org Product JSON-LD.",
      impact: "No price / ⭐rating rich results in Google → far fewer clicks from search for a store.",
      suggestion:
        'Add <script type="application/ld+json"> with @type "Product": name, image, brand, offers{price, priceCurrency, availability}, aggregateRating{ratingValue, reviewCount}. Most Shopify themes/apps can output this.',
    });
    return findings;
  }

  const offersRaw = product["offers"];
  const offer = (Array.isArray(offersRaw) ? offersRaw[0] : offersRaw) as JsonObject | undefined;
  const rating = product["aggregateRating"];

  if (!present(product["name"])) {
    findings.push({
      category: "product",
      severity: "medium",
      title: "Product schema missing `name`",
      detail: "The Product JSON-LD has no name.",
      impact: "Google can't build a proper product rich result.",
      suggestion: 'Set "name" to the product title in the Product JSON-LD.',
    });
  }
  if (!present(product["image"])) {
    findings.push({
      category: "product",
      severity: "medium",
      title: "Product schema missing `image`",
      detail: "The Product JSON-LD has no image.",
      impact: "Product rich results and Google Shopping need an image.",
      suggestion: 'Add "image" (a full URL) to the Product JSON-LD.',
    });
  }
  if (!offer || !present(offer["price"])) {
    findings.push({
      category: "product",
      severity: "medium",
      title: "Product schema missing `offers.price`",
      detail: "No price found in the Product JSON-LD offers.",
      impact: "Without price, Google won't show the price in search → weaker, lower-CTR result.",
      suggestion: 'Add "offers": { "@type": "Offer", "price": "1999", "priceCurrency": "INR", "availability": "InStock" }.',
    });
  } else if (!present(offer["availability"])) {
    findings.push({
      category: "product",
      severity: "low",
      title: "Product offer missing `availability`",
      detail: "The offer has a price but no availability.",
      impact: "In-stock status can appear in search results and Shopping.",
      suggestion: 'Add "availability": "https://schema.org/InStock" (or OutOfStock) to the offer.',
    });
  }
  if (!present(product["brand"])) {
    findings.push({
      category: "product",
      severity: "low",
      title: "Product schema missing `brand`",
      detail: "No brand in the Product JSON-LD.",
      impact: "Brand strengthens the product's identity in search.",
      suggestion: 'Add "brand": { "@type": "Brand", "name": "Trinaya Jewels" }.',
    });
  }
  if (!rating) {
    findings.push({
      category: "product",
      severity: "medium",
      title: "No `aggregateRating` (⭐ stars)",
      detail: "The Product schema has no aggregateRating.",
      impact: "⭐ star ratings in search results are one of the biggest click-through boosters for a store.",
      suggestion:
        'Collect reviews and add "aggregateRating": { "@type": "AggregateRating", "ratingValue": "4.7", "reviewCount": "128" }.',
    });
  }

  if (findings.length === 0) {
    findings.push({
      category: "product",
      severity: "info",
      title: "Product schema looks complete",
      detail: "Product JSON-LD includes name, image, price, brand, and rating.",
      impact: "Great — you're eligible for price + ⭐rating rich results in Google.",
    });
  }

  return findings;
}

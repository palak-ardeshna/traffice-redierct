/**
 * @flowpilot/audits — shared result shapes (zod-validated so the same report can
 * cross the IPC boundary and later be persisted / rendered into a PDF report).
 */
import { z } from "zod";

export const Severity = z.enum(["critical", "high", "medium", "low", "info"]);
export type Severity = z.infer<typeof Severity>;

export const AuditCategory = z.enum(["seo", "product", "links", "performance"]);
export type AuditCategory = z.infer<typeof AuditCategory>;

export const Finding = z.object({
  category: AuditCategory,
  severity: Severity,
  title: z.string(),
  detail: z.string(),
  /** Why this matters for user engagement / traffic. */
  impact: z.string().optional(),
  /** Concrete, actionable "how to fix" guidance. */
  suggestion: z.string().optional(),
});
export type Finding = z.infer<typeof Finding>;

export const BrokenLink = z.object({
  url: z.string(),
  status: z.number().int(), // 0 = network error / unreachable
  reason: z.string(),
});
export type BrokenLink = z.infer<typeof BrokenLink>;

export const Vitals = z.object({
  lcpMs: z.number().nullable(), // Largest Contentful Paint (CWV)
  cls: z.number().nullable(), // Cumulative Layout Shift (CWV)
  fcpMs: z.number().nullable(), // First Contentful Paint
  ttfbMs: z.number().nullable(), // Time To First Byte
  loadMs: z.number().nullable(),
  domContentLoadedMs: z.number().nullable(),
  requests: z.number().int(),
  transferBytes: z.number().int(),
  imageCount: z.number().int(),
  imageBytes: z.number().int(),
  largestImageBytes: z.number().int(),
});
export type Vitals = z.infer<typeof Vitals>;

export const AuditReport = z.object({
  url: z.string(),
  finalUrl: z.string(),
  fetchedAt: z.string(),
  statusCode: z.number().int(),
  performance: z.object({
    responseMs: z.number(), // time to first byte-ish (headers received)
    totalMs: z.number(), // time to full HTML downloaded
    htmlBytes: z.number().int(),
  }),
  links: z.object({
    total: z.number().int(),
    checked: z.number().int(),
    broken: z.array(BrokenLink),
  }),
  vitals: Vitals.nullable(), // real Core Web Vitals (null if browser unavailable)
  findings: z.array(Finding),
  score: z.number().int().min(0).max(100),
});
export type AuditReport = z.infer<typeof AuditReport>;

/**
 * @trafficguru/ipc-contracts — the single source of truth for the renderer↔main boundary.
 *
 * Every IPC channel is declared here with zod schemas for its input and output.
 * Both the preload/renderer client and the main-process router import this module,
 * so a channel cannot drift between the two sides without a type error.
 *
 * Naming convention: `domain:action`.
 * Request/response channels are invoked via ipcRenderer.invoke / ipcMain.handle.
 * Streaming channels (traffic events, logs) push over a dedicated subscription channel.
 */

import { z } from "zod";

/* ----------------------------- shared primitives ---------------------------- */

export const Uuid = z.string().uuid();
export const IsoDate = z.string().datetime();

export const TrafficStatus = z.enum(["idle", "starting", "running", "stopping", "stopped", "error"]);

/* ----------------------------- streamed traffic events -------------------------- */

export const TrafficEvent = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("status"),
    status: TrafficStatus,
  }),
  z.object({
    kind: z.literal("visit"),
    url: z.string(),
    success: z.boolean(),
    timestamp: IsoDate,
    durationMs: z.number().int(),
    workerId: z.number().int(),
  }),
  z.object({
    kind: z.literal("log"),
    level: z.enum(["debug", "info", "warn", "error"]),
    message: z.string(),
    timestamp: IsoDate,
  }),
]);
export type TrafficEvent = z.infer<typeof TrafficEvent>;

/* ----------------------------- contract ---------------------------- */

/**
 * Each entry declares the zod schema for the request payload and the response.
 * The main-process router validates `request` on receipt; the renderer client
 * validates `response` on return. See apps/desktop/src/main/ipc-router.ts.
 */
export const RedirectLink = z.object({
  slug: z.string(),
  destUrl: z.string(),
  adScript: z.string(),
  adDirectUrl: z.string(),
  delaySeconds: z.number().int(),
  title: z.string(),
  createdAt: IsoDate,
  clicks: z.number().int(),
  uniqueVisitors: z.number().int(),
  adViews: z.number().int(),
});
export type RedirectLink = z.infer<typeof RedirectLink>;

export const ipcContract = {
  "redirect:create": {
    request: z.object({
      destUrl: z.string().url(),
      adScript: z.string().optional(),
      adDirectUrl: z.string().optional(),
      title: z.string().optional(),
      delaySeconds: z.number().int().min(0).max(30).optional(),
    }),
    response: z.object({
      slug: z.string(),
      shortUrl: z.string(),
      link: RedirectLink,
    }),
  },
  "redirect:list": {
    request: z.object({}),
    response: z.object({
      baseUrl: z.string(),
      links: z.array(RedirectLink),
    }),
  },
  "redirect:delete": {
    request: z.object({ slug: z.string() }),
    response: z.object({ deleted: z.boolean() }),
  },
  "traffic:start": {
    request: z.object({
      urls: z.array(z.string().url()).min(1),
      preVisitUrls: z.array(z.string().url()).optional(),
      preVisitScroll: z.boolean().default(true),
      preVisitStayDuration: z.number().int().min(1000).default(5000),
      workers: z.number().int().min(1).max(20).default(3),
      visitsPerWorker: z.number().int().min(1).default(10),
      scroll: z.boolean().default(true),
      scrollDuration: z.number().int().min(500).default(2000),
      stayDuration: z.number().int().min(1000).default(5000),
      proxies: z.array(z.string()).optional(),
      headless: z.boolean().default(true),
    }),
    response: z.object({ success: z.boolean() }),
  },
  "traffic:stop": {
    request: z.object({}),
    response: z.object({ success: z.boolean() }),
  },
  "traffic:status": {
    request: z.object({}),
    response: z.object({
      status: TrafficStatus,
      totalVisits: z.number().int(),
      successfulVisits: z.number().int(),
      failedVisits: z.number().int(),
      activeWorkers: z.number().int(),
    }),
  },
} as const;

export type IpcChannel = keyof typeof ipcContract;
export type IpcRequest<C extends IpcChannel> = z.infer<
  (typeof ipcContract)[C]["request"]
>;
export type IpcResponse<C extends IpcChannel> = z.infer<
  (typeof ipcContract)[C]["response"]
>;

/** Streaming subscription channels (main → renderer push). */
export const streamChannels = {
  "traffic:events": TrafficEvent,
} as const;
export type StreamChannel = keyof typeof streamChannels;

/** Serialized error DTO that crosses the bridge (RFC 7807-ish). */
export const IpcError = z.object({
  code: z.string(),
  title: z.string(),
  detail: z.string().optional(),
  traceId: z.string().optional(),
});
export type IpcError = z.infer<typeof IpcError>;

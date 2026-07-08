/**
 * @flowpilot/logger — structured logging (blueprint §13).
 *
 * Pino for fast JSON logs (reusable server-side in the cloud phase). Redaction
 * middleware scrubs known secret/PII keys BEFORE any sink so credentials never
 * land in a log file (Phase-1 acceptance criterion #10).
 */

import pino, { type Logger } from "pino";

const REDACT_PATHS = [
  "password",
  "secret",
  "token",
  "authorization",
  "cookie",
  "*.password",
  "*.secret",
  "*.token",
  "headers.authorization",
  "headers.cookie",
];

export function createLogger(opts?: {
  name?: string;
  level?: string;
}): Logger {
  return pino({
    name: opts?.name ?? "flowpilot",
    level: opts?.level ?? process.env.LOG_LEVEL ?? "info",
    redact: { paths: REDACT_PATHS, censor: "[REDACTED]" },
    base: undefined, // omit pid/hostname noise on desktop
  });
}

export const logger = createLogger();
export type { Logger };

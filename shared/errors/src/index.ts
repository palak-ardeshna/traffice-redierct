/**
 * @flowpilot/errors — typed error hierarchy (blueprint §18).
 *
 * Every error carries a STABLE `code` (a client-facing enum) and serializes to an
 * RFC-7807-style DTO. Services return/throw these; the IPC router and REST layer
 * translate them to the wire format. Never throw bare Error in service code.
 */

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "UNAUTHORIZED"
  | "AUTOMATION_ERROR"
  | "INTEGRATION_ERROR"
  | "INTERNAL_ERROR";

export interface ProblemDetail {
  type: string;
  title: string;
  status: number;
  detail?: string;
  code: ErrorCode;
  traceId?: string;
  errors?: Array<{ path: string; message: string }>;
}

export abstract class AppError extends Error {
  abstract readonly code: ErrorCode;
  abstract readonly status: number;
  readonly traceId?: string;
  readonly fieldErrors?: Array<{ path: string; message: string }>;

  constructor(
    message: string,
    opts?: {
      traceId?: string;
      fieldErrors?: Array<{ path: string; message: string }>;
      cause?: unknown;
    },
  ) {
    super(message, { cause: opts?.cause });
    this.name = this.constructor.name;
    this.traceId = opts?.traceId;
    this.fieldErrors = opts?.fieldErrors;
  }

  toProblem(): ProblemDetail {
    return {
      type: `https://docs.flowpilot.app/errors/${this.code.toLowerCase()}`,
      title: this.message,
      status: this.status,
      code: this.code,
      traceId: this.traceId,
      errors: this.fieldErrors,
    };
  }
}

export class ValidationError extends AppError {
  readonly code = "VALIDATION_ERROR" as const;
  readonly status = 422;
}
export class NotFoundError extends AppError {
  readonly code = "NOT_FOUND" as const;
  readonly status = 404;
}
export class ConflictError extends AppError {
  readonly code = "CONFLICT" as const;
  readonly status = 409;
}
export class UnauthorizedError extends AppError {
  readonly code = "UNAUTHORIZED" as const;
  readonly status = 401;
}
export class AutomationError extends AppError {
  readonly code = "AUTOMATION_ERROR" as const;
  readonly status = 500;
}
export class IntegrationError extends AppError {
  readonly code = "INTEGRATION_ERROR" as const;
  readonly status = 502;
}

export function toProblem(err: unknown): ProblemDetail {
  if (err instanceof AppError) return err.toProblem();
  return {
    type: "https://docs.flowpilot.app/errors/internal_error",
    title: "Internal error",
    status: 500,
    code: "INTERNAL_ERROR",
  };
}

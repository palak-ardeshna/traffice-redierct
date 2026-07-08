/**
 * RunService — orchestrates a run without knowing anything about Electron or IPC.
 * This is the crown-jewel boundary: it must stay framework-agnostic so the exact
 * same class powers the future cloud API (blueprint rec #8 / §21). Enforced by an
 * import-boundary lint rule (no `electron` import allowed in this package).
 */

import type { RunRepository, TenantContext } from "@flowpilot/data-access";
import { NotFoundError } from "@flowpilot/errors";

/** Abstracts the durable queue — SQLite-backed on desktop, BullMQ in cloud (blueprint rec #7). */
export interface JobQueue {
  enqueue(job: RunJob): Promise<void>;
}

export interface RunJob {
  runId: string;
  teamId: string;
  scenarioId: string;
  browser: string;
  profileId?: string;
}

export interface IdGenerator {
  next(): string; // UUIDv7
}

export class RunService {
  constructor(
    private readonly runs: RunRepository,
    private readonly queue: JobQueue,
    private readonly ids: IdGenerator,
  ) {}

  /** Create a queued run and dispatch a job envelope to the worker tier (§9.2). */
  async create(
    ctx: TenantContext,
    input: { projectId: string; scenarioId: string; browser: string; profileId?: string },
  ) {
    const runId = this.ids.next();
    const run = await this.runs.create(ctx, {
      id: runId,
      teamId: ctx.teamId,
      projectId: input.projectId,
      scenarioId: input.scenarioId,
      trigger: "manual",
      status: "queued",
    });

    await this.queue.enqueue({
      runId,
      teamId: ctx.teamId,
      scenarioId: input.scenarioId,
      browser: input.browser,
      profileId: input.profileId,
    });

    return run;
  }

  async get(ctx: TenantContext, id: string) {
    const run = await this.runs.findById(ctx, id);
    if (!run) throw new NotFoundError(`Run ${id} not found`);
    return run;
  }
}

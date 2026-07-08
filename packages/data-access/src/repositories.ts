/**
 * Repository interfaces + Drizzle SQLite implementations.
 *
 * Services depend on the INTERFACES (ADR 0003) so they are unit-testable with
 * in-memory fakes and unaffected by the SQLite→Postgres swap. Every method takes
 * a tenant context (`teamId`) so multi-tenancy is enforced at the query layer
 * (ADR 0005) — the cloud adds Postgres RLS on top as defense-in-depth.
 */

import { eq, and, desc } from "drizzle-orm";
import type { Db } from "./db.js";
import { projects, runs } from "./schema.js";

export interface TenantContext {
  teamId: string;
}

export interface ProjectRepository {
  list(ctx: TenantContext, limit: number): Promise<(typeof projects.$inferSelect)[]>;
  create(
    ctx: TenantContext,
    input: { id: string; name: string; baseUrl?: string; environment: string },
  ): Promise<typeof projects.$inferSelect>;
  findById(ctx: TenantContext, id: string): Promise<typeof projects.$inferSelect | undefined>;
}

export interface RunRepository {
  create(ctx: TenantContext, input: typeof runs.$inferInsert): Promise<typeof runs.$inferSelect>;
  findById(ctx: TenantContext, id: string): Promise<typeof runs.$inferSelect | undefined>;
  updateStatus(ctx: TenantContext, id: string, status: string): Promise<void>;
}

export class DrizzleProjectRepository implements ProjectRepository {
  constructor(private readonly db: Db) {}

  list(ctx: TenantContext, limit: number) {
    return this.db
      .select()
      .from(projects)
      .where(eq(projects.teamId, ctx.teamId))
      .orderBy(desc(projects.createdAt))
      .limit(limit)
      .all() as unknown as Promise<(typeof projects.$inferSelect)[]>;
  }

  async create(
    ctx: TenantContext,
    input: { id: string; name: string; baseUrl?: string; environment: string },
  ) {
    const [row] = await this.db
      .insert(projects)
      .values({
        id: input.id,
        teamId: ctx.teamId,
        name: input.name,
        baseUrl: input.baseUrl,
        environment: input.environment as never,
      })
      .returning();
    return row!;
  }

  findById(ctx: TenantContext, id: string) {
    return this.db
      .select()
      .from(projects)
      .where(and(eq(projects.teamId, ctx.teamId), eq(projects.id, id)))
      .get() as unknown as Promise<typeof projects.$inferSelect | undefined>;
  }
}

export class DrizzleRunRepository implements RunRepository {
  constructor(private readonly db: Db) {}

  async create(ctx: TenantContext, input: typeof runs.$inferInsert) {
    const [row] = await this.db
      .insert(runs)
      .values({ ...input, teamId: ctx.teamId })
      .returning();
    return row!;
  }

  findById(ctx: TenantContext, id: string) {
    return this.db
      .select()
      .from(runs)
      .where(and(eq(runs.teamId, ctx.teamId), eq(runs.id, id)))
      .get() as unknown as Promise<typeof runs.$inferSelect | undefined>;
  }

  async updateStatus(ctx: TenantContext, id: string, status: string) {
    await this.db
      .update(runs)
      .set({ status: status as never })
      .where(and(eq(runs.teamId, ctx.teamId), eq(runs.id, id)));
  }
}

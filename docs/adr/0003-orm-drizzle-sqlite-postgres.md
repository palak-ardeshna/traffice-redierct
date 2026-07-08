# ADR 0003 — Data Layer: Drizzle ORM over SQLite → PostgreSQL

- **Status:** Accepted
- **Date:** 2026-07-07
- **Deciders:** Database Architect, Backend Lead, CTO

## Context
The desktop app is **local-first** and needs an embedded, transactional, zero-config database with fast synchronous access (SQLite). The future SaaS (§21) needs the **same schema and queries** on PostgreSQL with Row-Level Security for multi-tenancy. We want type-safe queries, transparent SQL, and a lightweight runtime that packages cleanly inside Electron.

## Decision
Use **SQLite** (`better-sqlite3`) on the desktop and **PostgreSQL** in the cloud, both accessed through **Drizzle ORM** with a shared schema authored once and dialect-specific builds. All DB access sits behind **repository interfaces** (`packages/data-access`).

## Alternatives considered
| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **Drizzle** | Type-safe, SQL-first (transparent queries), thin runtime, first-class SQLite **and** Postgres, easy Electron packaging, lightweight migrations | Younger than Prisma; some advanced features are DIY | **Chosen** |
| **Prisma** | Great DX, mature | Heavier engine/binary, historically awkward SQLite-in-Electron packaging, less transparent generated SQL, migration engine weight | Rejected |
| **TypeORM/Sequelize** | Mature | Decorator/runtime heaviness, weaker TS inference, more footguns | Rejected |
| **Raw SQL + query builder (Kysely)** | Minimal, type-safe | Less schema/migration tooling; we'd rebuild what Drizzle gives | Rejected (viable fallback) |

## Decision details
- **Schema authored once** in `packages/data-access`; SQLite build for desktop, Postgres build for cloud. Types stay identical → services don't change across tiers.
- **`team_id` on every table from day one** (see ADR 0005) so the Postgres RLS multi-tenant migration is additive.
- **Repository pattern** hides Drizzle behind interfaces → services depend on abstractions, are unit-testable with in-memory fakes, and the SQLite→Postgres swap is invisible above the repository layer.
- **Content-addressed file store** keeps large binaries (screenshots/HAR/PDF) out of the DB (blueprint §6).

## Consequences
- **Positive:** one schema, two engines; cloud migration is a dialect + RLS change, not a rewrite; transparent SQL aids debugging/perf.
- **Negative:** must maintain dialect parity in CI (run integration tests against both SQLite and Postgres before Phase 4).
- **Follow-ups:** repository interfaces + migrations in Phase 1; Postgres CI lane added in Phase 4.

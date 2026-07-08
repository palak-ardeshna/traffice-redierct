# ADR 0005 — Multi-Tenancy: `team_id` on Every Table from Day One

- **Status:** Accepted
- **Date:** 2026-07-07
- **Deciders:** SaaS Architect, Database Architect, Security Eng, CTO

## Context
FlowPilot ships desktop-first (effectively single-tenant, one implicit local team) but must evolve into a **multi-tenant SaaS** (§21) without a schema rewrite or a risky data backfill. Cross-tenant data isolation bugs are catastrophic (risk #8). Retrofitting tenancy after launch is one of the most expensive and error-prone migrations a product can face.

## Decision
Every tenant-scoped table carries a **`team_id` foreign key from day one**, even on desktop where there is a single implicit local team. In the cloud, PostgreSQL **Row-Level Security (RLS)** policies key on `team_id` for defense-in-depth on top of application-layer scoping.

## Details
- **Desktop:** a single seeded local `teams` row; `team_id` is present but effectively constant → zero UX cost, full schema readiness.
- **Cloud:** RLS policies (`USING (team_id = current_setting('app.team_id')::uuid)`) enforce isolation at the database, so an application bug cannot leak across tenants.
- **Query hygiene:** repositories always accept a tenant context; a lint/test guard forbids tenant-scoped queries without a `team_id` predicate.
- **Key isolation:** per-tenant KMS envelope keys for artifact/data encryption; large Enterprise tenants can be promoted to dedicated schema/DB.
- **Audit:** `audit_logs` is append-only + hash-chained per team for tamper evidence (§14.6).

## Alternatives considered
| Option | Cons | Verdict |
|---|---|---|
| Add tenancy later | Massive backfill, high risk of leaks, downtime | Rejected |
| Separate DB per tenant from the start | Overkill for desktop + small tenants; ops cost | Rejected (offered only to large Enterprise) |
| App-layer scoping only (no RLS) | Single bug = cross-tenant leak | Rejected (RLS is the safety net) |
| **`team_id` everywhere + RLS in cloud** | Slight schema verbosity on desktop | **Chosen** |

## Consequences
- **Positive:** SaaS migration is additive (dialect swap + enable RLS); isolation is structural, not bolted on; strongest mitigation for risk #8.
- **Negative:** every table and query carries tenant context; enforced by tests/lint.
- **Follow-ups:** tenant-context plumbing in repositories (Phase 1); RLS policies + cross-tenant isolation tests (Phase 4).

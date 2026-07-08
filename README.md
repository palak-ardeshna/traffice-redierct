# FlowPilot

Enterprise Browser Automation & Website Testing Platform — desktop-first, cloud-optional.

See the full design in [docs/BLUEPRINT.md](docs/BLUEPRINT.md), the decision records in
[docs/adr/](docs/adr/), and the current milestone scope in
[docs/PHASE1_BUILD_SPEC.md](docs/PHASE1_BUILD_SPEC.md).

## Monorepo layout

| Path | What |
|---|---|
| `apps/desktop` | Electron app (main / preload / renderer) |
| `shared/ipc-contracts` | Typed renderer↔main channel contract (build-first) |
| `shared/errors`, `shared/logger` | Cross-cutting: typed errors, structured logging |
| `packages/core-domain` | Pure domain + Scenario JSON v1 schema (no I/O) |
| `packages/data-access` | Drizzle schema, repositories, migrations (SQLite→Postgres) |
| `packages/core-services` | Framework-agnostic use-cases (reused by future cloud API) |

## Prerequisites

- Node.js ≥ 20.11
- pnpm 9 (`corepack enable && corepack prepare pnpm@9.12.0 --activate`)

## Quickstart

```bash
pnpm install            # install all workspaces
pnpm db:generate        # generate the first SQLite migration from the schema
pnpm db:migrate         # apply it to ./.flowpilot-data/flowpilot.sqlite
pnpm dev                # launch the Electron app (walking skeleton)
```

Then create a project in the window — that exercises the full
renderer → preload → main → zod-validate round-trip.

## Useful scripts

| Command | Effect |
|---|---|
| `pnpm typecheck` | Type-check every package (Turbo-cached) |
| `pnpm build` | Build all packages + the desktop bundle |
| `pnpm test` | Run unit/integration tests |
| `pnpm --filter @flowpilot/desktop package` | Produce a signed installer (needs signing config) |

## Architectural guardrails (do not violate)

- `core-services` and `core-domain` must **never** import `electron` — enforced by lint (ADR 0004, blueprint rec #8).
- All DB access goes through repository interfaces (ADR 0003).
- Every tenant-scoped query carries `team_id` (ADR 0005).
- Every IPC payload is validated against `@flowpilot/ipc-contracts` on both sides.

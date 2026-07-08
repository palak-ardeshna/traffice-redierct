# Phase 1 — MVP Build Spec (FlowPilot)

**Goal (single sentence):** Ship a signed desktop app on Windows & macOS that can **record a browser flow → run it → capture screenshots → export a PDF report**, on the architectural spine that later carries the full product and SaaS.

**Duration:** ~4 months · **Team:** 5–7 engineers · **Definition of Done:** the end-to-end demo below passes on a clean machine from a signed installer, with CI producing those installers automatically.

> Scope discipline: everything not listed under "In scope" is explicitly **deferred** to Phases 2–4 (see blueprint §17). Resist adding audits, AI, scheduling, cloud, or plugins now — the wedge is record→run→report.

---

## 1 · In scope (Phase 1 only)

| Area | Included | Deferred |
|---|---|---|
| Shell | Electron 3-tier, secure IPC, auto-update, signing (Win/mac) | Linux packaging → P2 |
| Data | SQLite + Drizzle + migrations + repositories, content-addressed file store | Postgres/cloud → P4 |
| Engine | Playwright abstraction, single worker + durable queue, browser pool (Chromium), step executors, retries | Parallel/shard, FF/WebKit → P2/P3; self-heal → P3 |
| Authoring | Recorder v1 (Chromium), Scenario JSON v1, basic Scenario Builder (list editor), code view (read-only) | Visual node editor, components, data-driven → P3 |
| Run UX | Run configurator, live step timeline, screenshots tab | Network/Console/Perf tabs → P2 |
| Reporting | Basic branded PDF (single run) | Excel/HTML/trend, template editor → P2 |
| Settings | General + Automation + data dir + logs | AI/Team/SSO → P3/P4 |
| Cross-cutting | Logging (Pino+electron-log), typed errors, event bus, telemetry (opt-in), fixture-site test harness | — |

---

## 2 · Build order (dependency-sequenced)

```
Week 1–2   Foundations
  monorepo (pnpm + Turborepo), tsconfig, ESLint/Prettier, CI skeleton
  shared/ipc-contracts (zod channels)  ← build FIRST (blueprint rec #3)
  shared/logger, shared/errors, shared/config
  data-access: Drizzle schema + migrations + repository interfaces + SQLite impl
  core-domain: entities + zod schemas (Scenario JSON v1)

Week 3–5   Electron spine
  apps/desktop: main bootstrap, DI container, window, preload (contextBridge)
  IPC router wired to a stub service; renderer shell (React + Tailwind + shadcn)
  hardening: contextIsolation/sandbox/fuses; secure IPC validated round-trip
  fixture-site harness (tests/fixtures) stood up  ← blueprint rec #4

Week 4–8   Automation engine (overlaps)
  packages/automation: BrowserEngine abstraction over Playwright
  durable SQLite-backed queue + worker supervisor + utilityProcess worker
  step executors: navigate/click/fill/assert/wait/screenshot
  browser pool (Chromium), storageState sessions, run lifecycle + events (SSE/IPC stream)
  RunService (core-services) + repositories persistence + artifacts to file store

Week 6–10  Recorder + authoring
  packages/recorder: injected capture + CDP listeners → Scenario JSON
  selector ranking (getByRole/Label/Text → css → xpath) + stability score
  Scenario Builder (list editor), save → scenario_versions, code view (transpile)
  playback dry-run

Week 9–13  Run UX + reporting
  Automation page (configurator + live timeline + screenshots)
  packages/reporting: PDF composer (React-PDF + Playwright HTML→PDF), branding config
  Dashboard v1 (recent runs, pass/fail) ; Settings v1

Week 12–16 Harden + ship
  auto-update (electron-updater) + signed feed
  CI: matrix build → sign (Win Authenticode, mac Developer ID + notarize) → package → publish
  perf/memory watchdog benchmark (blueprint risk #3)
  E2E (Playwright-driving-Electron) of the golden demo; bug bash; RC → GA
```

---

## 3 · Acceptance criteria (the golden demo)

1. Launch signed installer on a clean Windows 11 and macOS machine → app opens, no security warnings.
2. Create a project; add the fixture site as a website.
3. Click **Record** → perform login + navigation + a form submit in the instrumented browser → Stop. Steps appear with ranked selectors + stability scores.
4. Save scenario (creates version 1). Edit one step's assertion. Save (version 2).
5. **Run** the scenario on Chromium → live step timeline updates in real time; a full-page screenshot is captured; run finishes `passed`.
6. Kill the worker process mid-run in a separate test → run is marked `error` (not hung), UI stays responsive, app does not crash.
7. **Generate PDF report** with a custom logo/color → branded PDF opens with summary, steps, and screenshots.
8. Re-run pins `scenario_version_id`; run history shows both runs with correct versions.
9. Trigger an update from the signed feed → app verifies signature+hash, installs on restart, post-update health check passes.
10. Secrets: the fixture login password is stored via OS keychain; it never appears in DB rows or any log file (verified by a redaction test).

---

## 4 · Cross-cutting requirements (non-negotiable in P1)

- **`core-services` imports zero Electron/IPC** — enforced by an ESLint import-boundary rule (protects the future cloud API, blueprint rec #8).
- **Every IPC payload validated** with the `ipc-contracts` zod schemas on both sides.
- **`team_id` present on all tenant-scoped rows** from day one (ADR 0005), even with a single implicit local team.
- **Repository interfaces only** in services; no direct Drizzle calls above `data-access` (ADR 0003).
- **File-store + queue interfaces shaped to match S3/BullMQ** even though the P1 impls are local FS + SQLite (blueprint rec #7).
- **Fixture-site tests, not live internet**, for engine reliability (blueprint §19).
- **Opt-in telemetry + flakiness scoring instrumented** from the start (blueprint rec #6).

---

## 5 · Risks specific to Phase 1

| Risk | Mitigation |
|---|---|
| Signing/notarization eats weeks late | Automate in CI in Week 12–13, not at RC (blueprint rec #5) |
| Electron memory with warm browser pool | Watchdog benchmark by Week 14; pool recycle thresholds |
| Recorder selector brittleness | Ranked candidates + stability score + playback dry-run before "done" |
| Scope creep from stakeholders | This spec is the contract; audits/AI/cloud are P2+ and out of bounds |

---

## 6 · Exit → Phase 2

Phase 1 exits when the golden demo passes from signed installers produced by CI. Phase 2 then adds the **audit suite** (performance, network, console, SEO, a11y, broken-link), visual regression, Excel/HTML reports, scheduling, notifications, and Linux packaging — all on top of the now-proven engine + storage + reporting spine.

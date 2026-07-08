# ADR 0002 — Automation Engine: Playwright

- **Status:** Accepted
- **Date:** 2026-07-07
- **Deciders:** Browser Automation Eng, QA Lead, Architect

## Context
The core value of FlowPilot is **reliable cross-browser automation** plus deep telemetry (network, console, performance, tracing) and a record-and-replay authoring flow. We must support Chromium, Firefox, and WebKit with one API, capture Core Web Vitals and HAR, and expose CDP-level signals. Flaky automation is the #1 reason such tools get abandoned (risk #2), so auto-waiting and trace-based debugging are must-haves.

## Decision
Embed **Playwright** as the automation core, wrapped behind an internal abstraction layer (`packages/automation`) so the engine is not directly coupled to Playwright's API surface.

## Alternatives considered
| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **Playwright** | One API across Chromium/FF/WebKit; auto-wait; CDP access (network/console/perf/memory); tracing (time-travel debugging); codegen we can adapt for the recorder; active maintenance | Bundles browser binaries (size); version churn | **Chosen** |
| **Puppeteer** | Mature, CDP-native | Chromium-only → no cross-browser confidence | Rejected |
| **Selenium/WebDriver** | Broadest historical reach, grid ecosystem | Flakier, no native tracing, heavier setup, slower feedback | Rejected |
| **Cypress** | Great DX, time-travel | In-browser runtime limits multi-tab/cross-origin/native perf tracing; not a library we can embed headlessly the same way | Rejected |

## Decision details
- **Abstraction layer** isolates Playwright behind our own `BrowserEngine`, `Locator`, and `StepExecutor` interfaces → protects against breaking changes (risk #1) and keeps the door open for additional targets (remote CDP, device farms) via plugins (§15).
- **Version pinning per project** (`browsers` table) for reproducibility; staged engine upgrades gated by the fixture-site regression suite (§19).
- **Reliability features leveraged:** auto-wait, `storageState` sessions, trace-on-failure, screenshot-on-failure, network/console/perf via CDP.

## Consequences
- **Positive:** single dependency covers cross-browser + telemetry + recorder foundation; strong reliability primitives out of the box.
- **Negative:** browser binary size and version management; mitigated by pooling (§9.6) and pinning.
- **Follow-ups:** build the abstraction layer + fixture-site harness in Phase 1 (blueprint recommendation #4).

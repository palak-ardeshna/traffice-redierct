# ADR 0001 — Desktop Shell: Electron

- **Status:** Accepted
- **Date:** 2026-07-07
- **Deciders:** Principal Architect, Desktop Eng, CTO
- **Supersedes:** —

## Context
FlowPilot must run **browser automation locally** (Playwright driving Chromium/Firefox/WebKit), own a local SQLite DB, access the OS keychain, capture large binary artifacts, run background schedulers, and ship signed auto-updating installers on Windows/macOS/Linux. The renderer is a rich React UI. We need a shell that gives us full Node APIs in a privileged process, a mature packaging/signing/update story, and a large hiring pool — while keeping a portable service layer for a future SaaS.

## Decision
Use **Electron** (via `electron-vite`) with a strict 3-tier process model: sandboxed Renderer, privileged Main, and isolated Automation Worker `utilityProcess`es.

## Alternatives considered
| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **Electron** | Full Node in Main → trivial Playwright/keychain/FS/DB integration; `electron-builder` + `electron-updater` (signing, notarization, staged rollout); huge ecosystem & talent pool; Chromium fuses for hardening | Larger binary/memory footprint; must manage process isolation deliberately | **Chosen** |
| **Tauri (Rust core)** | Tiny binary, low memory, Rust security | Automation needs Node + Playwright in-process; bridging the entire Node plugin/AI/reporting ecosystem through Rust adds friction and risk on the exact hot path (automation); smaller talent pool | Rejected |
| **NW.js** | Node+Chromium like Electron | Declining ecosystem, weaker update/signing tooling | Rejected |
| **Web + native wrapper (PWA)** | Simple | Cannot run Playwright/keychain/local FS with required privilege; not local-first | Rejected |

## Consequences
- **Positive:** fastest path to a reliable automation core; best-in-class packaging/signing/update; one language (TS) across all tiers; service layer stays framework-agnostic for cloud reuse.
- **Negative:** memory footprint requires a resource governor + pool recycling (tracked in blueprint §9.6, risk #3); must enforce hardening (contextIsolation, sandbox, fuses, no nodeIntegration — see ADR 0004 and §14).
- **Follow-ups:** Electron fuses config; per-OS signing pipeline in CI (§20.4); memory watchdog benchmark in Phase 1.

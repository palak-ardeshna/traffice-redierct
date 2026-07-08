# ADR 0004 — Process-Isolated Automation Workers & Secure IPC

- **Status:** Accepted
- **Date:** 2026-07-07
- **Deciders:** Architect, Security Eng, Desktop Eng

## Context
Browser automation is inherently unstable: pages crash, scripts hang, memory leaks. If automation ran in the Main or Renderer process, a single bad run could freeze the UI or corrupt the DB. Additionally, the Renderer must be hardened (untrusted web content, future plugin UIs) and must never touch Node/FS/DB directly. We also want the execution tier to be **relocatable to the cloud** later without rearchitecting.

## Decision
Run automation in **separate `utilityProcess` workers**, supervised by Main. The Renderer is fully sandboxed; all privileged actions cross a **contract-first, validated IPC boundary**. Workers receive self-contained **job envelopes** and are stateless w.r.t. app config.

## Details
- **Renderer hardening:** `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`; a minimal `contextBridge` API; Electron fuses disable `runAsNode`/`nodeCliInspect` and enable ASAR integrity.
- **IPC contract-first:** `shared/ipc-contracts` defines every channel with zod request/response schemas imported by both sides → compile-time + runtime safety; whitelisted channels only; typed error DTOs; streaming channel for run events with backpressure.
- **Worker isolation:** browser crash/hang/leak is contained; watchdog timeouts per step and per run; crashed worker's durable job re-dispatches idempotently (run status guards double-execution).
- **Relocatability:** because workers take a full job envelope and emit events, the same worker protocol runs on a cloud fleet (§21) — the queue interface (ADR-adjacent) matches BullMQ.

## Alternatives considered
| Option | Cons | Verdict |
|---|---|---|
| Automation in Main process | UI freeze / DB corruption on crash; no isolation | Rejected |
| Automation in Renderer | Security disaster (Node in renderer); instability | Rejected |
| Web Workers / threads | Playwright needs a full process + browser; threads insufficient | Rejected |
| **Separate utilityProcess workers** | Slightly more coordination code | **Chosen** |

## Consequences
- **Positive:** UI stays responsive under load; crashes are isolated and recoverable; strong security posture; cloud-portable execution tier.
- **Negative:** more IPC/coordination surface; requires a supervisor + health checks (§9.6).
- **Follow-ups:** build `ipc-contracts` and the worker supervisor first (blueprint recommendation #3); fuzz/validate every IPC payload.

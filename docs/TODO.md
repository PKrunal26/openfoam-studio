# OpenFOAM Studio — Live TODO

> **Rule:** Update this file at the start and end of every session, and whenever a subtask
> changes status. This is the single source of truth for what is being worked on.
>
> Status values: `pending` · `in-progress` · `done` · `blocked`  
> PRDs live in `docs/features/`.

---

## Pull request and merge — 2026-10-08

- `done` · Prepared the completed launch fixes and CLI/setup follow-up for the user-authorized pull request and merge. Automatic PR checks verify units/types/builds/assets; full ordered simulation validation remains mandatory for release candidates. GitHub records the final PR checks, commit and merge status.

## CLI provider choice — 2026-10-08

- `done` · Restore both Codex CLI and Claude Code CLI in Settings; preserve explicit provider/model choices; retain Codex as the unconfigured default.
- `done` · Verified config/REST/UI persistence and selected-provider connection/recovery routing. Setup instructions no longer masquerade as terminal commands. 281 unit regressions, 15 affected Stage 0 checks, three typechecks and builds passed. Refreshed ARM64 installer integrity and actual mounted payload comparison passed. Live Claude connection failed on this machine; fresh authentication/model access is required. Earlier ordered CFD stage evidence remains recorded separately in the launch report.

## Project lead launch audit — 2026-10-07

### Implementation — Sol agents (finished 2026-10-08)

- `done` · Core/AI and recovery safety; restricted Codex/Sol default; solver-aware validation and Docker lifecycle.
- `done` · Shared safe editor buffers, Save and run, cancellation/project isolation, guided FTUX, explicit question mode, accessibility and historical results.
- `done` · Provider/health/configuration, encrypted desktop credentials, durable data/export, build/type/release gates and packaging safeguards.
- `done` · Lead integration: transactional generation/recovery, authenticated bounded requests, job ownership, immutable run evidence and provenance.
- `done` · Ordered Stage 0–5: **15 + 11 + 3 + 8 + 3 + 9 = 49 passed**. Final units **274/274**; three typechecks and renderer/server builds passed. Actual Codex production HTTP journeys passed.
- `done` · Final ARM64 DMG built and verified; actual mounted payload matches reviewed build. Packaged starter → Save and run → archived results, clean quit and relaunch passed in disposable data. Installer/checksum/native evidence recorded in the implementation report.
- `blocked` · Broad public promotion: needs a reviewed immutable commit, signing/notarization where promised, clean-machine macOS Intel/ARM64 and Windows x64 install/data-preservation proof, advertised-provider fresh-account journeys and five representative user sessions. These are external release gates, not implemented-code failures.
- Follow-through report: [LAUNCH_IMPLEMENTATION_REPORT.md](LAUNCH_IMPLEMENTATION_REPORT.md). Original audit below is historical evidence of the pre-fix state.

- `done` · Reviewed FTUX, workbench, AI and CFD reliability, security, packaging, and announcement readiness against the current working tree. Report: [LAUNCH_READINESS_REPORT.md](LAUNCH_READINESS_REPORT.md), with 25 prioritized findings, visual evidence, work packages, and release acceptance gates. Existing local changes preserved; no production code changed.
- Verification: Stage 0 failed (missing OpenFOAM image plus provider-dependent CLI expectation; 8 passed, 2 failed, 5 environment tests blocked). Stages 1–5 stopped. Renderer typecheck and renderer/server builds passed; root `tsc --noEmit` failed. A directory-read request reproduced a backend crash in an isolated audit project. Downstream UI inspection used explicitly labeled visual fixtures, not a successful solver run.
- `done` · Source fixes and ordered local validation are complete. Publication/artifact and external journey gates remain explicitly open in the implementation report.

## Historical public release readiness (2026-07-26)

### First fixes — 2026-09-15

- Implemented strict localhost Host/Origin checks and removed wildcard CORS, including SSE. Local command-line clients remain supported; per-launch authentication remains follow-up work.
- Made AI Settings accessible from the setup gate; closing Settings rechecks readiness. Docker repair no longer installs optional Claude CLI packages.
- Verification: renderer typecheck and server bundle pass. Stage 0 fails because the OpenFOAM image is missing and an existing CLI test assumes the CLI provider regardless of local configuration. Stages 1–5 not run.

Audit of the "download from GitHub, run with no dependencies" path, verified against
a real packaged build rather than the configs.

| Item | Status |
|------|--------|
| P0 · macOS release artifact — `.github/workflows/build-mac.yml`, arm64 + x64 DMG → tag `mac-latest` | `done` |
| P0 · Ship `wiki/` + `docs/openfoam-v13/` in packaged builds (electron-builder `files`) | `done` |
| P0 · `resolveAppRoot()` (`core/paths.ts`) so DocsIndex/Reviewer find the wiki after esbuild inlines core/** | `done` |
| P0 · Timeouts on Docker health probes + failed probe reported as `ok:false` instead of silence | `done` |
| P0 · Kill the backend on `app.quit()` (Electron skips `window-all-closed`); adopt an existing :3456 server | `done` |
| P1 · `docker`/`npm` auto-fix commands spawn bare names — Finder-launched mac app has a minimal PATH | `pending` |
| P1 · Non-Docker-Desktop socket support (Colima / OrbStack / Rancher / podman, `DOCKER_HOST`) | `pending` |
| P1 · Top-level try/catch on the HTTP handler; `/health/fix` is unwrapped (unhandled rejection kills the server) | `pending` |
| P1 · Versioned releases instead of rolling per-platform tags that CI deletes and recreates | `pending` |
| P2 · Remove empty `main/ipc` stub; Obsidian cruft in `wiki/` (`Untitled.base`, `dashboard.md`) ships in the app | `pending` |
| P2 · `engines` field in package.json; reconsider `asar:false` (ships readable source, 520 MB bundles) | `pending` |

**Tests:** `npm run test:unit` — 130 unit tests green (adds `tests/unit/paths.test.ts`,
`tests/unit/health.test.ts`, `tests/unit/renderer/`). Stage 0–5 not re-run: Docker Desktop
is wedged on the dev machine, and `core/health.ts` changes need a stage0 pass once it is back.

---

## Feature Backlog (priority order)

| # | Feature | ICE | Status | PRD |
|---|---------|-----|--------|-----|
| F01 | Setup / health check page | 20.0 | `done` | [F01](features/F01-setup-health-check.md) |
| F04 | Stage 5: conversation test (write first, TDD) | 10.0 | `done` | [F04](features/F04-stage5-conversation-test.md) |
| F02 | Conversational follow-up (second prompt) | 6.7 | `done` | [F02](features/F02-conversational-followup.md) |
| F03 | Residual convergence plot | 7.5 | `done` | [F03](features/F03-residual-plot.md) |
| F05 | Error recovery loop with approval gate | 5.0 | `done` | [F05](features/F05-error-recovery-loop.md) |

---

## F01 — Setup / Health Check Page

**Status:** `done` ✓

| Subtask | Status |
|---------|--------|
| S1 · `GET /health` endpoint (Docker ping, image check, Claude CLI check) | `done` |
| S2 · Setup view in `demo/index.html` (checklist, fix instructions, re-check button, auto-fix log) | `done` |
| S3 · App startup: gate home/project views behind health check | `done` |
| S4 · Fix instruction copy for each failure case | `done` |
| S5 · `POST /health/fix` auto-repair endpoint + allowlisted host commands | `done` |

**Tests:**

| Test | Status |
|------|--------|
| Happy path: ok:true, all 3 checks pass | `done` |
| Responds in < 2 s | `done` |
| Docker unreachable: docker + image fail | `done` |
| Claude CLI missing: claude_cli fails | `done` |
| Response shape: all fields present, correct order | `done` |

**Files:**
- `core/health.ts` — `runHealthChecks()` function (new)
- `core/docker/CommandRunner.ts` — centralized allowlisted Docker execution
- `core/setup/HostCommandRunner.ts` — allowlisted host repair commands
- `demo/server.ts` — `GET /health` + `POST /health/fix`
- `demo/index.html` — setup view, auto-fix button, repair log
- `tests/stage0/health.test.ts` — health + repair-plan coverage

---

## F04 — Stage 5: Conversational Loop Test

**Status:** `done` ✓

| Subtask | Status |
|---------|--------|
| S1 · Create `tests/stage5/conversation.test.ts` | `done` |
| S2 · Turn 1 block: generate Re=100, assert 8 files, assert nu=0.001 | `done` |
| S3 · Turn 2 block: change to Re=400, assert 1 file, assert nu=0.00025 | `done` |
| S4 · Turn 3 block: extend to 2 s, assert 1 file (controlDict) | `done` |

**Tests:** This feature IS the tests.

---

## F03 — Residual Convergence Plot

**Status:** `done` ✓

| Subtask | Status |
|---------|--------|
| S1 · Residual log parser (regex for icoFoam/foamRun/GAMG lines) | `done` |
| S2 · Emit `residual` SSE events from `handleRun` | `done` |
| S3 · Accumulate residuals in `demo/index.html` during stream | `done` |
| S4 · Render SVG chart after `done` event (log scale, 3 fields, legend) | `done` |
| S5 · Convergence verdict below chart | `done` |

**Tests:**

| Test | Status |
|------|--------|
| Parser extracts Ux, Uy, p from sample icoFoam log | `done` |
| Parser handles GAMG p lines | `done` |
| Parser returns `{}` for log with no solver lines | `done` |
| SSE stream emits ≥1 residual event per field in full run | `done` (requires Docker to verify) |

---

## F02 — Conversational Follow-up

**Status:** `done` ✓

| Subtask | Status |
|---------|--------|
| S1 · Extend `ProjectMeta` with `messages: Message[]` | `done` |
| S2 · Update `/generate` to accept and persist conversation history | `done` |
| S3 · Update `FileGenerator.ts` to accept history and pass to Claude | `done` |
| S4 · Update chat panel in `demo/index.html` (load history, sticky run, clear chat, re-enable input) | `done` |
| S5 · `GET /api/projects/:id` returns `messages` (no change needed — field in meta) | `done` |
| S6 · Delta-write: only overwrite changed files on refinement turns | `done` |
| S7 · `DELETE /api/projects/:id/messages` endpoint (clear chat) | `done` |

**Tests:**

| Test | Status |
|------|--------|
| Stage 5 F04 passes (3-turn conversation) | `done` |
| Stage 1 regression: file generation unchanged | `done` |

---

## F05 — Error Recovery Loop

**Status:** `done` ✓

| Subtask | Status |
|---------|--------|
| S1 · `core/agent/ErrorRecovery.ts` with `diagnose(log)` | `done` |
| S2 · Update `handleRun`: collect log, call diagnose, emit diagnosis SSE | `done` |
| S3 · Render diagnosis + approval gate in `demo/index.html` | `done` |
| S4 · `POST /api/projects/:id/apply-fix` endpoint | `done` |
| S5 · Exhaustion handling (3 retries → manual edit message) | `done` |
| S6 · Unit tests for `ErrorRecovery.diagnose` | `done` |

**Tests:**

| Test | Status |
|------|--------|
| `diagnose` returns correct fix for bad BC | `done` |
| `diagnose` returns correct fix for missing pRef | `done` |
| `diagnose` returns correct fix for high Courant | `done` |
| `diagnose` returns null for unknown error | `done` |
| Integration: inject bad BC → auto-recover in ≤2 retries | `done` (written; requires Docker to run) |

---

## F06 — Results Visualization (CFD-Post-style viewer)

**Status:** `done` ✓ (P0 + P1 + P2)

| Subtask | Status |
|---------|--------|
| P0 · Post-solve foamToVTK (all time steps, -useTimeName) wired into run pipeline | `done` |
| P0 · `POST /postprocess` endpoint (convert solved cases on demand) | `done` |
| P0 · Manifest v2: time series with float times (`core/postprocess/vtkSeries.ts`) | `done` |
| P0 · Legacy VTK parser + surface extraction (`renderer/lib/vtk/`, TDD) | `done` |
| P0 · ResultsEngine (vtk.js isolated): coloring, colormaps, scalar bar, axes widget, camera snaps | `done` |
| P0 · Results tab UI: pipeline tree, properties panel, time transport, playback | `done` |
| P1 · Slice / cut plane (origin + normal; axis presets + offset slider — draggable widget dropped, vtk.js v35 limitation) | `done` |
| P1 · Clip (keep one side) | `done` |
| P1 · Vector glyphs (arrows, density + scale) | `done` |
| P1 · Streamlines (line rake seeds, RK4, color by magnitude) | `done` |
| P1 · Iso-surfaces (value slider) | `done` |
| P2 · Probe at point, two-viewport compare (shared camera) | `done` |
| P2 · Screenshot export + background toggle | `done` (landed early with P0) |

**Tests:** `npm run test:postprocess` — 79 unit tests (parser, surface, series, data cache, tet decomposition, slice/iso/clip, streamlines, glyphs, probe, WebGL context guards), all green.

**Robustness (2026-06-14):** vtk.js viewers no longer blank the whole app on WebGL context loss — `ViewerErrorBoundary` + proactive `webglcontextlost`/`webglcontextrestored` handling with a Retry fallback (`renderer/lib/vtk/webgl.ts`, TDD). Complements PR #16 (hardware accel) which fixed the always-black case.

---

## Completed

- **F01** — Setup / Health Check Page
- **F04** — Stage 5 Conversational Loop Test  
- **F02** — Conversational Follow-up (Cursor-style multi-turn chat)

---

_Last updated: 2026-10-08 — Both CLI choices and setup guidance fixed; 281 units and affected Stage 0 pass. Earlier ordered Stage 0–5 evidence retained separately. See the launch implementation report for current candidate evidence and external promotion gates._

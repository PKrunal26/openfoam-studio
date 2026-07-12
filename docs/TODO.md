# OpenFOAM Studio — Live TODO

> **Rule:** Update this file at the start and end of every session, and whenever a subtask
> changes status. This is the single source of truth for what is being worked on.
>
> Status values: `pending` · `in-progress` · `done` · `blocked`  
> PRDs live in `docs/features/`.

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

_Last updated: 2026-06-14 — vtk.js viewers hardened against WebGL context loss (error boundary + proactive detection/recovery, TDD); test:postprocess now 79 green._

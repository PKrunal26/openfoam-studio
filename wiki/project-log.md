# OpenFOAM Studio — Project Log

## What We Have Done

### Stages 0–4 Complete (2026-04-11)
All five test stages pass end-to-end from a clean state:
- **Stage 0** — Docker + OpenFOAM environment: 5/5 tests ✓ (~22s)
- **Stage 1** — File generation via claude CLI: 4/4 tests ✓ (Re=100.0, 8 files generated)
- **Stage 2** — Mesh quality (blockMesh + checkMesh): 3/3 tests ✓ (400 cells, skewness ~0)
- **Stage 3** — Solver execution (foamRun): 3/3 tests ✓ (2000 time steps, residuals converging)
- **Stage 4** — Ghia physics benchmark: 3/3 tests ✓ (max deviation 3.2% vs 15% tolerance, final residual 1.79e-6)

Core implementations in place: `FileGenerator.ts`, `VelocitySampler.ts`, `Reviewer.ts`, `cavity-system-prompt.ts`.
Refactored: shared `CaseFiles` type (`core/agent/types.ts`), shared `runClaude` (`core/agent/claude-runner.ts`).
### 0. OpenFOAM 13 knowledge base refresh
Added a breadth-first knowledge base for future AI contributors and the product's
solver-facing agent. The new docs capture what the code actually uses today and
map that to official OpenFOAM 13 concepts:

- `wiki/README.md` — reading order and current repo truth
- `wiki/openfoam-13-agent-guide.md` — practical agent guide
- `wiki/cases/case-structure.md` — case file dependency model
- `wiki/cases/lid-driven-cavity.md` — canonical benchmark case
- `wiki/solvers/solver-selection.md` — solver/module selection rules
- `wiki/solvers/incompressibleFluid.md` — primary supported module
- `wiki/errors/reviewer-checklist.md` — failure triage checklist
- expanded `wiki/errors/common-failures.md` with OpenFOAM 13-specific pitfalls

This refresh also documents important repo reality:
- actual implementation is centered on `foamRun` + `incompressibleFluid`
- tests are currently the strongest source of truth
- renderer/main are still mostly placeholders

### 1. Project Foundation
Set up the core architecture for OpenFOAM Studio — an AI-powered desktop app where engineers describe CFD simulations in plain English and the app handles OpenFOAM setup, execution, error recovery, and results.

**Architecture decided (hard rules):**
- `core/` — Node.js only, zero Electron dependency, 100% headlessly testable
- `renderer/` — React UI, runs standalone in browser with mocked IPC
- `main/` — Electron shell, thin IPC wiring only
- `tests/` — Stage-gated, never skip stages
- `wiki/` — CFD knowledge base (this directory)
- `docker/` — OpenFOAM container config

**Stack:** Electron + React + TypeScript + Vitest + Zustand + Anthropic Node SDK (`claude-sonnet-4-6`) + OpenFOAM 13 (Foundation) + dockerode

### 2. Tooling & Knowledge Base
- Connected Obsidian to `wiki/` via the `obsidian-mcp` MCP server → Claude can read/write CFD knowledge directly, Obsidian gives graph/browse UI
- CFD knowledge base structured into `wiki/solvers/`, `wiki/cases/`, `wiki/errors/`

### 3. UI Scaffold — evaluated a fork, built our own instead
Considered forking **[pingdotgg/t3code](https://github.com/pingdotgg/t3code)** as the
base scaffold for the renderer, for its xterm.js terminal, WebSocket transport with
reconnection, Zustand state, Electron wrapper, and Effect/SQLite server.

**Not adopted.** The renderer was written from scratch and none of that code is in
this repo. The Effect/SQLite server and WebSocket transport were more machinery than
a single-user local app needs, and the OpenFOAM-specific surface (case-file tree,
parameters editor, VTK results viewer) was most of the UI anyway.

**What shipped instead:** own React 19 + Vite + Tailwind v4 shell (`renderer/`),
plain Node HTTP + SSE server (`demo/server.ts`), Monaco for case files, a Logs tab
for command output instead of xterm.js, and flat files under `demo/projects/<id>/`
instead of a database. Docs that still described the fork were corrected on
2026-07-26.

### 4. Full System Design — Brainstorm Session
Completed a full brainstorming session defining the end-to-end architecture. Key decisions:

- **UI:** Cursor-style layout — case-file tree left, Monaco Editor center, chat right, command output bottom. (Shipped without react-arborist or xterm.js; see `docs/UI_SPEC.md`.)
- **Agent:** 4-role pipeline (Architect → Input Writer → Runner → Reviewer) driven by system prompt + custom tools. (Shipped on BYOK providers via the Vercel AI SDK, with the `claude` CLI as a no-key fallback.)
- **Error recovery:** RCA in chat → fix manifest → user approval → apply fixes → re-run (max 3 loops)
- **Results:** Residual plot inline + field visualisation. (Shipped as a hand-rolled SVG chart and an in-app vtk.js Results tab — no recharts, no ParaView dependency.)
- **Parallel agent docs created:** `docs/ARCHITECTURE.md`, `docs/UI_SPEC.md`, `docs/AGENT_PIPELINE.md`, `docs/TOOLS.md`
- **Full spec:** `docs/superpowers/specs/2026-04-11-openfoam-studio-design.md`

---

## What We Are Going To Do

### Stage 0 (Current) — Docker + OpenFOAM Environment
Get the OpenFOAM container working end-to-end before writing any UI or agent code.

**5 tests must pass:**
1. Docker is running and image `openfoam-ubuntu24.04:latest` exists
2. Container starts and responds
3. `blockMesh` runs on the tutorial cavity case (exit 0)
4. `foamRun` runs 10 iterations without `FOAM FATAL ERROR`
5. Log files are readable from host via volume mount

Run with: `npm run test:stage0`

### Stage 1 — File Generation
Generate valid OpenFOAM case files from structured config objects. No Docker needed. Fast tests (~10s).

### Stage 2 — Mesh Quality
Validate that generated meshes pass `checkMesh` quality criteria (~60s).

### Stage 3 — Solver Execution
Run solvers end-to-end in Docker and capture structured results (~3min).

### Stage 4 — Physics Validation (Ghia Benchmark)
Validate lid-driven cavity results against the Ghia et al. (1982) benchmark data. This is the physics correctness gate (~8min).

### UI Integration (Post Stage 4)
Build the OpenFOAM Studio renderer:
- Natural language input → simulation config → OpenFOAM case files
- Logs tab shows live solver output streamed over SSE
- Results panel shows residual plots and mesh previews
- Error recovery loop: FOAM FATAL ERRORs → agent diagnosis → auto-fix → re-run

### Agent Layer
Wire in `@anthropic-ai/sdk` with `claude-sonnet-4-6`:
- Parse plain-English simulation descriptions into structured configs
- Generate OpenFOAM dictionaries (`blockMeshDict`, `controlDict`, boundary conditions)
- Diagnose solver errors from log files using `wiki/errors/` knowledge base
- Suggest mesh refinements based on `checkMesh` output

---

## Key Constraints
- All Docker commands go through `core/docker/CommandRunner.ts` allowlist — no raw shell ever exposed to agent
- LF line endings enforced in all OpenFOAM file writer (Windows CRLF breaks OpenFOAM parsers)
- `path.join()` always, never string concatenation
- Tests are stage-gated: never skip forward, never build impl before failing test exists

---

## 2026-04-14

### Onboarding self-heal and image-source verification

- Added onboarding auto-fix for Docker startup, image preparation, and Claude CLI installation
- Verified the source image `microfluidica/openfoam:13` directly
- Verified that the source image provides:
  - `foamVersion = OpenFOAM-13`
  - `/opt/openfoam13/etc/bashrc`
  - `/opt/openfoam13/tutorials/incompressibleFluid/cavity`
  - `foamRun`
- Kept the local runtime alias `openfoam-ubuntu24.04:latest` so existing tests and runtime code did not need to change
- Updated setup docs to point at `microfluidica/openfoam:13` as the canonical pull source

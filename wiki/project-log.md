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

### 3. UI Scaffold — Forked t3code
Forked **[pingdotgg/t3code](https://github.com/pingdotgg/t3code)** as the base scaffold for the renderer UI.

**Why t3code:**
- Already a working agent coding UI with React 19 + Vite + Tailwind CSS 4
- Has xterm.js terminal emulation (needed to show solver output)
- Has a WebSocket transport layer with reconnection state machine
- Uses Zustand for state (same as our stack)
- Electron desktop wrapper already wired up
- Effect-based server with SQLite persistence
- Provider abstraction (Codex/Claude) — maps cleanly to our OpenFOAM provider model
- Monorepo with turbo — matches our multi-package needs

**t3code architecture (for reference):**
```
apps/server    → Node.js WebSocket server (Effect runtime, SQLite)
apps/web       → React UI (sessions, conversations, terminal, diffs)
apps/desktop   → Electron wrapper
packages/contracts  → Shared schemas (Effect/Schema)
packages/shared     → Git, shell, logging utilities
```

### 4. Full System Design — Brainstorm Session
Completed a full brainstorming session defining the end-to-end architecture. Key decisions:

- **UI:** Cursor-style four-panel layout — file tree (react-arborist) left, Monaco Editor center, Claude chat right, xterm.js terminal bottom
- **Agent:** t3code's existing Claude provider unchanged. 4-role pipeline (Architect → Input Writer → Runner → Reviewer) driven by system prompt + 6 custom tools
- **Error recovery:** RCA in chat → fix manifest → user approval → apply fixes → re-run (max 3 loops)
- **Results:** Residual plot (recharts) inline + ParaView batch PNG; fallback to `paraFoam` in terminal
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
Adapt t3code's renderer as the OpenFOAM Studio UI:
- Replace Codex/Claude provider with an OpenFOAM simulation provider
- Natural language input → simulation config → OpenFOAM case files
- Terminal panel shows live solver output (reuse xterm.js)
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

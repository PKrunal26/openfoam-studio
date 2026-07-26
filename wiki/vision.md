# Vision — OpenFOAM Studio

## The Problem

OpenFOAM is one of the most capable CFD solvers in the world. It is also one of the most hostile tools to use. Engineers who understand fluid dynamics perfectly well can spend days on configuration before a single simulation runs — and when it fails, the error messages are cryptic, the docs are sparse, and the fix requires knowing which of hundreds of dictionary keywords to change.

The pain is entirely in the tooling, not the physics.

- Every case is a tree of hand-edited text files with no schema validation
- A single CRLF line ending silently corrupts an OpenFOAM file on Windows
- `FOAM FATAL ERROR` tells you something broke but rarely why
- There is no natural-language interface — everything is manual, every time

## The Vision

> **OpenFOAM Studio lets any engineer describe a simulation in plain English and run it — no OpenFOAM expertise required.**

The engineer thinks about physics. The app handles files, containers, errors, and results.

## Who It Is For

**Primary:** Mechanical and aerospace engineers who understand fluid dynamics but do not want to become OpenFOAM configuration specialists.

**Secondary:** Researchers who need to prototype parametric studies quickly — geometry sweeps, Reynolds number sweeps, turbulence model comparisons — without writing boilerplate case files for each run.

**Not for:** Users who need GUI mesh generation or CAD import (that is a different class of problem).

## How It Works (Product Level)

1. User types a plain-English description: *"Lid-driven cavity, Re=100, 2D, incompressible, run for 0.5 s"*
2. The AI agent parses the intent and generates all required OpenFOAM case files (`blockMeshDict`, `controlDict`, boundary conditions, transport properties)
3. The solver runs inside a local Docker container — no data leaves the machine
4. If the solver fails, the agent reads the log, diagnoses the error using the CFD knowledge base, fixes the file, and re-runs automatically
5. Results (residual plots, velocity field slices) are shown inline

## UI Layout — Cursor-style Desktop App

The interface is a purpose-built React 19 + Vite + Electron renderer (Tailwind v4, Zustand, Monaco, vtk.js) talking to a local HTTP + SSE server, with a BYOK LLM provider — or the Claude Code CLI with no key — as the agent backend. See `docs/UI_SPEC.md` for the shipped layout.

```
┌─────────────────────────────────────────────────────────────────┐
│  OpenFOAM Studio                                                │
├──────────────┬──────────────────────────┬───────────────────────┤
│              │                          │                       │
│  File Tree   │    File Viewer           │   AI Conversation     │
│              │                          │                       │
│  case/       │  (selected file          │  Engineer types:      │
│  ├ 0/        │   rendered with          │  "Run at Re=400"      │
│  ├ constant/ │   syntax highlight)      │                       │
│  └ system/   │                          │  Agent responds,      │
│              │                          │  edits files,         │
│              │                          │  explains changes     │
│              │                          │                       │
├──────────────┴──────────────────────────┴───────────────────────┤
│  Terminal  (all commands run by the agent, live output)         │
│  > blockMesh -case /tmp/cavity  [exit 0]                        │
│  > icoFoam  -case /tmp/cavity   [running...]                    │
└─────────────────────────────────────────────────────────────────┘
```

### Panel Responsibilities

**Left — File Tree**
Shows the live OpenFOAM case directory structure. Clicking any file opens it in the center panel. The agent's file writes are reflected here immediately.

**Center — File Viewer**
Reads and displays the selected OpenFOAM dictionary file with syntax highlighting. Engineers can inspect exactly what the agent generated or modified. Edits made here feed back to the agent's context.

**Right — AI Conversation**
The primary input surface. Engineers describe what they want in plain English. The agent responds in natural language, explains what it is doing, and streams its actions (file edits, solver invocations) as they happen. Streamed over SSE from the local server.

**Bottom — Command output**
Shows every command the agent runs inside the Docker container, with live streaming output. Nothing is hidden. Engineers can see `blockMesh`, `foamRun`, `checkMesh` output exactly as it would appear in a terminal. Shipped as the Logs tab plus the Commands sidebar panel rather than a terminal emulator.

## Design Principles

**Local-first.** All compute runs in a Docker container on the engineer's machine. No cloud upload, no subscription dependency, no data exposure.

**Physics-correct, not just functional.** "It runs" is not enough. The Ghia et al. (1982) lid-driven cavity benchmark is the acceptance gate — results must match published data within ±5%. A simulation that converges to the wrong answer is worse than one that fails loudly.

**Transparent by default.** Every generated file is visible and editable. The agent never hides what it has done. Engineers can inspect, override, or eject to plain OpenFOAM at any point.

**Stage-gated development.** No layer is built until the layer below is proven by passing tests. Docker and the OpenFOAM environment must work before file generation is written. File generation must work before mesh quality is validated. This is non-negotiable.

**No raw shell access.** The agent never executes arbitrary shell commands. All Docker interactions go through a strict command allowlist in `core/docker/CommandRunner.ts`.

## Success Criteria — Version 1

| Criterion | Measure |
|-----------|---------|
| Physics correctness | Stage 4 Ghia benchmark passes: icoFoam lid-driven cavity velocity profile within ±5% of Ghia et al. (1982) |
| Time to first simulation | A non-OpenFOAM engineer runs their first simulation in under 5 minutes from cold start |
| Error recovery | Common `FOAM FATAL ERROR` classes (bad BC, bad mesh, divergence) are diagnosed and fixed automatically without user intervention |
| Security | Zero raw shell commands ever exposed to the agent layer |

## What We Are Not Building (v1)

- GUI mesh generation or CAD import
- Multi-machine or cloud execution
- Support for OpenFOAM ESI fork (Foundation release only)
- Turbulence modelling (RANS, LES) — incompressible laminar flow first
- Windows native (Docker Desktop on Windows is supported; native Win32 is not)

## UI Foundation

The renderer is written from scratch for this project. Early planning considered
forking an existing Electron editor shell (**[pingdotgg/t3code](https://github.com/pingdotgg/t3code)**)
for its xterm.js terminal, WebSocket transport, and SQLite session store. That
route was **not taken** — none of its code is in this repo. What shipped instead:

- React 19 + Vite + Tailwind CSS 4 + Electron — own component shell (`renderer/`)
- HTTP + SSE to a local Node server (`demo/server.ts`), not WebSockets
- Monaco for case files and a Logs tab for command output, not xterm.js
- Zustand stores in `renderer/store/`
- Plain files on disk under `demo/projects/<id>/` for session history, no database
- vtk.js Geometry and Results tabs, isolated behind `renderer/lib/vtk/`

Agent actions route through `core/docker/CommandRunner.ts`. See `docs/UI_SPEC.md`
for the current layout and component map.

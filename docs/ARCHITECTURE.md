# Architecture — OpenFOAM Studio

> Read this before working on `core/`, `renderer/`, `demo/server.ts`, or any cross-cutting concern.
> After changes, update this doc and append to `docs/AGENT_CHANGES.md`.

## System Overview

OpenFOAM Studio is an AI-powered desktop app. Engineers describe CFD simulations in plain English. The app generates an OpenFOAM case, runs it inside Docker, supports error recovery, and presents results/logs in a Cursor-style UI.

## Layer Map

```
renderer/               Vite + React + TypeScript frontend
  ├ Files sidebar        Case file tree
  ├ Monaco editor        Edit case files in-place
  ├ Assistant panel      Chat + streamed agent events
  ├ Logs / Runs          Live logs + persisted run history
  └ editor/tabs/
      ├ CaseFileTab      Monaco-based case file editor
      ├ ParametersTab    Key simulation parameters form
      ├ GeometryTab      vtk.js 3-D mesh viewer
      ├ LogsTab          Live + historical Docker logs
      └ ResidualChart    SVG convergence plot (log scale)

demo/server.ts          Local HTTP server (port 3456): REST API + SSE streaming
  ├ /api/projects              Create/list/delete projects
  ├ /api/projects/:id/files    List case files
  ├ /api/projects/:id/file     Read/write a case file (path-guarded)
  ├ /api/projects/:id/generate SSE generation stream
  ├ /api/projects/:id/run      SSE run stream (Docker)
  ├ /settings                  BYOK provider/model/key config
  └ /health                    Environment checks + optional repairs

demo/electron-main.cjs  Electron entry point (spawns `demo/server.ts` as a child process)

demo/projects/<id>/     On-disk persistence
  ├ meta.json            Project meta (incl. `messages`)
  ├ case/                OpenFOAM case directory (0/, constant/, system/, …)
  ├ runs.jsonl           Run history
  ├ commands.jsonl       Docker command history
  └ runs/<runId>.log     Stored run logs

core/                   Reusable Node.js modules (headless, no Electron dependency)
  ├ agent/               Agent loop, tools, prompts, LLM provider wiring
  ├ docker/              Docker execution via allowlist (`CommandRunner.ts`)
  ├ setup/health         Setup checks + repair helpers
  └ ...                  File generation, error recovery, docs indexing, etc.

wiki/                   CFD knowledge base in markdown — no vector DB

tests/                  Stage-gated, never skip stages
  ├ stage0/              Docker + OpenFOAM environment
  ├ stage1/              File generation (no Docker)
  ├ stage2/              Mesh quality
  ├ stage3/              Solver execution
  ├ stage4/              Ghia benchmark physics validation
  └ stage5/              Conversation + recovery tests
```

## Data Flow — Generate (Happy Path)

Two execution paths depending on the configured provider:

```
Engineer types prompt (renderer)
        │
        ▼
POST /api/projects/:id/generate (SSE)
        ▼
demo/server.ts
        │
        ├─── provider == "claude-cli" ──────────────────────────────┐
        │    runClaudeAgent()                                        │
        │    spawns `claude` CLI process; parses tool-call JSON      │
        │                                                            │
        └─── API-key providers (anthropic/openai/google/…) ─────────┘
             runAgentLoop()  (Vercel AI SDK)
             tool-calling loop: list/read/write/edit/search/finish
        │
        ▼
core/agent/tools.ts  (list/read/write/edit case files, search docs)
        │
        ▼
demo/projects/<id>/case/ updated on disk
        │
        ▼
renderer refreshes file tree + opens/updates Monaco tabs
```

## Data Flow — Run + Recovery

```
Engineer clicks Run (renderer)
        │
        ▼
POST /api/projects/:id/run (SSE)
        ▼
demo/server.ts streams log + residuals + exit codes
        │
        ▼
core/docker/CommandRunner.ts runs allowlisted OpenFOAM commands in Docker
        │
        ▼
If FOAM error: core/agent/ErrorRecovery derives fixes → renderer shows approval gate
        │
        ▼
POST /api/projects/:id/apply-fix (then re-run stream)
```

## Hard Rules (from `CLAUDE.md`)

- `path.join()` always — never string concatenation for paths
- LF line endings for all OpenFOAM files (enforced in file writers)
- All Docker commands go through `core/docker/CommandRunner.ts` allowlist
- No raw shell access ever exposed to the agent
- Zero Electron imports in `core/`
- Tests are stage-gated — never build Stage N+1 until Stage N passes

## Key Interfaces

### Docker command allowlist

Only allowlisted OpenFOAM commands may be executed inside Docker.
See `core/docker/CommandRunner.ts` (`ALLOWED_DOCKER_COMMANDS`) for the canonical list.

Any other command must be rejected at the allowlist level, not by prompt instruction.

## Open Source Components

| Component     | License    | Purpose                                      |
|--------------|------------|----------------------------------------------|
| Monaco Editor | MIT        | Case file editor (renderer)                  |
| dockerode     | Apache 2.0 | Docker SDK for Node                          |
| Vercel AI SDK | MIT        | BYOK LLM providers + streaming tool-call loop |

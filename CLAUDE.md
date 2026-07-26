# OpenFOAM Studio

AI-powered desktop app. Engineers describe CFD simulations in plain English.
The app handles OpenFOAM setup, execution, error recovery, and results.

## Additional instructions
For wiki ingestion, maintenance, and linting workflow, also follow `WIKI_SCHEMA.md`.

## Current implementation (where the real code lives)
renderer/               Vite + React + TS frontend (Tailwind v4, shadcn/ui, Zustand, Monaco, vtk.js)
demo/server.ts          HTTP server on port 3456 — REST API + SSE streaming, serves renderer/dist/
demo/electron-main.cjs  Electron entry point — spawns server.ts as child process
demo/projects/<id>/     Persistence: meta.json + case/ + runs.jsonl + commands.jsonl + runs/<runId>.log
core/                   Reusable Node.js modules (AgentLoop, tools, DocsIndex, FileGenerator, CommandRunner, ErrorRecovery, health, llm, paths)
tests/                  Stage-gated, never skip stages
wiki/                   CFD knowledge base in markdown, no vector DB — shipped inside packaged builds
docs/openfoam-v13/      Optional scraped OpenFOAM 13 user guide (run `npm run scrape:docs` to populate)

## Stack
Electron shell + Vite + React + TypeScript renderer
Tailwind v4 (CSS-first) + shadcn/ui + lucide-react
Zustand stores, Monaco editor (`@monaco-editor/react`), vtk.js (`@kitware/vtk.js`) for Geometry tab
Vercel AI SDK (`ai` + `@ai-sdk/{anthropic,openai,google,openai-compatible}`) — BYOK, see `core/agent/llm.ts`
Falls back to `claude` CLI (uses Claude Code login, no API key needed)
OpenFOAM 13 (Foundation), image: microfluidica/openfoam:13 (override via OFS_OPENFOAM_IMAGE env)
dockerode (Docker SDK for Node)
Results tab: own legacy-VTK parser + engine in renderer/lib/vtk/ — React components never import vtk.js directly

## Dev / build
`npm run dev`           Vite dev server + Electron (OFS_DEV=1, proxies :5173)
`npm run build:renderer`  Build renderer to renderer/dist/
`npm run build:mac`     Package macOS app to dist/
`npm run build:win`     Package Windows app to dist/
Releases: CI builds both installers on push to main (.github/workflows/build-mac.yml →
tag `mac-latest`, build-windows.yml → tag `windows-latest`). Packaged app needs no
system Node — Electron's own Node runs the pre-bundled demo/server.compiled.js.
Anything the runtime reads from the repo (wiki/, docs/openfoam-v13/) must be listed in
electron-builder `files`, located via `resolveAppRoot()` from core/paths.ts (fixed
`../..` hops break once esbuild inlines core/** into demo/server.compiled.js), AND
present in both release workflows' `paths:` filters or that platform ships stale content.

## Key API surface (demo/server.ts)
GET  /api/projects                    list all projects
POST /api/projects                    create project → {id, name, status, createdAt}
GET  /api/projects/:id                get project meta
DELETE /api/projects/:id              delete project
GET  /api/projects/:id/files          list case files → [{relPath}]
GET  /api/projects/:id/file?path=     read file content
POST /api/projects/:id/generate       SSE — multi-turn generation (AI SDK agent loop for API-key providers; Claude Code CLI tool-loop for `claude-cli`); claude-cli + openai-compatible get a post-generation blockMesh/setFields/foamRun validation loop with auto-diagnosis + applyFixes (demo/server.ts validateGeneratedCase)
POST /api/projects/:id/run            SSE — Docker: blockMesh, [setFields if setFieldsDict], foamToVTK (mesh), foamRun, foamToVTK (all times → Results tab)
POST /api/projects/:id/postprocess    SSE — re-run foamToVTK on a solved case (body {fields?: string[]})
GET  /api/projects/:id/runs           run history (newest first) → RunRecord[]
GET  /api/projects/:id/runs/:runId/log  stored log text for a finished run
GET  /api/projects/:id/commands       command history (newest first, ?limit=N)
GET  /api/projects/:id/vtk/manifest   VTK files + time series {files, series} (core/postprocess/vtkSeries.ts)
GET  /api/projects/:id/vtk/file?path= stream a VTK file (path-guarded, binary)
POST /api/projects/:id/apply-fix      apply a FileFix, increment retryCount, re-run (SSE)
DELETE /api/projects/:id/messages     clear chat history
GET  /settings                        current BYOK provider + model + redacted key flags
POST /settings                        update provider, model, API key, customBaseURL
POST /settings/api-key                back-compat: set raw Anthropic key (old clients)

## Current stage: STAGES 0–5 COMPLETE

## Test commands (always in order, stop at first failure)
npm run test:stage0    # Docker + OpenFOAM environment (~5 min)
npm run test:stage1    # File generation, no Docker (~10 sec)
npm run test:stage2    # Mesh quality (~60 sec)
npm run test:stage3    # Solver execution (~3 min)
npm run test:stage4    # Ghia benchmark physics validation (~8 min)
npm run test:stage5    # Conversation + recovery tests
npm run test:agent     # Agent tools + DocsIndex unit tests (~1 sec, no LLM)
npm run test:postprocess # Results-tab VTK parser/surface/series unit tests (~1 sec, no Docker)
npm run test:unit      # All of tests/unit (agent + postprocess + paths + health + renderer), ~2 sec

## Stage 0 success definition
All 5 tests pass:
- Docker is running and image exists
- Container starts and responds
- blockMesh runs on tutorial cavity case (exit 0)
- foamRun exits 0 (no FOAM FATAL ERROR)
- Log files are readable from host via volume mount

## Feature tracking
Feature PRDs: docs/features/F01–F05
Live TODO: docs/TODO.md — update status at the start and end of every session,
and whenever a subtask or test changes state.
Agent paper trail: docs/AGENT_CHANGES.md — append an entry whenever a development
agent changes code or docs.

## Hard rules
- path.join() always, never string concatenation for paths
- LF line endings for all OpenFOAM files, enforced in file writer
- All Docker commands go through core/docker/CommandRunner.ts allowlist
- No raw shell access ever exposed to the agent
- CLAUDE.md stays under 100 lines
- **After every code or doc change: append to docs/AGENT_CHANGES.md AND update CLAUDE.md if anything it describes has changed. No exceptions.**

# OpenFOAM Studio

AI-powered desktop app. Engineers describe CFD simulations in plain English.
The app handles OpenFOAM setup, execution, error recovery, and results.

## Architecture (do not deviate from this)
core/                   Node.js only, zero Electron dependency, 100% testable headlessly
renderer/               React UI (Vite + TS). Runs in browser against demo server.
demo/server.ts          HTTP server + REST + SSE (port 3456), serves renderer/dist
demo/electron-main.cjs  Electron entry (spawns demo/server.ts)
tests/                  Stage-gated, never skip stages
wiki/                   CFD knowledge base in markdown, no vector DB
docker/                 OpenFOAM container config

## Stack
Electron + Vite + React + TypeScript + Vitest + Zustand
Vercel AI SDK BYOK (`ai` + `@ai-sdk/*`) with `claude` CLI fallback
OpenFOAM 13 (Foundation), image: microfluidica/openfoam:13
dockerode (Docker SDK for Node)

## Current stage: STAGES 0–5 COMPLETE
Stages 0–4 are validated by stage-gated tests. Stage 5 app functionality (conversational loop + error recovery) exists in the app/server path.

## Test commands (always in order, stop at first failure)
npm run test:stage0    # Docker + OpenFOAM environment (~5 min)
npm run test:stage1    # File generation, no Docker (~10 sec)
npm run test:stage2    # Mesh quality (~60 sec)
npm run test:stage3    # Solver execution (~3 min)
npm run test:stage4    # Ghia benchmark physics validation (~8 min)
npm run test:stage5    # Conversation + recovery tests

## Stage 0 success definition
All 5 tests pass:
- Docker is running and image exists
- Container starts and responds
- blockMesh runs on tutorial cavity case (exit 0)
- foamRun runs 10 iterations without FOAM FATAL ERROR
- Log files are readable from host via volume mount

## Hard rules
- path.join() always, never string concatenation for paths
- LF line endings for all OpenFOAM files, enforced in file writer
- All Docker commands go through core/docker/CommandRunner.ts allowlist
- No raw shell access ever exposed to the agent
- Development agents must append code/doc changes to docs/AGENT_CHANGES.md
- AGENTS.md stays under 100 lines

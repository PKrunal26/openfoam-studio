# Agent Tools — OpenFOAM Studio

> Read this before working on `core/agent/tools.ts`, `core/agent/AgentLoop.ts`, or `core/docker/CommandRunner.ts`.
> After changes, update this doc and `docs/AGENT_CHANGES.md`.

## Overview

There are two “agent engines” that drive generation:

- **AI SDK agent loop**: `core/agent/AgentLoop.ts` + tools in `core/agent/tools.ts` (for API-key providers via `core/agent/llm.ts`)
- **Claude Code CLI tool-loop**: `core/agent/ClaudeAgentRunner.ts` (for the `claude-cli` provider; uses the user’s local Claude Code login)

Both engines ultimately write files under a project’s case directory:

`demo/projects/<id>/case/<relPath>`

All Docker execution goes through the allowlist in `core/docker/CommandRunner.ts`.

## Hard rules

- `path.join()` always — never string concatenation for paths
- LF line endings for OpenFOAM files (normalize CRLF → LF on write)
- No raw host shell access is exposed to the model
- All Docker commands go through the `CommandRunner` allowlist

---

## Tool surface (AI SDK engine)

**File:** `core/agent/tools.ts`

Tools exposed to the model include:

- **Case file tools**
  - `list_case_files`
  - `read_case_file`
  - `write_case_file` (path-guarded, CRLF→LF normalization)
  - `edit_case_file` (string replace with uniqueness checks)
- **Docs tools**
  - `search_docs` / `read_doc` (backed by `core/agent/DocsIndex.ts` over `wiki/` and optional `docs/openfoam-v13/`)
- **Execution tool**
  - `run_command` (Docker-only; allowlisted; implemented via `core/docker/CommandRunner.ts`)
- **Completion tool**
  - `finish` (must not be called with an empty case directory)

**Tests:** `tests/unit/agent/tools.test.ts`, `tests/unit/agent/DocsIndex.test.ts`

---

## Docker allowlist

**File:** `core/docker/CommandRunner.ts`

All in-container commands must be allowlisted here. Anything not allowlisted is rejected before container execution.

---

## Server integration

**File:** `demo/server.ts`

- `POST /api/projects/:id/generate` streams agent events (SSE) and writes files under `case/`.
- `POST /api/projects/:id/run` executes `blockMesh`, `foamToVTK` (non-fatal), then `foamRun` in Docker and streams logs/residuals (SSE).
- `POST /api/projects/:id/apply-fix` applies `FileFix[]` mutations with path guards, increments retryCount, and re-runs.

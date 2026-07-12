# Contributing to OpenFOAM Studio

Thanks for your interest in contributing. This guide covers how to get the project
running, the rules the codebase enforces, and how to submit changes.

## Prerequisites

- **Node.js 22+** and npm
- **Docker** running locally (the solver runs inside the `microfluidica/openfoam:13` container)
- An LLM provider, either:
  - Your own API key (Anthropic, OpenAI, or Google), or a local model via an OpenAI-compatible endpoint (e.g. Ollama), set in Settings, or
  - The `claude` CLI on your PATH (used as a fallback, no API key needed)

## Getting started

```bash
git clone https://github.com/PKrunal26/openfoam-studio.git
cd openfoam-studio
npm install
cp .env.example .env   # optional: add an API key, or configure provider in-app
npm run dev            # Vite dev server + Electron
```

## Architecture rules (please do not deviate)

- `core/` is **pure Node.js with zero Electron dependency** and must stay headlessly testable. Never import Electron here.
- `renderer/` is the React UI. It talks to the local server over HTTP/SSE only.
- `demo/` is the runtime glue (Electron entry + local server on port 3456).
- Results-tab React components **never import vtk.js directly**. All vtk.js access goes through `renderer/lib/vtk/ResultsEngine.ts`.

## Hard rules (enforced)

- Use `path.join()` for all paths. Never string-concatenate paths.
- All OpenFOAM files are written with **LF line endings** (`\n`), enforced in the file writer.
- Every Docker command goes through the allowlist in `core/docker/CommandRunner.ts`. **No raw shell access is ever exposed to the agent.**
- Keep `CLAUDE.md` under 100 lines.

## Tests

Tests are **stage-gated**. Run them in order and stop at the first failure.

```bash
npm run test:stage0      # Docker + OpenFOAM environment (~5 min, needs Docker)
npm run test:stage1      # File generation (~10 sec)
npm run test:stage2      # Mesh quality (~60 sec)
npm run test:stage3      # Solver execution (~3 min)
npm run test:stage4      # Ghia benchmark physics validation (~8 min)
npm run test:stage5      # Conversation + recovery tests
npm run test:agent       # Agent tools + DocsIndex unit tests (~1 sec, no LLM)
npm run test:postprocess # Results-tab VTK parser unit tests (~1 sec, no Docker)
```

The fast suites (`test:agent`, `test:postprocess`) need neither Docker nor an LLM and are the
quickest way to check a change before pushing.

## Workflow expectations

- Update `docs/TODO.md` at the start and end of a work session, and whenever a subtask changes state.
- Append an entry to `docs/AGENT_CHANGES.md` for any code or doc change.
- If you change something `CLAUDE.md` describes, update `CLAUDE.md` too.

## Submitting changes

1. Fork the repo and create a branch. We use conventional prefixes, e.g. `feat/`, `fix/`, `docs/`, `chore/`.
2. Keep pull requests focused on a single change.
3. Use [Conventional Commits](https://www.conventionalcommits.org/) for messages, e.g. `fix(results): survive WebGL context loss`.
4. Make sure the relevant test stages pass. At minimum run `npm run test:agent` and `npm run typecheck:renderer`.
5. Open a PR against `main` and fill out the template.

## Reporting bugs and requesting features

Use the GitHub issue templates. For security issues, **do not open a public issue**, see [SECURITY.md](./SECURITY.md).

By contributing, you agree that your contributions are licensed under the [MIT License](./LICENSE).

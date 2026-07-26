# OpenFOAM Studio

**AI-powered OpenFOAM simulation studio — describe CFD simulations in plain English**

<br/>

OpenFOAM Studio is a cross-platform desktop application that brings the power of OpenFOAM CFD to engineers and researchers via an intuitive, AI-assisted interface. Simply describe the simulation you want, and OpenFOAM Studio takes care of setup, file generation, container orchestration, execution, error recovery, and results presentation.

---

## Features

- **Natural Language Simulation Setup**  
  Describe your CFD scenario in plain English—no need for manual file editing.

- **Automated OpenFOAM Execution**  
  All solver runs are performed inside a managed Docker container with live progress.

- **Integrated Error Handling**  
  Automatic diagnosis and recovery from OpenFOAM and Docker errors.

- **Physics Validation**  
  Built-in benchmarks (Ghia cavity, mesh quality, etc.) validate solver results.

- **Enforced Engineering Best Practices**  
  - LF line endings for OpenFOAM files
  - File system safety: all Docker commands go through a vetted runner
  - Zero raw shell access from the agent

---

<img width="2836" height="1862" alt="image" src="https://github.com/user-attachments/assets/98624e5f-b23f-46ad-9169-25d85f3d5d6a" />
<img width="2836" height="1862" alt="image" src="https://github.com/user-attachments/assets/10d2d2e9-0f62-4b1a-9d4c-b81007f854ae" />
<img width="2836" height="1862" alt="image" src="https://github.com/user-attachments/assets/4e5223f5-4de4-4cc6-ae62-a39d0785c14b" />
<img width="2836" height="1862" alt="image" src="https://github.com/user-attachments/assets/d2e62b6e-f9f0-41f9-906a-f7beac4b55a4" />
<img width="2836" height="1862" alt="image" src="https://github.com/user-attachments/assets/f00cb00f-d957-431c-a4d6-f49a3698b3ed" />




## Repository Architecture

```
core/                   # Node.js backend (no Electron), Docker orchestration, agent modules
renderer/               # Vite + React UI
demo/server.ts          # Local HTTP server (REST + SSE), serves renderer/dist
demo/electron-main.cjs  # Electron entry (spawns demo/server.ts)
tests/                  # Stage-gated end-to-end test suites
wiki/                   # Markdown knowledge base (no vector DB), shipped in the app
docs/                   # Feature specs, TODOs, agent logs
scripts/                # Build helpers (server bundle, postbuild, docs scraper)
plans/                  # Design notes kept for reference
```

- **Stack:** Electron + Vite + React + TypeScript + Vitest + Zustand  
- **OpenFOAM Version:** 13 (Foundation)  
- **Docker Image:** `microfluidica/openfoam:13`  
- **AI:** BYOK via Vercel AI SDK (`ai` + `@ai-sdk/*`) with `claude` CLI fallback

---

## Installing (Prebuilt Releases)

| Platform | Download |
|----------|----------|
| macOS (Apple Silicon + Intel, `.dmg`) | [mac-latest](https://github.com/PKrunal26/openfoam-studio/releases/tag/mac-latest) |
| Windows (x64, `.exe`) | [windows-latest](https://github.com/PKrunal26/openfoam-studio/releases/tag/windows-latest) |

Both tags are rolling builds of `main`, rebuilt by CI on every push. All
[releases](https://github.com/PKrunal26/openfoam-studio/releases) are listed here.

Nothing else to install: the app bundles its own Node runtime, so there is no
`npm install` step and no system Node requirement. **Docker must be installed and
running** — the solver executes inside an OpenFOAM container, and the app's setup
screen can start Docker and pull the image for you.

You will also need one AI provider: paste an API key in Settings (Anthropic,
OpenAI, Google, or any OpenAI-compatible endpoint including Ollama and LM Studio),
or install the [Claude Code CLI](https://github.com/anthropics/claude-code) and
run `claude login` to use its session with no key.

The binaries are **not code-signed**, so the OS will warn on first launch:

- **macOS** — right-click the app → **Open** (instead of double-clicking), then confirm.
  If it still refuses, clear the quarantine flag:
  ```bash
  xattr -dr com.apple.quarantine "/Applications/OpenFOAM Studio.app"
  ```
- **Windows** — on the SmartScreen prompt, click **More info → Run anyway**.

---

## Quick Start (from source)

1. **Install Docker**  
   Ensure Docker is running and the required image is available.

2. **Clone and Install**
   ```bash
   git clone https://github.com/PKrunal26/openfoam-studio.git
   cd openfoam-studio
   npm install
   ```

3. **Run Stage-Gated Tests**  
   Each stage must pass before proceeding:
   ```bash
   npm run test:stage0    # Docker + OpenFOAM check (~5 min)
   npm run test:stage1    # File generation checks
   npm run test:stage2    # Mesh quality validation
   npm run test:stage3    # Solver run validation
   npm run test:stage4    # Physics benchmark validation
   npm run test:stage5    # Conversation + recovery tests
   npm run test:agent     # Fast unit tests for agent tooling (~1s)
   ```

4. **Launch the App**
   ```bash
   npm run dev
   ```

---

## Results Visualization (CFD-Post-style viewer)

The **Results** tab renders solved cases in 3D (vtk.js/WebGL) with field coloring,
colormaps, a scalar bar, time animation, and a CFD-Post-style pipeline tree.

**Data flow:** `case dir → foamToVTK (Docker) → <case>/VTK/*.vtk → HTTP → parser → vtk.js`

1. After `foamRun` succeeds, the run pipeline executes
   `foamToVTK -ascii -useTimeName -fields '(U p k epsilon omega nut T)'` inside the
   OpenFOAM container. Every written time step is converted to legacy VTK under
   `<case>/VTK/` (`<case>_<time>.vtk` internal mesh + `<patch>/<patch>_<time>.vtk`
   boundaries). Fields a case does not have are skipped silently. Already-solved
   projects can be converted retroactively via `POST /api/projects/:id/postprocess`
   (the Results tab offers this as a one-click button).
2. `GET /api/projects/:id/vtk/manifest` walks `VTK/`, classifies each file
   (`core/postprocess/vtkSeries.ts`), and returns a time series: sorted time values
   plus the internal-mesh and per-patch file for each step.
3. The renderer fetches each step on demand, parses it with its own legacy-VTK
   parser (`renderer/lib/vtk/legacyVtkParser.ts` — vtk.js v35 ships no legacy
   unstructured-grid reader), extracts the external surface of the internal mesh
   (`surfaceExtract.ts`), and caches parsed steps so time scrubbing never re-reads
   from disk. All vtk.js rendering lives in `renderer/lib/vtk/ResultsEngine.ts`;
   React components never import vtk.js directly.

---

## Development & Contribution

- Follow modular separation:  
  - **core/** is pure Node.js—never import Electron.
  - **renderer/** is React UI; talks to the local server via HTTP/SSE.
  - **demo/** is the packaged runtime glue (Electron + local server).

- **Update Live TODO:**  
  Always update `docs/TODO.md` at the start/end of your session and when subtasks change state.

- **Agent Paper Trail:**  
  Log any repo changes in `docs/AGENT_CHANGES.md`.

- **File Writing Policy:**  
  - Always use Node's `path.join()`, not string concat.
  - Enforce LF (`\n`) line endings for all OpenFOAM files.

- **Docker Safety:**  
  Never run unvetted shell commands. Use only allowed methods via `core/docker/CommandRunner.ts`.

---

## Documentation & Reference

- **Feature Specs:** See `docs/features/`
- **Knowledge Base:** See `wiki/`
- **CHANGELOG & Agent:** See `docs/AGENT_CHANGES.md`

---

## License

MIT License

---

## Trademark Notice

This offering is not approved or endorsed by OpenCFD Limited, producer and distributor
of the OpenFOAM software via www.openfoam.com, and owner of the OPENFOAM and OpenCFD
trademarks.

---

**Questions?**  
Find answers or contribute in the [wiki](./wiki/) or raise a GitHub issue.

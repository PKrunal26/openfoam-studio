# OpenFOAM Studio

OpenFOAM Studio is an early desktop workspace for setting up and exploring OpenFOAM 13 simulations with AI assistance. Describe a supported flow problem, inspect the case files, run locally in Docker, and explore results. Bring your own AI provider.

This checkout is a launch candidate, not a certified engineering tool. The initial validation target is a laminar incompressible lid-driven cavity at Re=100. Other physics, providers, CAD workflows, and architectures require their own release evidence. Read [known limitations](docs/KNOWN_LIMITATIONS.md) before using results for decisions.

## Requirements and downloads

Docker must be installed, running, and able to download `microfluidica/openfoam:13`. Download size and disk usage vary by architecture and image version; check Docker Desktop storage and leave space for meshes, time directories, and VTK exports. The desktop app bundles Node; source development uses Node 22.

AI requires a provider API key, a configured compatible endpoint, or an authenticated Codex CLI (`codex login`) or Claude Code CLI (`claude auth login`). Choose either CLI in Settings → AI Provider. Codex with `gpt-6.1-sol` is the default for unconfigured installs; saved provider and model choices are preserved. Generation, questions, and error recovery use the selected provider without silently switching on failure. Settings includes an explicit connection test. A configured key is not proof of model access; model suggestions are not a CFD performance certification. Remote providers may charge for requests, including the small connection test.

[Published releases](https://github.com/PKrunal26/openfoam-studio/releases) include older rolling installers that do not necessarily contain this checkout's fixes. Use a versioned candidate and its checksum once validation and artifact smoke tests pass. Target artifacts are macOS ARM64, macOS Intel, and Windows x64. Windows ARM64 is excluded from the candidate matrix.

Installers currently have no verified signing/notarization evidence. Broad promotion is blocked until actual artifacts have been reviewed and installed on clean target machines. Do not remove operating-system protection blindly; verify the release origin and checksum first.

## First case

1. Start Docker and complete the setup checklist. Starting Docker and downloading the image are separate operations; setup repair can be cancelled.
2. Choose the AI provider/model and test its connection. Review [privacy and key storage](docs/PRIVACY.md).
3. Without dependencies, use inspect mode to open the bundled reference visualization. Its data demonstrates the viewer and is not a solver or benchmark certificate. For your own solve, create the supported cavity starter, inspect units, boundary conditions, viscosity, mesh, and time settings.
4. Save the reviewed files, then run. Mesh checks and solver completion are distinct from benchmark agreement or engineering accuracy.
5. Explore the results and keep the input/run identity with exports. Use Export in the project toolbar and Import project on the home screen to transfer a case, logs, and saved results. Back up projects before upgrading; see [support and backup guidance](docs/SUPPORT.md).

## Development

```sh
npm ci
npm run dev
```

Architecture remains headless Node in `core/`, React/Vite in `renderer/`, HTTP/SSE in `demo/server.ts`, and Electron in `demo/electron-main.cjs`. The markdown `wiki/` is bundled without a vector database. OpenFOAM 13 executes in Docker through the command runner.

Run stages in this order, stopping at the first failure:

```sh
npm run test:stage0
npm run test:stage1
npm run test:stage2
npm run test:stage3
npm run test:stage4
npm run test:stage5
npm run test:unit
npm run typecheck
npm run build:renderer
npm run build:server
node scripts/verify-package.mjs
```

Stage 1 and some subsequent suites call an AI provider; credentials and account access are required. CI does not silently skip stages when credentials are absent. Pull requests from forks cannot access repository validation secrets; maintainers must run the reviewed candidate in a trusted environment before promotion.

Build workflows produce candidate artifacts from a pinned commit only after ordered stages and checks pass. Publishing is a separate explicit manual promotion to a versioned prerelease. Existing versions are never deleted or overwritten. Signing credentials, clean-machine smoke tests, and release-environment protections require maintainer configuration; workflow files alone do not establish them.

Follow [AGENTS.md](AGENTS.md), preserve Node/Electron separation, use `path.join()`, enforce LF case files, and append changes to [the agent log](docs/AGENT_CHANGES.md).

## License and trademark

MIT. This offering is not approved or endorsed by OpenCFD Limited, producer and distributor of the OpenFOAM software via www.openfoam.com, and owner of the OPENFOAM and OpenCFD trademarks.

# OpenFOAM Studio: project lead launch review

**7 October 2026 · Current working tree at `35885e6` plus existing local changes · Version 1.0.3**

## Recommendation

**Hold the broad announcement. Prepare a bounded public alpha after the case-safety, execution, and distribution gates below pass.** The project has a useful foundation and substantial functionality. It is already more than a single-prompt file generator: it has a multi-turn tool loop, documentation retrieval, editable cases, live logs, recovery, residual charts, and a capable results viewer. A framework rewrite or simply selecting newer models would leave the most consequential problems unresolved.

The main gap is an enforceable product contract. A user must be able to trust that a question will preserve their case, the solver will use the inputs they see, Stop will end the operation, and a green status will have a precise engineering meaning. Those guarantees currently differ across providers and workflows.

The recommended initial audience is engineers, researchers, and students evaluating **a small set of demonstrated OpenFOAM 13 cases**. The present evidence does not support a general-purpose, production engineering accuracy claim. The first release should make its supported cases and experimental capabilities explicit.

## Evidence and limits

Three parallel source reviews covered UX, AI/CFD, and release/security. The lead reviewed the code, built the application, inspected the live setup/settings screens, walked through isolated visual fixtures, and reproduced a backend failure. No production code was changed for this review, no real project was edited, and no paid model request was made.

| Check | Result on this checkout | Interpretation |
| --- | --- | --- |
| `npm run test:stage0` | **Failed:** 8 passed, 2 failed, 5 environment tests blocked by suite setup | Docker answered, but `microfluidica/openfoam:13` was absent. The happy-path test consequently failed. The CLI-missing test also failed because provider-aware health checks no longer match its unconditional CLI expectation. |
| Stages 1–5 | **Not run** | Stopped at the first failed stage, as required. Historical completion is not a fresh certification of this checkout. |
| `npm run typecheck:renderer` | Passed | Renderer typecheck is healthy. |
| `npm run build:renderer` | Passed, with large-chunk warnings | Main JS is approximately 1.96 MB and Monaco chunk 3.63 MB before gzip. Build success does not establish runtime UX or physics correctness. |
| `npm run build:server` | Passed | Server bundle builds; esbuild bundling does not typecheck the backend. |
| `./node_modules/.bin/tsc --noEmit` | **Failed** | Root configuration has strict-type errors, browser alias/DOM configuration conflicts, and test typing errors. `demo/server.ts` is also absent from its include list. A clean core/server typecheck needs a deliberate configuration. |
| Live setup/settings | Inspected against the real isolated backend | Missing-image gate appears, and AI settings are now reachable from it. |
| Home/new project/results | Inspected using repository fixtures and a separate visual-only health proxy | Confirms layout and UI states, including rendering fixture VTK. **Does not prove generation, meshing, solving, recovery, or benchmark success.** |
| Manual backend probe | **Reproduced process exit** | `GET /api/projects/audit001/file?path=system` caused `EISDIR` and terminated Node. This was a disposable audit project. |
| Public releases | Read-only GitHub metadata checked | Both rolling release tags identify July 26 version 1.0.3, built from `35885e6`. The existing September setup/local-access changes remain uncommitted and therefore absent from these downloads. |

The local checks ran under Node 25.6.1; CI config selects Node 22. Packaged binaries, Windows installation, Intel Mac installation, credentialed providers, live solver runs, and hostile case execution were not tested during this audit.

**Evidence labels used below:** “live” means observed in this review; “source” means a concrete path/configuration was inspected; “risk” means a plausible failure whose runtime outcome still needs validation. Severity is a product decision: P0 blocks promotion, P1 blocks the intended supported launch journey, P2 is targeted polish or a capability that must be explicitly scoped out.

## What to preserve

- The prescribed architecture: headless Node core, React renderer, REST/SSE server, thin Electron wrapper, local Docker solver, and markdown knowledge base.
- Accessible, editable OpenFOAM files and the centralized Docker command runner. These support engineering inspection and make the product more credible than an opaque chat interface.
- Existing BYOK/provider adapters and AI SDK tool loop. The infrastructure is modern enough to improve incrementally.
- Persisted chat, command/run logs, diagnosis approval UI, residual plotting, and the VTK pipeline, probing, field comparison, screenshots, and filters.
- Recent bundle-safe knowledge-base resolution, bounded main health probes, backend shutdown work, and the current local Host/Origin checks. These are valuable fixes, but must reach the released artifact.

## FTUX: the current journey and the intended journey

| Moment | Current experience | Required launch behavior |
| --- | --- | --- |
| Discover/download | Broad “describe CFD in plain English” promise; unsigned rolling installers; Docker and AI setup described later | Name the alpha audience, supported physics, platform/architecture, Docker requirement, AI options, and benchmark scope before download. Publish one versioned candidate. |
| First open | A small prerequisite modal on a black screen replaces the whole app | Welcome with a concise product explanation, prerequisite checklist, and an option to inspect a bundled solved example while dependencies are unavailable. |
| Install/repair | Sequential failure screens; generic “Fix it for me”; image size/free-space requirements unspecified | Distinguish missing Docker from starting/hung Docker and backend failure. Use “Start Docker” / “Download OpenFOAM,” bounded progress, and cancel/retry. Report measured image/storage requirements. |
| Configure AI | Provider/model/key fields, but no actual connection test | Explain what data reaches the selected endpoint; test provider/model access; show key removal and supported capability mode. A configured value is not a working connection. |
| First project | Empty project list, name/prompt form, then “Editor surface” and “Open a case file” | Primary action: a guided cavity case. Secondary action: describe your own case. Show a simulation brief, assumptions, estimated scope, and the next action. |
| Generate | Three different provider workflows; initial prompt automatically starts work; project name changes with each message | Distinguish questions, clarification, new setup, and refinements. Preserve project identity and show assumptions and intended edits before consequential changes. |
| Review/run | Run is enabled even for a newly created empty project; unsaved edits can differ from disk | Show readiness checklist. Save and run a specific revision; require mesh-quality checks. Show phases and real completion/cancellation states. |
| Failure/recovery | Approval diffs exist, but mutations and Stop are unreliable | A validated, complete patch with expected old contents, rollback, explicit physics implications, and a cancellable re-run. |
| Results | Capable viewer, but dense layout and a single mutable output directory | Default to a useful result view with run/revision/time/field identity, units, convergence/validation status, and concise numerical interpretation. |
| Return/share | Projects and logs persist, but no robust revision/export/backup flow | Resume interrupted work explicitly; reopen exact prior results; export case plus run manifest and report; preserve projects across upgrades/uninstall. |

Live setup evidence: the displayed/copyable instruction is `$ Run: docker pull ...`; the `Run:` prose is copied as part of the command. Store executable instructions separately from explanatory copy. Source: [health.ts](/Users/krunal/Projects/openfoam-studio/core/health.ts:150), [SetupModal.tsx](/Users/krunal/Projects/openfoam-studio/renderer/components/setup/SetupModal.tsx:47).

![Real missing-image setup gate](/Users/krunal/Projects/openfoam-studio/docs/audit/2026-10-07/setup.jpg)

The first-project screen below was reached through a visual-only health proxy. The empty case still has an enabled Run action and placeholder editor copy.

![First project, visual fixture](/Users/krunal/Projects/openfoam-studio/docs/audit/2026-10-07/first-project.jpg)

## Prioritized fix register

### P0: promotion blockers

| ID | Finding, evidence, and confidence | Required outcome |
| --- | --- | --- |
| R01 | **Chat reset can erase a completed case.** Clear history empties `messages`; the next generation defines refinement from message count and recursively removes the case when that count is zero. Source: [history reset](/Users/krunal/Projects/openfoam-studio/demo/server.ts:1489), [continuity decision](/Users/krunal/Projects/openfoam-studio/demo/server.ts:301), [case removal](/Users/krunal/Projects/openfoam-studio/demo/server.ts:345). | Questions and chat reset preserve all inputs/results. Case identity/revision is independent of chat history. Any explicit replacement has a recoverable snapshot. |
| R02 | **The released app does not contain the current safety/setup fixes.** HEAD still has wildcard CORS; current local tree adds Host/Origin checks and reachable AI settings. Live release metadata pins HEAD. [Current request guard](/Users/krunal/Projects/openfoam-studio/demo/server.ts:1128), [mac release](https://github.com/PKrunal26/openfoam-studio/releases/tag/mac-latest), [Windows release](https://github.com/PKrunal26/openfoam-studio/releases/tag/windows-latest). | Reviewed fixes are committed, validated, built from one pinned revision, and proven in the actual downloadable installers. Announce that release. |
| R03 | **The CLI path does not enforce the advertised no-shell/case-only tool contract.** `--allowedTools` grants permission to named tools; it does not restrict available tools. The runner uses acceptEdits and inherits environment/customization without an enforced application path boundary. Source: [ClaudeAgentRunner.ts](/Users/krunal/Projects/openfoam-studio/core/agent/ClaudeAgentRunner.ts:136), [diagnostic runner](/Users/krunal/Projects/openfoam-studio/core/agent/claude-runner.ts:77). Configuration defect confirmed; exploit not attempted. | Both CLI paths have explicit tool/configuration/path restrictions, version detection, and negative tests. The SDK and CLI guarantee the same boundary. Current CLI offers restricted mode, but using it requires a supported-version check and compatibility verification. [Official CLI reference](https://code.claude.com/docs/en/cli-reference). |

### P1: supported-journey blockers

| ID | Finding and evidence | Required outcome |
| --- | --- | --- |
| R04 | **Run may use different inputs from the editor.** Dirty tabs close/navigation without protection; Run neither saves nor warns. AI and Parameters update disk without refreshing open buffers. A stale Save can overwrite a refinement; a save race can mark newly typed contents saved. Source: [editor store](/Users/krunal/Projects/openfoam-studio/renderer/store/useEditorStore.ts:79), [Run](/Users/krunal/Projects/openfoam-studio/renderer/App.tsx:79), [parameter write](/Users/krunal/Projects/openfoam-studio/renderer/components/editor/tabs/ParametersTab.tsx:140). | Save/discard/cancel on exit; Save and run; exact saved-buffer bookkeeping; file revision conflict checks; reload clean tabs and reconcile dirty ones. |
| R05 | **Compatible endpoints replace cases rather than refine them.** Every prompt generates eight fixed cavity files with no history/current case context, including remote tool-capable endpoints. [Provider branch](/Users/krunal/Projects/openfoam-studio/demo/server.ts:381), [generator](/Users/krunal/Projects/openfoam-studio/core/agent/FileGenerator.ts:172). Source. | Capability-based routing and a common intent/revision contract. Either support questions/refinements correctly or clearly expose a restricted cavity-generation mode. |
| R06 | **Stop and terminal states are inconsistent.** SDK abort reaches the model but not Docker tools; compatible calls are only cancellable between files; apply-fix/re-run has no AbortController. Generation transport errors leave `streaming` set. A recovery stream ending without a terminal event can be treated as success. [AgentLoop](/Users/krunal/Projects/openfoam-studio/core/agent/AgentLoop.ts:78), [Docker tool](/Users/krunal/Projects/openfoam-studio/core/agent/tools.ts:354), [re-run](/Users/krunal/Projects/openfoam-studio/renderer/store/useRunsStore.ts:141), [chat error](/Users/krunal/Projects/openfoam-studio/renderer/store/useChatStore.ts:258). Source. | One job ID/abort signal through model, tools, Docker, diagnosis, and repair; timeouts; authoritative terminal event; settle every error path; cancel and ignore late events on project change. |
| R07 | **Readiness and green tool steps can be false positives.** `withTracing` emits `ok:true` for command results with `ok:false`; generation always becomes ready, including failed/skipped validation and clarification-only output. [Tracing](/Users/krunal/Projects/openfoam-studio/core/agent/tools.ts:155), [command result](/Users/krunal/Projects/openfoam-studio/core/agent/tools.ts:383), [ready status](/Users/krunal/Projects/openfoam-studio/demo/server.ts:450). Source. | Distinct needs-information/draft/unvalidated/validation-failed/ready/completed states, set from deterministic backend records. Domain failure propagates into activity/history. |
| R08 | **Mesh/solver validation is inconsistent and cavity-specific.** Full runs and CLI/local validation omit enforced checkMesh. SDK foamRun requires `0/p` and single-phase physicalProperties while its prompt supports VoF `p_rgh`/phase files; SDK tools cannot initialize setFields. [Run pipeline](/Users/krunal/Projects/openfoam-studio/core/run/buildRunCommands.ts:24), [validation loop](/Users/krunal/Projects/openfoam-studio/demo/server.ts:929), [file guard](/Users/krunal/Projects/openfoam-studio/core/agent/tools.ts:338). Source. | One solver-aware sequence and deterministic mesh gate for every engine. Validate actual solver progress in an isolated copy; preserve original time directories and controlDict. |
| R09 | **Recovery may apply wrong or partial physics changes.** Pressure-reference fix targets SIMPLE despite current PIMPLE setup; unknown patch errors assume `0/U`/noSlip; phase fixes invent water/air defaults. Patch application is sequential, can overwrite a supposed new file, replace multiple matches, or report success for a no-op sentinel. Model diagnosis lacks full schema validation. [ErrorRecovery](/Users/krunal/Projects/openfoam-studio/core/agent/ErrorRecovery.ts:79), [applyFix](/Users/krunal/Projects/openfoam-studio/core/agent/applyFix.ts:28), [diagnosis parsing](/Users/krunal/Projects/openfoam-studio/demo/server.ts:1118). Source. | Solver/field/patch-aware diagnosis, complete relevant file context, typed patch schema, preflight all changes, unique matches, atomic application, rollback, and displayed physics assumptions. |
| R10 | **A read request can kill the backend.** Confirmed with directory path `system`: EISDIR escaped the async handler and Node exited. Nonstring settings values and filesystem errors expose similar source paths; request bodies have no size limit. [Handler](/Users/krunal/Projects/openfoam-studio/demo/server.ts:1128), [file read](/Users/krunal/Projects/openfoam-studio/demo/server.ts:1355), [body reader](/Users/krunal/Projects/openfoam-studio/demo/server.ts:256). Live/source. | Schemas, regular-file checks, bounded body reads, request error/abort handling, and a top-level exception boundary. Bad requests return 4xx; storage/backend failures remain actionable without process loss. |
| R11 | **Setup can pass invalid AI auth or hang in repair.** Any `.claude.json` can satisfy readiness for a different selected provider; file existence is treated as CLI auth. Repair awaits an unbounded ping inside its nominal timeout. Backend failures are reported as Docker failures. [Auth](/Users/krunal/Projects/openfoam-studio/core/health.ts:114), [repair](/Users/krunal/Projects/openfoam-studio/core/health.ts:214), [failure mapping](/Users/krunal/Projects/openfoam-studio/renderer/lib/healthLifecycle.ts:47). Source. | Selected-provider validation and connection test; separate backend/Docker/provider states; bound each probe and whole repair; explicit retry/cancel. |
| R12 | **Shipping bypasses the documented validation contract.** Installer workflows publish independently of CI/stage gates. CI checks renderer plus two unit subsets; it omits other unit suites and root/backend typecheck. Stage 5 primarily covers legacy FileGenerator/Reviewer rather than the production provider paths. [CI](/Users/krunal/Projects/openfoam-studio/.github/workflows/ci.yml:30), [mac build](/Users/krunal/Projects/openfoam-studio/.github/workflows/build-mac.yml:40), [stage 5](/Users/krunal/Projects/openfoam-studio/tests/stage5/conversation.test.ts:14). Source/remote metadata. | Ordered Stage 0–5 release evidence, all relevant unit suites, correct server/core typecheck, production-path integration coverage, required release checks, and platform artifact smoke tests. |
| R13 | **Data ownership/durability is inadequate.** Windows uninstall specifies `deleteAppDataOnUninstall:true` for the location containing projects. Metadata/config writes are non-atomic; no per-project mutation lock or backup/export flow was found. [Installer](/Users/krunal/Projects/openfoam-studio/electron-builder.win.json:33), [persistence](/Users/krunal/Projects/openfoam-studio/demo/server.ts:206), [config](/Users/krunal/Projects/openfoam-studio/core/setup/appConfig.ts:108). Configuration confirmed; installer/interrupt outcomes untested. | Preserve user data by default; atomic writes/recovery copies; serialized project mutations; export/import/backup; upgrade/uninstall/reinstall proof. |
| R14 | **Run history cannot reproduce the result.** Logs are per run, but inputs and `case/VTK` are mutable/shared. Selecting old runs opens logs rather than their original results. [Run record](/Users/krunal/Projects/openfoam-studio/demo/server.ts:164), [VTK route](/Users/krunal/Projects/openfoam-studio/demo/server.ts:1394), [history action](/Users/krunal/Projects/openfoam-studio/renderer/components/sidebar/RunsPanel.tsx:75). Source. | Immutable input snapshots and output manifests with case hash, run ID, solver/image digest, resolved model, settings, checks, and time/field units. At minimum, visibly invalidate stale results after input changes. |
| R15 | **Scientific confidence is overstated.** Runtime success is largely exit-zero plus a partial latest-field nan scan. Ghia comparison is a specific test suite, not an in-app certificate for arbitrary cases. [Runtime scan](/Users/krunal/Projects/openfoam-studio/demo/server.ts:868), [README claim](/Users/krunal/Projects/openfoam-studio/README.md:22), [benchmark](/Users/krunal/Projects/openfoam-studio/tests/stage4/physics.test.ts:31). Source. | Label run completed separately from numerical/physics checks. Publish precise benchmark applicability, expose assumptions, and implement finite-field/output/mesh/conservation checks for supported scenarios. |
| R16 | **Model catalog drift breaks some fresh-user paths.** Dropdown still offers shut-down `gemini-3-pro-preview`; default Gemini 2.5 access is restricted to prior active users. [Configured models](/Users/krunal/Projects/openfoam-studio/core/setup/appConfig.ts:34), [official Gemini catalog](https://ai.google.dev/gemini-api/docs/models). Source/provider docs. | Remove retired suggestions, test available defaults on fresh accounts, retain custom model IDs, and show actual connection/capability status. Choose replacements by CFD eval results. |
| R19 | **Late requests can replace the active project or file buffer.** Loads/callbacks lack consistent project+operation scoping; file tab IDs omit the project. Slow responses can write state after navigation. [Project store](/Users/krunal/Projects/openfoam-studio/renderer/store/useProjectStore.ts:20), [editor store](/Users/krunal/Projects/openfoam-studio/renderer/store/useEditorStore.ts:34). Source. | Cancel or reject stale responses, use project-scoped file IDs, and show explicit loading/not-found/retry states. Switching projects must never edit or display the wrong case. |

### P2: polish, hardening, and scope decisions

| ID | Gap | Action/evidence |
| --- | --- | --- |
| R17 | Unguided first success and misleading actions | Replace placeholder editor with brief/readiness/next action; disable empty-case Run; rename Generate, which currently only focuses chat. Preserve chosen project name instead of replacing it with every prompt. [App](/Users/krunal/Projects/openfoam-studio/renderer/App.tsx:69), [metadata](/Users/krunal/Projects/openfoam-studio/demo/server.ts:279). |
| R18 | Dense layout and incomplete accessibility | Label primary navigation; increase readable secondary text; collapse results controls; use keyboard-operable project cards and semantic tabs; manage modal focus and label inputs/sliders. [Cards](/Users/krunal/Projects/openfoam-studio/renderer/components/home/ProjectGrid.tsx:175), [tabs](/Users/krunal/Projects/openfoam-studio/renderer/components/editor/EditorTabs.tsx:34), [results layout](/Users/krunal/Projects/openfoam-studio/renderer/components/editor/tabs/results/ResultsTab.tsx:165). |
| R20 | Errors disappear or lack recovery | Show save failures, partial geometry, screenshot/conversion failures; add Retry and a redacted support bundle. Parameters needs typed values/units/bounds for supported scenarios. [Save](/Users/krunal/Projects/openfoam-studio/renderer/components/editor/tabs/CaseFileTab.tsx:24), [Parameters](/Users/krunal/Projects/openfoam-studio/renderer/components/editor/tabs/ParametersTab.tsx:197). |
| R21 | Local server identity and job cleanup | Authenticate privileged requests; verify identity/version before adopting a service on port 3456. Label/track containers, clean owned jobs on shutdown, reconcile interrupted runs at startup. Current cancellation observes request close; verify actual response/client disconnect behavior. [Adoption](/Users/krunal/Projects/openfoam-studio/demo/electron-main.cjs:184), [containers](/Users/krunal/Projects/openfoam-studio/core/docker/CommandRunner.ts:43). Risks need runtime coverage. |
| R22 | Key/privacy lifecycle | Use OS secret storage; support explicit key removal and clear live env state; disclose cloud prompt/file/log data flow and CLI transcript retention. Settings GET already redacts keys. [Config storage](/Users/krunal/Projects/openfoam-studio/core/setup/appConfig.ts:111), [key deletion](/Users/krunal/Projects/openfoam-studio/demo/server.ts:1252), [UI save](/Users/krunal/Projects/openfoam-studio/renderer/components/settings/SettingsModal.tsx:99). |
| R23 | Installer trust/reproducibility | Versioned immutable releases, checksums, clear architecture labels, signing/notarization for broad launch, changelog and update/rollback instructions. Unsigned distribution can be an explicit alpha limitation, but raises first-run abandonment. [Build signing](/Users/krunal/Projects/openfoam-studio/.github/workflows/build-mac.yml:54), [rolling tags](/Users/krunal/Projects/openfoam-studio/.github/workflows/build-windows.yml:57). |
| R24 | Packaging leaks/broken starter route | Explicitly exclude local `demo/projects` from broad demo globs. Empty-prompt fixture route depends on test fixtures that packaging does not include; ship a dedicated reviewed starter asset instead. Validate bundle contents. [Fixture path](/Users/krunal/Projects/openfoam-studio/demo/server.ts:44), [fixture load](/Users/krunal/Projects/openfoam-studio/demo/server.ts:325), [Windows files](/Users/krunal/Projects/openfoam-studio/electron-builder.win.json:6). |
| R25 | Maintenance, performance, and knowledge drift | Lazy-load heavy editor/results code; ship only needed workers/languages; measure startup and large VTK memory. Bound caches/compute, evaluate workers for heavy filters. Add correct core/server typecheck and a supported Node version. Remove stale agent-facing wiki claims and align pipeline docs with real tools/approvals. [Stale guide](/Users/krunal/Projects/openfoam-studio/wiki/openfoam-13-agent-guide.md:138), [root config](/Users/krunal/Projects/openfoam-studio/tsconfig.json:23). |

Some P2 items become P1 when their affected capability is advertised at launch: project preservation, cloud privacy disclosure, job cleanup, and access boundaries cannot be dismissed as cosmetic.

## Engineering confidence: make evidence visible

The Stage 4 benchmark uses one Re=100 cavity on a 20×20×1 mesh, with **0.15 absolute normalized velocity tolerance**, excludes near-wall benchmark points, and samples the cell-center line at normalized x=0.475 rather than the exact x=0.5 centerline. This is useful bounded validation evidence; it does not establish ±5% accuracy or general CFD correctness. Sources: [tolerance](/Users/krunal/Projects/openfoam-studio/tests/stage4/physics.test.ts:34), [wall filtering](/Users/krunal/Projects/openfoam-studio/tests/stage4/physics.test.ts:241), [sampling](/Users/krunal/Projects/openfoam-studio/core/postprocess/VelocitySampler.ts:101).

Use separate evidence states: **files generated → mesh checked → solver completed → numerical checks passed → applicable benchmark passed**. A transient simulation's residual behavior should not be treated identically to a steady simulation's convergence criterion. The last written time is simply the last written time; it is not automatically a converged solution.

For each supported case, persist the solver/module, physical assumptions, dimensions/units, boundary conditions, mesh counts/quality, time settings, residuals, finite-field checks, relevant conservation measures, and comparison methodology. Results should identify the exact input revision and actual time range, including any missing outputs or partial exports.

## Security: check the full execution boundary

The SDK's scoped file tools and command allowlist are a useful foundation. However, an allowed OpenFOAM executable can itself interpret case-supplied executable constructs. OpenFOAM 13 supports compiled dictionary code and system-call functionality. Arbitrary dictionaries plus a read-write mount, default network, and unconstrained container execution therefore need a case-policy and isolation review. **No malicious case was run and the absent image prevented inspecting its effective settings.** Sources: [codeStream API](https://cpp.openfoam.org/v13/classFoam_1_1functionEntries_1_1codeStream.html), [systemCall implementation](https://cpp.openfoam.org/v13/systemCall_8C_source.html), [container creation](/Users/krunal/Projects/openfoam-studio/core/docker/CommandRunner.ts:43).

Before promotion, inspect and pin the actual image digest/UID/settings, define supported executable dictionary/library behavior, restrict network and resources where appropriate, and prove the policy with negative cases. Apply the same guarantees to CLI generation, direct SDK generation, manual file writes, and recovery. Do not repeat the blanket “zero raw shell access” guarantee until it is enforced across all paths.

## AI modernization that improves this product

The useful advance is a **common, typed engineering workflow**: classify intent, build/clarify a simulation specification, plan minimal edits, apply a revision, run deterministic validation, and explain measured results. The LLM proposes; the backend owns state, validation, resource budgets, and transaction boundaries.

| Opportunity | Product value | Implementation direction |
| --- | --- | --- |
| Structured simulation brief | Users see missing information and assumptions before files change | Typed solver/physics/units/geometry/BC spec with required fields; ask only for material missing facts. |
| Structured diagnosis and patch plan | Reliable, reviewable recovery | AI SDK structured output plus strict schema, expected old revision/content, atomic patch preflight, and rollback. [Structured output documentation](https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data). |
| Provider capability contract | Consistent behavior with hosted and local models | Test tool use/structured output/context support; use a safe constrained fallback. Do not equate an OpenAI-compatible URL with a weak cavity-only model. |
| Bounded operations | Stop actually ends token/compute spend | Propagate abort signals, total/step timeouts, token totals and budgets, and configurable limits through every operation. The installed stack already supports these building blocks. [Cancellation documentation](https://ai-sdk.dev/docs/advanced/stopping-streams). |
| Numeric results assistant | Answers grounded in actual simulation data | Tools for field statistics, probes, pressure/flow integrals, residuals, and benchmark comparisons, with run/source references. Visual interpretation supplements numeric checks. |
| Revision comparison and parameter sweeps | A useful engineering workflow beyond a demo | Immutable runs first; then controlled changes/sweeps with comparable metrics and resource estimates. |

Model selection should follow a CFD eval set: canonical cavity, channel/step, supported multiphase/turbulence cases, ambiguous request, explanation-only question, minimal refinement, invalid mesh, recovery, malicious/out-of-scope file request, Stop, provider failure, and budget exhaustion. Measure first-pass runnable rate, physics checks, unintended changes, repair effectiveness, latency, and tokens/cost. Tool success and attractive pictures are insufficient metrics.

Provider checks during this review show a concrete Gemini lifecycle problem (R16), while the shipped Anthropic IDs are listed Active and OpenAI GPT-5.2 remains documented. A newer catalog entry alone is not evidence that it performs better on this app. Preserve custom IDs, verify account access, and benchmark before changing defaults. [Anthropic lifecycle](https://platform.claude.com/docs/en/about-claude/model-deprecations), [OpenAI model documentation](https://developers.openai.com/api/docs/models/gpt-5.2).

Defer additional agent orchestration, voice, autonomous web/computer control, vector databases, and broad CAD promises until the supported core journey works reliably. The prescribed architecture can accommodate the recommended improvements.

## Visual polish and usability

The restrained dark workbench is a coherent starting point. The strongest improvement is task hierarchy, not decorative restyling. Keep the technical density available to experts while making the default first project legible and purposeful.

- A welcome/brief surface should replace “Editor surface.” Use the user's simulation question, assumptions, readiness checklist, and next action as the center of attention.
- Show labeled Setup/Mesh/Run/Results navigation; keep Files/Commands as expert tools. Make Assistant opening distinct from generation/execution.
- At 1280×800, the results viewport is squeezed between file browser, pipeline, properties, and chat. Entering Results should prioritize the visualization, with collapsible inspectors and assistant.
- Give measurements/units and scientific state prominence; improve secondary text size and contrast. Add keyboard access, focus management, and accessible status announcements.
- Replace fragile confirmations/time-limited delete buttons with a clear, recoverable data lifecycle. Use actionable error states and consistent progress/terminal states.
- The fixture at t=10 s shows “Only the initial time is converted” because there is only one time step. One time step does not establish that it is the initial time; use factual copy derived from the manifest.

The screenshot below is a **repository data fixture rendered at laptop size**, not a successful run performed in this review.

![Results viewer at 1280×800, visual fixture](/Users/krunal/Projects/openfoam-studio/docs/audit/2026-10-07/results-laptop-fixture.jpg)

## Delivery plan

Recommended initial release matrix below is a **target for validation**, not a statement that these journeys passed this audit. Use this scope for work packages and release gates; broaden it only with matching evidence.

| Dimension | Initial supported target | Additional scope |
| --- | --- | --- |
| Platforms | macOS ARM64, macOS Intel, Windows x64: actual downloadable artifacts on clean machines | Windows ARM64 and other platforms remain excluded until an artifact and full smoke-test evidence exist. |
| AI modes | Restricted Claude CLI and one direct API path, preferably Anthropic for the first candidate | OpenAI, Google, and compatible/local modes become supported only after the same question/refinement/validation/Stop checks pass. Hidden or explicitly experimental modes must not carry the general support claim. |
| Physics/cases | Documented laminar incompressible cavity at Re=100, with benchmark method and controlled mesh refinement | Channel/backward-step, heated, turbulent, and VoF examples require their own generation, mesh, full-solve, recovery, and applicable physics evidence before promotion. |
| Workflows | New case, explanation-only turn, minimal refinement, save/run, supported recovery, Stop, reopen, results identity, reproducible export | CAD import, broad solver coverage, automated optimization, and sweeps stay outside the first release promise. |

Assign responsibility by workstream rather than treating this as a styling pass. Effort sizes are relative: S = localized change, M = several coordinated modules, L = a workflow spanning UI/backend/tests. Calendar estimates should follow a green Stage 0 and confirmed staffing.

| Order | Work package / suggested owner | Scope | Completion evidence |
| --- | --- | --- | --- |
| 1 | Case safety / core + renderer | R01, R04, R19, transactional part of R09, mutation locking from R13 · **L** | Chat reset/question preserves cases; manual/AI conflicts are visible; Save and run uses an exact revision; failed multi-file patch changes nothing; project switching ignores late responses. |
| 2 | Execution contract / backend + AI | R05–R11, R03, resource/security policy · **L** | Consistent provider intent and readiness; enforced mesh checks; no false green failures; cancellation stops provider and Docker; malformed requests cannot kill backend. |
| 3 | Release proof / release + QA | R02, R12, uninstall preservation, starter assets · **M/L** | Ordered stages pass on the candidate; production paths and artifact contents verified; both platforms install/resume/reinstall against one commit. |
| 4 | Guided first success / product + renderer | FTUX, R17–R20, provider test and disclosure · **M** | New users complete the supported cavity walkthrough without developer coaching; errors give a next action; keyboard flow works. |
| 5 | Results confidence / CFD + backend + renderer | R14–R15, support/export, numeric explanation · **L** | Results identify exact inputs and validation scope; stale output is flagged; a reproducible case/run bundle exports. |
| 6 | Broader alpha polish / release + renderer | R21–R25 and measured performance · **M** | Signed or explicitly limited alpha distribution, reliable cleanup, privacy/key lifecycle, usable laptop layout, startup/memory measurements. |

Packages 1–3 can proceed in parallel at clearly owned boundaries; FTUX work can start alongside them. Broader physics/CAD/sweep features come after this launch contract. A limited alpha may explicitly exclude unvalidated providers/physics. An announcement saying all providers and all examples work requires corresponding proof.

## Launch acceptance gates

1. **Safety:** a question, chat reset, failed recovery, Stop, navigation, and restart preserve the correct case. Negative tool/path/case-policy checks pass. User data survives uninstall/reinstall unless deletion is explicitly requested.
2. **Ordered validation:** repair the environment and configuration-dependent Stage 0 tests, then run Stage 0 → 1 → 2 → 3 → 4 → 5, stopping at failure. Run relevant unit suites and core/server/renderer typechecks on the same candidate revision. Add production-path coverage without replacing these gates.
3. **Supported first success:** every advertised provider/mode completes the documented starter journey, explanation-only turn, and minimal refinement. Fresh credentials/model access are verified. Every displayed example either has release evidence or is labeled experimental.
4. **Failure recovery:** invalid/expired credentials, 429/endpoint failure, Docker stopped/hung, missing image, invalid mesh, solver error, disk-full/save failure, network loss, and cancellation produce accurate terminal states and actionable recovery. No false ready/success badge.
5. **Artifact proof:** install the actual mac ARM64, mac Intel, and advertised Windows architecture artifacts on clean machines; check knowledge-base assets, startup/quit/relaunch, updater/reinstall data preservation, settings, generation, solve, and results. A source build is not a substitute.
6. **Usability:** observe at least five representative first-time users. Suggested target: four complete the supported first success without developer intervention after dependencies are available; all can identify assumptions, validation scope, and where results came from. Measure setup abandonment separately from workflow completion.
7. **Communication:** versioned release/changelog, exact prerequisites, supported-case/provider matrix, honest benchmark methods/results, cloud/local data-flow disclosure, known limitations, support channel, and a reproducible launch demo match the candidate.

## Announcement position

Use this after the gates pass:

> OpenFOAM Studio is an early desktop workspace for setting up and exploring OpenFOAM 13 simulations with AI assistance. Describe a supported flow problem, inspect the generated case, run it locally in Docker, and explore the results. Bring your own AI provider. The release documents its tested scenarios, assumptions, and validation limits.

Avoid “any CFD problem,” blanket engineering-accuracy claims, “everything stays local” for cloud AI modes, guaranteed autonomous error recovery, and “built-in benchmark validation” until that validation is actually available in the app. Lead the demo with a fresh install and supported cavity, then show an explanation, a controlled mesh refinement, a recoverable failure, and a result tied to its inputs.

The next milestone should be **a reproducible, safe first successful simulation in the released artifact**. That is the strongest foundation for announcing the project broadly.

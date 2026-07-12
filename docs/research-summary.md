# CFD-LLM Research Summary

Sources: Foam-Agent 2.0 (arXiv 2509.18178), ChatCFD (arXiv 2506.02019),
MetaOpenFOAM (arXiv 2407.21320), CFDLLMBench (arXiv 2509.20374)

---

## 1. The 4-Role Agent Pipeline

All four systems converge on the same conceptual pipeline: **Plan → Generate → Execute → Review**.

| Role | MetaOpenFOAM | Foam-Agent 2.0 | ChatCFD |
|------|-------------|----------------|---------|
| **Planner / Architect** | Architect | Architect Agent | Stage 1: User Input Processing |
| **Generator** | InputWriter | Input Writer Agent + Meshing Agent | Stage 2: Case File Generation |
| **Executor** | Runner | Runner Agent | Stage 3 (execution sub-module) |
| **Reviewer** | Reviewer | Reviewer Agent | Stage 3: Error Locator + Correction + Reflection |

### Role descriptions (Foam-Agent 2.0 — most complete)

1. **Architect Agent** — Classifies simulation domain, queries hierarchical RAG indices, builds an explicit dependency DAG of required files `P = {F₁, F₂, ..., Fₙ}`.
2. **Meshing Agent** — Generates `blockMeshDict`/`snappyHexMeshDict`, converts external `.msh` files, or creates new geometries via Gmsh. This was absent from MetaOpenFOAM.
3. **Input Writer Agent** — Generates config files in dependency order (`system/ → constant/ → 0/`). Each file Fᵢ is generated with full context Cᵢ that includes all previously generated files (Contextual Generation). Formalised as a DAG G=(V,E).
4. **Runner Agent** — Executes simulation, performs pattern-matching error detection: `E: L → {e₁, e₂, ..., eₘ}`.
5. **Reviewer Agent** — Maintains correction history `H = {(Fⁱ, Eⁱ)}`, generates minimal file patches `ΔF`, iterates up to a user-specified max.
6. **Visualization Agent** — Post-simulation: generates PyVista/ParaView Python scripts with its own mini review loop.

### ChatCFD additions

ChatCFD adds a **Reflection Module** that activates on persistent errors: stores structured reflection blocks so the agent does not repeat the same failed fix. It also adds a **Physics Interpreter** post-processor that achieves 97.4% fidelity in natural-language description of simulation results.

---

## 2. Why Dependency-Aware File Generation Matters

OpenFOAM cases require 6–7 interdependent configuration files (300–600 lines total). The dependency graph is:

```
controlDict (solver, time params)
    └── physicalProperties / transportProperties (viscosity, density)
            └── turbulenceProperties (model type)
                    └── 0/ field files (which files depend on turbulence model)
                            └── boundary names come from blockMeshDict
                                    └── all 0/ BCs reference those patch names
```

**Key coupling points:**
- `blockMeshDict` defines patch names (e.g. "inlet", "outlet", "wall") that every `0/` file must reference exactly
- `turbulenceProperties` determines *which* field files are required (`k-epsilon` needs `0/k`, `0/epsilon`, `0/nut`; `k-omega SST` needs `0/k`, `0/omega`, `0/nut`)
- Pressure `p` has different physical dimensions (`m²/s²` vs `Pa`) between incompressible and compressible cases — all downstream files must be consistent

**Evidence from ablation data (Foam-Agent 2.0, Table 3):**

| Config | Success Rate |
|--------|-------------|
| No Reviewer, No Dependency (T=0.0) | 48.2% |
| No Reviewer, With Dependency (T=0.0) | **56.4%** (+8.2pp) |
| With Reviewer, No Dependency | 86.4% |
| With Reviewer, With Dependency | 88.2% |

Without ordering, the Reviewer must make significantly more correction loops to compensate for cross-file inconsistencies that would have been avoided. Average loops rise from 0.79 → 1.87 when dependency ordering is removed.

**ChatCFD:** Removing `db1` (File Dependency and Structure DB) drops accuracy from ~82% to 73% (-9pp).

---

## 3. The Reviewer Agent: Single Most Important Component

### MetaOpenFOAM ablation (Table 2)

| Configuration | pass@1 | Executability |
|--------------|--------|---------------|
| Full system | **85%** | 3.6 |
| Remove Reviewer | 27.5% | 1.7 |
| Remove RAG | 0% | 0.8 |

Removing the Reviewer collapses pass@1 by **57.5 percentage points** (from 85% to 27.5%). The paper states: "without the Reviewer role, MetaOpenFOAM cannot handle CFD simulation tasks with moderate complexity."

### Foam-Agent 2.0 ablation (Table 3)

| Configuration | Success Rate |
|--------------|-------------|
| No Reviewer, No Dependency | 48.2% |
| No Reviewer, With Dependency | 56.4% |
| **With Reviewer, No Dependency** | **86.4%** |
| With Reviewer, With Dependency | 88.2% |

The Reviewer provides a **~30 percentage point lift** beyond what dependency ordering alone achieves. The paper: "the inclusion of the reviewer node is the **most significant factor** for performance."

### CFDLLMBench ablation (Table 2, FoamBench Basic, Foam-Agent)

| Config | Mₑₓₑ꜀ | Success Rate |
|--------|--------|-------------|
| RAG + Reviewer | 0.836 | **0.336** |
| RAG + No Reviewer | 0.373 | 0.200 |
| No RAG + Reviewer | 0.473 | 0.245 |
| Zero-shot | ~0.064 | ~0.045 |

### What the Reviewer catches that other agents miss

- **Cross-file inconsistencies**: A file is syntactically valid but references a patch name that doesn't exist in the mesh
- **Dimensional mismatches**: `p` or `alphat` with wrong physical dimensions (don't cause syntax errors but break physics)
- **Missing required files**: Turbulence model requires `0/nut` that wasn't included in the initial file plan
- **Keyword errors**: Incorrect OpenFOAM keywords that cause solver failure but aren't predictable from the LLM's prior knowledge
- **Physical coupling errors**: Pressure-density interactions in compressible flows requiring reading multiple files simultaneously

---

## 4. CFDLLMBench FoamBench: Metrics and Scores to Beat

### FoamBench composition

- **Basic**: 110 cases from 11 OpenFOAM tutorials, systematic boundary condition and parameter variations
- **Advanced**: 16 expert-crafted cases requiring autonomous turbulence model selection, novel geometry, mesh generation

### The 5 metrics

| Metric | Symbol | Description |
|--------|--------|-------------|
| Executability | Mₑₓₑ꜀ | Binary: 1 if OpenFOAM runs without crashing |
| Folder/File Structure | Mₛₜᵣᵤ꜀ₜ | ROUGE similarity of directory structure vs reference |
| File Content | Mf ᵢₗₑ | ROUGE similarity of file contents vs reference |
| Physical Accuracy | M_NMSE | Normalised MSE of numerical output vs reference solution |
| **Success Rate** | — | **Fraction where Mₑₓₑ꜀ = 1 AND M_NMSE = 1 (the headline number)** |

### Best current scores (Foam-Agent + Claude Sonnet 3.5)

| Split | Mₑₓₑ꜀ | Mₛₜᵣᵤ꜀ₜ | Mf ᵢₗₑ | M_NMSE | Success Rate |
|-------|--------|---------|--------|--------|-------------|
| FoamBench Basic | 0.836 | 0.879 | 0.778 | 0.427 | **0.336** |
| FoamBench Advanced | 0.625 | 0.792 | 0.621 | 0.406 | **0.250** |

**Zero-shot baseline (Sonnet 3.5, no agent framework):**

| Split | Success Rate |
|-------|-------------|
| Basic | 0.045 |
| Advanced | 0.007 |

### Scores to beat

| Target | FoamBench Basic | FoamBench Advanced |
|--------|----------------|-------------------|
| State-of-the-art (SOTA) | 33.6% | 25.0% |
| Goal for OpenFOAM Studio | > 40% | > 30% |

Note: Claude Sonnet 3.5 is the best backbone model for FoamBench (better than GPT-4o, o3-mini, Gemini 2.5 Flash). Using `claude-sonnet-4-6` should provide a meaningful head start.

---

## 5. The Physical Fidelity Gap

The most critical finding across all four papers: **execution success ≠ physical correctness**.

### ChatCFD measurements

| Metric | Value |
|--------|-------|
| Execution success rate | 82.1% |
| Physical fidelity (phy) — runnable AND physically correct | **68.12%** |
| Gap | ~14pp → ~17% of simulations that run are physically wrong |

Root causes of physical failures in runnable simulations:
- **Incorrect BCs / initial fields in multiphase flows** (~60% of physical failures). These "rarely trigger convergence failures, allowing apparent success that misleads agents."
- **Omissions in `setFieldsDict`** — evade the Reviewer because missing dict entries don't produce syntax errors
- **Numerical scheme misconfigurations** — incorrect flux discretization, time integration, boundary treatment

### CFDLLMBench measurements (starkest numbers)

For Foam-Agent + Sonnet 3.5, FoamBench Basic:

| Metric | Value |
|--------|-------|
| Execution success (Mₑₓₑ꜀) | 83.6% |
| Physical accuracy (M_NMSE) | 42.7% |
| Success Rate (both correct) | 33.6% |

**Implication: of the 83.6% of cases that execute, only ~40% are physically correct. Approximately 60% of cases that execute produce physically wrong results.**

The paper attributes this to LLMs "failing to fully understand the prompts and lack domain-specific reasoning required to correctly apply fundamental CFD concepts — such as flux discretization schemes, appropriate time integration strategies, and consistent boundary treatments."

### The narrator vs. implementer gap (ChatCFD)

ChatCFD's Physics Interpreter achieves **97.4% fidelity** in natural-language narration of correct physics. But the physical fidelity of executed cases is only **68.12%** — a **29 percentage point gap**. The insight: LLMs can describe the right physics in words far better than they can implement it in executable code. A `"2-D flow around a cylinder at Re=100"` description is trivially correct; the OpenFOAM implementation requires dozens of tightly interdependent settings (inlet velocity profile, turbulence suppression, kinematic viscosity, blockage ratio, spanwise BCs, etc.).

---

## Implications for OpenFOAM Studio

1. **Use the 4-role pipeline**: Architect → (Meshing +) Input Writer → Runner → Reviewer. Do not skip the Reviewer — it provides the single largest performance lift.
2. **Implement dependency-ordered file generation** as a DAG from day one. The `system/ → constant/ → 0/` ordering is mandatory.
3. **Physical fidelity validation requires more than just checking if the sim ran**. The Reviewer must check dimensional consistency, patch name consistency, and physical parameter appropriateness — not just OpenFOAM syntax.
4. **Target**: Beat 33.6% Success Rate on FoamBench Basic using `claude-sonnet-4-6`. The physical accuracy gap (Mₑₓₑ꜀ 83.6% → Success Rate 33.6%) is the primary frontier.
5. **Knowledge base matters**: ChatCFD's structured JSON databases (file dependency, BC types, parameter dimensions, solver templates) outperform pure RAG. Build `wiki/` as structured markdown that can later be compiled into these DB categories.

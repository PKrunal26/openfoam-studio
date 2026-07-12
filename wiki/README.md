# OpenFOAM Studio Knowledge Base

This wiki is the working knowledge base for OpenFOAM Studio.
It is written for AI agents and human contributors who need to move from
project context to correct OpenFOAM 13 behavior quickly.

## Read this first

1. `vision.md`
2. `openfoam-13-agent-guide.md`
3. `cases/case-structure.md`
4. `cases/file-inventory.md`
5. `solvers/solver-selection.md`
6. `solvers/incompressibleFluid.md`
7. `cases/lid-driven-cavity.md`
8. `errors/reviewer-checklist.md`
9. `errors/common-failures.md`

## What the current code actually uses

The repo is currently centered on a single validated path:

- OpenFOAM version: 13 Foundation
- Canonical source image: `microfluidica/openfoam:13`
- Runtime image: `microfluidica/openfoam:13`
- Main runner: `foamRun`
- Main solver module: `incompressibleFluid`
- Mesh tool: `blockMesh`
- Mesh validator: `checkMesh`
- Post-processing path in tests: read final `U` file directly
- Canonical case: 2D lid-driven cavity at `Re=100`

## Agent change tracking

Cross-agent repo changes are tracked in `docs/AGENT_CHANGES.md`.
Wiki-specific maintenance remains append-only in `wiki/log.md`.

That means the first AI goal is not "support all of OpenFOAM".
It is "be extremely reliable for the cavity-style incompressible single-phase flow path,
then generalize carefully."

## Scope discipline

When adding support, preserve this order:

1. Single-region cases
2. `foamRun` + one solver module
3. Structured meshes from `blockMesh`
4. Laminar incompressible cases
5. Then turbulent incompressible cases
6. Then imported meshes, multiphase, compressible, and multi-region cases

## Primary references

- OpenFOAM v13 User Guide: https://doc.cfd.direct/openfoam/user-guide-v13
- OpenFOAM Foundation v13 install page: https://openfoam.org/download/13-ubuntu/
- OpenFOAM Foundation v13 release notes: https://openfoam.org/release/13/

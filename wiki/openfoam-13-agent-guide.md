# OpenFOAM 13 Agent Guide

This is the fastest breadth-first guide for any AI working on OpenFOAM Studio.
It focuses on what is true in the codebase now, what is true in OpenFOAM 13,
and what mistakes are most likely to break the product.

## 1. Repo truth before theory

Current implementation and tests are built around:

- `foamRun`, not legacy solver binaries, as the primary execution path
- the `incompressibleFluid` solver module
- `blockMesh` for mesh generation
- `checkMesh` for mesh validation
- a 2D cavity case with a single hexahedral block and `20x20x1` cells
- field files `0/U` and `0/p`
- `constant/physicalProperties`
- `constant/momentumTransport`
- `system/controlDict`, `fvSchemes`, `fvSolution`, `blockMeshDict`

If an agent assumes older OpenFOAM naming, it will generate the wrong files.

## 2. The most important OpenFOAM 13 version facts

OpenFOAM Foundation v13 uses modular solvers.
That means:

- `foamRun` loads a solver module
- the module can be declared in `system/controlDict`
- the current repo uses `solver incompressibleFluid;`

For this repo, the most important naming changes versus older tutorials are:

- use `foamRun`, not `icoFoam`, as the main path
- use `constant/physicalProperties`, not `constant/transportProperties`
- use `constant/momentumTransport`, not `constant/turbulenceProperties`
- use a `PIMPLE` block in `fvSolution` for `incompressibleFluid`

## 3. Minimum valid case mental model

Every OpenFOAM case has three main zones:

- `system/`: run control, numerics, linear solvers, algorithms
- `constant/`: mesh and physical/model settings
- `0/`: initial fields and boundary conditions

For OpenFOAM Studio, think in this dependency order:

1. Pick the solver module
2. Choose the physical regime
3. Decide which fields are required
4. Build the mesh and patch names
5. Generate field files that match those patch names exactly
6. Run `blockMesh`
7. Run `checkMesh`
8. Run `foamRun`
9. Review logs and outputs

## 4. Dependency rules the agent must never violate

### Patch names are source-of-truth from the mesh

`blockMeshDict` defines patch names.
Every field file under `0/` must contain a boundary entry for every patch.
If the mesh says `movingWall`, the field files must also say `movingWall`.

### Solver choice determines required files

For the current path:

- `foamRun` + `incompressibleFluid`
- laminar cavity
- required fields are `U` and `p`

If the agent switches to RAS turbulence later, extra fields are usually required,
for example `k`, `epsilon`, `omega`, or `nut` depending on the model.
That is why solver selection must happen before field planning.

### Pressure in closed incompressible systems is relative

In a closed incompressible case like cavity, pressure usually needs reference
settings in `fvSolution`, e.g. `pRefCell` and `pRefValue`.
Without that, the pressure system can be singular.

## 5. Practical execution model for OpenFOAM Studio

The future product should reason in this loop:

1. Parse user intent into a structured case plan
2. Select solver family and case template
3. Generate files in dependency order
4. Validate statically before running
5. Run mesh generation
6. Validate mesh quality
7. Run solver
8. Distinguish:
   - syntax/config errors
   - numerical instability
   - physically wrong but numerically stable outputs
9. Apply the smallest safe fix
10. Re-run

## 6. Static validation the agent should do before Docker

- Required files exist
- File names match OpenFOAM 13 conventions
- Every file has a `FoamFile` header
- No CRLF endings
- `controlDict` contains `application foamRun;` and a valid `solver`
- `momentumTransport` matches the intended regime
- all `0/` field files include every mesh patch
- all `empty` patches in the mesh use `empty` in the field files
- no path traversal or host-shell assumptions

## 7. Runtime validation the agent should do after Docker

- `blockMesh` exits `0`
- `checkMesh` exits `0`
- no `FOAM FATAL ERROR`
- solver advances through expected timesteps or iterations
- residuals behave plausibly
- output time directories exist
- expected fields are written

## 8. Physical validation the agent should do after execution

A case that runs is not automatically correct.
The agent should also check:

- target Reynolds number consistency
- boundary condition plausibility
- mesh dimensionality consistency
- expected qualitative physics
- benchmark agreement where available

For the current cavity path, compare against the Ghia centerline profile.

## 9. Important mismatches already present in the repo

These matter for future contributors:

- Docker execution is now centralized in `core/docker/CommandRunner.ts`.
- Host-side setup repair commands are allowlisted in `core/setup/HostCommandRunner.ts`.
- Renderer and Electron layers are mostly placeholders.
- Tests are currently the real product surface.
- Some docs still describe the project as if Stage 0 is current, while the test
  tree and plans imply work through Stage 5.

An AI should treat the tests and fixtures as the strongest source of truth.

## 10. Image truth for this repo

The validated OpenFOAM source image is:

- `microfluidica/openfoam:13`

The repo runtime and tests use this image directly:

```text
docker pull microfluidica/openfoam:13
```

## 11. Safe near-term expansion path

Expand support in this order:

1. More `incompressibleFluid` tutorial-derived cases
2. Turbulent incompressible single-region cases
3. Imported meshes
4. Better post-processing
5. Multiphase and compressible modules
6. Multi-region `foamMultiRun`

Do not jump straight to general OpenFOAM free-form generation.

## Sources

- OpenFOAM v13 User Guide: https://doc.cfd.direct/openfoam/user-guide-v13
- Solver modules: https://doc.cfd.direct/openfoam/user-guide-v13/solvers-modules
- Standard solvers: https://doc.cfd.direct/openfoam/user-guide-v13/standard-solvers
- File structure: https://doc.cfd.direct/openfoam/user-guide-v13/case-file-structure
- `foamRun` install/test example: https://openfoam.org/download/13-ubuntu/
- local image verification: `microfluidica/openfoam:13` on 2026-04-14

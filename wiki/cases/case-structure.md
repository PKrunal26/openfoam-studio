# OpenFOAM Case Structure

This is the canonical breadth-first map of an OpenFOAM case as OpenFOAM Studio
should understand it.

## 1. Three top-level directories

### `system/`

Controls the run itself:

- `controlDict`: start/end time, timestep, write behavior, selected solver module
- `fvSchemes`: discretization choices
- `fvSolution`: linear solvers and algorithm settings
- `blockMeshDict`: simple structured mesh definition when using `blockMesh`
- other utilities may add files here later, e.g. `decomposeParDict`, `snappyHexMeshDict`

### `constant/`

Holds mesh and physical/model configuration:

- `polyMesh/`: generated mesh files after meshing
- `physicalProperties`: transport coefficients such as `nu`
- `momentumTransport`: laminar, RAS, LES, or non-Newtonian model setup

### `0/`

Initial conditions and boundary conditions for fields at time zero:

- `U`: velocity
- `p`: pressure
- additional fields depend on solver/model selection

## 2. Minimum valid case for the current repo

The repo’s current cavity path needs exactly these eight authored files:

- `0/U`
- `0/p`
- `constant/physicalProperties`
- `constant/momentumTransport`
- `system/controlDict`
- `system/fvSchemes`
- `system/fvSolution`
- `system/blockMeshDict`

Generated later:

- `constant/polyMesh/*`
- output time directories like `0.1`, `0.2`, ...

## 3. Dependency graph

The agent should think about file generation in this order:

1. `system/controlDict`
2. `constant/physicalProperties`
3. `constant/momentumTransport`
4. `system/blockMeshDict`
5. field list for `0/`
6. `0/U`, `0/p`, and any additional fields
7. `system/fvSchemes`
8. `system/fvSolution`

Why this order:

- the solver module influences required physics and algorithm blocks
- transport choices affect required fields
- mesh patch names constrain `boundaryField` entries
- field inventory must be known before numerics are finalized

## 4. Boundary consistency rule

Every mesh patch must appear in every relevant field file.

For the current cavity case:

- mesh patches: `movingWall`, `fixedWalls`, `frontAndBack`
- `0/U` must contain all three
- `0/p` must contain all three

This is the single most common cross-file integrity failure.

## 5. 2D convention in OpenFOAM

OpenFOAM cases are still built on a 3D mesh structure.
A 2D case is usually represented by:

- one cell in the thin direction
- `empty` type on the front/back patches
- `empty` boundary conditions in corresponding field files

If a patch is `empty` in the mesh, it must also be `empty` in the field file.

## 6. What changes when the case becomes more complex

### Turbulent incompressible cases

Usually add turbulence fields such as:

- `k`
- `epsilon`
- `omega`
- `nut`

### Imported or external meshes

The authored mesh file may no longer be `blockMeshDict`.
Instead the workflow may require:

- mesh conversion utility
- manually checked patch typing
- edited `constant/polyMesh/boundary`

### Multiphase or compressible cases

Expect more fields, more property dictionaries, and different solver modules.

## 7. Agent heuristics

- Infer the minimum file set from the solver and model family
- Prefer tutorial-derived structures over invention
- Treat `system/`, `constant/`, and `0/` as coupled, not independent
- Validate field-to-patch coverage before runtime

## Sources

- OpenFOAM v13 case structure: https://doc.cfd.direct/openfoam/user-guide-v13/case-file-structure
- OpenFOAM v13 user guide: https://doc.cfd.direct/openfoam/user-guide-v13

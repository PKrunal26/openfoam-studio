# File Inventory by Case Regime

This page is a quick planning aid for agents.
Use it before generating any files.

## 1. Current supported inventory

### Incompressible, isothermal, single-phase, laminar, structured mesh

Required authored files:

- `system/controlDict`
- `system/fvSchemes`
- `system/fvSolution`
- `system/blockMeshDict`
- `constant/physicalProperties`
- `constant/momentumTransport`
- `0/U`
- `0/p`

This is the inventory used throughout the current repo.

## 2. Likely next inventory

### Incompressible, isothermal, single-phase, turbulent RAS

Start from the laminar inventory, then commonly add:

- `0/k`
- `0/epsilon` or `0/omega`
- `0/nut`

And expand `constant/momentumTransport` accordingly.

Exact field set depends on the turbulence model.

## 3. Red flags for agents

If the prompt implies any of the following, the simple 8-file cavity inventory
is probably not enough:

- turbulence model named explicitly
- heat transfer
- compressibility
- multiphase flow
- species transport
- rotating regions or multiple regions
- imported external mesh workflow

## 4. Rule of thumb

Do not infer extra fields casually.
Extra fields should come from:

- solver module selection
- turbulence or phase model selection
- a known-good tutorial template

## 5. Generation policy

Prefer:

1. choose module and regime
2. derive required field inventory
3. create mesh patches
4. create all field files against those patches

Avoid:

1. generating `0/` fields first
2. changing turbulence model after field generation
3. mixing file inventories from different tutorial families

## Sources

- OpenFOAM v13 file structure: https://doc.cfd.direct/openfoam/user-guide-v13/case-file-structure
- OpenFOAM v13 solver modules: https://doc.cfd.direct/openfoam/user-guide-v13/solvers-modules
- Local repo fixtures and tests

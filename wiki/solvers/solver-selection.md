# Solver Selection for OpenFOAM Studio

This page tells the agent how to think about solver selection breadth-first.

## 1. Current product scope

Right now, the code and tests only validate one main path:

- application: `foamRun`
- solver module: `incompressibleFluid`
- regime: incompressible, isothermal, single-phase
- mesh path: `blockMesh`
- benchmark path: lid-driven cavity

Anything outside that should be treated as future scope, not assumed scope.

## 2. OpenFOAM 13 solver model

In OpenFOAM Foundation v13, `foamRun` is the generic runner.
It loads a solver module, usually declared in `system/controlDict`.

Examples of relevant main solver applications:

- `foamRun`: single-region modular solver runner
- `foamMultiRun`: multi-region modular solver runner
- `potentialFoam`: potential-flow utility solver
- `boundaryFoam`: boundary-layer type utility solver

Legacy applications still exist, but OpenFOAM Studio should not default to them.

## 3. Solver modules that matter first

### `incompressibleFluid`

Use for:

- incompressible
- isothermal
- single-phase
- laminar or turbulent
- steady or transient

This is the correct first-class module for OpenFOAM Studio v1.

### Later modules worth supporting

- `fluid`: compressible HVAC-like single-phase flows
- `incompressibleVoF`: two incompressible immiscible fluids
- `compressibleVoF`: two compressible/non-isothermal immiscible fluids
- `multiphaseEuler`: more advanced multiphase systems
- `solid`: heat transport in solids

## 4. Selection rubric for the agent

Ask these questions in order:

1. Single-region or multi-region?
2. Incompressible or compressible?
3. Single-phase or multiphase?
4. Isothermal or thermal?
5. Laminar or turbulent?
6. Structured simple mesh or imported complex mesh?

For the current product, if the prompt can be satisfied by
incompressible single-phase isothermal flow, the answer should usually be:

- `foamRun`
- `solver incompressibleFluid;`

## 5. What the current tests imply

The test suite validates:

- environment using `foamRun`
- generated files targeting `incompressibleFluid`
- solver execution with `foamRun`
- physics validation against cavity benchmark

So the agent should prefer "do the simple correct thing with `incompressibleFluid`"
over ambitious solver diversification.

## 6. Important version trap

Older OpenFOAM tutorials and internet examples often say:

- `icoFoam`
- `simpleFoam`
- `transportProperties`
- `turbulenceProperties`
- `PISO`

Those examples are often still useful conceptually, but OpenFOAM Studio must map
them into the OpenFOAM 13 modular-solver world before generating files.

## 7. Future support tiers

### Tier 1

- `incompressibleFluid`
- laminar
- cavity, channel, pipe, external 2D benchmarks

### Tier 2

- `incompressibleFluid`
- RAS turbulence
- industrial-style single-region cases

### Tier 3

- `incompressibleVoF`, `compressibleVoF`, `fluid`
- imported meshes
- more complex post-processing

### Tier 4

- `foamMultiRun`
- multi-region conjugate heat transfer

## Sources

- Solver modules: https://doc.cfd.direct/openfoam/user-guide-v13/solvers-modules
- Standard solvers: https://doc.cfd.direct/openfoam/user-guide-v13/standard-solvers
- OpenFOAM Foundation v13 install page: https://openfoam.org/download/13-ubuntu/

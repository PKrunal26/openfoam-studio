# `incompressibleFluid` in OpenFOAM 13

This is the primary solver module OpenFOAM Studio should know deeply.

## 1. What it is

`incompressibleFluid` is the OpenFOAM 13 solver module for steady or transient
flow of incompressible, isothermal fluids, with optional turbulence modelling
and optional mesh motion/change.

In the current repo, it is the module loaded by `foamRun`.

## 2. How it is selected

In `system/controlDict`:

```text
application     foamRun;
solver          incompressibleFluid;
```

The application is still `foamRun`.
The actual physics comes from `solver incompressibleFluid;`.

## 3. What files it expects in the current path

At minimum for the laminar cavity path:

- `0/U`
- `0/p`
- `constant/physicalProperties`
- `constant/momentumTransport`
- `system/controlDict`
- `system/fvSchemes`
- `system/fvSolution`

If turbulence is enabled, additional turbulence fields are commonly required.

## 4. Why `PIMPLE` matters

The repo prompt and fixtures both use `PIMPLE` in `fvSolution`.
That is the correct algorithm block for this solver module family.

For the current cavity fixtures, the essential shape is:

- `solvers { ... }`
- `PIMPLE { ... }`

For closed incompressible cases, include:

- `pRefCell`
- `pRefValue`

## 5. Physical properties in the current laminar path

`constant/physicalProperties` contains the molecular viscosity configuration.

For the repo’s cavity case:

- `viscosityModel constant;`
- `nu 0.001 [m^2/s];`

That matches `U = 1 m/s`, `L = 0.1 m`, `Re = 100`.

## 6. Momentum transport in the current laminar path

For the cavity benchmark used here:

```text
simulationType  laminar;
```

This is enough for the present scope.

If the product later supports turbulence, `momentumTransport` becomes much more
important because it determines model family and required extra fields.

## 7. Boundary conditions in the cavity path

### `0/U`

- moving lid: `fixedValue uniform (1 0 0)`
- stationary walls: `noSlip`
- front/back 2D planes: `empty`

### `0/p`

- walls: usually `zeroGradient`
- front/back 2D planes: `empty`
- pressure reference supplied in `fvSolution`

## 8. Common failure modes specific to this solver path

- using legacy file names from pre-modular tutorials
- putting `PISO` where the generated case should use `PIMPLE`
- missing `pRefCell`/`pRefValue` in a closed incompressible domain
- boundary patches in `0/` files not matching the mesh
- invalid `deltaT` causing instability
- turbulence fields omitted after changing `simulationType`

## 9. What to copy from tutorials vs what to infer

Safe to reuse from tutorials:

- file shape
- patch naming patterns
- mesh topology patterns
- standard discretization and algorithm blocks

Should be inferred carefully from the user prompt:

- Reynolds number
- characteristic length
- viscosity
- lid/inlet speed
- runtime horizon
- write interval

## 10. Agent policy

When the prompt is "simple incompressible CFD" and nothing contradicts it,
default to `incompressibleFluid`.
That is the most grounded path in both OpenFOAM 13 and this repo.

## Sources

- Solver modules: https://doc.cfd.direct/openfoam/user-guide-v13/solvers-modules
- `fvSolution`: https://doc.cfd.direct/openfoam/user-guide-v13/fvsolution
- Standard solvers: https://doc.cfd.direct/openfoam/user-guide-v13/standard-solvers
- `foamInfo incompressibleFluid` output from local OpenFOAM 13 image

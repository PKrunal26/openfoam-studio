# Lid-Driven Cavity in OpenFOAM Studio

This is the canonical seed case for OpenFOAM Studio.
It is the only fully grounded physics path in the current repo.

## 1. Why this case matters

The cavity case is used across the repo for:

- Stage 0 environment validation
- Stage 1 file generation fixtures
- Stage 2 mesh validation
- Stage 3 solver execution
- Stage 4 physics validation against Ghia et al.
- Stage 5 error recovery exercises

If an AI cannot generate and repair this case reliably, it is not ready to
generalize.

## 2. Problem definition

The standard current case is:

- 2D square cavity
- side length `0.1 m`
- top wall moves in `+x`
- other walls stationary
- incompressible, isothermal, single-phase
- laminar
- target `Re = 100`

Canonical parameterization:

- `U_lid = 1 m/s`
- `L = 0.1 m`
- `nu = U * L / Re = 0.001 m^2/s`

## 3. Canonical file choices in this repo

### Mesh

- one hex block
- vertices scaled by `convertToMeters 0.1`
- cell count `20 20 1`
- patches:
  - `movingWall`
  - `fixedWalls`
  - `frontAndBack`

### Fields

- `U`: zero internal velocity, moving lid at top
- `p`: zero internal pressure, `zeroGradient` on walls

### Physics and numerics

- `foamRun`
- `solver incompressibleFluid;`
- `simulationType laminar;`
- `PIMPLE` algorithm block in `fvSolution`

## 4. What the agent should validate before running

- mesh is truly 2D via `1` cell thickness and `empty` front/back
- `U` and `p` boundary patches exactly match mesh patch names
- pressure reference exists in `fvSolution`
- `nu` matches the requested Reynolds number
- `deltaT` is reasonable for the mesh and lid speed

## 5. What success looks like

### Runtime success

- `blockMesh` exits `0`
- `checkMesh` exits `0`
- solver advances through timesteps without `FOAM FATAL ERROR`

### Physics success

- top cells move with positive `u`
- bottom cells are near no-slip
- centerline profile shows recirculation signature
- vertical centerline `u` profile matches Ghia benchmark within tolerance

## 6. Typical agent mistakes on this case

- using legacy `transportProperties`
- missing `frontAndBack` in a field file
- wrong 2D treatment, e.g. non-`empty` front/back
- choosing turbulent modelling for `Re=100`
- setting `deltaT` too high
- inventing extra patches not present in the mesh
- using inconsistent units

## 7. Why this case is ideal for the product

It is simple enough to debug quickly, but rich enough to validate:

- file dependency handling
- patch consistency
- mesh generation
- stable time stepping
- closed-domain pressure treatment
- physical benchmark comparison

That makes it the best "first truth anchor" for the app.

## Sources

- OpenFOAM v13 tutorial chapter: https://doc.cfd.direct/openfoam/user-guide-v13/tutorials
- OpenFOAM Foundation install example using `foamRun`: https://openfoam.org/download/13-ubuntu/
- Local repo fixtures and tests

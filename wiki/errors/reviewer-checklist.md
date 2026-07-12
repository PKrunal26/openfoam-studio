# Reviewer Checklist

Use this checklist when the solver fails, the mesh fails, or the result looks
physically wrong.

## 1. First classify the failure

Choose one primary class:

- file structure error
- OpenFOAM syntax error
- missing patch / boundary mismatch
- wrong solver-module-era naming
- mesh validity error
- numerical instability
- singular pressure / reference issue
- turbulence/model inventory mismatch
- physically plausible run but wrong physics

## 2. Fast inspection order

Inspect in this order:

1. `system/controlDict`
2. `constant/momentumTransport`
3. `system/blockMeshDict`
4. all files in `0/`
5. `system/fvSolution`
6. `system/fvSchemes`

This order catches most repo-relevant failures quickly.

## 3. Questions to ask on every review

### Version correctness

- Did the case use OpenFOAM 13 names?
- Is the runner `foamRun`?
- Is the solver module set correctly?

### Mesh/field integrity

- Do field patch names exactly match mesh patch names?
- Are `empty` patches handled consistently?
- Does the mesh describe the intended geometry?

### Physics integrity

- Does `nu` match the requested Reynolds number?
- Is laminar vs turbulent choice reasonable?
- Are pressure conditions appropriate for a closed domain?

### Numerics

- Is `deltaT` too large?
- Are the algorithm blocks compatible with the chosen module?
- Did residuals decrease?

## 4. Minimal-fix policy

The reviewer should prefer the smallest safe correction:

- fix one wrong keyword before rewriting a full file
- preserve existing patch names if they are mesh-consistent
- avoid changing solver family unless the current one is clearly wrong
- avoid adding turbulence unless the prompt or physics requires it

## 5. What the reviewer should never do casually

- rename mesh patches after field files already depend on them
- switch between modular and legacy solver styles mid-case
- add extra turbulence fields without updating all dependencies
- "fix" physics by only chasing numerical stability

## 6. Physical-fidelity review

Even if the run succeeds:

- compare output against expected qualitative behavior
- compare benchmark profiles where available
- check that boundary conditions represent the intended physical problem

For cavity:

- positive top-wall driven flow
- near-zero bottom-wall velocity
- recirculation signature on the centerline

## 7. Log clues to pattern-match

### Boundary mismatch

- `keyword <patchName> is undefined in dictionary`

### Solver/linear solver mismatch

- `Unknown asymmetric matrix solver PCG`

### Pressure reference issue

- pressure singularity or no reference point behavior

### Instability

- rapidly growing residuals
- very large Courant number
- `nan`, `inf`, or floating point failure

### Mesh issues

- negative volume cells
- bad non-orthogonality or skewness from `checkMesh`

## 8. Output expected from a reviewer AI

A good reviewer response should include:

- root cause in one sentence
- exact file to change
- exact keyword or block to change
- why the change is safe
- whether the fix is:
  - syntax
  - consistency
  - numerical stability
  - physics

## Sources

- OpenFOAM v13 boundary conditions: https://doc.cfd.direct/openfoam/user-guide-v13/boundary-conditions
- OpenFOAM v13 `fvSolution`: https://doc.cfd.direct/openfoam/user-guide-v13/fvsolution
- Local failure patterns in this repo

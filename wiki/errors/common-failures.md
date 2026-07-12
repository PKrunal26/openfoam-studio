# Common OpenFOAM 13 Failure Patterns

Each section: symptom in log → root cause → fix.

---

## 1. deltaT Too Large (Divergence)

**Symptoms in solver log:**
- Courant number >> 1 (e.g., "Max Courant Number = 58.3")
- Residuals increasing instead of decreasing
- Very large residual values (> 1 or even Inf/NaN)
- "FOAM FATAL ERROR: Maximum number of iterations exceeded"
- Solution may blow up silently (residuals jump to 1.0 and stay there)

**Root cause:**
`deltaT` in `system/controlDict` is too large relative to the mesh size.
For a 0.1m cavity with 20 cells and U=1 m/s, CFL condition requires:
`deltaT < 0.1/(20 * 1) = 0.005 s`

**Fix:**
Reduce `deltaT` in `system/controlDict` to satisfy CFL.
For Re=100 cavity: set `deltaT 0.005;` or smaller.

**File to fix:** `system/controlDict`
**Keyword to change:** `deltaT`

---

## 2. Missing Boundary Condition

**Symptoms in solver log:**
```
FOAM FATAL IO ERROR:
keyword <patchName> is undefined in dictionary "<fieldFile>/boundaryField"
```
e.g., `keyword movingWall is undefined in dictionary "0/U/boundaryField"`

**Root cause:**
The mesh has a patch (e.g., `movingWall`) defined in `system/blockMeshDict`
and created by `blockMesh`, but the field file (`0/U`, `0/p`) does not have
a corresponding boundary condition entry.

**Fix:**
Add the missing patch to the `boundaryField` section of the affected file.
For `movingWall` in `0/U` (lid-driven cavity):
```
movingWall
{
    type            fixedValue;
    value           uniform (1 0 0);
}
```

**File to fix:** The field file named in the error (e.g., `0/U`)
**Keyword to add:** The patch name that is "undefined in dictionary"

---

## 3. Invalid Turbulence / MomentumTransport Model

**Symptoms in solver log:**
```
FOAM FATAL IO ERROR:
simulationType <value> is not a valid turbulence model type
```
or
```
keyword <modelName> is undefined in dictionary "constant/momentumTransport"
```
or any parse error in `constant/momentumTransport`

**Root cause:**
`constant/momentumTransport` has an invalid `simulationType` value.
Valid values for laminar incompressible flow: `laminar`
Valid values for RANS: `RAS` (with a `RAS { model kEpsilon; }` sub-dict)

**Fix:**
For a simple laminar cavity (Re <= 1000):
```
simulationType  laminar;
```

**File to fix:** `constant/momentumTransport`
**Keyword to fix:** `simulationType`

---

## 4. Negative Volume Cells (Bad Mesh)

**Symptoms in solver log:**
```
--> FOAM FATAL ERROR:
Zero or negative cell volume detected
```
or checkMesh reports: `Negative volume cells: N`

**Root cause:**
`system/blockMeshDict` has incorrectly ordered vertices, causing inverted cells.
In OpenFOAM, vertex ordering must follow the right-hand rule for each face.

**Fix:**
Check the `hex (...)` entries in `blockMeshDict`. The 8 vertices of each hex block
must be ordered: bottom-front-left, bottom-front-right, bottom-back-right,
bottom-back-left (CCW from bottom), then same order for top face.

**File to fix:** `system/blockMeshDict`

---

## 5. Pressure Boundary Condition Mismatch

**Symptoms in solver log:**
```
--> FOAM FATAL ERROR:
No pressure reference point found in closed domain
```
or solver diverges immediately with pressure residuals = 1.0

**Root cause:**
In a closed domain (all walls, no inlet/outlet), the pressure is relative.
The solver needs exactly one `fixedValue` pressure BC or a `pRefCell`/`pRefValue`
set in `system/fvSolution` under the `PIMPLE` block.
If all pressure BCs are `zeroGradient`, the system is singular.

**Fix:**
In `0/p`, change one patch (e.g., `fixedWalls`) to:
```
fixedWalls
{
    type            zeroGradient;
}
```
And ensure `fvSolution/PIMPLE` has:
```
pRefCell    0;
pRefValue   0;
```
This pins the absolute pressure level without over-constraining.

**File to fix:** `system/fvSolution` and/or `0/p`

---

## 6. OpenFOAM 13 Naming Drift (Legacy vs Modular)

**Symptoms in generated files or logs:**
- `constant/transportProperties` exists instead of `constant/physicalProperties`
- `constant/turbulenceProperties` exists instead of `constant/momentumTransport`
- solver launched as `icoFoam` or `simpleFoam` when the rest of the repo expects `foamRun`
- `controlDict` has legacy-style entries inconsistent with the module approach

**Root cause:**
The generator copied an older OpenFOAM tutorial or internet snippet without
translating it to OpenFOAM Foundation v13 modular-solver conventions.

**Fix:**
Normalize the case to the OpenFOAM 13 path used in this repo:

- `application     foamRun;`
- `solver          incompressibleFluid;`
- `constant/physicalProperties`
- `constant/momentumTransport`

**Files to fix:** `system/controlDict`, `constant/physicalProperties`,
`constant/momentumTransport`

---

## 7. Wrong Algorithm Block for `incompressibleFluid`

**Symptoms in logs or generated files:**
- `fvSolution` contains `PISO` copied from older cavity tutorials
- solver/module-specific settings appear to be ignored or mismatched
- pressure/velocity coupling behaves unexpectedly

**Root cause:**
The case was generated from a legacy incompressible solver tutorial instead of
the modular `incompressibleFluid` workflow used by `foamRun`.

**Fix:**
Use a `PIMPLE` block in `system/fvSolution`, and ensure pressure reference
settings are present for closed incompressible cases.

**File to fix:** `system/fvSolution`

---

## 8. Missing `empty` Consistency for 2D Cases

**Symptoms in logs or behavior:**
- front/back patches exist but field files use non-`empty` conditions
- `checkMesh` or solver behavior looks inconsistent for an intended 2D case
- solution behaves like an unintended 3D case or fails on geometric constraints

**Root cause:**
A 2D case in OpenFOAM still uses a thin 3D mesh. The front/back patches must
be `empty` in the mesh and also `empty` in the corresponding field files.

**Fix:**
Ensure:
- `blockMeshDict` defines the front/back patch as `type empty;`
- each relevant `0/` field file sets that patch to `type empty;`

**Files to fix:** `system/blockMeshDict`, affected field files in `0/`

---

## 9. Linear Solver Type Does Not Match Matrix Type

**Symptoms in solver log:**
```
FOAM FATAL IO ERROR:
Unknown asymmetric matrix solver PCG
```
or the corresponding symmetric/asymmetric mismatch message.

**Root cause:**
The `solvers` section of `fvSolution` selected an incompatible linear solver for
the matrix produced by the equation discretization.

**Fix:**
Use standard, tutorial-derived `fvSolution` blocks for the chosen solver module.
For the current cavity path, stay close to the known-good fixture unless there is
a clear reason to deviate.

**File to fix:** `system/fvSolution`

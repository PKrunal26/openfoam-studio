# Stage 3: Solver Execution

## Status: COMPLETE

## Depends on
Stage 2 passing (mesh quality verified)

## Success definition
All 3 tests pass in under 4 minutes.

foamRun executes on agent-generated files.
Solver runs at least 10 iterations without crashing.
Residual files exist and are non-empty after run.

## Tests to write first (tests/stage3/solver.test.ts)

Test 1: foamRun starts and completes
  Load files from tests/fixtures/generated/cavity/
  Run blockMesh first (same as Stage 2)
  Run foamRun
  Assert exit code 0
  Assert log contains at least 10 "Time =" lines
  Assert no "FOAM FATAL ERROR"

Test 2: Residuals are written
  After foamRun completes
  Assert postProcessing/ directory exists in case
  OR assert solver log contains residual lines
  (format: "Ux: Solving for Ux, Initial residual = ...")
  Assert at least one residual value < 1 (solver actually ran)

Test 3: Output timestep directories exist
  After foamRun completes
  Assert at least one timestep directory exists
  (e.g. 0.005/ or similar depending on deltaT and endTime)
  Assert U and p files exist in that directory

## Implementation needed
None -- same Docker pattern as Stage 2.

## Completion criteria
- [x] All 3 tests written and initially failing
- [x] All 3 tests passing
- [x] Test run under 4 minutes (actual: 6.4s)
- [x] plans/README.md Stage 3 checkbox ticked

## When done
Update plans/README.md: change Stage 3 to [x]
Read plans/stage-4-physics.md and begin immediately.

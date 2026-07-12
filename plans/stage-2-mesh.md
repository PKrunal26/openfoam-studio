# Stage 2: Mesh Quality

## Status: COMPLETE

## Depends on
Stage 1 passing (file generation working)
Cached cavity case files in tests/fixtures/generated/cavity/

## Success definition
All 3 tests pass in under 90 seconds.

blockMesh runs on agent-generated files (not tutorial files).
checkMesh reports mesh quality within OpenFOAM acceptable limits.
Mesh quality values are within bounds for a simple cavity case.

## Tests to write first (tests/stage2/mesh.test.ts)

Test 1: blockMesh succeeds on generated files
  Load the 8 files from tests/fixtures/generated/cavity/
  Start a Docker container from microfluidica/openfoam:13
  Copy files into container working directory
  Source /opt/openfoam13/etc/bashrc
  Run blockMesh
  Assert exit code 0
  Assert log contains "End"
  Assert no "FOAM FATAL ERROR" in log

Test 2: checkMesh passes quality thresholds
  Continue from Test 1 (mesh already generated)
  Run checkMesh
  Assert exit code 0
  Parse checkMesh output and assert:
    Max non-orthogonality < 70 degrees
    Max skewness < 4
    No "FOAM FATAL ERROR"
    "Mesh OK" or zero failed checks

Test 3: Mesh statistics are reasonable for cavity case
  Parse checkMesh output and assert:
    Total cells > 0
    Total cells < 1,000,000 (sanity upper bound)
    All boundaries listed (movingWall, fixedWalls, frontAndBack)

## Implementation needed
None -- Stage 2 tests only run OpenFOAM on already-generated
files. No new core/ code needed.
Docker container management goes in tests/stage2/mesh.test.ts
directly, same pattern as Stage 0 tests.

## Cache note
Reuse tests/fixtures/generated/cavity/ from Stage 1.
Do not regenerate files. Do not call Anthropic API in Stage 2.

## Completion criteria
- [x] All 3 tests written and initially failing (no Docker yet)
- [x] All 3 tests passing with Docker running
- [x] Test run duration under 90 seconds (actual: 6s)
- [x] plans/README.md Stage 2 checkbox ticked

## When done
Update plans/README.md: change Stage 2 to [x]
Read plans/stage-3-solver.md and begin immediately.

# Stage 5: Error Recovery

## Status: COMPLETE

## Depends on
Stage 4 passing (physics validated)

## Success definition
All 3 tests pass in under 15 minutes.

The Reviewer agent correctly diagnoses and fixes the 3 most
common OpenFOAM failure modes without human intervention.
This is the core product capability -- simulations that fail
once succeed on retry.

## Tests to write first (tests/stage5/error-recovery.test.ts)

Test 1: Recovers from bad deltaT (divergence trigger)
  Generate cavity files but inject a bad deltaT = 1.0
  (too large, will cause divergence for this case)
  Run foamRun, it should fail or produce exploding residuals
  Pass the error log to Reviewer agent
  Assert Reviewer identifies deltaT as the problem
  Assert Reviewer outputs corrected controlDict with
  smaller deltaT (< 0.01)
  Run again with corrected file
  Assert second run succeeds

Test 2: Recovers from missing boundary condition
  Generate cavity files but remove the movingWall entry from 0/U
  Run blockMesh + foamRun
  Pass error log to Reviewer agent
  Assert Reviewer identifies missing boundary condition
  Assert Reviewer outputs corrected 0/U with movingWall entry
  Run again with corrected file
  Assert second run succeeds

Test 3: Recovers from wrong turbulence model file
  Generate cavity files but write an invalid value into
  constant/momentumTransport
  Run foamRun
  Pass error to Reviewer agent
  Assert Reviewer identifies turbulence config as the issue
  Assert Reviewer outputs valid momentumTransport
  Run again
  Assert second run succeeds

## Implementation needed

Create core/agent/Reviewer.ts:
  - Takes: error log text, list of current case files
  - Uses Anthropic SDK with tool use
  - Identifies which file contains the error
  - Returns: filename + corrected file content
  - Must use the CFD wiki error patterns if they exist
  - Must not hallucinate -- if it cannot identify the error,
    it should say so rather than guess

Create wiki/errors/common-failures.md:
  - deltaT too large -> symptoms, fix
  - Missing boundary condition -> symptoms, fix
  - Invalid turbulence model -> symptoms, fix
  - Negative volume cells -> symptoms, fix
  - Pressure BC mismatch -> symptoms, fix

## Completion criteria
- [x] wiki/errors/common-failures.md written
- [x] Reviewer.ts built (validated through integration tests)
- [x] All 3 error recovery tests passing
- [x] Test run under 15 minutes (actual: ~3 min)
- [x] plans/README.md Stage 5 checkbox ticked

## When done
All POC stages complete.
Update plans/README.md all checkboxes ticked.
Run full suite: npm run test:stage0 through test:stage5
Report total duration and any failures.
POC is done when full suite passes end to end.

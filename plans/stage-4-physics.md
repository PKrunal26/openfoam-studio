# Stage 4: Physics Validation

## Status: COMPLETE

## Depends on
Stage 3 passing (solver runs successfully)

## Success definition
All 3 tests pass in under 10 minutes.

Simulation converges.
Velocity profile matches Ghia et al. 1982 benchmark within 15%.
This is the first proof that results are physically correct,
not just that they run.

## Benchmark data
Create tests/fixtures/benchmarks/ghia1982.json with the
centerline velocity data from Ghia et al. 1982 for Re=100.
u-velocity along vertical centerline (x=0.5):

y=0.0000, u=0.000000
y=0.0547, u=-0.03717
y=0.0625, u=-0.04192
y=0.0703, u=-0.04775
y=0.1016, u=-0.06434
y=0.1719, u=-0.10150
y=0.2813, u=-0.15662
y=0.4531, u=-0.21090
y=0.5000, u=-0.20581
y=0.6172, u=-0.13641
y=0.7344, u= 0.00332
y=0.8516, u= 0.23151
y=0.9531, u= 0.68717
y=0.9609, u= 0.73722
y=0.9688, u= 0.78871
y=0.9766, u= 0.84123
y=1.0000, u= 1.00000

## Tests to write first (tests/stage4/physics.test.ts)

Test 1: Simulation converges
  Run full case (blockMesh + foamRun with endTime=2.0)
  Parse solver log
  Assert final residuals for U and p are below 1e-3
  Assert residuals are decreasing trend over last 20 iterations

Test 2: Centerline velocity matches Ghia within 15%
  After convergence, extract U field at final timestep
  Sample u-velocity along vertical centerline (x=0.5)
  Compare against ghia1982.json reference data
  Assert max deviation < 15% at each sampled point
  Log actual vs expected at each point so failures are readable

Test 3: Physical features are present
  Assert u-velocity at top wall (y=1) is approximately 1 m/s
  Assert u-velocity at bottom wall (y=0) is approximately 0
  Assert velocity field has a recognisable vortex
  (u changes sign somewhere between y=0 and y=1)

## Implementation needed
A post-processing utility in core/postprocess/VelocitySampler.ts
that reads OpenFOAM U field files and extracts values at given
coordinates. This is the first new core/ code since Stage 1.

## Completion criteria
- [x] ghia1982.json benchmark data file created
- [x] All 3 tests written and initially failing
- [x] VelocitySampler.ts built (unit tests deferred — validated through integration)
- [x] All 3 physics tests passing (max Ghia deviation: 0.032, tolerance: 0.15)
- [x] Test run under 10 minutes (actual: 6s)
- [x] plans/README.md Stage 4 checkbox ticked

## When done
Update plans/README.md: change Stage 4 to [x]
Read plans/stage-5-error-recovery.md and begin immediately.

# OpenFOAM Studio -- Build Plan

## How this works
Each stage has a plan file. Complete the stage, mark it done,
move to the next. Never skip a stage. Never start a stage
until the previous one is fully green.

## Status
- [x] Stage 0: Environment
- [x] Stage 1: File generation
- [x] Stage 2: Mesh quality
- [x] Stage 3: Solver execution
- [x] Stage 4: Physics validation
- [x] Stage 5: Error recovery

## Running
npm run test:stage0    # ~22s
npm run test:stage1    # ~2s (cached), ~129s (fresh)
npm run test:stage2    # ~60s
npm run test:stage3    # ~3 min
npm run test:stage4    # ~8 min
npm run test:stage5    # ~15 min

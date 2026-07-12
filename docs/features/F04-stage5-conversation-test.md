# F04 — Stage 5: End-to-End Conversational Loop Test

**ICE Score:** 10 (Impact 4 · Confidence 5 · Effort 2)  
**Status:** `done`  
**Depends on:** Stages 0–4 all passing (they do)  
**Blocks:** F02 (TDD: test written before feature implementation)

---

## Problem

There is no test for the multi-turn conversation loop. Stage 4 validates physics correctness
for a single generation. But the product's core value — iterative refinement — has zero
test coverage. Building F02 without a test is a violation of the stage-gated discipline
that has kept the codebase clean.

This stage must be written **before** F02 is implemented. The test failing on the current
codebase is proof the feature is missing. It passing after F02 is proof the feature works.

---

## User Story

> As a developer, I need a stage-gated test that proves the conversational loop works
> end-to-end — two sequential prompts, with the second modifying only what changed —
> before the feature is declared done.

---

## Success Criteria

| # | Criterion | Measure |
|---|-----------|---------|
| SC1 | Test fails on current codebase (before F02) | `npm run test:stage5` → ≥1 failure |
| SC2 | Test passes after F02 is implemented | `npm run test:stage5` → all pass |
| SC3 | Second prompt does NOT regenerate all files | Assert: files other than `physicalProperties` are byte-identical after second generate |
| SC4 | `nu` in `physicalProperties` matches Re=400 after second prompt | `nu = 0.00025` (U=1, L=0.1, Re=400: nu=UL/Re) |
| SC5 | Test runs in under 90 seconds | Timed assertion (two Claude API calls) |

---

## Subtasks

- [ ] **S1** Create `tests/stage5/` directory with `conversational-loop.test.ts`

- [ ] **S2** Write Turn 1 test block
  ```ts
  // Turn 1: generate lid-driven cavity at Re=100
  const files1 = await fileGen.generate(
    'Lid-driven cavity, Re=100, 2D, incompressible, run for 0.5 s',
    []  // no history
  )
  expect(Object.keys(files1)).toHaveLength(8)
  const nu1 = extractNu(files1['constant/physicalProperties'])
  expect(nu1).toBeCloseTo(0.001, 4)  // nu = 1*0.1/100
  ```

- [ ] **S3** Write Turn 2 test block
  ```ts
  // Turn 2: change to Re=400
  const history = [
    { role: 'user', content: 'Lid-driven cavity, Re=100, 2D, incompressible, run for 0.5 s' },
    { role: 'assistant', content: 'Generated 8 files for Re=100 lid-driven cavity case.' }
  ]
  const files2 = await fileGen.generate('Change the Reynolds number to 400', history)

  // Only physicalProperties should change
  expect(Object.keys(files2)).toHaveLength(1)
  expect(Object.keys(files2)[0]).toBe('constant/physicalProperties')
  const nu2 = extractNu(files2['constant/physicalProperties'])
  expect(nu2).toBeCloseTo(0.00025, 5)  // nu = 1*0.1/400
  ```

- [ ] **S4** Write Turn 3 test block (3-turn validation)
  ```ts
  // Turn 3: change end time
  const history2 = [...history,
    { role: 'user', content: 'Change the Reynolds number to 400' },
    { role: 'assistant', content: 'Updated physicalProperties: nu changed to 0.0025.' }
  ]
  const files3 = await fileGen.generate('Extend the run to 2 seconds', history2)
  expect(Object.keys(files3)).toHaveLength(1)
  expect(Object.keys(files3)[0]).toBe('system/controlDict')
  // endTime should be 2
  expect(files3['system/controlDict']).toContain('endTime         2')
  ```

- [ ] **S5** Write `extractNu` helper
  ```ts
  function extractNu(content: string): number {
    const m = content.match(/nu\s+([0-9.e+-]+)/)
    if (!m) throw new Error('nu not found in physicalProperties')
    return parseFloat(m[1])
  }
  ```

- [ ] **S6** Add to `package.json`
  ```json
  "test:stage5": "vitest run tests/stage5"
  ```
  (Already present in scripts — verify it exists, add only if missing)

---

## Tests Required

This feature IS a test. The tests it contains are the success criteria.

| Turn | Assert | Value |
|------|--------|-------|
| 1 | Files generated | 8 |
| 1 | `nu` value | `0.001` ± 0.0001 |
| 2 | Files returned | 1 (only `physicalProperties`) |
| 2 | `nu` value | `0.00025` ± 0.00001 |
| 3 | Files returned | 1 (only `controlDict`) |
| 3 | `endTime` value | `2` |

---

## Anti-Goals

- Do NOT run the Docker solver in Stage 5 — that is Stage 3/4's job
- Do NOT test UI behaviour in Stage 5 — this tests `FileGenerator` only
- Do NOT make Stage 5 depend on a live demo server

---

## Implementation Notes

- The test calls `FileGenerator.generate()` directly — no HTTP, no server needed.
- `FileGenerator` must be updated (F02 S3) to accept `history` parameter before this test can pass.
- The test will fail with current `FileGenerator` signature until F02 S3 is done — that's correct and expected.
- Use the authenticated `claude` CLI environment — same pattern as Stage 1 tests.
- Timeout: set `vitest` test timeout to `120_000` ms for this file.

# F05 — Error Recovery Loop with Approval Gate

**ICE Score:** 5.0 (Impact 5 · Confidence 4 · Effort 4)  
**Status:** `done`  
**Depends on:** F02 (conversational model must work before recovery loop can use it)  
**Blocks:** nothing (this is the current final feature)

---

## Problem

When `foamRun` fails with `FOAM FATAL ERROR`, the current UI says:
> "In the full agent flow I would read the log, diagnose the root cause, propose fixes,
> and ask your approval before re-running."

That is product theater. The vision's most-cited differentiator is not implemented.
The wiki already contains error patterns (`wiki/errors/reviewer-checklist.md`).
The backend can already read Docker logs. This feature closes the gap between
demo and differentiated product.

---

## User Story

> As a CFD engineer, when my simulation fails with a FOAM FATAL ERROR, I want the
> agent to diagnose the failure, propose a specific file fix, and — after I approve —
> apply the fix and re-run automatically, so I don't have to manually grep through
> solver logs and guess what to change.

---

## Success Criteria

| # | Criterion | Measure |
|---|-----------|---------|
| SC1 | At least 3 FOAM FATAL ERROR classes handled automatically | See error classes below |
| SC2 | Approval gate always shown — agent never auto-applies fixes | Manual review: no fix applied without user "Yes" |
| SC3 | Recovery attempted up to 3 times before giving up | Counter in meta.json; test with injected errors |
| SC4 | Every fix visible in chat log (what file, what line, what changed) | No silent edits |
| SC5 | On exhaustion (3 retries failed): full log shown, user invited to edit manually | Verified by integration test |
| SC6 | Recovery adds a message to conversation history (F02 messages array) | Persist diagnosis + fix in meta.messages |

---

## Error Classes to Handle (v1)

| Class | Trigger pattern | Root cause | Fix |
|-------|-----------------|------------|-----|
| Bad boundary condition type | `FOAM FATAL ERROR: Unknown patchField type` | Wrong `type` keyword in `0/U` or `0/p` | Replace with correct type |
| Missing pressure reference | `No reference cell found` | `p` field has no fixed value and no `pRefCell` | Add `pRefCell 0; pRefValue 0;` to `fvSolution.SIMPLE` |
| Divergence (unbounded field) | `Courant Number mean: ... max: > 1` | `deltaT` too large for mesh | Halve `deltaT` in `controlDict` |

Additional classes from `wiki/errors/reviewer-checklist.md` can be added post-v1.

---

## Subtasks

- [ ] **S1** Create `core/agent/ErrorRecovery.ts`
  - `diagnose(log: string): DiagnosisResult | null`
  - `DiagnosisResult: { errorClass: string; description: string; fix: FileFix[] }`
  - `FileFix: { file: string; description: string; oldValue: string; newValue: string }`
  - Match log against the 3 error classes above using regex
  - Return `null` if no known pattern matches (unknown error)

- [ ] **S2** Update `handleRun` in `demo/server.ts`
  - When `foamRun` exits non-zero, collect full log into a string
  - Call `ErrorRecovery.diagnose(log)`
  - If diagnosis found: emit SSE event `{ type: 'diagnosis', result: DiagnosisResult }`
  - If no diagnosis: emit `{ type: 'unknown-error', log: lastN(log, 50) }`
  - Add `retryCount` to `ProjectMeta`; reject if `>= 3`

- [ ] **S3** Update `demo/index.html` to render diagnosis in chat panel
  - On `diagnosis` event: show assistant message:
    ```
    ⚠️ FOAM FATAL ERROR detected: [errorClass]
    
    Diagnosis: [description]
    
    Proposed fix:
    • [file]: change "[oldValue]" → "[newValue]"
    
    [Yes, apply fix]  [No, show full log]
    ```
  - "Yes, apply fix" button: POST `/api/projects/:id/apply-fix` with `{ fix: FileFix[] }`
  - "No, show full log" button: render full terminal output in a `<pre>` in chat

- [ ] **S4** Add `POST /api/projects/:id/apply-fix` endpoint to `demo/server.ts`
  - Validate that requested file path is within `projectCaseDir(id)` (path traversal check)
  - Apply `newValue` → write updated file
  - Increment `meta.retryCount`
  - Append diagnosis + fix to `meta.messages` (F02 conversation history)
  - Trigger re-run (reuse `handleRun` logic)
  - Return SSE stream of the new run

- [ ] **S5** Exhaustion handling
  - If `meta.retryCount >= 3` and solver still fails: emit `{ type: 'exhausted' }`
  - Show in chat: "Three automatic fixes attempted without success. The full log is below.
    Try editing the files manually in the editor panel, then click Run again."

- [ ] **S6** Unit tests for `ErrorRecovery.diagnose`
  - One test per error class (see tests table)

---

## Tests Required

| Test | Type | File | Pass condition |
|------|------|------|----------------|
| `diagnose` returns correct fix for bad BC | Unit | `tests/stage1/error-recovery.test.ts` | `fix[0].file === '0/U'`, correct oldValue/newValue |
| `diagnose` returns correct fix for missing pRef | Unit | same | `fix[0].file === 'system/fvSolution'` |
| `diagnose` returns correct fix for high Courant | Unit | same | `fix[0].file === 'system/controlDict'`, newValue = half of oldValue |
| `diagnose` returns null for unknown error | Unit | same | `null` returned, no crash |
| Integration: inject bad BC → auto-recover in ≤2 retries | Integration | `tests/stage3/error-recovery-integration.test.ts` | Solver passes after recovery |
| Approval gate: fix not applied without user action | E2E | (Playwright) | Clicking "No" leaves files unchanged |
| Exhaustion: 3 failures → shows manual edit message | Integration | same as above | `meta.retryCount === 3`, exhausted message visible |

---

## Anti-Goals

- Do NOT implement automatic fix application without approval gate — ever
- Do NOT handle turbulence model errors in v1 (no RANS/LES in scope)
- Do NOT attempt recovery for `blockMesh` failures (mesh errors need human judgment)
- Do NOT surface raw stack traces to the user — summarize them

---

## Implementation Notes

- The log capture for diagnosis: collect all `line` events from the run into a string buffer.
  Only send to `diagnose()` after `foamRun` exits non-zero.
- Path traversal check in `apply-fix`: always use `path.resolve()` and assert the result
  starts with `projectCaseDir(id)`. This is a security boundary.
- The `retryCount` resets to 0 on every new user-initiated run (not on auto-recovery retries).
- Keep `ErrorRecovery.ts` in `core/` (not `demo/`) — it must be unit-testable headlessly
  and will be reused when the full Electron app is built.

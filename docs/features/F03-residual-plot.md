# F03 — Residual Convergence Plot

**ICE Score:** 7.5 (Impact 3 · Confidence 5 · Effort 2)  
**Status:** `done`  
**Depends on:** nothing (solver output already streaming; this is pure parsing + rendering)  
**Blocks:** nothing

---

## Problem

The simulation runs and exits 0. The user sees `foamRun ✓ exit 0` in the terminal.
They have no idea whether the physics converged, what the residuals look like, or whether
the result is meaningful. The vision promises "residual plots shown inline." Without them,
users cannot validate their simulation or build intuition about convergence.

The Ghia benchmark passes at 3.2% deviation — but the engineer cannot see that.

---

## User Story

> As a CFD engineer, after my simulation completes I want to see a residual convergence
> chart so I can immediately tell whether the solver converged and roughly how fast.

---

## Success Criteria

| # | Criterion | Measure |
|---|-----------|---------|
| SC1 | Chart appears automatically after every successful run | No user action required |
| SC2 | Shows at minimum Ux, Uy, p residuals | All three fields present on chart |
| SC3 | Y axis is logarithmic | Residual drop from ~1e-1 to ~1e-6 is visible |
| SC4 | Final residual value is annotated on the chart | Last data point labeled |
| SC5 | Chart is readable in the 380px chat panel width | No overflow, no truncation |
| SC6 | Parser unit test passes against a real icoFoam log sample | See tests below |

---

## Subtasks

- [ ] **S1** Write residual log parser in `demo/server.ts`
  - Target log line pattern (icoFoam / foamRun):
    ```
    smoothSolver:  Solving for Ux, Initial residual = 0.0823, Final residual = 1.23e-06, No Iterations 28
    ```
  - Regex: `/Solving for (\w+), Initial residual = ([\d.e+-]+)/`
  - Accumulate: `Map<field, number[]>` keyed by field name
  - Also handle `GAMG:  Solving for p` pattern

- [ ] **S2** Emit `residual` SSE events during `handleRun`
  - Alongside existing `log` events, emit:
    ```ts
    { type: 'residual', field: 'Ux', iteration: number, value: number }
    ```
  - Iteration counter increments per time step (not per line)

- [ ] **S3** Accumulate residuals in `demo/index.html` during SSE stream
  ```js
  const residuals = {}  // { Ux: [0.08, 0.04, ...], p: [...] }
  // on residual event:
  if (!residuals[ev.field]) residuals[ev.field] = []
  residuals[ev.field].push(ev.value)
  ```

- [ ] **S4** Render SVG chart after `done` event (no external library — pure SVG)
  - Log scale Y axis (base 10)
  - One colored `<polyline>` per field
  - X axis: iteration number
  - Legend: field name + final value (e.g. "Ux: 1.2e-6")
  - Dimensions: 340px wide × 160px tall (fits inside chat panel)
  - Inject into chat panel as a `<div class="msg assistant">` with embedded `<svg>`

- [ ] **S5** Add inline convergence verdict below chart
  - If all final residuals < 1e-4: "✅ Converged (all residuals < 1e-4)"
  - If any residual > 1e-3 at end: "⚠️ May not have converged — check terminal"

---

## Tests Required

| Test | Type | File | Pass condition |
|------|------|------|----------------|
| Residual parser extracts Ux, Uy, p from sample log | Unit | `tests/stage3/residual-parser.test.ts` | Correct field names, correct first and last values |
| Parser handles GAMG p lines | Unit | same | `p` field populated |
| Parser returns empty map for log with no solver lines | Unit | same | `{}` returned, no crash |
| SSE stream emits residual events during run | Integration | `tests/stage3/residual-parser.test.ts` | At least 1 residual event per field in a full run |

---

## Anti-Goals

- Do NOT use recharts or any npm chart library — this is vanilla HTML demo, keep zero dependencies
- Do NOT try to render a ParaView velocity field image (that is a separate future feature)
- Do NOT show the chart during the run — only after `done` event

---

## Implementation Notes

- `icoFoam` logs one "Initial residual" line per field per time step. For a 0.5 s run at
  `deltaT = 0.005`, that is 100 time steps × 3 fields = 300 lines to parse.
- `foamRun` (OpenFOAM 13) uses the same solver log format as `icoFoam`.
- SVG log scale: use `Math.log10(value)` to map to Y pixel position.
  Clamp at 1e-10 to avoid log(0). Y range: log10(1) = 0 (top) to log10(1e-10) = -10 (bottom).
- Use these colors: Ux `#4ec9b0`, Uy `#ce9178`, p `#9cdcfe` (matches VS Code token palette).

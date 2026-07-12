# F01 — Onboarding / Setup Health Check

**ICE Score:** 20 (Impact 4 · Confidence 5 · Effort 1)  
**Status:** `done`  
**Depends on:** nothing  
**Blocks:** F02, F03, F05 (all assume a working environment)

---

## Problem

A new user clones the repo, runs `npm run demo`, and nothing works — Docker isn't running,
the image alias doesn't exist, or the `claude` CLI is missing. There is no diagnostic feedback.
They get a blank screen or a cryptic fetch error. The stated success criterion is
"first simulation in under 5 minutes from cold start." Right now minute zero fails silently.

---

## User Story

> As a first-time user opening OpenFOAM Studio, I want to see exactly what is missing
> from my environment so I can fix it and get to my first simulation without guessing.

---

## Success Criteria

| # | Criterion | Measure |
|---|-----------|---------|
| SC1 | Every missing prerequisite has a named fix instruction | No check fails without a `How to fix:` note |
| SC2 | All checks pass → auto-redirect to home within 1 second | Verified by E2E test |
| SC3 | Any check fails → setup page is shown, home is not reachable | Verified by E2E test |
| SC4 | "Re-check" button re-runs all checks without page reload | Manual + test |
| SC5 | Health endpoint responds in < 2 seconds | Timed in test |
| SC6 | Missing prerequisites can be repaired from onboarding | Manual + unit test |

---

## Subtasks

- [x] **S1** Add `GET /health` endpoint to `demo/server.ts`
  - Check 1: Docker daemon reachable (`docker.ping()`)
  - Check 2: Image `microfluidica/openfoam:13` exists (`docker.listImages()`)
  - Check 3: `claude` CLI exists on `PATH`
  - Return: `{ ok: boolean, checks: { name, pass, fix, canAutoFix }[] }`

- [x] **S2** Add setup view to `demo/index.html`
  - Show before home/project views if any check fails
  - Render checklist: green ✓ / red ✗ per check
  - Each failing check shows a `How to fix:` inline instruction
  - "Re-check" button calls `GET /health` and re-renders
  - "Fix Automatically" button calls `POST /health/fix`
  - Auto-fix log shows commands attempted and outputs

- [x] **S3** App startup: call `/health` on load
  - If all pass → proceed to home (current behaviour)
  - If any fail → show setup view; block navigation to home/project
  - Auto-attempt repair once for auto-fixable failures

- [x] **S4** Fix instructions copy (what to show for each failure)
  - Docker not running: `"Start Docker Desktop or run: sudo systemctl start docker"`
  - Image missing: `"Run: docker pull microfluidica/openfoam:13"`
  - Claude CLI missing: `"Install Claude Code: npm install -g @anthropic-ai/claude-code  then run: claude login"`

- [x] **S5** Add repair endpoint and allowlisted fix commands
  - `POST /health/fix` attempts Docker startup, image pull, and Claude CLI install
  - All host commands go through an allowlist in `core/setup/HostCommandRunner.ts`

---

## Tests Required

| Test | Type | File | Pass condition |
|------|------|------|----------------|
| Health endpoint returns 200 with all checks | Unit | `tests/stage0/health.test.ts` | `ok: true` when Docker up + image present + Claude CLI ready |
| Health endpoint returns failing check for missing image | Unit | same | `ok: false`, check name `image` has `pass: false` |
| Health endpoint responds < 2 s | Unit | same | elapsed < 2000 ms |
| Setup page shown when health fails | E2E | (manual / Playwright) | setup view visible, home view hidden |
| Re-check button refreshes state | E2E | same | after fixing env, clicking re-check shows all green |
| Auto-fix builds platform-aware repair plan | Unit | same | expected host commands selected in order |
| Auto-fix skips image repair when Docker stays down | Unit | same | image step marked skipped |

---

## Anti-Goals

- Do NOT check for `blockMesh` binary or OpenFOAM version — that is Stage 0's job
- Do NOT expose arbitrary host shell access — only allowlisted setup commands may run
- Do NOT block the dev server from starting if health fails; the server always starts

---

## Implementation Notes

- `dockerode`'s `docker.ping()` returns `"OK"` — already in devDependencies
- `docker.listImages({ filters: { reference: ['microfluidica/openfoam:13'] } })` returns array; length > 0 = present
- The health endpoint should never crash — wrap all checks in try/catch, fail gracefully
- The canonical runtime image is `microfluidica/openfoam:13`

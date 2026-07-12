# Stage 0 — Environment Tests

Stage 0 validates the host environment before any application code is written.
All 5 tests must pass before Stage 1 begins.

---

## What these tests verify

| # | Test | What it checks |
|---|------|----------------|
| 1 | Docker is running | Docker Desktop is up, daemon responds, image exists locally |
| 2 | Container responds | Container starts, executes a command, stdout is readable |
| 3 | blockMesh on cavity | OpenFOAM mesher runs on the built-in tutorial case, exits 0 |
| 4 | Solver 10 iterations | `foamRun` completes 10+ time steps without `FOAM FATAL ERROR` |
| 5 | Log via volume mount | Host filesystem can read a log file written inside the container |

---

## Prerequisites

1. **Docker Desktop** must be running before you execute these tests.
   - macOS: look for the whale icon in the menu bar, status must be "Running".
   - Verify with: `docker info`

2. Ensure the OpenFOAM image exists locally before running:
   - `docker pull microfluidica/openfoam:13`

---

## How to run

```bash
npm run test:stage0
```

Expected runtime: ~5 minutes once the image is already present locally.

To watch verbose output in real time (recommended):

```bash
npm run test:stage0 -- --reporter=verbose
```

---

## What success looks like

```
✓ Test 1: Docker is running and image exists locally
✓ Test 2: Container starts and responds to a command
✓ Test 3: blockMesh runs on cavity tutorial (exit 0, log contains "End")
✓ Test 4: Solver runs 10 iterations without FOAM FATAL ERROR
✓ Test 5: Solver log is readable from host via volume mount

Test Files  1 passed (1)
Tests       5 passed (5)
```

---

## Troubleshooting by test

### Test 1 fails: Docker is running and image exists locally

**Error: connect ENOENT /var/run/docker.sock** or **Cannot connect to the Docker daemon**
- Docker Desktop is not running. Start it and wait for it to fully initialize (~30 seconds).

**Error: Image not found after pull**
- Pull the expected image directly: `docker pull microfluidica/openfoam:13`
- Check disk space: the image requires ~8 GB free.

---

### Test 2 fails: Container starts and responds

**Error: 404 — No such image**
- Test 1 must pass first. The image was not pulled correctly.

**Error: permission denied while trying to connect to the Docker daemon socket**
- On Linux: add your user to the `docker` group: `sudo usermod -aG docker $USER`, then log out and back in.

---

### Test 3 fails: blockMesh runs on cavity tutorial

**blockMesh exit code is non-zero**
- Check the blockMesh log printed in the test output for the actual error.
- The most common cause: the tutorial path inside the container has changed.
  Current expected path: `/opt/openfoam13/tutorials/incompressibleFluid/cavity`
  Verify with: `docker run --rm microfluidica/openfoam:13 ls /opt/openfoam13/tutorials/incompressibleFluid/`

**Log does not contain "End"**
- blockMesh ran but crashed before finishing. Read the full log in the test output.

---

### Test 4 fails: Solver runs 10 iterations

**"Time =" lines < 10**
- Check `controlDict` inside the cavity tutorial: `endTime` may be set too low.
  The default cavity tutorial runs to `endTime 0.5` with `deltaT 0.005` = 100 steps. This should never be < 10.

**Log contains "FOAM FATAL ERROR"**
- The solver crashed. The most common causes:
  1. blockMesh did not run correctly in this test (the test checks this — if Test 3 passed, this is a different issue)
  2. The OpenFOAM version changed and `foamRun` is no longer the correct entry point.
     Try: `docker run --rm microfluidica/openfoam:13 bash -c "source /opt/openfoam13/etc/bashrc && foamRun --help"`

**Timeout**
- The 3-minute timeout is generous for the cavity tutorial. If it times out, Docker may be heavily resource-constrained. Increase memory in Docker Desktop preferences (4 GB minimum recommended).

---

### Test 5 fails: Log readable from host via volume mount

**File does not exist on host**
- Volume mounts require Docker Desktop to have file sharing enabled for the `/tmp` path (macOS).
  Go to Docker Desktop → Settings → Resources → File Sharing → add `/tmp` (or `/private/tmp` on macOS).

**Log file is empty**
- The solver may have written to a different path. Check the test output for the container exit code.
- On macOS, the actual tmpdir may be under `/private/tmp`. The test uses `os.tmpdir()` which should return the correct path — if there is a symlink issue, verify with `node -e "const os = require('os'); console.log(os.tmpdir())"`.

**Permission denied reading the file**
- The container wrote the file as root. On Linux, `fs.readFileSync` from a non-root host user may fail.
  Fix: `chmod 644` the file inside the container before the test exits, or run Docker with `--user $(id -u):$(id -g)`.

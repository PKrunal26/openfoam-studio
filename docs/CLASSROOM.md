# OpenFOAM Studio Classroom

A website for teaching CFD with OpenFOAM. Students sign in, open a tutorial that
is **already solved**, explore its setup and results in a SimScale-style
workbench, then change a setting and re-run it on a shared server.

It lives in `classroom/` and reuses the desktop app's Docker runner (`core/`)
and 3D viewer (`renderer/lib/vtk/`). No LLM is involved, so there is no token
cost.

## Why it is cheap to run

- **Each tutorial is solved once.** The reference solution is computed when the
  server first starts (about one minute for all six tutorials on 4 vCPUs) and
  then served to every student.
- **Identical settings are solved once for the whole class.** A run is keyed by
  a hash of its generated case files. If thirty students do the same exercise,
  the first one triggers a solve and the other twenty-nine get the stored result
  instantly.
- **Runs are small and bounded.** Tutorials take 2 to 60 seconds. Each has a
  wall-clock limit, each form value is range-checked, and constraints reject
  combinations that would be too expensive.
- **A fixed number of solver slots.** Extra runs wait in a first-come queue; the
  machine is never oversubscribed.

## What students get

| Area | What it does |
|---|---|
| Tutorials page | Cards for each tutorial with status and the student's own run count |
| Simulation tree | Geometry, Model, Materials, Initial conditions, Boundary conditions, Numerics, Simulation control, Mesh, Case files, Simulation runs |
| Settings panels | Forms for each node, live derived values (Re, Co, Ra, St ...), warnings, the mesh patches a boundary condition is assigned to, and the OpenFOAM files it writes |
| 3D viewport | Mesh geometry with patch highlighting; results colored by any field, time animation, cutting plane (3D), velocity vectors, mesh edges, image export |
| Convergence plots | Residuals, maximum Courant number and monitors (force coefficients, inlet pressure), live while a run is solving |
| Solver log | Live log with the failure reason extracted when a run diverges |
| Case files | The real dictionaries generated from the forms, with changed lines highlighted. Students can edit a file by hand; edits pass the same safety policy as the desktop app |
| Guide | A step-by-step walkthrough with exercises for every tutorial |
| Job status | Queue position and progress of the student's runs |

## Tutorials

| # | Tutorial | Solver module | Topics | Reference solve |
|---|---|---|---|---|
| 1 | Lid-driven cavity | `incompressibleFluid` | case structure, Re, Courant number, schemes | 2 s |
| 2 | Backward-facing step | `incompressibleFluid` | steady RANS, turbulence models, wall functions, convergence | 3 s |
| 3 | Dam break | `incompressibleVoF` | VoF, `setFields`, adaptive time step | 7 s |
| 4 | Pipe junction flow | `incompressibleFluid` | 3D, two inlets, cutting planes, pressure drop | 5 s |
| 5 | Flow around a cylinder | `incompressibleFluid` | vortex shedding, force coefficients, Strouhal number | 55 s |
| 6 | Heated cavity | `fluid` | energy equation, Boussinesq, Rayleigh number | 15 s |

The case files were written for this project in the style of the standard
OpenFOAM Foundation tutorials (`cavity`, `pitzDaily`, `damBreak`, `TJunction`,
`cylinder`, `hotRoom`) and target OpenFOAM 13.

## Run it locally

Requirements: Node 22, Docker, about 3 GB of disk for the OpenFOAM image.

```bash
npm ci
```

```bash
npm run classroom:build
```

```bash
OFS_CLASS_CODE=cfd2026 OFS_INSTRUCTOR_CODE=teach npm run classroom:start
```

Open http://localhost:8080. The first start pulls `microfluidica/openfoam:13`
and solves the reference cases in the background; the tutorial cards show
"Solving reference" until they are ready.

For development with hot reload (API on 8080, web on 5174):

```bash
OFS_CLASS_CODE=cfd2026 npm run classroom:dev
```

## Deploy on a server (AWS EC2 or any Linux machine)

1. **Create the machine.** Ubuntu 24.04, x86-64. For a class of 30:
   `c7i.xlarge` (4 vCPU, 8 GB) is enough; `c7i.2xlarge` (8 vCPU, 16 GB) gives
   four solver slots. 40 GB of gp3 disk. Open inbound ports 80 and 443 (and 22
   for yourself).
2. **Install Docker.**

   ```bash
   curl -fsSL https://get.docker.com | sudo sh
   ```

3. **Get the code and configure it.**

   ```bash
   git clone https://github.com/PKrunal26/openfoam-studio.git && cd openfoam-studio
   ```

   ```bash
   cp classroom/.env.example classroom/.env
   ```

   Edit `classroom/.env`: set `OFS_CLASS_CODE`, `OFS_INSTRUCTOR_CODE` and
   `OFS_MAX_CONCURRENT_RUNS` (about vCPUs / 2). If you have a DNS name pointing
   at the machine, set `OFS_DOMAIN` to it and `OFS_SECURE_COOKIES=1`; HTTPS is
   then automatic.
4. **Start it.**

   ```bash
   sudo mkdir -p /srv/ofs-classroom
   ```

   ```bash
   sudo docker compose -f classroom/docker-compose.yml --env-file classroom/.env up -d --build
   ```

5. Open the site, sign in at `/admin` with the instructor code and wait for
   every reference solution to show **succeeded**. Give students the address
   and the class code.

To update later: `git pull`, then run the same `docker compose ... up -d --build`.
Accounts and results live in `/srv/ofs-classroom` and survive updates. Back up
that directory to keep student work.

### Cost guide

The numbers below are rough on-demand prices; check the AWS calculator for
your region.

| Setup | Approx. cost |
|---|---|
| `c7i.xlarge`, running 24/7 | about $130 per month |
| `c7i.2xlarge`, running 24/7 | about $260 per month |
| 40 GB gp3 disk | about $4 per month |

A 4-month course on a `c7i.xlarge` left running costs roughly half of a $1,000
credit. Stopping the instance outside teaching weeks (the disk and all student
work are kept) cuts that further. There is no per-student or per-run cost.

### Without Docker Compose

The server is a single Node process and can run directly on the host:

```bash
OFS_CLASS_CODE=... OFS_INSTRUCTOR_CODE=... OFS_CLASSROOM_DATA=/srv/ofs-classroom npm run classroom:start
```

Put any HTTPS reverse proxy in front of port 8080 and set `OFS_TRUST_PROXY=1`
so sign-in rate limits see real client addresses. If the process is not root,
it starts solver containers under its own user id so it can clean up their
files; that user must be allowed to use Docker.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `OFS_CLASS_NAME` | `CFD with OpenFOAM` | Shown on the sign-in page |
| `OFS_CLASS_CODE` | empty | Required to create an account. Empty means open enrolment; only use that on a private network |
| `OFS_INSTRUCTOR_CODE` | empty | Unlocks `/admin`. Empty disables the instructor view |
| `OFS_CLASSROOM_PORT` / `OFS_CLASSROOM_HOST` | `8080` / `0.0.0.0` | Listen address |
| `OFS_CLASSROOM_DATA` | `classroom/data` | Accounts, workspaces, results |
| `OFS_MAX_CONCURRENT_RUNS` | `2` | Solver slots. Each run may use 2 cores and 2 GB |
| `OFS_MAX_RUNS_PER_TUTORIAL` | `8` | Runs a student can keep per tutorial |
| `OFS_MAX_RUNS_PER_DAY` | `40` | New solves per student per day (cache hits are free) |
| `OFS_CACHE_MAX_GB` | `20` | Result storage budget; unreferenced results are evicted oldest first |
| `OFS_SECURE_COOKIES` | `0` | Set `1` behind HTTPS |
| `OFS_TRUST_PROXY` | `0` | Set `1` behind a reverse proxy |
| `OFS_AUTO_BAKE` | `1` | Solve missing reference cases on startup |
| `OFS_ALLOW_FRAMING` | `0` | Set `1` to allow the site inside an iframe (LMS embed). Cookies are `SameSite=Lax`, so embedded sign-in needs the same site |
| `OFS_SESSION_SECRET` | generated | Cookie signing key; generated into the data directory if unset |
| `OFS_MAX_STUDENTS` | `300` | Account cap |
| `OFS_OPENFOAM_IMAGE` | `microfluidica/openfoam:13` | Solver image |

## Instructor tasks

- **Overview** at `/admin`: students, when they were last active, runs per
  tutorial, the live queue and storage use.
- **Forgotten PIN**: the key icon next to a student sets a new one.
- **Remove a student**: the bin icon deletes the account and its runs.
- **Reference solutions**: "Solve missing" or "Re-solve all" from the overview,
  or from a shell:

  ```bash
  npm run classroom:bake
  ```

- **After changing a tutorial or the OpenFOAM image**, check that every
  dropdown option and every guide exercise still solves:

  ```bash
  npm run classroom:verify
  ```

## Accounts and privacy

Students choose a display name and a PIN; the class code gates sign-up. There
are no email addresses. PINs are stored as scrypt hashes. Sessions are signed,
HTTP-only cookies. The server stores each student's settings, edited files and
run list as JSON under the data directory, and nothing else.

## Safety model

Students never get a shell. What they can influence is limited to:

- **Form values**: numbers checked against a range, or one of a fixed list of
  options. They are substituted into case-file templates by a small arithmetic
  evaluator that has no access to anything but those values.
- **Hand-edited case files**: only files that already exist in the tutorial,
  at most 256 KB, and checked by `core/run/casePolicy.ts` (no `#codeStream`,
  `#calc`, coded function objects, `systemCall`, external includes or
  unreviewed libraries).

Every OpenFOAM command goes through the `core/docker/CommandRunner.ts`
allowlist and runs in a container with no network, a read-only root
filesystem, all capabilities dropped, and CPU, memory and process limits. Runs
also have a wall-clock limit per tutorial and an output-size guard.

Not covered: this is a classroom tool, not a hardened multi-tenant service.
Put it behind HTTPS, use a non-trivial class code, and do not reuse the
machine for anything sensitive.

## Add or change a tutorial

A tutorial is a folder in `classroom/tutorials/<id>/`:

```
tutorial.json   parameters, tree sections, run settings, result fields
guide.md        the walkthrough; each "## " heading becomes a step
case/           OpenFOAM case files (0/, constant/, system/) used as templates
thumbnail.png   optional card image
```

In case files, `{{ expression }}` is replaced when a run is created.
Expressions can use parameter ids, derived values, arithmetic and a few
functions (`round`, `sqrt`, `min`, `max`, `if(cond, a, b)` ...):

```
endTime         {{endTime}};
hex (0 1 2 3 4 5 6 7) ({{N}} {{N}} 1) simpleGrading (1 1 1)
value           uniform ({{Ulid}} 0 0);
```

`tutorial.json` in brief (see `classroom/tutorials/cavity/` for a complete,
small example and `classroom/server/tutorials.ts` for the schema):

- `params`: form inputs. `number` needs `min`/`max`; `select` needs `options`.
- `derived`: read-only values computed from parameters (`expr`).
- `constraints`: expressions that must hold. `level: "warning"` shows a notice;
  the default level blocks the run. Use them to protect the server.
- `sections`: which tree node each setting appears under, the mesh `patches`
  it is assigned to, the `files` it writes and fixed `rows` to display.
- `run`: `maxWallSeconds`, exported `fields`, `steady`, and `endTime` (an
  expression, used for the progress bar).
- `monitors`: plots from function-object output under `postProcessing/`.
- `verify`: parameter sets used by the guide's exercises, for
  `npm run classroom:verify`.

The server validates every tutorial at startup: unknown ids, defaults out of
range, placeholders that do not render, or content the safety policy rejects
stop it with a message naming the tutorial. Meshes must come from `blockMesh`
(the command allowlist has no other mesher).

## Layout

```
classroom/server/    config, accounts, tutorial templating, run pipeline, result cache, queue, HTTP API
classroom/web/       Vite + React workbench (built to classroom/web/dist)
classroom/tutorials/ the tutorial catalog
classroom/data/      runtime data (ignored by git)
tests/unit/classroom unit tests (npm run test:classroom)
```

## Known limits

- Meshes are limited to what `blockMesh` can build; no CAD import or
  snappyHexMesh yet.
- Results are exported as ASCII VTK and parsed in the browser, which suits
  meshes up to a few tens of thousands of cells.
- One server process, file-based storage: sized for a class, not a campus.
- No AI assistant in this build. The desktop app's agent could be added behind
  an instructor-provided key later.

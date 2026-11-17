# OpenFOAM Studio Classroom

A website for teaching CFD with OpenFOAM. Students sign in, open a tutorial that
is **already solved**, explore its setup and results in a browser workbench,
then change a setting and re-run it on a shared server.

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
| Tutorials page | One card per tutorial with a result preview, level and the student's own run count |
| Sidebar | Geometry, the setup steps (model, materials, initial and boundary conditions, numerics, simulation control, mesh), case files, and the list of runs with live progress |
| Inspector | The open setup step: inputs, live computed values (Re, Co, Ra, St ...), warnings, the mesh patches it is assigned to and the OpenFOAM files it writes |
| 3D viewport | Mesh geometry with patch highlighting; results colored by any field, time animation, cutting plane (3D), velocity vectors, mesh edges, image export |
| Run tabs | Fields, Convergence (residuals, Courant number, force and pressure monitors, live while solving), Log (with the failure reason extracted) and Settings (what the run used, against the reference) |
| Case files | The real dictionaries generated from the forms, with changed lines marked. Students can edit a file by hand; edits pass the same safety policy as the desktop app |
| Guide | A step-by-step walkthrough with exercises for every tutorial |

### Look and feel

One white sheet divided by hairlines, square corners, flat fills. The brand
device is a five-step viridis band (the colormap results are shown in), used
for the logo mark, the page strip, guide progress and level markers. Type:
Space Grotesk for names, IBM Plex Sans for text, IBM Plex Mono for anything a
solver would print (labels, units, file names, numbers). Tokens live in
`classroom/web/src/styles.css`; shared controls (custom select, segmented
control, switch, buttons) in `classroom/web/src/ui/primitives.tsx`.

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

### On your own Mac (and working on it live)

A Mac mini works well as the class server, and you can keep developing on the
same machine. The OpenFOAM image has a native arm64 build, so Apple silicon
runs it without emulation.

1. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/)
   (OrbStack or Colima also work) and Node 22. In Docker Desktop's resource
   settings give it about 2 CPUs and 2.5 GB of memory per solver slot.
2. Keep the repository under your home folder: Docker Desktop only shares
   `/Users` with containers by default, and solver containers mount the data
   directory (`classroom/data` unless you change it).
3. For the class, run the built server:

   ```bash
   npm ci && npm run classroom:build
   ```

   ```bash
   OFS_CLASS_CODE=... OFS_INSTRUCTOR_CODE=... npm run classroom:start
   ```

4. To work on it live without disturbing students, run a second, separate
   instance with hot reload on other ports and its own data folder:

   ```bash
   OFS_CLASSROOM_PORT=8090 OFS_CLASSROOM_DATA="$PWD/classroom/data-dev" OFS_CLASS_CODE=dev npm run classroom:dev
   ```

   The web app is then at http://localhost:5174. When you are happy with a
   change, rebuild and restart the class instance (step 3). A restart keeps
   accounts and results; a run that was in progress shows as interrupted and
   can be started again.
5. Students on the same network open `http://<the-mac's-address>:8080`. To
   reach it from anywhere with HTTPS and no router changes, put a tunnel in
   front of it, for example Cloudflare Tunnel:

   ```bash
   cloudflared tunnel --url http://localhost:8080
   ```

   or Tailscale Funnel. Then start the server with `OFS_SECURE_COOKIES=1` and
   `OFS_TRUST_PROXY=1`.
6. Stop the Mac from sleeping (System Settings, Energy, "Prevent automatic
   sleeping when the display is off"), or keep this running in a terminal:

   ```bash
   caffeinate -s
   ```

#### One command, on your own domain

`classroom/host-mac.sh` does steps 3, 5 and 6 in one go: it builds, creates
`classroom/.env` with random class and instructor codes on first run, starts
the server, keeps the Mac awake and publishes it through a named Cloudflare
Tunnel with HTTPS. Nothing changes on your router and your home address stays
private.

One-time preparation for a domain bought elsewhere (Porkbun, for example):

1. Create a free Cloudflare account, choose "Add a domain", enter the domain
   and pick the free plan. Cloudflare shows two nameservers.
2. At the registrar, replace the domain's nameservers with those two
   (Porkbun: Domain Management, Details, Authoritative Nameservers). Wait for
   Cloudflare to mark the domain active, usually within an hour.
3. On the Mac:

   ```bash
   brew install cloudflared
   ```

Then, from the repository:

```bash
bash classroom/host-mac.sh
```

The first run opens a browser to authorise `cloudflared` for the domain. The
default domain is `openfoamstudio.online`; set `OFS_PUBLIC_DOMAIN` for another
one, or `OFS_NO_TUNNEL=1` to serve the local network only. The script prints
the class and instructor codes each time it starts; edit `classroom/.env` to
change them. Local mode was run on Linux; the tunnel steps and macOS were not
run in development.

If Docker Desktop's default socket is turned off, set `DOCKER_HOST` to its
socket path before starting the server. This setup has been verified on Linux
only; the first start on macOS is the check that Docker file sharing and the
socket are set up as described.

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

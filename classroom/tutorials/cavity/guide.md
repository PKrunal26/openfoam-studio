## Overview

The lid-driven cavity is the "hello world" of CFD. A square box is filled with fluid. Three walls stand still; the top wall (the lid) slides to the right at constant speed and drags the fluid into a large recirculating vortex.

It is simple enough to solve in seconds, and it contains every ingredient of a real OpenFOAM case.

> This tutorial is already solved. Open **Run 1** in the Runs list on the left to see the result, then come back here.

### What you will learn

- How an OpenFOAM case is organised: `0/`, `constant/` and `system/`
- What a boundary condition is and where it is written
- How the Reynolds number and the Courant number control the flow and the stability of the solver

## The physics

The flow is incompressible and laminar. The solver module `incompressibleFluid` solves the Navier–Stokes equations for velocity **U** and kinematic pressure **p** (pressure divided by density, in m²/s²).

One number describes the whole problem, the **Reynolds number**:

```
Re = U L / ν
```

With lid speed U = 1 m/s, cavity size L = 0.1 m and viscosity ν = 0.01 m²/s, the reference case has Re = 10. That is a slow, syrupy flow, dominated by viscosity.

## Walk through the setup

Work down the **Setup** list on the left. Each entry opens its settings next to the model.

1. **Geometry** shows the mesh boundary. The faces are grouped into named *patches*.
2. **Materials → Fluid** sets the viscosity. It is written to `constant/physicalProperties`.
3. **Boundary conditions → Moving lid** assigns a fixed velocity to the `movingWall` patch. Notice the highlighted faces in the viewport and the **Written to** files at the bottom of the panel.
4. **Simulation control** sets the end time and time step in `system/controlDict`.
5. **Mesh** sets how many cells `blockMesh` creates.

> Every panel lists the files it writes to. Click one to open the real OpenFOAM dictionary under **Case files**. Lines that differ from the reference are highlighted.

## Read the results

Open **Run 1** from the Runs list (the **Fields** tab).

- The color shows velocity magnitude. It is fastest right under the lid and almost zero in the bottom corners.
- Press **play** to watch the flow start from rest. By t = 0.5 s it has stopped changing: it has reached a steady state.
- Switch the **Field** to pressure. There is a low-pressure spot in the top-left corner and a high-pressure spot in the top-right, where the lid pushes fluid into the wall.
- Turn on **Velocity vectors** to see the vortex.

Then open the **Convergence** tab. The residuals fall steadily, which is what a flow settling to steady state looks like.

## Exercise 1: raise the Reynolds number

1. Open **Materials → Fluid** and change the viscosity to `0.001`. The panel now shows Re = 100.
2. Press **Run simulation**. Watch its progress in the **Runs** list; it takes a few seconds.
3. Open the new run from the Runs list when it has finished.

### Questions

- Where is the centre of the vortex compared with Run 1? Why does it move in the direction of the lid?
- Play the animation. Has the flow reached a steady state at t = 0.5 s? If not, increase the **End time** and run again.

## Exercise 2: break it, then fix it

The **Courant number** tells you how many cells the fluid crosses in one time step:

```
Co = U Δt / Δx
```

1. Press **Reset changes** in the top bar to go back to the reference setup (Re = 10). Then, in **Mesh**, choose **80 × 80**. Look at **Simulation control**: the cell size has shrunk four times, so the Courant number is now 4, and a warning appears.
2. Run it anyway. The run fails. Open its **Log** tab and scroll to the end, then look at the **Convergence** tab. What do the residuals and the maximum Courant number do just before the crash?
3. Now set the **Time step** to `0.00125` so that Co = 1 again, and run once more.

> A finer mesh needs a smaller time step. This link between Δx and Δt is one of the most important practical rules in transient CFD.

## Exercise 3: numerical schemes

1. Reset your changes (top bar), then set the viscosity to `0.0005` (Re = 200) and the mesh to 40 × 40 with a time step of `0.0025`. Run it with the default **linear** convection scheme.
2. Change **Numerics → Convection scheme** to **upwind** and run again.
3. Compare the two runs' velocity fields.

Upwind is first-order accurate. It adds *numerical diffusion*, which acts like extra viscosity and smears the vortex. The solver never complains, so it is up to you to know what your schemes are doing.

## What you have learned

- An OpenFOAM case is three folders: `0/` (fields and boundary conditions), `constant/` (properties and mesh) and `system/` (time control and numerics).
- The Reynolds number sets the character of the flow; the Courant number sets whether the time stepping is stable.
- Mesh, time step and schemes are *numerical* choices. A good engineer checks that the answer does not depend on them.

Next: **Backward-facing step** introduces turbulence and steady-state solving.

## Overview

Air flows through a channel that suddenly gets taller. The flow cannot follow the sharp corner: it **separates**, forms a recirculation bubble behind the step and **reattaches** to the floor several step heights downstream.

This geometry is a standard test for turbulence models, and it is modelled on OpenFOAM's well-known `pitzDaily` tutorial.

### What you will learn

- Steady-state solving with the SIMPLE algorithm, where "time" counts iterations
- RANS turbulence modelling: k-epsilon, k-omega SST and wall functions
- How to judge convergence from residuals and a monitored quantity

## The physics

The Reynolds number based on the step height H = 25 mm is

```
Re = U H / ν = 10 × 0.025 / 1e-5 = 25 000
```

so the flow is turbulent. Resolving every eddy would need millions of cells. Instead a **RANS** model solves for the time-averaged flow and represents the turbulence by two extra transported quantities:

- **k**, the turbulent kinetic energy
- **ε** (or **ω**), its dissipation rate

Together they give an *eddy viscosity* `nut` that is added to the fluid's own viscosity.

At the inlet, k and ε are estimated from a turbulence intensity I and a mixing length. Open **Boundary conditions → Velocity inlet** to see the formulas and the resulting values.

## Walk through the setup

1. **Model → Turbulence** selects the RANS model in `constant/momentumTransport`.
2. **Boundary conditions → Walls**: each turbulence field has its own *wall function*. They model the thin near-wall layer so the mesh does not need to resolve it.
3. **Numerics**: the time scheme is `steadyState`. The relaxation factor damps the change from one iteration to the next.
4. **Simulation control**: the maximum number of iterations. The run stops earlier if all residuals fall below the residual target.

> Open **Case files → 0/nut** and **0/epsilon** to see how wall functions appear in the dictionaries.

## Read the results

Open **Run 1** from the Runs list (the **Fields** tab).

- **Velocity magnitude** shows the fast jet above the step and the slow recirculation region below it.
- Switch **Component** to **X**. Negative values (flow going backwards) mark the recirculation bubble. Where the near-wall x-velocity changes sign on the floor is the **reattachment point**. Estimate it in step heights (H = 0.025 m).
- Look at **k**: turbulence is produced in the shear layer between the jet and the bubble.

Open the **Convergence** tab. The run stopped after about 140 iterations because every residual passed 1e-3. The **Inlet pressure** monitor has levelled off, which is a second, independent sign of convergence.

## Exercise 1: compare turbulence models

1. Change **Model → Turbulence** to **k-omega SST** and run.
2. Find the reattachment point again.

### Questions

- Which model predicts the longer recirculation bubble?
- Experiments for this kind of step give a reattachment length of roughly 6 to 7 step heights. Which model is closer?

> Standard k-epsilon is known to under-predict separation. This is why engineers do not trust a single turbulence model blindly.

## Exercise 2: first-order versus second-order

1. Go back to k-epsilon. Set **Numerics → Velocity convection scheme** to **upwind** and run.
2. Compare the bubble length and the sharpness of the shear layer with Run 1.

Upwind converges easily, but its numerical diffusion thickens the shear layer and shortens the bubble.

## Exercise 3: how converged is converged?

1. Reset to the reference, then set the **Residual target** to **1e-4** and run.
2. Open the **Convergence** tab.

The residuals stop falling and hover around 5e-4. The run uses all its iterations without ever "converging": with a second-order scheme, the shear layer behind the step keeps flickering slightly and the steady solver cannot settle it.

- Does the **Inlet pressure** monitor still change in a way that matters for an engineer?
- Now run the same target with the **upwind** scheme. It converges. Why does a more diffusive scheme reach a lower residual, and does that make its answer better?

> A low residual means the equations *as discretised* are satisfied. It says nothing about whether the discretisation was accurate.

## Exercise 4: mesh sensitivity

Run the reference case on the **Coarse** and **Fine** meshes and note the reattachment length and the final inlet pressure for each. If the answer still changes from medium to fine, the medium mesh is not fine enough.

## What you have learned

- A steady RANS simulation iterates to a solution; residuals *and* monitored quantities tell you when to stop.
- The turbulence model is a modelling assumption that changes the answer.
- Low-order schemes buy robustness with accuracy.

Next: **Dam break** adds a second fluid and a free surface.

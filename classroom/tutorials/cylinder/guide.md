## Overview

A uniform stream flows past a circular cylinder. At very low speed the wake is steady and symmetric. Above a Reynolds number of about 47 it becomes unstable: vortices peel off the top and bottom alternately and drift downstream in two rows, the **von Kármán vortex street**.

The same mechanism makes cables hum in the wind and once brought down bridges.

### What you will learn

- Simulating a flow that is unsteady by nature
- Measuring forces with a function object: drag and lift coefficients
- Extracting a frequency and the Strouhal number from a time signal
- How numerical diffusion can remove real physics

## The physics

Only the Reynolds number matters, so the case uses unit values: D = 1 m, U = 1 m/s, ν = 0.01 m²/s, giving Re = 100.

The shedding frequency f is expressed by the **Strouhal number**

```
St = f D / U
```

For 50 < Re < 150, Roshko's measurements give St ≈ 0.212 (1 − 21.2 / Re), about 0.167 at Re = 100. Open **Materials → Fluid** to see the expected value and period for your settings.

The forces on the cylinder are made dimensionless as drag and lift coefficients:

```
Cd = F_drag / (½ ρ U² D)        Cl = F_lift / (½ ρ U² D)
```

## Walk through the setup

1. **Mesh**: turn on mesh edges in the toolbar and zoom in on the cylinder. An **O-grid** wraps it with cells clustered at the wall, where the boundary layer lives.
2. **Initial conditions**: the flow starts with a small cross-flow. This breaks the symmetry so that shedding starts within a few dozen time units.
3. **Boundary conditions → Pressure outlet**: `inletOutlet` lets vortices leave without reflecting.
4. **Case files → system/controlDict**: at the bottom is the `forceCoeffs` function object that records Cd and Cl every time step.

## Read the results

Open **Run 1** from the Runs list (the **Fields** tab) and press **play**. The run keeps its last 60 snapshots, about five shedding cycles.

- **Velocity magnitude** shows the wake swinging from side to side.
- **Pressure** shows each vortex as a low-pressure core.
- Turn on **Velocity vectors** and step through one cycle frame by frame.

Open the **Convergence** tab and scroll to **Force coefficients**.

- The lift coefficient oscillates around zero; the drag coefficient has a mean of about 1.5 and wobbles at twice the lift frequency.
- Hover over the lift curve and read off the times of two successive peaks. Their difference is the period T.
- Compute St = D / (T U) and compare it with the expected value.

> The reference run gives T ≈ 6.0 s, so St ≈ 0.166. Published values for Re = 100 are 0.164 to 0.167.

## Exercise 1: below the threshold

Set the viscosity to `0.03` (Re ≈ 33) and run.

- Does the wake still oscillate? What does the lift coefficient do?
- What happens to the drag coefficient at lower Reynolds number?

## Exercise 2: Strouhal number against Reynolds number

Run Re = 60, 100 and 200 (ν = 0.0167, 0.01, 0.005). For each, measure the period from the lift curve.

Plot St against Re and compare with Roshko's formula. This is how the original correlation was made, with a wind tunnel instead of a browser.

## Exercise 3: numerical diffusion kills the vortex street

1. At Re = 100, change **Numerics → Convection scheme** to **upwind** and run.
2. Compare the lift amplitude and the wake with Run 1.

First-order upwind adds so much artificial viscosity that the *effective* Reynolds number of the simulation drops. The shedding weakens or disappears, although the solver reports no problem at all.

### Question

Imagine you only had the upwind result. How could you have found out that it was wrong?

## Exercise 4: time accuracy

Run the reference case with **Time scheme → backward** (second order) and with **Maximum Courant number → 2**. How do the Strouhal number and the lift amplitude react to each change?

## What you have learned

- Some flows have no steady state; the transient *is* the answer.
- Function objects turn fields into engineering quantities while the solver runs.
- Validation means comparing a number you computed with one somebody measured.

Next: **Heated cavity** adds temperature and buoyancy.

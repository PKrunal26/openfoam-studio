## Overview

A column of water stands against the left wall of a tank, held by an imaginary dam. At t = 0 the dam vanishes. The water collapses, races across the floor, hits a small obstacle and throws a tongue of water at the far wall.

This is OpenFOAM's classic `damBreak` case and your first simulation with two fluids.

### What you will learn

- The volume-of-fluid (VoF) method and the phase fraction field `alpha.water`
- How `setFields` creates a non-uniform initial condition
- Adaptive time stepping driven by the Courant number
- Boundary conditions for an open atmosphere

## The physics

The solver module `incompressibleVoF` treats water and air as one fluid whose properties change with the **phase fraction** α:

- α = 1: the cell is full of water
- α = 0: the cell is full of air
- in between: the free surface passes through the cell

Density and viscosity are blended with α, and one extra transport equation moves α with the flow.

Gravity drives everything, so the solver works with `p_rgh = p − ρ g h`, the pressure with the hydrostatic part removed. That makes wall boundary conditions much simpler.

The front of the collapsing column moves at roughly twice the characteristic speed √(g h). Open **Model → Gravity** to see this value.

## Walk through the setup

1. **Materials** has three entries: the two fluids and the interface with its surface tension. Each phase has its own `physicalProperties` file.
2. **Initial conditions → Water column**: `system/setFieldsDict` fills a box with α = 1. The pipeline runs `setFields` after `blockMesh` and before the solver.
3. **Boundary conditions → Open top**: three linked conditions let air flow in or out freely while only air may enter.
4. **Simulation control**: there is no fixed time step. The solver picks the largest step that keeps the Courant number under the limit.

> Open **Case files → system/setFieldsDict**. Change the column size in the form and watch the `box` line update.

## Read the results

Open **Run 1** from the Runs list (the **Fields** tab). Yellow is water, dark purple is air.

- Press **play**. Follow the front along the floor, the impact on the obstacle at about t = 0.2 s and the splash against the right wall.
- Switch to **Velocity** and turn on **Velocity vectors** near the impact.
- Switch to **p_rgh** at the moment of impact. Where is the pressure highest?

Open the **Convergence** tab and look at the **maximum Courant number**: the solver holds it just under 1 by changing the time step.

## Exercise 1: the Moon

1. In **Model → Gravity** set g to `1.62`.
2. The characteristic speed drops by a factor of √6. Raise the **End time** to `2.5` so the water has time to cross the tank.
3. Run and compare with Run 1.

### Question

If you scale time by √(g/h), do the two runs look alike? This is *Froude scaling*, the basis of all model testing in hydraulics.

## Exercise 2: a taller, thinner column

Keep the water area about the same but make the column taller and thinner: set the width to `0.0776` and the height to `0.55`.

- Does the front reach the obstacle sooner or later?
- How high does the splash go on the right wall?

## Exercise 3: honey instead of water

Set the **liquid kinematic viscosity** to `0.005` (five thousand times water) and run.

- The front is slower and no longer breaks up. Why?
- Which term of the momentum equation has become important?

## Exercise 4: numerical accuracy

1. Reset to the reference and run with **Mesh resolution → Fine**.
2. Compare the free surface with the reference. Finer meshes resolve thinner sheets and smaller droplets.
3. In **Numerics**, set **Interface compression** to 0 and run on the reference mesh. The interface smears over several cells.

> A VoF result never becomes fully mesh-independent in the splashing phase: every refinement reveals smaller structures. Global quantities, such as the front arrival time, do converge.

## What you have learned

- VoF tracks a free surface with one extra scalar, the phase fraction.
- `setFields` builds initial conditions that are not uniform.
- Courant-limited adaptive time stepping keeps a violent flow stable.

Next: **Pipe junction flow** moves to three dimensions.

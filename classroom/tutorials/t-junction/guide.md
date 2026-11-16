## Overview

Two air streams meet in a T-shaped duct. The main stream flows straight through; a second stream enters from the side branch and has to turn through 90°. The combined flow leaves through a single outlet.

Junctions like this are everywhere in ventilation, piping and engine manifolds, and the pressure they cost is a standard engineering question.

### What you will learn

- Setting up a 3D internal flow with several inlets
- Looking inside a 3D result with a cutting plane
- Using a monitored quantity (inlet pressure) as an engineering result

## The physics

Both ducts are 50 mm square. With 2 m/s in the main duct the Reynolds number is about 6 500, so the flow is turbulent and the case uses a steady RANS model.

Because the flow is incompressible and both ducts have the same cross-section, mass conservation gives the outlet velocity directly:

```
U_out = U_main + U_branch
```

The outlet is held at zero pressure. The pressure the solver computes at each inlet is therefore the **pressure drop** of that path through the junction (per unit density, in m²/s²; multiply by 1.18 kg/m³ for pascals).

## Walk through the setup

1. **Geometry**: hover each patch in the list next to the model. There are two inlets, one outlet and the walls.
2. **Boundary conditions → Velocity inlet 1 / 2**: note the direction of each inlet velocity in `0/U`. The branch flows in −y.
3. **Mesh**: four blocks of cubic cells. Open **Case files → system/blockMeshDict** and find the `defaultPatch` entry: every face you do not name becomes a wall.

> Rotate the model with the left mouse button, pan with Shift, zoom with the wheel. The **XY** button gives the side view.

## Read the results

Open **Run 1** from the Runs list (the **Fields** tab). The view shows a **cutting plane** through the middle of the duct, with the walls drawn transparent.

- The branch flow is pushed against the downstream wall of the junction and accelerates. Just after the corner there is a slow **separation zone** on the upper wall.
- Change the cutting plane **Normal** to **X** and move the **Position** slider to slide a cross-section along the main duct. Downstream of the junction the fastest flow sits low in the duct.
- Switch to **pressure**. The stagnation point where the branch flow meets the main stream shows as a high-pressure spot on the floor.

Open the **Convergence** tab and scroll to **Inlet pressures**. Both inlets need about 8.7 m²/s², roughly 10 Pa, to drive this flow.

## Exercise 1: change the flow split

1. Set **Velocity inlet 2** to `3` m/s so the branch carries more than the main duct.
2. Run and compare.

### Questions

- How do the two inlet pressures change? Which path is now more expensive?
- How large is the separation zone compared with Run 1?

## Exercise 2: close the branch

Set the branch velocity to `0`. The case becomes a straight duct with a dead-end side cavity.

- What is the main-inlet pressure now? This is the friction loss of the plain duct.
- Subtract it from the Run 1 value to estimate the extra loss caused by the junction.

## Exercise 3: is the mesh fine enough?

Run the reference settings on the **Coarse** and **Fine** meshes. Make a small table of mesh size against main-inlet pressure.

> With wall functions, the first cell must not be too thin. A mesh-independence study with RANS is about the bulk of the flow, not about resolving the wall layer.

## Exercise 4: your own question

Pick one: a different turbulence model, the upwind scheme, or a tenfold change in viscosity. Predict what will happen to the inlet pressures *before* you run, then check.

## What you have learned

- A 3D case is set up exactly like a 2D one; only the mesh and the way you look at results change.
- Cutting planes are the basic tool for looking inside a volume.
- Engineering answers are usually single numbers, and a monitor tracks them through the run.

Next: **Flow around a cylinder**, where the flow never becomes steady.

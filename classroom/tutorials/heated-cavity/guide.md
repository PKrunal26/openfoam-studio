## Overview

A closed, air-filled square cavity has a warm left wall and a cool right wall. Nothing pushes the air, yet it moves: air heated at the warm wall becomes lighter and rises, air cooled at the other wall sinks, and a single large circulation carries heat across the cavity.

This is **natural convection**, the mechanism behind radiators, double glazing and electronics cooling. The differentially heated cavity is also a classic benchmark with published reference solutions.

### What you will learn

- Solving an energy equation with the `fluid` solver module
- Thermophysical properties and the Boussinesq approximation
- The Rayleigh number and how it shapes the flow
- Heat-transfer boundary conditions: fixed temperature and adiabatic

## The physics

Density differences drive the flow. For small temperature differences the **Boussinesq approximation** keeps the density constant everywhere except in the gravity term, where it varies linearly:

```
ρ = ρ₀ (1 − β (T − T₀))
```

β is the thermal expansion coefficient, 1/T for an ideal gas.

The governing number is the **Rayleigh number**

```
Ra = g β ΔT L³ / (ν α)
```

which compares buoyancy with the two diffusion processes that oppose it: viscosity ν and thermal diffusivity α = ν / Pr. Open **Materials → Air** to see Ra for the current settings. The reference case has Ra ≈ 1.2 × 10⁵.

- Ra below about 10³: heat crosses by conduction, the air barely moves
- 10⁴ to 10⁶: steady laminar circulation with boundary layers on the walls
- above about 10⁸: turbulent

## Walk through the setup

1. **Model → Gravity**: `constant/g`. Without it the solution is pure conduction.
2. **Materials → Air**: open `constant/physicalProperties` from the panel. The `thermoType` block selects the equation of state and the energy variable.
3. **Boundary conditions**: the hot and cold walls have fixed temperatures; the top and bottom are *adiabatic* (`zeroGradient`, no heat flux).
4. **Case files → 0/p_rgh**: as in the dam break, the solver works with pressure minus its hydrostatic part.

## Read the results

Open **Run 1** from the Runs list (the **Fields** tab).

- **Temperature**: the isotherms are vertical only in thin layers at the two walls. In the core they lie almost flat: the air is **stratified**, warm on top and cool below.
- Press **play** to watch the circulation develop from still air and settle.
- **Velocity**: the air moves fastest in narrow jets along the heated and cooled walls. The core hardly moves. Turn on **Velocity vectors** to see the direction.

> The thin fast layers at the walls are boundary layers. Their thickness scales with Ra^(−1/4), which is why high Rayleigh numbers need finer meshes.

## Exercise 1: towards pure conduction

Raise the **dynamic viscosity** to `0.0003`. Check that Ra is now a few hundred, and run.

- What do the isotherms look like? Compare them with a pure-conduction solution (straight vertical lines).
- How fast does the air move compared with Run 1?

## Exercise 2: stronger convection

1. Reset, then set the hot wall to `330` K and the cold wall to `270` K. Note the Boussinesq warning: with ΔT / T = 20 % the approximation is being stretched.
2. Ra is now about 7 × 10⁵. Use the **60 × 60** mesh and run.

### Questions

- How have the wall layers changed?
- Is the core more or less stratified than in Run 1?

## Exercise 3: turn gravity down

Set g to `1` m/s². Ra drops by a factor of ten.

- How long does the flow take to settle now? You may need a longer **End time**.
- Compare the velocity scale √(g β ΔT L) with the maximum velocity in your result.

## Exercise 4: a different fluid

Change the **Prandtl number** to `7` (water-like) while keeping everything else. Ra rises about tenfold because the thermal diffusivity falls.

- Which is now thinner, the velocity boundary layer or the thermal one?

## What you have learned

- Adding heat transfer means one more field (T), one more equation (energy) and thermophysical properties.
- In natural convection the flow and the temperature are fully coupled: each drives the other.
- A dimensionless number, here Ra, tells you the regime before you run anything.

You have now worked through incompressible, turbulent, multiphase, 3D, unsteady and thermal cases. Every OpenFOAM case you meet from here on is a variation of these.

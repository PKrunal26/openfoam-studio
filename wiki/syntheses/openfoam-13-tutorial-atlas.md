---
type: synthesis
status: stable
confidence: high
sources:
  - https://doc.cfd.direct/openfoam/user-guide-v13/tutorials
  - local-openfoam-image:microfluidica/openfoam:13
  - local-runtime-alias:openfoam-ubuntu24.04:latest
tags:
  - openfoam
  - openfoam13
  - tutorials
updated: 2026-04-14
---

# OpenFOAM 13 Tutorial Atlas

## Question

Which tutorials ship with OpenFOAM 13 Foundation, and how should OpenFOAM Studio navigate them breadth-first?

## Answer

The local OpenFOAM 13 image used by this repo ships with **252 runnable tutorial case roots**.
For breadth-first navigation, treat the first directory under `$FOAM_TUTORIALS` as the primary family, then drill into the named case folders that contain `system/controlDict`.
Folders such as `resources/`, validation folders, helper meshes, and setup-only parents are not counted as runnable tutorials unless they themselves contain `system/controlDict`.

### Top-level families

- `XiFluid` (4) — Premixed combustion and engine-oriented Xi flame-speed cases.
- `compressibleMultiphaseVoF` (1) — Compressible multi-phase interface-capturing cases.
- `compressibleVoF` (8) — Compressible volume-of-fluid free-surface and cavitation-style cases.
- `fluid` (30) — General single-region fluid tutorials spanning laminar, turbulent, buoyant, acoustic, and radiation problems.
- `incompressibleDenseParticleFluid` (5) — Eulerian-Lagrangian dense particle transport in incompressible carriers.
- `incompressibleDriftFlux` (3) — Mixture-model drift-flux tutorials for dispersed incompressible multiphase flow.
- `incompressibleFluid` (53) — The largest modern fluid family, covering canonical internal, external, rotating, atmospheric, and validation cases.
- `incompressibleMultiphaseVoF` (4) — Incompressible multi-phase VOF cases with more than two phases.
- `incompressibleVoF` (33) — Incompressible free-surface, wave, ship, sloshing, and mixer cases.
- `isothermalFilm` (1) — Isothermal liquid-film surface-flow tutorials.
- `isothermalFluid` (2) — Potential-flow free-surface cases without thermal coupling.
- `legacy` (21) — Older solver-specific tutorials retained for reference and migration.
- `mesh` (8) — Mesh-generation and mesh-manipulation tutorials rather than physics cases.
- `movingMesh` (1) — Moving-mesh and terrain-following mesh motion examples.
- `multiRegion` (21) — Conjugate heat-transfer and coupled film-region tutorials.
- `multicomponentFluid` (18) — Reactive, multi-species, and combustion-oriented fluid cases.
- `multiphaseEuler` (27) — Euler-Euler multiphase reactor, boiling, bubble, and granular-flow cases.
- `potentialFoam` (2) — Potential-flow initialization and comparison cases.
- `shockFluid` (8) — Compressible high-Mach and shock-dominated tutorials.
- `solidDisplacement` (2) — Solid mechanics tutorials for displacement and stress solvers.

## Evidence

- Inventory method: `find "$FOAM_TUTORIALS" -type f -path "*/system/controlDict"` inside `microfluidica/openfoam:13`
- Counting rule: one runnable tutorial per directory that owns a `system/controlDict`
- Repo alignment: onboarding prepares the local runtime alias `openfoam-ubuntu24.04:latest` from `microfluidica/openfoam:13`

## Breadth-First Map

### XiFluid (4)

Premixed combustion and engine-oriented Xi flame-speed cases.

- `XiFluid/1D`
- `XiFluid/engine2Valve2D`
- `XiFluid/kivaTest`
- `XiFluid/stratified`

### compressibleMultiphaseVoF (1)

Compressible multi-phase interface-capturing cases.

- `compressibleMultiphaseVoF/damBreak4phaseLaminar`

### compressibleVoF (8)

Compressible volume-of-fluid free-surface and cavitation-style cases.

- `compressibleVoF/angledDuct`
- `compressibleVoF/ballValve`
- `compressibleVoF/climbingRod`
- `compressibleVoF/damBreak`
- `compressibleVoF/depthCharge2D`
- `compressibleVoF/depthCharge3D`
- `compressibleVoF/sloshingTank2D`
- `compressibleVoF/throttle`

### fluid (30)

General single-region fluid tutorials spanning laminar, turbulent, buoyant, acoustic, and radiation problems.

- `fluid/BernardCells`
- `fluid/aerofoilNACA0012`
- `fluid/aerofoilNACA0012Steady`
- `fluid/angledDuct`
- `fluid/angledDuctExplicitFixedCoeff`
- `fluid/angledDuctLTS`
- `fluid/annularThermalMixer`
- `fluid/blockedChannel`
- `fluid/buoyantCavity`
- `fluid/cavity`
- `fluid/decompressionTank/decompressionTank`
- `fluid/externalCoupledCavity`
- `fluid/forwardStep`
- `fluid/helmholtzResonance`
- `fluid/hotRadiationRoom`
- `fluid/hotRadiationRoomFvDOM`
- `fluid/hotRoom`
- `fluid/hotRoomBoussinesq`
- `fluid/hotRoomBoussinesqSteady`
- `fluid/hotRoomComfort`
- `fluid/iglooWithFridges`
- `fluid/mixerVessel2DMRF`
- `fluid/nacaAirfoil`
- `fluid/pitzDaily`
- `fluid/prism`
- `fluid/shockTube`
- `fluid/squareBend`
- `fluid/squareBendLiq`
- `fluid/squareBendLiqSteady`
- `fluid/stackPlume`

### incompressibleDenseParticleFluid (5)

Eulerian-Lagrangian dense particle transport in incompressible carriers.

- `incompressibleDenseParticleFluid/Goldschmidt`
- `incompressibleDenseParticleFluid/GoldschmidtMPPIC`
- `incompressibleDenseParticleFluid/column`
- `incompressibleDenseParticleFluid/cyclone`
- `incompressibleDenseParticleFluid/injectionChannel`

### incompressibleDriftFlux (3)

Mixture-model drift-flux tutorials for dispersed incompressible multiphase flow.

- `incompressibleDriftFlux/dahl`
- `incompressibleDriftFlux/mixerVessel2DMRF`
- `incompressibleDriftFlux/tank3D`

### incompressibleFluid (53)

The largest modern fluid family, covering canonical internal, external, rotating, atmospheric, and validation cases.

- `incompressibleFluid/T3A`
- `incompressibleFluid/TJunction`
- `incompressibleFluid/TJunctionFan`
- `incompressibleFluid/airFoil2D`
- `incompressibleFluid/ballValve`
- `incompressibleFluid/blockedChannel`
- `incompressibleFluid/boxTurb16`
- `incompressibleFluid/cavity`
- `incompressibleFluid/cavityCoupledU`
- `incompressibleFluid/channel395`
- `incompressibleFluid/cylinder`
- `incompressibleFluid/ductSecondaryFlow`
- `incompressibleFluid/elipsekkLOmega`
- `incompressibleFluid/flowWithOpenBoundary`
- `incompressibleFluid/hopperParticles/hopperEmptying`
- `incompressibleFluid/hopperParticles/hopperInitialState`
- `incompressibleFluid/impeller`
- `incompressibleFluid/mixerSRF`
- `incompressibleFluid/mixerVessel2D`
- `incompressibleFluid/mixerVessel2DMRF`
- `incompressibleFluid/mixerVesselHorizontal2DParticles`
- `incompressibleFluid/motorBike/motorBike`
- `incompressibleFluid/motorBikeSteady`
- `incompressibleFluid/movingCone`
- `incompressibleFluid/offsetCylinder`
- `incompressibleFluid/oscillatingInlet`
- `incompressibleFluid/pipeCyclic`
- `incompressibleFluid/pitzDaily`
- `incompressibleFluid/pitzDailyLES`
- `incompressibleFluid/pitzDailyLESDevelopedInlet`
- `incompressibleFluid/pitzDailyLTS`
- `incompressibleFluid/pitzDailyPulse`
- `incompressibleFluid/pitzDailyScalarTransport`
- `incompressibleFluid/pitzDailySteady`
- `incompressibleFluid/pitzDailySteadyExperimentalInlet`
- `incompressibleFluid/planarContraction`
- `incompressibleFluid/planarCouette`
- `incompressibleFluid/planarPoiseuille`
- `incompressibleFluid/porousBlockage`
- `incompressibleFluid/propeller`
- `incompressibleFluid/roomResidenceTime`
- `incompressibleFluid/rotor2D`
- `incompressibleFluid/rotor2DSRF`
- `incompressibleFluid/rotorDisk`
- `incompressibleFluid/simpleRushtonMRF`
- `incompressibleFluid/simpleRushtonNCC`
- `incompressibleFluid/turbineSiting`
- `incompressibleFluid/venturiTube`
- `incompressibleFluid/waveSubSurface`
- `incompressibleFluid/windAroundBuildings`
- `incompressibleFluid/wingMotion/wingMotion2D_steady`
- `incompressibleFluid/wingMotion/wingMotion2D_transient`
- `incompressibleFluid/wingMotion/wingMotion_snappyHexMesh`

### incompressibleMultiphaseVoF (4)

Incompressible multi-phase VOF cases with more than two phases.

- `incompressibleMultiphaseVoF/damBreak4phase`
- `incompressibleMultiphaseVoF/damBreak4phaseFineLaminar`
- `incompressibleMultiphaseVoF/damBreak4phaseLaminar`
- `incompressibleMultiphaseVoF/mixerVessel2DMRF`

### incompressibleVoF (33)

Incompressible free-surface, wave, ship, sloshing, and mixer cases.

- `incompressibleVoF/DTCHull`
- `incompressibleVoF/DTCHullMoving`
- `incompressibleVoF/DTCHullWave`
- `incompressibleVoF/angledDuct`
- `incompressibleVoF/capillaryRise`
- `incompressibleVoF/cavitatingBullet`
- `incompressibleVoF/climbingRod`
- `incompressibleVoF/containerDischarge2D`
- `incompressibleVoF/damBreak3D`
- `incompressibleVoF/damBreakLaminar`
- `incompressibleVoF/floatingObject`
- `incompressibleVoF/floatingObjectWaves`
- `incompressibleVoF/forcedUpstreamWave`
- `incompressibleVoF/mixerVessel`
- `incompressibleVoF/mixerVessel2DMRF`
- `incompressibleVoF/mixerVesselHorizontal2D`
- `incompressibleVoF/nozzleFlow2D`
- `incompressibleVoF/parshallFlume`
- `incompressibleVoF/planingHullW3`
- `incompressibleVoF/propeller`
- `incompressibleVoF/rotatingCube`
- `incompressibleVoF/sloshingCylinder`
- `incompressibleVoF/sloshingTank2D`
- `incompressibleVoF/sloshingTank2D3DoF`
- `incompressibleVoF/sloshingTank3D`
- `incompressibleVoF/sloshingTank3D3DoF`
- `incompressibleVoF/sloshingTank3D6DoF`
- `incompressibleVoF/testTubeMixer`
- `incompressibleVoF/trayedPipe`
- `incompressibleVoF/waterChannel`
- `incompressibleVoF/wave`
- `incompressibleVoF/wave3D`
- `incompressibleVoF/weirOverflow`

### isothermalFilm (1)

Isothermal liquid-film surface-flow tutorials.

- `isothermalFilm/rivuletPanel`

### isothermalFluid (2)

Potential-flow free-surface cases without thermal coupling.

- `isothermalFluid/potentialFreeSurfaceMovingOscillatingBox`
- `isothermalFluid/potentialFreeSurfaceOscillatingBox`

### legacy (21)

Older solver-specific tutorials retained for reference and migration.

#### legacy/basic (2)

- `legacy/basic/financialFoam/europeanCall`
- `legacy/basic/laplacianFoam/flange`

#### legacy/compressible (2)

- `legacy/compressible/rhoPorousSimpleFoam/angledDuctExplicit`
- `legacy/compressible/rhoPorousSimpleFoam/angledDuctImplicit`

#### legacy/electromagnetics (2)

- `legacy/electromagnetics/electrostaticFoam/chargedWire`
- `legacy/electromagnetics/mhdFoam/hartmann`

#### legacy/incompressible (8)

- `legacy/incompressible/adjointShapeOptimisationFoam/pitzDaily`
- `legacy/incompressible/icoFoam/cavity/cavity`
- `legacy/incompressible/icoFoam/cavity/cavityClipped`
- `legacy/incompressible/icoFoam/cavity/cavityGrade`
- `legacy/incompressible/icoFoam/elbow`
- `legacy/incompressible/porousSimpleFoam/angledDuctExplicit`
- `legacy/incompressible/porousSimpleFoam/angledDuctImplicit`
- `legacy/incompressible/shallowWaterFoam/squareBump`

#### legacy/lagrangian (7)

- `legacy/lagrangian/dsmcFoam/freeSpacePeriodic`
- `legacy/lagrangian/dsmcFoam/freeSpaceStream`
- `legacy/lagrangian/dsmcFoam/supersonicCorner`
- `legacy/lagrangian/dsmcFoam/wedge15Ma5`
- `legacy/lagrangian/mdEquilibrationFoam/periodicCubeArgon`
- `legacy/lagrangian/mdEquilibrationFoam/periodicCubeWater`
- `legacy/lagrangian/mdFoam/nanoNozzle`

### mesh (8)

Mesh-generation and mesh-manipulation tutorials rather than physics cases.

#### mesh/blockMesh (4)

- `mesh/blockMesh/pipe`
- `mesh/blockMesh/sphere`
- `mesh/blockMesh/sphere7`
- `mesh/blockMesh/sphere7ProjectedEdges`

#### mesh/refineMesh (1)

- `mesh/refineMesh/sector`

#### mesh/snappyHexMesh (2)

- `mesh/snappyHexMesh/flange`
- `mesh/snappyHexMesh/pipe`

#### mesh/spiralPipe (1)

- `mesh/spiralPipe`

### movingMesh (1)

Moving-mesh and terrain-following mesh motion examples.

- `movingMesh/SnakeRiverCanyon`

### multiRegion (21)

Conjugate heat-transfer and coupled film-region tutorials.

#### multiRegion/CHT (13)

- `multiRegion/CHT/VoFcoolingCylinder2D`
- `multiRegion/CHT/circuitBoardCooling`
- `multiRegion/CHT/coolingCylinder2D`
- `multiRegion/CHT/coolingSphere`
- `multiRegion/CHT/engine2Valve2D`
- `multiRegion/CHT/heatExchanger`
- `multiRegion/CHT/heatedDuct`
- `multiRegion/CHT/misalignedDuct`
- `multiRegion/CHT/multiphaseCoolingCylinder2D`
- `multiRegion/CHT/notchedRoller`
- `multiRegion/CHT/reverseBurner`
- `multiRegion/CHT/shellAndTubeHeatExchanger`
- `multiRegion/CHT/wallBoiling`

#### multiRegion/film (8)

- `multiRegion/film/VoFToFilm`
- `multiRegion/film/cylinder`
- `multiRegion/film/cylinderDripping`
- `multiRegion/film/cylinderVoF`
- `multiRegion/film/hotBoxes`
- `multiRegion/film/rivuletBox`
- `multiRegion/film/rivuletPanel`
- `multiRegion/film/splashPanel`

### multicomponentFluid (18)

Reactive, multi-species, and combustion-oriented fluid cases.

- `multicomponentFluid/DLR_A_LTS`
- `multicomponentFluid/aachenBomb`
- `multicomponentFluid/counterFlowFlame2D`
- `multicomponentFluid/counterFlowFlame2DLTS`
- `multicomponentFluid/counterFlowFlame2DLTS_GRI_TDAC`
- `multicomponentFluid/counterFlowFlame2D_GRI`
- `multicomponentFluid/counterFlowFlame2D_GRI_TDAC`
- `multicomponentFluid/filter`
- `multicomponentFluid/lockExchange`
- `multicomponentFluid/membrane`
- `multicomponentFluid/nc7h16`
- `multicomponentFluid/parcelInBox`
- `multicomponentFluid/simplifiedSiwek`
- `multicomponentFluid/smallPoolFire2D`
- `multicomponentFluid/smallPoolFire3D`
- `multicomponentFluid/verticalChannel`
- `multicomponentFluid/verticalChannelLTS`
- `multicomponentFluid/verticalChannelSteady`

### multiphaseEuler (27)

Euler-Euler multiphase reactor, boiling, bubble, and granular-flow cases.

- `multiphaseEuler/Grossetete`
- `multiphaseEuler/LBend`
- `multiphaseEuler/aeratedStirredTankMRF`
- `multiphaseEuler/bed`
- `multiphaseEuler/boilingBed`
- `multiphaseEuler/bubbleColumn`
- `multiphaseEuler/bubbleColumnEvaporating`
- `multiphaseEuler/bubbleColumnEvaporatingDissolving`
- `multiphaseEuler/bubbleColumnEvaporatingReacting`
- `multiphaseEuler/bubbleColumnIATE`
- `multiphaseEuler/bubbleColumnLES`
- `multiphaseEuler/bubbleColumnLaminar`
- `multiphaseEuler/bubblePipe`
- `multiphaseEuler/damBreak4phase`
- `multiphaseEuler/fluidisedBed`
- `multiphaseEuler/fluidisedBedLaminar`
- `multiphaseEuler/hydrofoil`
- `multiphaseEuler/injection`
- `multiphaseEuler/mixerVessel2D`
- `multiphaseEuler/mixerVessel2DMRF`
- `multiphaseEuler/pipeBend`
- `multiphaseEuler/steamInjection`
- `multiphaseEuler/titaniaSynthesis`
- `multiphaseEuler/titaniaSynthesisSurface`
- `multiphaseEuler/wallBoilingIATE`
- `multiphaseEuler/wallBoilingPolydisperse`
- `multiphaseEuler/wallBoilingPolydisperseTwoGroups`

### potentialFoam (2)

Potential-flow initialization and comparison cases.

- `potentialFoam/cylinder`
- `potentialFoam/pitzDaily`

### shockFluid (8)

Compressible high-Mach and shock-dominated tutorials.

- `shockFluid/LadenburgJet60psi`
- `shockFluid/biconic25-55Run35`
- `shockFluid/diffuserIntake`
- `shockFluid/forwardStep`
- `shockFluid/movingCone`
- `shockFluid/obliqueShock`
- `shockFluid/shockTube`
- `shockFluid/wedge15Ma5`

### solidDisplacement (2)

Solid mechanics tutorials for displacement and stress solvers.

- `solidDisplacement/beamEndLoad`
- `solidDisplacement/plateHole`

## Caveats

- This page documents the tutorials present in `microfluidica/openfoam:13` on 2026-04-14, not every tutorial that may exist in other OpenFOAM forks or future releases.
- Some tutorial names are self-explanatory but still require opening the case directory, `README`, or `Allrun` for detailed setup logic.
- Nested paths such as `incompressibleFluid/wingMotion/wingMotion2D_transient` are listed at the runnable case-root level so the atlas stays faithful to what can actually be executed.

## Related pages

- [[README]]
- [[openfoam-13-agent-guide]]
- [[solver-selection]]
- [[lid-driven-cavity]]

## Confidence

High for the case inventory and counts, because they were enumerated directly from the local OpenFOAM 13 image used by the repo. Medium for semantic interpretation of each family name, because that part is inferred from OpenFOAM naming conventions rather than from a single official index page.

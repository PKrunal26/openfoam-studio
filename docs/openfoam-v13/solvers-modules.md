---
source: https://doc.cfd.direct/openfoam/user-guide-v13/solvers-modules
title: OpenFOAM v13 User Guide - 3.5 Solver modules
slug: solvers-modules
---
### How is a solver module programmed in OpenFOAM?

Our Programming CFD course demonstrates coding a solver module in OpenFOAM

[Programming CFD](https://cfd.direct/openfoam-training/programming-cfd "Programming CFD")

\[**version 13**\]\[[version 12](../user-guide-v12)\]\[[version 11](../user-guide-v11)\]\[[version 10](../user-guide-v10)\]\[[version 9](../user-guide-v9)\]\[[version 8](../user-guide-v8)\]\[[version 7](../user-guide-v7)\]\[[version 6](../user-guide-v6)\]

\[[chapter contents](applications)\]\[[previous topic](running-applications-parallel)\]\[[next topic](standard-solvers)\]\[[index](bookindex)\]

## 3.5 Solver modules

From OpenFOAM version 11, application solvers, e.g. simpleFoam have been largely replaced by the generic foamRun solver which loads a solver module, e.g. incompressibleFluid that defines the flow solution. Solver modules are located in the $FOAM\_MODULES directory. The current solver modules distributed with OpenFOAM are listed below.

### 3.5.1 Single-phase modules

  
fluid

Solver module for steady or transient turbulent flow of compressible fluids with heat-transfer for HVAC and similar applications, with optional mesh motion and change.

  
incompressibleDenseParticleFluid

Solver module for transient flow of incompressible isothermal fluids coupled with particle clouds including the effect of the volume fraction of particles on the continuous phase, with optional mesh motion and change.

  
incompressibleFluid

Solver module for steady or transient turbulent flow of incompressible isothermal fluids with optional mesh motion and change.

  
multicomponentFluid

Solver module for steady or transient turbulent flow of compressible multicomponent fluids with optional mesh motion and change.

  
shockFluid

Solver module for density-based solution of compressible flow

  
XiFluid

Solver module for compressible premixed/partially-premixed combustion with turbulence modelling.

### 3.5.2 Multiphase/VoF flow modules

  
compressibleMultiphaseVoF

Solver module for the solution of multiple compressible, isothermal immiscible fluids using a VOF (volume of fluid) phase-fraction based interface capturing approach, with optional mesh motion and mesh topology changes including adaptive re-meshing.

  
compressibleVoF

Solver module for for 2 compressible, non-isothermal immiscible fluids using a VOF (volume of fluid) phase-fraction based interface capturing approach, with optional mesh motion and mesh topology changes including adaptive re-meshing.

  
incompressibleDriftFlux

Solver module for 2 incompressible fluids using the mixture approach with the drift-flux approximation for relative motion of the phases, with optional mesh motion and mesh topology changes including adaptive re-meshing.

  
incompressibleMultiphaseVoF

Solver module for the solution of multiple incompressible, isothermal immiscible fluids using a VOF (volume of fluid) phase-fraction based interface capturing approach, with optional mesh motion and mesh topology changes including adaptive re-meshing.

  
incompressibleVoF

Solver module for for 2 incompressible, isothermal immiscible fluids using a VOF (volume of fluid) phase-fraction based interface capturing approach, with optional mesh motion and mesh topology changes including adaptive re-meshing.

  
isothermalFluid

Solver module for steady or transient turbulent flow of compressible isothermal fluids with optional mesh motion and change.

  
multiphaseEuler

Solver module for a system of any number of compressible fluid phases with a common pressure, but otherwise separate properties. The type of phase model is run time selectable and can optionally represent multiple species and in-phase reactions. The phase system is also run time selectable and can optionally represent different types of momentum, heat and mass transfer.

### 3.5.3 Solid modules

  
solid

Solver module for thermal transport in solid domains and regions for conjugate heat transfer, HVAC and similar applications, with optional mesh motion and mesh topology changes.

  
solidDisplacement

Solver module for steady or transient segregated finite-volume solution of linear-elastic, small-strain deformation of a solid body, with optional thermal diffusion and thermal stresses.

### 3.5.4 Film modules

  
isothermalFilm

Solver module for flow of compressible isothermal liquid films

  
film

Solver module for flow of compressible liquid films

### 3.5.5 Utility modules

  
functions

Solver module to execute the functionObjects for a specified

  
movingMesh

Solver module to move the mesh.

### 3.5.6 Base classes for solver modules

  
fluidSolver

Base solver module for fluid solvers.

  
twoPhaseSolver

Solver module base-class for for 2 immiscible fluids, with optional mesh motion and mesh topology changes including adaptive re-meshing.

  
twoPhaseVoFSolver

Solver module base-class for for 2 immiscible fluids using a VOF (volume of fluid) phase-fraction based interface capturing approach, with optional mesh motion and mesh topology changes including adaptive re-meshing.

  
VoFSolver

Base solver module base-class for the solution of immiscible fluids using a VOF (volume of fluid) phase-fraction based interface capturing approach, with optional mesh motion and mesh topology changes including adaptive re-meshing.

  
multiphaseVoFSolver

Base solver module for the solution of multiple immiscible fluids using a VOF (volume of fluid) phase-fraction based interface capturing approach, with optional mesh motion and mesh topology changes including adaptive re-meshing.

OpenFOAM v13 User Guide - 3.5 Solver modules

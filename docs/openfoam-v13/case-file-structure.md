---
source: https://doc.cfd.direct/openfoam/user-guide-v13/case-file-structure
title: OpenFOAM v13 User Guide - 4.1 File structure of OpenFOAM cases
slug: case-file-structure
---
### What are the case configuration files in OpenFOAM?

CFD Direct's OpenFOAM Training discusses case configuration files in OpenFOAM

[See Training](https://cfd.direct/openfoam-training "See Training")

\[**version 13**\]\[[version 12](../user-guide-v12)\]\[[version 11](../user-guide-v11)\]\[[version 10](../user-guide-v10)\]\[[version 9](../user-guide-v9)\]\[[version 8](../user-guide-v8)\]\[[version 7](../user-guide-v7)\]\[[version 6](../user-guide-v6)\]

\[[chapter contents](cases)\]\[[previous topic](cases)\]\[[next topic](basic-file-format)\]\[[index](bookindex)\]

## 4.1 File structure of OpenFOAM cases

The basic directory structure of an OpenFOAM case, containing the minimum set of files required to run an application, is shown in Figure [4.1](#x17-920031) and described as follows:

* * *

![<case> system controlDict see section 4.4 fvSchemes see section 4.5 fvSolution see section 4.6 constant ...Properties see chapter 8 polyMesh see section 5.2 points faces owner neighbour boundary time directories see subsection 4.2.9 \\relax \\special {t4ht=](img/index239x.png)

  

Figure 4.1: Case directory structure

* * *

  
constant directory

that contains a full description of the case mesh in a subdirectory polyMesh and files specifying properties and models for the application concerned, e.g. physicalProperties and momentumTransport.

  
system directory

for setting parameters associated with the solution procedure itself. It contains at least the following three files: controlDict where run control parameters are set including start/end time, time step and parameters for data output; fvSchemes where discretisation schemes used in the solution are selected; and, fvSolution where the equation solvers, tolerances and other algorithm controls are set for the run.

  
‘time’ directories

containing individual files of data for particular fields, e.g. velocity and pressure. The data can be: either, initial values and boundary conditions that the user must specify to define the problem; or, results written to file by OpenFOAM. Fields must always be initialised, even when the solution does not strictly require it, as in steady-state problems. The name of each time directory is based on the simulated time at which the data is written and is described fully in section [4.4](controldict#x20-1130004.4) . Since we usually start our simulations at time ![eqn](img/index240x.png), the initial conditions are usually stored in a directory named 0. For example, in the motorBike tutorial, the velocity field ![eqn](img/index241x.png) and pressure field ![eqn](img/index242x.png) are initialised from files 0/U and 0/p respectively.

OpenFOAM v13 User Guide - 4.1 File structure of OpenFOAM cases

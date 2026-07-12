---
source: https://doc.cfd.direct/openfoam/user-guide-v13/tutorials
title: OpenFOAM v13 User Guide - Chapter 2 Tutorials
slug: tutorials
---
### How do I run OpenFOAM tutorial examples?

CFD Direct's OpenFOAM Training explains how to run the OpenFOAM tutorials

[See Training](https://cfd.direct/openfoam-training "See Training")

\[**version 13**\]\[[version 12](../user-guide-v12)\]\[[version 11](../user-guide-v11)\]\[[version 10](../user-guide-v10)\]\[[version 9](../user-guide-v9)\]\[[version 8](../user-guide-v8)\]\[[version 7](../user-guide-v7)\]\[[version 6](../user-guide-v6)\]

\[[table of contents](contents)\]\[[previous topic](introduction)\]\[[next topic](backwardstep)\]\[[index](bookindex)\]

## Chapter 2 Tutorials

This chapter we describes the process of setup, simulation and post-processing for some OpenFOAM test cases, with the principal aim of introducing a user to the basic procedures of running OpenFOAM. The test cases are taken from the tutorials directory which contains numerous example cases in OpenFOAM. The directory location is represented by the $FOAM\_TUTORIALS variable in the OpenFOAM “environment”.

The directory contains numerous cases that demonstrate the use of all the solver modules, other solvers and many utilities supplied with OpenFOAM. Most examples are stored in sub-directories corresponding to each of the modular solvers. For example, the cases that use the incompressibleFluid module are stored in $FOAM\_TUTORIALS/incompressibleFluid. The user can explore these example cases, starting by listing the top-level of the $FOAM\_TUTORIALS directory, by typing in a terminal

  
    ls $FOAM\_TUTORIALS

The OpenFOAM environment includes a $FOAM\_RUN variable which represents a directory in the user’s file system at $HOME/OpenFOAM/<USER\>\-13/run where <USER\> is the account login name and “13” is the OpenFOAM version number. The directory provides a recommended location to store and run simulation cases. The examples presented in this chapter will be copied into the run directory. The user should check whether the directory exists by typing

  
    ls $FOAM\_RUN

If a message is returned saying no such directory exists, the user should create the directory by typing

  
    mkdir -p $FOAM\_RUN

Any example case from $FOAM\_TUTORIALS can then be copied into the run directory. For example to try the motorBike example for the incompressibleFluid solver module, the user can copy it to the run directory by typing:

  
    cd $FOAM\_RUN  
    cp -r $FOAM\_TUTORIALS/incompressibleFluid/motorBike .

 2.1 [Backward-facing step](backwardstep#x5-40002.1)  
  2.1.1 [Pre-processing](backwardstep#x5-50002.1.1)  
  2.1.2 [Mesh generation](backwardstep#x5-60002.1.2)  
  2.1.3 [Viewing the mesh](backwardstep#x5-70002.1.3)  
  2.1.4 [Boundary and initial conditions](backwardstep#x5-80002.1.4)  
  2.1.5 [Physical properties](backwardstep#x5-90002.1.5)  
  2.1.6 [Momentum transport](backwardstep#x5-100002.1.6)  
  2.1.7 [Control](backwardstep#x5-110002.1.7)  
  2.1.8 [Discretisation and linear-solver settings](backwardstep#x5-120002.1.8)  
  2.1.9 [Running an application](backwardstep#x5-130002.1.9)  
  2.1.10 [Time selection in ParaView](backwardstep#x5-140002.1.10)  
  2.1.11 [Colouring surfaces](backwardstep#x5-150002.1.11)  
  2.1.12 [Cutting plane (slice)](backwardstep#x5-160002.1.12)  
  2.1.13 [Vector plots](backwardstep#x5-170002.1.13)  
  2.1.14 [Popular filters in ParaView](backwardstep#x5-180002.1.14)  
  2.1.15 [Contours](backwardstep#x5-190002.1.15)  
  2.1.16 [Streamline plots](backwardstep#x5-200002.1.16)  
  2.1.17 [Inlet boundary condition](backwardstep#x5-210002.1.17)  
  2.1.18 [Turbulence model](backwardstep#x5-220002.1.18)  
 2.2 [Breaking of a dam](dambreak#x6-230002.2)  
  2.2.1 [Mesh generation](dambreak#x6-240002.2.1)  
  2.2.2 [Boundary conditions](dambreak#x6-250002.2.2)  
  2.2.3 [Phases](dambreak#x6-260002.2.3)  
  2.2.4 [Setting initial fields](dambreak#x6-270002.2.4)  
  2.2.5 [Fluid properties](dambreak#x6-280002.2.5)  
  2.2.6 [Gravity](dambreak#x6-290002.2.6)  
  2.2.7 [Turbulence modelling](dambreak#x6-300002.2.7)  
  2.2.8 [Time step control](dambreak#x6-310002.2.8)  
  2.2.9 [Discretisation schemes](dambreak#x6-320002.2.9)  
  2.2.10 [Linear-solver control](dambreak#x6-330002.2.10)  
  2.2.11 [Running the code](dambreak#x6-340002.2.11)  
  2.2.12 [Post-processing](dambreak#x6-350002.2.12)  
  2.2.13 [Running in parallel](dambreak#x6-360002.2.13)  
  2.2.14 [Post-processing a case run in parallel](dambreak#x6-370002.2.14)  
 2.3 [Stress analysis of a plate with a hole](platehole#x7-380002.3)  
  2.3.1 [Mesh generation](platehole#x7-390002.3.1)  
  2.3.2 [Boundary and initial conditions](platehole#x7-400002.3.2)  
  2.3.3 [Physical properties](platehole#x7-410002.3.3)  
  2.3.4 [Control](platehole#x7-420002.3.4)  
  2.3.5 [Discretisation schemes and linear-solver control](platehole#x7-430002.3.5)  
  2.3.6 [Running the code](platehole#x7-440002.3.6)  
  2.3.7 [Post-processing](platehole#x7-450002.3.7)

OpenFOAM v13 User Guide - Chapter 2 Tutorials

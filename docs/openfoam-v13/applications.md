---
source: https://doc.cfd.direct/openfoam/user-guide-v13/applications
title: OpenFOAM v13 User Guide - Chapter 3 Applications and libraries
slug: applications
---
### How is an application programmed in OpenFOAM?

CFD Direct's Programming CFD course shows how to code applications in OpenFOAM

[Programming CFD](https://cfd.direct/openfoam-training/programming-cfd "Programming CFD")

\[**version 13**\]\[[version 12](../user-guide-v12)\]\[[version 11](../user-guide-v11)\]\[[version 10](../user-guide-v10)\]\[[version 9](../user-guide-v9)\]\[[version 8](../user-guide-v8)\]\[[version 7](../user-guide-v7)\]\[[version 6](../user-guide-v6)\]

\[[table of contents](contents)\]\[[previous topic](platehole)\]\[[next topic](programming-language-openfoam)\]\[[index](bookindex)\]

## Chapter 3 Applications and libraries

The examples in Chapter [2](tutorials#x4-30002) show that OpenFOAM provides a range of software ‘tools’ that are run from a terminal command line. The tools include applications which are executable programs written in C++, the base programming language of OpenFOAM. Applications obtain most of the functionality from OpenFOAM’s vast store of pre-compiled libraries, also written in C++. Since OpenFOAM is open source software, users have the freedom to create their own applications and libraries. Applications are generally split into two categories:

-   solvers, e.g. foamRun, that perform CFD calculations involving fluid dynamics, energy, etc.;
    
-   utilities, e.g. blockMesh and foamPostProcess, that perform other tasks in CFD like meshing and post-processing.
    

Prior to version 11 of OpenFOAM, there were many solvers, since separate ones were written for various different types of flow, e.g. simpleFoam, pimpleFoam, etc. However, most flow solvers are now written as modules, e.g. incompressibleFluid, incompressibleVoF and e.g.solid which are loaded by the general foamRun (or foamMultiRun) solvers. Rather than existing as an application, each solver module is compiled into a library of its own.

In addition to applications, the tools in OpenFOAM also include shell scripts, e.g. paraFoam, foamInfo and foamGet. Many of the scripts help with the configuration of cases.

This chapter gives an overview of applications and libraries, including their creation, modification, compilation and execution.

 3.1 [The programming language of OpenFOAM](programming-language-openfoam#x9-470003.1)  
 3.2 [Compiling applications and libraries](compiling-applications#x10-480003.2)  
  3.2.1 [Header .H files](compiling-applications#x10-490003.2.1)  
  3.2.2 [Compiling with wmake](compiling-applications#x10-500003.2.2)  
  3.2.3 [Including headers](compiling-applications#x10-510003.2.3)  
  3.2.4 [Linking to libraries](compiling-applications#x10-520003.2.4)  
  3.2.5 [Source files to be compiled](compiling-applications#x10-530003.2.5)  
  3.2.6 [Running wmake](compiling-applications#x10-540003.2.6)  
  3.2.7 [wmake environment variables](compiling-applications#x10-550003.2.7)  
  3.2.8 [Removing dependency lists: wclean](compiling-applications#x10-560003.2.8)  
  3.2.9 [Compiling libraries](compiling-applications#x10-570003.2.9)  
  3.2.10 [Compilation example: the foamRun application](compiling-applications#x10-580003.2.10)  
  3.2.11 [Debug messaging and optimisation switches](compiling-applications#x10-590003.2.11)  
  3.2.12 [Dynamic linking at run-time](compiling-applications#x10-600003.2.12)  
 3.3 [Running applications](running-applications#x11-610003.3)  
 3.4 [Running applications in parallel](running-applications-parallel#x12-620003.4)  
  3.4.1 [Decomposition of mesh and initial field data](running-applications-parallel#x12-630003.4.1)  
  3.4.2 [File input/output in parallel](running-applications-parallel#x12-640003.4.2)  
  3.4.3 [Running a decomposed case](running-applications-parallel#x12-650003.4.3)  
  3.4.4 [Distributing data across several disks](running-applications-parallel#x12-660003.4.4)  
  3.4.5 [Post-processing parallel processed cases](running-applications-parallel#x12-670003.4.5)  
 3.5 [Solver modules](solvers-modules#x13-680003.5)  
  3.5.1 [Single-phase modules](solvers-modules#x13-690003.5.1)  
  3.5.2 [Multiphase/VoF flow modules](solvers-modules#x13-700003.5.2)  
  3.5.3 [Solid modules](solvers-modules#x13-710003.5.3)  
  3.5.4 [Film modules](solvers-modules#x13-720003.5.4)  
  3.5.5 [Utility modules](solvers-modules#x13-730003.5.5)  
  3.5.6 [Base classes for solver modules](solvers-modules#x13-740003.5.6)  
 3.6 [Standard solvers](standard-solvers#x14-750003.6)  
  3.6.1 [Main solver applications](standard-solvers#x14-760003.6.1)  
  3.6.2 [Legacy solver applications](standard-solvers#x14-770003.6.2)  
 3.7 [Standard utilities](standard-utilities#x15-780003.7)  
  3.7.1 [Pre-processing](standard-utilities#x15-790003.7.1)  
  3.7.2 [Mesh generation](standard-utilities#x15-800003.7.2)  
  3.7.3 [Mesh conversion](standard-utilities#x15-810003.7.3)  
  3.7.4 [Mesh manipulation](standard-utilities#x15-820003.7.4)  
  3.7.5 [Other mesh tools](standard-utilities#x15-830003.7.5)  
  3.7.6 [Post-processing](standard-utilities#x15-840003.7.6)  
  3.7.7 [Post-processing data converters](standard-utilities#x15-850003.7.7)  
  3.7.8 [Lagrangian post-processing](standard-utilities#x15-860003.7.8)  
  3.7.9 [Surface mesh (e.g. OBJ/STL) tools](standard-utilities#x15-870003.7.9)  
  3.7.10 [Parallel processing](standard-utilities#x15-880003.7.10)  
  3.7.11 [Thermophysical-related utilities](standard-utilities#x15-890003.7.11)  
  3.7.12 [Miscellaneous utilities](standard-utilities#x15-900003.7.12)

OpenFOAM v13 User Guide - Chapter 3 Applications and libraries

---
source: https://doc.cfd.direct/openfoam/user-guide-v13/cases
title: OpenFOAM v13 User Guide - Chapter 4 OpenFOAM cases
slug: cases
---
### How are CFD cases configured in OpenFOAM?

CFD Direct's OpenFOAM Training teaches the workflows to set up OpenFOAM cases

[See Training](https://cfd.direct/openfoam-training "See Training")

\[**version 13**\]\[[version 12](../user-guide-v12)\]\[[version 11](../user-guide-v11)\]\[[version 10](../user-guide-v10)\]\[[version 9](../user-guide-v9)\]\[[version 8](../user-guide-v8)\]\[[version 7](../user-guide-v7)\]\[[version 6](../user-guide-v6)\]

\[[table of contents](contents)\]\[[previous topic](standard-utilities)\]\[[next topic](case-file-structure)\]\[[index](bookindex)\]

## Chapter 4 OpenFOAM cases

This chapter deals with the file structure and organisation of OpenFOAM cases. Normally, a user would assign a name to a case, e.g. the tutorial case of aerodynamics of a motorbike is simply named motorBike. This name becomes the name of a directory in which all the case files and sub-directories are stored.

When running a simulation, a case directory can be located anywhere on a user’s filing system. However, we recommend putting cases within a run subdirectory of the user’s filing system, i.e.$HOME/OpenFOAM/${USER}\-13 as described at the beginning of chapter [2](tutorials#x4-30002). The $FOAM\_RUN environment variable is set to $HOME/OpenFOAM/${USER}\-13/run by default and the user can quickly move to that directory by executing a preset alias, run, at the command line.

The tutorial cases that accompany the OpenFOAM distribution provide useful examples of the case directory structures. The tutorials are located in the $FOAM\_TUTORIALS directory, reached quickly by executing the tut alias at the command line. Users can view tutorial examples at their leisure while reading this chapter.

 4.1 [File structure of OpenFOAM cases](case-file-structure#x17-920004.1)  
 4.2 [Basic input/output file format](basic-file-format#x18-930004.2)  
  4.2.1 [General syntax rules](basic-file-format#x18-940004.2.1)  
  4.2.2 [Dictionaries](basic-file-format#x18-950004.2.2)  
  4.2.3 [The data file header](basic-file-format#x18-960004.2.3)  
  4.2.4 [Lists](basic-file-format#x18-970004.2.4)  
  4.2.5 [Scalars, vectors and tensors](basic-file-format#x18-980004.2.5)  
  4.2.6 [Dimensional units](basic-file-format#x18-990004.2.6)  
  4.2.7 [Units and unit conversion](basic-file-format#x18-1000004.2.7)  
  4.2.8 [Dimensioned types](basic-file-format#x18-1010004.2.8)  
  4.2.9 [Fields](basic-file-format#x18-1020004.2.9)  
  4.2.10 [Macro expansion](basic-file-format#x18-1030004.2.10)  
  4.2.11 [Including files](basic-file-format#x18-1040004.2.11)  
  4.2.12 [Environment variables](basic-file-format#x18-1050004.2.12)  
  4.2.13 [Regular expressions](basic-file-format#x18-1060004.2.13)  
  4.2.14 [Keyword ordering](basic-file-format#x18-1070004.2.14)  
  4.2.15 [Inline calculations](basic-file-format#x18-1080004.2.15)  
  4.2.16 [Inline code](basic-file-format#x18-1090004.2.16)  
  4.2.17 [Conditionals](basic-file-format#x18-1100004.2.17)  
 4.3 [Global controls](global-settings#x19-1110004.3)  
  4.3.1 [Overriding global controls](global-settings#x19-1120004.3.1)  
 4.4 [Time and data input/output control](controldict#x20-1130004.4)  
  4.4.1 [Modules](controldict#x20-1140004.4.1)  
  4.4.2 [Time control](controldict#x20-1150004.4.2)  
  4.4.3 [Data writing](controldict#x20-1160004.4.3)  
  4.4.4 [Other settings](controldict#x20-1170004.4.4)  
 4.5 [Numerical schemes](fvschemes#x21-1180004.5)  
  4.5.1 [Time schemes](fvschemes#x21-1190004.5.1)  
  4.5.2 [Gradient schemes](fvschemes#x21-1200004.5.2)  
  4.5.3 [Divergence schemes](fvschemes#x21-1210004.5.3)  
  4.5.4 [Surface normal gradient schemes](fvschemes#x21-1220004.5.4)  
  4.5.5 [Laplacian schemes](fvschemes#x21-1230004.5.5)  
  4.5.6 [Interpolation schemes](fvschemes#x21-1240004.5.6)  
 4.6 [Solution and algorithm control](fvsolution#x22-1250004.6)  
  4.6.1 [Linear solver control](fvsolution#x22-1260004.6.1)  
  4.6.2 [Solution tolerances](fvsolution#x22-1270004.6.2)  
  4.6.3 [Preconditioned conjugate gradient solvers](fvsolution#x22-1280004.6.3)  
  4.6.4 [Smooth solvers](fvsolution#x22-1290004.6.4)  
  4.6.5 [Geometric-algebraic multi-grid solvers](fvsolution#x22-1300004.6.5)  
  4.6.6 [Solution under-relaxation](fvsolution#x22-1310004.6.6)  
  4.6.7 [SIMPLE and PIMPLE algorithms](fvsolution#x22-1320004.6.7)  
  4.6.8 [Pressure referencing](fvsolution#x22-1330004.6.8)  
 4.7 [Case management tools](case-management#x23-1340004.7)  
  4.7.1 [General file management](case-management#x23-1350004.7.1)  
  4.7.2 [The foamDictionary utility](case-management#x23-1360004.7.2)  
  4.7.3 [The foamSearch script](case-management#x23-1370004.7.3)  
  4.7.4 [The foamGet script](case-management#x23-1380004.7.4)  
  4.7.5 [The foamInfo script](case-management#x23-1390004.7.5)  
  4.7.6 [The foamToC utility](case-management#x23-1400004.7.6)  
  4.7.7 [The foamUnits script](case-management#x23-1410004.7.7)  
  4.7.8 [The foamFind script](case-management#x23-1420004.7.8)  
  4.7.9 [The foamMergeCase script](case-management#x23-1430004.7.9)

OpenFOAM v13 User Guide - Chapter 4 OpenFOAM cases

---
source: https://doc.cfd.direct/openfoam/user-guide-v13/boundary-conditions
title: OpenFOAM v13 User Guide - Chapter 6 Boundary conditions
slug: boundary-conditions
---
### How are boundary conditions applied in CFD?

CFD Direct's OpenFOAM Training fully covers boundary conditions in OpenFOAM

[See Training](https://cfd.direct/openfoam-training "See Training")

\[**version 13**\]\[[version 12](../user-guide-v12)\]\[[version 11](../user-guide-v11)\]\[[version 10](../user-guide-v10)\]\[[version 9](../user-guide-v9)\]\[[version 8](../user-guide-v8)\]\[[version 7](../user-guide-v7)\]\[[version 6](../user-guide-v6)\]

\[[chapter contents](index)\]\[[previous topic](mapfields)\]\[[next topic](patch-selection)\]\[[index](bookindex)\]

## Chapter 6 Boundary conditions

Boundary conditions are specified in field files, e.g. p, U, in time directories. The structure of these files is introduced in sections [2.1.4](backwardstep#x5-80002.1.4) and [4.2.9](basic-file-format#x18-1020004.2.9) . They include three entries: dimensions for the dimensional units; internalField for the initial internal field values; and, boundaryField where the boundary conditions are specified. The boundaryField requires an entry for each patch in the mesh. The patches are specified in the boundary file; below is a sample file from a 2D incompressibleFluid example in OpenFOAM.

  
5  
(  
    outlet  
    {  
        type            patch;  
        nFaces          320;  
        startFace       198740;  
    }  
    up  
    {  
        type            symmetry;  
        inGroups        List<word> 1(symmetry);  
        nFaces          760;  
        startFace       199060;  
    }  
    hole  
    {  
        type            wall;  
        inGroups        List<word> 1(wall);  
        nFaces          1120;  
        startFace       199820;  
    }  
    frontAndBack  
    {  
        type            empty;  
        inGroups        List<word> 1(empty);  
        nFaces          200000;  
        startFace       200940;  
    }  
    inlet  
    {  
        type            patch;  
        nFaces          320;  
        startFace       400940;  
    }  
)

The corresponding pressure field file, p, is shown below.

16dimensions  \[0 2 -2 0 0 0 0\];

17

18internalField  uniform 0;

19

20boundaryField

21{

22  inlet

23  {

24  type  zeroGradient;

25  }

26  outlet

27  {

28  type  fixedValue;

29  value  uniform 0;

30  }

31  up

32  {

33  type  symmetry;

34  }

35  hole

36  {

37  type  zeroGradient;

38  }

39  frontAndBack

40  {

41  type  empty;

42  }

43}

44

45// \*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\* //
   

The boundaryField is a sub-dictionary containing an entry for every patch in the mesh. Each entry begins with the patch name and configures the boundary condition through entries in a sub-dictionary. A type entry is required for every patch which specifies the type of boundary condition. The examples above include zeroGradient and fixedValue conditions corresponding to generic patches defined in the boundary file. They also include symmetry and empty types corresponding to equivalent constraint patches, e.g. the up patch is defined as symmetry in the mesh and uses a symmetry condition in the field file.

For details about the main boundary conditions used in OpenFOAM, refer to [Chapter 4 of Notes on Computational Fluid Dynamics: General Principles](https://doc.cfd.direct/notes/cfd-general-principles/boundary-conditions).

 6.1 [Patch selection in field files](patch-selection#x34-1950006.1)  
 6.2 [Geometric constraints](geometric-constraints#x35-1960006.2)  
 6.3 [Basic boundary conditions](basic-boundary-conditions#x36-1970006.3)  
 6.4 [Derived boundary conditions](derived-boundary-conditions#x37-1980006.4)  
  6.4.1 [The inlet/outlet condition](derived-boundary-conditions#x37-1990006.4.1)  
  6.4.2 [Entrainment boundary conditions](derived-boundary-conditions#x37-2000006.4.2)  
  6.4.3 [Fixed flux pressure](derived-boundary-conditions#x37-2010006.4.3)  
  6.4.4 [Time-varying boundary conditions](derived-boundary-conditions#x37-2020006.4.4)

OpenFOAM v13 User Guide - Chapter 6 Boundary conditions

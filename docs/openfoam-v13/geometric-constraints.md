---
source: https://doc.cfd.direct/openfoam/user-guide-v13/geometric-constraints
title: OpenFOAM v13 User Guide - 6.2 Geometric constraints
slug: geometric-constraints
---
### What are the geometric constraints in OpenFOAM?

Geometric constraints are explained in CFD Direct's Essential CFD course

[Essential CFD](https://cfd.direct/openfoam-training/essential-cfd "Essential CFD")

\[**version 13**\]\[[version 12](../user-guide-v12)\]\[[version 11](../user-guide-v11)\]\[[version 10](../user-guide-v10)\]\[[version 9](../user-guide-v9)\]\[[version 8](../user-guide-v8)\]\[[version 7](../user-guide-v7)\]\[[version 6](../user-guide-v6)\]

\[[chapter contents](boundary-conditions)\]\[[previous topic](patch-selection)\]\[[next topic](basic-boundary-conditions)\]\[[index](bookindex)\]

## 6.2 Geometric constraints

Section [5.3](boundaries#x27-1470005.3) describes the mesh boundary, which is split into patches and written in the mesh boundary file. Each patch includes a type entry which can be specified as a generic patch, a wall or a geometric constraint, e.g. empty, symmetry, cyclic etc.

For each geometric constraint type for a patch in the mesh, there is an equivalent boundary condition type that must be applied to the same patch in the boundaryField of a field file. The type names in the mesh and boundaryField are the same, e.g. the symmetry boundary condition must be applied to a symmetry patch.

To simplify the configuration of field files, OpenFOAM includes a file named setConstraintTypes in the $FOAM\_ETC/caseDicts of the installation. The setConstraintTypes file contains the following entries.

9cyclic

10{

11  type  cyclic;

12}

13

14cyclicSlip

15{

16  type  cyclicSlip;

17}

18

19nonConformalCyclic

20{

21  type  nonConformalCyclic;

22  value $internalField;

23}

24

25nonConformalError

26{

27  type  nonConformalError;

28}

29

30empty

31{

32  type  empty;

33}

34

35processor

36{

37  type  processor;

38  value $internalField;

39}

40

41processorCyclic

42{

43  type  processorCyclic;

44  value $internalField;

45}

46

47nonConformalProcessorCyclic

48{

49  type  nonConformalProcessorCyclic;

50  value $internalField;

51}

52

53symmetryPlane

54{

55  type  symmetryPlane;

56}

57

58symmetry

59{

60  type  symmetry;

61}

62

63wedge

64{

65  type  wedge;

66}

67

68internal

69{

70  type  internal;

71}

72

73

74// \*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\* //
   

The file exploits the fact that a patch which is a geometric constraint is automatically included in a group of the constraint name, e.g. a symmetry patch is in a group named symmetry. The entries therefore set a boundary type for each constraint group (to the name of the group). All constraint conditions are covered by an entry for each condition.

The user can then include this file inside the boundaryField of their field files. Since the file is in the $FOAM\_ETC directory it can be included using the special #includeEtc directive, e.g. in the boundaryField entry below.

  
boundaryField  
{  
    inlet  
    {  
        type            zeroGradient;  
    }  
  
    outlet  
    {  
        type            fixedValue;  
        value           uniform 0;  
    }  
  
    wall  
    {  
        type            zeroGradient;  
    }  
  
    #includeEtc "caseDicts/setConstraintTypes"  
}

With the setContraintTypes file included in the field files, the only patches that generally need to be configured are: the generic patches, corresponding to open boundaries; and, wall patches.

OpenFOAM v13 User Guide - 6.2 Geometric constraints

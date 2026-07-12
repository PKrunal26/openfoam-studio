---
source: https://doc.cfd.direct/openfoam/user-guide-v13/patch-selection
title: OpenFOAM v13 User Guide - 6.1 Patch selection in field files
slug: patch-selection
---
### How are patches identified in field files in OpenFOAM?

CFD Direct's OpenFOAM Training explains how patches are identified in field files

[See Training](https://cfd.direct/openfoam-training "See Training")

\[**version 13**\]\[[version 12](../user-guide-v12)\]\[[version 11](../user-guide-v11)\]\[[version 10](../user-guide-v10)\]\[[version 9](../user-guide-v9)\]\[[version 8](../user-guide-v8)\]\[[version 7](../user-guide-v7)\]\[[version 6](../user-guide-v6)\]

\[[chapter contents](boundary-conditions)\]\[[previous topic](boundary-conditions)\]\[[next topic](geometric-constraints)\]\[[index](bookindex)\]

## 6.1 Patch selection in field files

There are three different ways an entry can be specified for a patch in the boundaryField of a field file: 1) by patch name; 2) by group name; 3) matching a patch name with a regular expression. They are listed here in order of precedence which is obeyed if multiple entries are valid of a particular patch. The different specifications can be illustrated by imagining a mesh with the following patches.

-   inlet: a generic patch.
    
-   lowerWall and upperWall: two wall patches.
    
-   outletSmall, outletMedium and outletLarge: three outlet patches of generic type, all in a patch group named outlet.
    

Then imagine the following boundaryField for a field, e.g. p, corresponding to the patches above.

  
boundaryField  
{  
    inlet  
    {  
       type             zeroGradient;  
    }  
    ".\*Wall"  
    {  
        type            zeroGradient;  
    }  
    outletSmall  
    {  
        type            fixedValue;  
        value           uniform 1;  
    }  
    outlet  
    {  
        type            fixedValue;  
        value           uniform 0;  
    }  
}

In this example, the inlet field entry is read for the inlet patch, following rule 1 above (matching patch name). Similarly, the outletSmall entry will be read for the patch of the same name.

The outletMedium and outletLarge patches do not have matching entries in the field file, so they instead the outlet entry will be applied (rule 2), since it matches the group name to which the patches belong. Note that the outletSmall patch does not use the outlet entry because a matching patch entry takes precedence over a matching group entry.

Finally, the lowerWall and upperWall match the regular expression ".\*Wall". Regular expressions are described in section [4.2.13](basic-file-format#x18-1060004.2.13) ; they must be included in double quotations "…". The ".\*" component matches any expression (including nothing), so matches the wall patch names here. The regular expression could use word grouping to provide a more precise match to the patch names, e.g.

  
    "(lower|upper)Wall"  
    {  
        type            zeroGradient;  
    }

Alternatively a patch entry could cover the wall patches taking advantage of the fact that every non-generic patch is automatically placed in a group of the same name as its type, as discussed in section [5.3.6](boundaries#x27-1530005.3.6) . In this case, all wall patches are placed in a group named wall, so the following entry would be read for both patches.

  
    wall  
    {  
        type            zeroGradient;  
    }

OpenFOAM v13 User Guide - 6.1 Patch selection in field files

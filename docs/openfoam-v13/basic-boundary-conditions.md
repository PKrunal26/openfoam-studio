---
source: https://doc.cfd.direct/openfoam/user-guide-v13/basic-boundary-conditions
title: OpenFOAM v13 User Guide - 6.3 Basic boundary conditions
slug: basic-boundary-conditions
---
### What are the basic boundary conditions in OpenFOAM?

CFD Direct's OpenFOAM Training covers the basic boundary conditions in OpenFOAM

[See Training](https://cfd.direct/openfoam-training "See Training")

\[**version 13**\]\[[version 12](../user-guide-v12)\]\[[version 11](../user-guide-v11)\]\[[version 10](../user-guide-v10)\]\[[version 9](../user-guide-v9)\]\[[version 8](../user-guide-v8)\]\[[version 7](../user-guide-v7)\]\[[version 6](../user-guide-v6)\]

\[[chapter contents](boundary-conditions)\]\[[previous topic](geometric-constraints)\]\[[next topic](derived-boundary-conditions)\]\[[index](bookindex)\]

## 6.3 Basic boundary conditions

The main basic boundary condition types available in OpenFOAM are summarised below using a patch field named ![eqn](img/index364x.png). This is not a complete list; for all types see $FOAM\_SRC/finiteVolume/fields/fvPatchFields/basic.

-   fixedValue: value of ![eqn](img/index364x.png) is specified by value.
    
-   fixedGradient: normal gradient of ![eqn](img/index364x.png) (![eqn](img/index367x.png)) is specified by gradient.
    
-   zeroGradient: normal gradient of ![eqn](img/index368x.png) is zero.
    
-   calculated: patch field ![eqn](img/index368x.png) calculated from other patch fields.
    
-   mixed: mixed fixedValue/ fixedGradient condition depending on valueFraction ![eqn](img/index370x.png) where
    
    ![ { valueFraction = 1 corresponds to Ψ = refValue, 0 corresponds to ∂Ψ ∕∂n = refGradient. \\relax \\special {t4ht=](img/index371x.png)
    
    (6.1)
    
-   directionMixed: mixed condition with tensorial valueFraction, to allow different conditions in normal and tangential directions of a vector patch field, e.g. fixedValue in the tangential direction, zeroGradient in the normal direction.
    

OpenFOAM v13 User Guide - 6.3 Basic boundary conditions

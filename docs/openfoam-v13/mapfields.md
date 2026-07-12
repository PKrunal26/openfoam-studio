---
source: https://doc.cfd.direct/openfoam/user-guide-v13/mapfields
title: OpenFOAM v13 User Guide - 5.8 Mapping fields between different geometries
slug: mapfields
---
### How are fields mapped between meshes in OpenFOAM?

CFD Direct's experts explain field mapping in their OpenFOAM Training

[See Training](https://cfd.direct/openfoam-training "See Training")

\[**version 13**\]\[[version 12](../user-guide-v12)\]\[[version 11](../user-guide-v11)\]\[[version 10](../user-guide-v10)\]\[[version 9](../user-guide-v9)\]\[[version 8](../user-guide-v8)\]\[[version 7](../user-guide-v7)\]\[[version 6](../user-guide-v6)\]

\[[chapter contents](mesh)\]\[[previous topic](mesh-conversion)\]\[[next topic](boundary-conditions)\]\[[index](bookindex)\]

## 5.8 Mapping fields between different geometries

The mapFields utility maps one or more fields relating to a given geometry onto the corresponding fields for another geometry. It is completely generalised in so much as there does not need to be any similarity between the geometries to which the fields relate. However, for cases where the geometries are consistent, mapFields can be executed with a special option that simplifies the mapping process.

For our discussion of mapFields we need to define a few terms. First, we say that the data is mapped from the source to the target. The fields are deemed consistent if the geometry and boundary types, or conditions, of both source and target fields are identical. The field data that mapFields maps are those fields within the time directory specified by startFrom/startTime in the controlDict of the target case. The data is read from the equivalent time directory of the source case and mapped onto the equivalent time directory of the target case.

### 5.8.1 Mapping consistent fields

A mapping of consistent fields is simply performed by executing mapFields on the (target) case using the \-consistent command line option as follows:

  
    mapFields <source dir\> -consistent

### 5.8.2 Mapping inconsistent fields

When the fields are not consistent, as shown in Figure [5.15](#x32-19200315) , mapFields requires a mapFieldsDict dictionary in the system directory of the target case. The following rules apply to the mapping:

-   the field data is mapped from source to target wherever possible, i.e. in our example all the field data within the target geometry is mapped from the source, except those in the shaded region which remain unaltered;
    
-   the patch field data is left unaltered unless specified otherwise in the mapFieldsDict dictionary.
    

The mapFieldsDict dictionary contain two lists that specify mapping of patch data. The first list is patchMap that specifies mapping of data between pairs of target and source patches that are geometrically coincident, as shown in Figure [5.15](#x32-19200315) . The list contains each pair of names of target patch (first) and source patch (second). The second list is cuttingPatches that contains names of target patches whose values are to be mapped from the source internal field through which the target patch cuts. In the situation where the target patch only cuts through part of the source internal field, e.g. bottom left target patch in our example, those values within the internal field are mapped and those outside remain unchanged.

* * *

![ Coincident patches: can be mapped using patchMap Internal target patches: can be mapped using cuttingPatches Source field geometry Target field geometry \\relax \\special {t4ht=](img/index363x.png)

  

Figure 5.15: Mapping inconsistent fields

* * *

An example mapFieldsDict dictionary is shown below:

16

17patchMap  (lid movingWall);

18

19cuttingPatches  ();

20

21

22// \*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\* //
   

  
    mapFields <source dir\>

### 5.8.3 Mapping parallel cases

If either or both of the source and target cases are decomposed for running in parallel, additional options must be supplied when executing mapFields:

  
\-parallelSource

if the source case is decomposed for parallel running;

  
\-parallelTarget

if the target case is decomposed for parallel running.

OpenFOAM v13 User Guide - 5.8 Mapping fields between different geometries

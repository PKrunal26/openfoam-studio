---
source: https://doc.cfd.direct/openfoam/user-guide-v13/mesh-zones
title: OpenFOAM v13 User Guide - 5.6 Mesh Zones
slug: mesh-zones
---
### How are mesh zones created and used in OpenFOAM?

CFD Direct's Applied CFD course comprehensively explains mesh zones in OpenFOAM

[Applied CFD](https://cfd.direct/openfoam-training/applied-cfd "Applied CFD")

\[**version 13**\]\[[version 12](../user-guide-v12)\]\[[version 11](../user-guide-v11)\]\[[version 10](../user-guide-v10)\]\[[version 9](../user-guide-v9)\]\[[version 8](../user-guide-v8)\]\[[version 7](../user-guide-v7)\]\[[version 6](../user-guide-v6)\]

\[[chapter contents](mesh)\]\[[previous topic](snappyhexmesh)\]\[[next topic](mesh-conversion)\]\[[index](bookindex)\]

## 5.6 Mesh Zones

This section describes mesh zones and some popular tools which use zones as part of the meshing process. A zone is a list (or collection) of points or faces or cells within a mesh which is identifiable by a name. The list contains exclusively the indices of points, faces or cells, meaning there are three types of zone, represented in OpenFOAM by the classes pointZone, faceZone and cellZone. A unique name is required for each zone of a particular type, but the same name can be used for one pointZone, faceZone and cellZone.

A cellZone has many uses. One example is that it can define a region of the mesh to which a source term, e.g. a heat source, can be applied using an fvModel. Another is to represent a region of a mesh over which some quantity is calculated, e.g. the average temperature. A cellZone is often used to identify cells for some kind of modification, e.g. refinement, within a mesh generation process.

A faceZone can optionally include information about the orientation of the faces, in addition to their indices. The information is contained in a flipMap, whose purpose is to provide a consistent orientation for all faces, e.g. to make all faces “point” in a downstream direction. The flipMap contains a boolean (true/false) for each face. The sign (![eqn](img/index357x.png)/![eqn](img/index358x.png)) of normal vectors of faces marked true can then be flipped so that they are oriented in a consistent direction with normal vectors of faces marked false.

A pointZone is much less commonly used that a cellZone and faceZone. It is generally used for a prescribed mesh motion, in which some or all points in a mesh are re-positioned.

### 5.6.1 Creating zones

A zone can be created in two ways. First, it can be created as part of the meshing process, when the zone is included within the mesh within a relevant file in the polyMesh directory. The relevant files are cellZones, faceZones and pointZones, which can each contain a set of one or more zones (in fact, a file can exist but contain zero zones).

These “static” zones can be created by a mesh generation tool, e.g. blockMesh or snappyHexMesh. Other utilities can also create them, especially the dedicated createZones tool, where the zones are configured through a createZonesDict file.

A zone can also be generated “dynamically” within an application, especially during a CFD simulation itself, i.e. within foamRun or foamMultiRun. These zones usually remain unchanged, following their generation at the beginning of a simulation. Alternatively, if a zone represents a fixed region of space, and the mesh is moving, the list of indices describing a zone can be updated dynamically during a simulation.

Dynamic zones are configured through a zonesGenerator file. The file can both include the configuration of new zones and may also involve “static” zones which have already been created as part of the mesh.

### 5.6.2 Zone generators

Zones can be configured in a zonesGenerator file, createZonesDict file and other configuration files for utilities described in following sections. There are several types of zoneGenerator, which are listed in this section. For detailed information about their configuration, the user can simply run the foamInfo script, e.g.

  
    foamInfo union

Zones are always updated when there are topological changes within the mesh, e.g. meshing refinement and unrefinement. When the mesh moves, users have the option to retain the same elements (cells, faces, points) within the zone, such that the zone moves with the mesh. Alternatively, they can update the elements of a zone during a simulation by setting the moveUpdate switch to on/yes/true. This allows the zones to represent regions fixed in space with the mesh moving within it.

The first set of zone generators describe volume regions within the domain. They can create a zone of cells, faces or points contained within the volume region. Cells and faces are included when their centres are within the volume; points are included which are within the volume. The volume zone generators are listed below.

-   annulus: selects cells, faces or points inside an annulus.
    
-   box: selects cells, faces or points inside a box.
    
-   cylinder: selects cells, faces or points inside a cylinder.
    
-   hemisphere: selects cells, faces or points inside a hemisphere.
    
-   insideSurface: selects cells, faces or points inside a closed surface described by a surface geometry file, e.g. surface.obj.
    
-   sphere: selects cells, faces or points inside a sphere.
    
-   truncatedCone: selects cells, faces or points inside a truncated cone.
    

An example configuration of a hemisphere zone generator is presented below (taking from running “foamInfo hemisphere”).

  
hemisphere1  
{  
    type        hemisphere;  
    zoneType    cell;  
  
    centre      (-0.001 0.001 0);  
    axis        (0 1 0);  
    radius      0.001;  
}

There are then zone generators which are specific to cells, faces and points. The biggest set of these is the zone generators for faces which are listed below.

-   face: creates a face zone from point, cell and face zones provided by a list of zoneGenerators.
    
-   flip: inverts the flipMap of a face zone from a given zoneGenerator.
    
-   normal: selects faces from a given zoneGenerator that are aligned with a specified normal direction.
    
-   orient: sets the face orientation flipMap of a face zone.
    
-   patch: creates a face zone from a set of patches.
    
-   plane: creates a face zone from faces, whose vector connecting its adjacent cell centres, intersects a specified plane.
    
-   surface: creates a face zone from faces whose vector, , whose vector connecting its adjacent cell centres, intersects a surface geometry, e.g. surface.obj.
    

As discussed in the introduction to this section, a face zone can optionally include a flipMap. A flipMap is required, for example, to calculate the flow rate through an area described by a face zone by summing the fluxes ![eqn](img/index359x.png) on all the faces in the face zone. That calculation is only meaningful if the face area vectors, used to calculate ![eqn](img/index359x.png), point in a consistent direction. To ensure consistency, the sign of ![eqn](img/index361x.png) is inverted for faces marked true in the flipMap.

Specific cell and point zone generators are listed below.

-   cellZone: selects and/or generates a cell zone for a tool that requires one, e.g. a functionObject, fvModel, fvConstraint or utility application.
    
-   containsPoints: creates a cell zone containing the specified points.
    
-   point: creates a point zone from face, cell and point zones provided by list of zoneGenerators.
    

The final set of zone generators create, that manipulate and combine zones, are listed below. When used to create a face zone, they have specific rules about creating a flipMap.

-   all: creates a zone using all cells, faces or points of the mesh; no flipMap for a face zone.
    
-   clear: clears all zones from a mesh.
    
-   difference: selects cell, face or point elements in the first specified zone and removes the elements in subsequent specified zones.
    
-   intersection: selects cell, face or point elements common to all the specified zones; can contain a flipMap if one face zone includes one.
    
-   invert: selects cell, face or point elements in the mesh and removes the elements from the specified zones.
    
-   periodic: activates a specified set of zones for a given period with optional repetition.
    
-   remove: removes specified zones from a mesh.
    
-   set: converts a legacy cell, face or point set to an equivalent zone; no flipMap a the face zone.
    
-   union: selects all cell, face or point elements from all the specified zones; can contain a flipMap if all face zones include one.
    
-   write: writes existing zones to the mesh, e.g. for visualisation.
    

### 5.6.3 The createZones utility

The createZones utility creates “static” zones that form part of a mesh. There are many example cases in OpenFOAM that use createZones that can be inspected to learn about its use. One example is the coolingSphere case (in $FOAM\_TUTORIALS/multiRegion/CHT) which generates a cell zone that is subsequently used to form a separate mesh region for a solid sphere. The configuration from the createPatchDict file is shown below.

16solid

17{

18  type  sphere;

19  zoneType  cell;

20

21  centre  (0 0 0);

22  radius  $blockMeshDict!geometry/sphere/radius;

23}

24

25// \*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\* //
   

It generates a zone named solid using the sphere zone generator. The zone type is a cell zone. The remaining parameters describe the sphere, namely the centre and radius. The latter is read from the blockMeshDict file using a macro expansion, described in section [4.2.10](basic-file-format#x18-1030004.2.10) .

The mesh and cell zone are generated by running blockMesh and createZones respectively. blockMesh first produces the standard mesh files in the constant/polyMesh. createZones then generates an additional cellZones file in that directory, containing the list of cell indices that make up the zone.

### 5.6.4 The refineMesh utility

The refineMesh utility refines cells in a mesh. The refinement can be applied to cells in the entire mesh or to specified regions of the mesh. The refinement is applied by splitting cells, which can be applied in all three directions or on one or two specified directions.

To apply refinement across the entire mesh and in all three directions, refineMesh can be run using the \-all option, i.e.

  
    refineMesh -all

Otherwise, the region of the mesh and/or refinement directions must be configured using a refineMeshDict file.

There are many example cases in OpenFOAM which include refineMeshDict files. One is the pipeCyclic case (in $FOAM\_TUTORIALS/incompressibleFluid) whose refineMeshDict file is shown below.

16

17hexRef8  yes;

18

19zone

20{

21  type  box;

22  box  (-1e6 -1e6 -1e6)(1e6 -0.15 0.3);

23}

24

25// \*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\* //
   

The file includes a zone entry to describe a cell zone configured with a box zone generator. The refinement is specified through the hexRef8 switch, set to on. hexRef8 refines cells in all directions, splitting each selected cell ![eqn](img/index362x.png). It is the method used by snappyHexMesh which keeps a record of the refinement history in a refinementHistory file in the polyMesh directory.

The DTCHull case (in $FOAM\_TUTORIALS/incompressibleVoF) is another example that uses the refineMesh utility. It is a case of ship hydrodynamics which generates an initial mesh which has high aspect ratio cells, stretched in the horizontal plane, in the vicinity of the water-air interface. Before meshing the ship hull with snappyHexMesh, the aspect ratio of cells is gradually reduced from the far field to the hull, by successive refinements of cells in the horizontal directions. The refineMeshDict file for this case is shown below.

16

17coordinates

18{

19  type  global;

20

21  e1  (1 0 0);

22  e2  (0 1 0);

23

24  directions  (e1 e2);

25}

26

27zones

28{

29  level1

30  {

31  type  box;

32  box  (-10 -6 -3) (10 0 3);

33  }

34

35  level2

36  {

37  type  box;

38  box  (-5 -3 -2.5) (9 0 2);

39  }

40

41  level3

42  {

43  type  box;

44  box  (-3 -1.5 -1) (8 0 1.5);

45  }

46

47  level4

48  {

49  type  box;

50  box  (-2 -1 -0.6) (7 0 1);

51  }

52

53  level5

54  {

55  type  box;

56  box  (-1 -0.6 -0.3) (6.5 0 0.8);

57  }

58

59  level6

60  {

61  type  box;

62  box  (-0.5 -0.55 -0.15) (6.25 0 0.65);

63  }

64}

65

66// \*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\* //
   

It first describes the refinement directions by the coordinates sub-dictionary. The co-ordinates must be specified by two orthogonal directions described by the e1 and e2 vectors. The directions parameter then lists the refinement directions, which could theoretically include e3, the vector calculated orthogonal to e1 and e2 (forming a right-handed set of axes).

The refinement is then specified in zones described in the a zones sub-dictionary. Six box zones are listed from largest to smallest. Refinement is applied successively to each zone so that it produces six levels of refinement in the final box, five levels in the region described by the fifth box beyond the final box, and so on.

### 5.6.5 The createPatch utility

The createPatch utility creates new patches from collections of boundary faces. It enables users to make changes to the patch configuration in a mesh, often in the final stages of a meshing workflow. The utility is configured by a createPatchDict file.

There are some examples in OpenFOAM which use createPatch. Most of them create a patch from faces defined by a face zone. The hotRoomComfort example (in $FOAM\_TUTORIALS/fluid) contains a createPatchDict file which creates an inlet and an outlet patch in a mesh whose boundary initially contains a single wall patch. The createPatchDict file is given below, showing each patch is generated from a box zone.

16patches

17{

18  inlet

19  {

20  // Dictionary to construct new patch from

21  patchInfo

22  {

23  type patch;

24  }

25

26  // Construct from zone

27  constructFrom zone;

28

29  // Generate zone

30  zone

31  {

32  type  box;

33  box  (-0.001 0.25 1.1)(0.001 0.75 1.3);

34  }

35  }

36

37  outlet

38  {

39  // Dictionary to construct new patch from

40  patchInfo

41  {

42  type patch;

43  }

44

45  // Construct from zone

46  constructFrom zone;

47

48  // Generate zone

49  zone

50  {

51  type  box;

52  box  (1.75 2.999 0.3)(2.25 3.001 0.5);

53  }

54  }

55}

56

57// \*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\* //
   

The potentialFreeSurfaceMovingOscillatingBox case (in $FOAM\_TUTORIALS/isothermalFluid) uses the createPatchDict shown below.

16patches

17{

18  floatingObjectBottom

19  {

20  // Dictionary to construct new patch from

21  patchInfo

22  {

23  type wall;

24  }

25

26  // Construct patch from a faceZone

27  constructFrom zone;

28

29  zone

30  {

31  type  normal;

32

33  normal  (0 1 0);

34  tol  0.01;

35

36  floatingObject

37  {

38  type  patch;

39  patch  floatingObject;

40  }

41  }

42  }

43}

44

45// \*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\* //
   

This example uses a normal zone generator applied to a zone generated from patch. The patch zone generation is configured within the normal zone configuration, resulting in a zone containing faces, oriented with the specified normal direction, that are extracted from the patch.

### 5.6.6 The subsetMesh utility

The subsetMesh utility creates a new mesh which is a subset of an existing mesh. It is commonly used in a meshing workflow which creates a mesh, then uses subsetMesh to remove part of the mesh.

The floatingObject tutorial (in $FOAM\_TUTORIALS/incompressibleVoF) provides a good example of its use. A mesh is initially created of a box-shaped domain. A floating object is then introduced corresponding to a zone configured in subsetMeshDict, shown below.

16

17zone

18{

19  type  box;

20  select  outside;

21  box  (0.35 0.35 0.1) (0.65 0.55 0.6);

22}

23

24patch  floatingObject;

25

26// \*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\* //
   

The zone is configured by defining a box with the addition of the optional selection keyword which selects cells outside the box. Consequently, the new mesh becomes the original mesh without the cells contained with the box, which represents the floating object. A patch entry provides a name for the patch formed by the faces exposed by removal of the cells.

OpenFOAM v13 User Guide - 5.6 Mesh Zones

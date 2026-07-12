---
source: https://doc.cfd.direct/openfoam/user-guide-v13/mesh-files
title: OpenFOAM v13 User Guide - 5.2 Mesh files
slug: mesh-files
---
### What are the mesh files in OpenFOAM?

The mesh files in OpenFOAM are described in CFD Direct's Essential CFD course

[Essential CFD](https://cfd.direct/openfoam-training/essential-cfd "Essential CFD")

\[**version 13**\]\[[version 12](../user-guide-v12)\]\[[version 11](../user-guide-v11)\]\[[version 10](../user-guide-v10)\]\[[version 9](../user-guide-v9)\]\[[version 8](../user-guide-v8)\]\[[version 7](../user-guide-v7)\]\[[version 6](../user-guide-v6)\]

\[[chapter contents](mesh)\]\[[previous topic](mesh-description)\]\[[next topic](boundaries)\]\[[index](bookindex)\]

## 5.2 Mesh files

When a mesh is written out by OpenFOAM, the data files go into a polyMesh sub-directory. Usually the polyMesh directory is written to the the constant directory, but simulations with dynamic meshes (e.g. mesh motion, refinement, etc.) write the modified meshes into time directories along with the field data files.

The data files are based around faces rather than cells. Each face is therefore assigned an ‘owner’ cell and ‘neighbour’ cell so that the connectivity across a given face can simply be described by the owner and neighbour cell labels. In the case of boundaries, there is no neighbour cell. With this in mind, the I/O specification consists of the following files:

  
points

a list of vectors describing the cell vertices, where the first vector in the list represents vertex 0, the second vector represents vertex 1, etc.;

  
faces

a list of faces, each face being a list of indices to vertices in the points list, where again, the first entry in the list represents face 0, etc.;

  
owner

a list of owner cell labels, starting with the owner cell of face 0, then 1, 2, …

  
neighbour

a list of neighbour cell labels;

  
boundary

a list of patches, containing a dictionary entry for each patch, declared using the patch name.

Critically, the faces list is ordered so that all internal faces are listed first, followed by the boundary faces. The boundary faces are themselves ordered so that they begin with the faces in the first patch, followed by the second, etc. As a consequence the patch entries in the boundary file are very compact, e.g.

  
    inlet  
    {  
        type            patch;  
        nFaces          30;  
        startFace       24170;  
    }

Due to the face ordering, the patch faces are simply described by: startFace, the index into the face list of the first face in the patch; and, nFaces, the number of faces in the patch.

OpenFOAM v13 User Guide - 5.2 Mesh files

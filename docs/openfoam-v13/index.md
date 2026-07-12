---
source: https://doc.cfd.direct/openfoam/user-guide-v13/
title: OpenFOAM v13 User Guide
slug: index
---
### How do I learn to do CFD with OpenFOAM?

CFD Direct provides the best Training to learn CFD with OpenFOAM

[See Training](https://cfd.direct/openfoam-training "See Training")

\[**version 13**\]\[[version 12](../user-guide-v12)\]\[[version 11](../user-guide-v11)\]\[[version 10](../user-guide-v10)\]\[[version 9](../user-guide-v9)\]\[[version 8](../user-guide-v8)\]\[[version 7](../user-guide-v7)\]\[[version 6](../user-guide-v6)\]

The OpenFOAM User Guide provides an introduction to OpenFOAM, through some basic tutorials, and some details about the general operation of OpenFOAM. OpenFOAM is a collection of approximately 150 applications built upon a collection of approximately 150 software libraries (modules). Each application performs a specific task within a CFD workflow. The snappyHexMesh application, for example, is a mesh generator for complex geometry, which can generate a mesh around a vehicle. Fluid flow is calculated using the foamRun application which loads a module which describes the fluid, e.g. the incompressibleFluid module solves steady or transient, turbulent flow of incompressible, isothermal fluids with optional mesh motion and change. The OpenFOAM User Guide describes these applications and modules and how to execute them, either on a single processor or in parallel on multiple processors.  
  
**Case Setup**  
The OpenFOAM User Guide then examines the set up of input data files for a CFD analysis. The input data includes time information (start time, end time, time step, etc) and controls for reading and writing data (time, format, compression, etc). It additionally describes the setting of numerical schemes that affects accuracy and stability of a simulation. Matrix solver controls and algorithm controls are also explained that affect computational time and stability.  
  
**Meshing**  
The OpenFOAM User Guide includes a chapter on meshing. It begins with the mesh structure of OpenFOAM and the handling of boundaries and boundary conditions. It describes the blockMesh application for generating meshes of simple geometries in detail, followed by the snappyHexMesh application and its control parameters. OpenFOAM includes applications that convert meshes from well known formats into the OpenFOAM format and detailed the User Guide covers principal conversion applications, e.g. fluentMeshToFoam, in detail. The mapFields application maps field data, e.g. pressure, velocity, from one mesh/geometry to another.  
  
**Post-Processing**  
OpenFOAM is shipped with a version of ParaView that includes a reader module to read data in OpenFOAM format. This enables visualization of solutions from OpenFOAM, with elements used commonly in CFD such as geometry surfaces, cutting planes, vector plots and streamlines. With these elements, users can generate animations conveniently with ParaView.

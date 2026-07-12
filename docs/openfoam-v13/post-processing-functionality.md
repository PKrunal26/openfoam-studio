---
source: https://doc.cfd.direct/openfoam/user-guide-v13/post-processing-functionality
title: OpenFOAM v13 User Guide - 7.3 Post-processing functionality
slug: post-processing-functionality
---
### What are the post-processing tools in OpenFOAM?

The post-processing tools in OpenFOAM are described in our OpenFOAM Training

[See Training](https://cfd.direct/openfoam-training "See Training")

\[**version 13**\]\[[version 12](../user-guide-v12)\]\[[version 11](../user-guide-v11)\]\[[version 10](../user-guide-v10)\]\[[version 9](../user-guide-v9)\]\[[version 8](../user-guide-v8)\]\[[version 7](../user-guide-v7)\]\[[version 6](../user-guide-v6)\]

\[[chapter contents](postprocessing)\]\[[previous topic](post-processing-cli)\]\[[next topic](graphs-monitoring)\]\[[index](bookindex)\]

## 7.3 Post-processing functionality

The packaged function objects are catalogued in this section. Each packaged function object is a configuration file stored in $FOAM\_ETC/caseDicts/postProcessing. As a reminder, they can be listed by the following command.

  
    foamPostProcess -list

### 7.3.1 Field calculation

  
age

Calculates and writes out the time taken for a particle to travel from an inlet to the location.

  
components

Writes the component scalar fields (e.g. Ux, Uy, Uz) of a field (e.g. U).

  
CourantNo

Calculates the Courant Number field from the flux field.

  
cylindrical

Transforms a vector field into cylindrical coordinates.

  
ddt

Calculates the Eulerian time derivative of a field.

  
div

Calculates the divergence of a field.

  
enstrophy

Calculates the enstrophy of the velocity field.

  
fieldAverage

Calculates and writes the time averages of a given list of fields.

  
flowType

Calculates and writes the flowType of velocity field where: -1 = rotational flow; 0 = simple shear flow; +1 = planar extensional flow.

  
grad

Calculates the gradient of a field.

  
Lambda2

Calculates and writes the second largest eigenvalue of the sum of the square of the symmetrical and anti-symmetrical parts of the velocity gradient tensor.

  
log

Calculates the natural logarithm of the specified scalar field.

  
MachNo

Calculates the Mach Number field from the velocity field.

  
mag

Calculates the magnitude of a field.

  
magSqr

Calculates the magnitude-squared of a field.

  
massFractions

Calculates mass-fraction fields from mole-fraction fields, or moles fields, and a multi-component thermophysical model.

  
moleFractions

Calculates mole-fraction fields from the mass-fraction fields of a multi-component thermophysical model.

  
power

Calculates power fields, corresponding to pressure, shear and total stress.

  
PecletNo

Calculates the Peclet Number field from the flux field.

  
Q

Calculates the second invariant of the velocity gradient tensor.

  
randomise

Adds a random component to a field, with a specified perturbation magnitude.

  
reconstruct

Calculates the reconstruction of a field; e.g. to construct a cell-centred velocity U from the face-centred flux phi.

  
scale

Multiplies a field by a scale factor

  
shearStress

Calculates the shear stress, outputting the data as a volSymmTensorField.

  
specieAdvectiveFlux

Calculate the advective flux of a specified species as a surfaceScalarField

  
specieDiffusionFlux

Calculate the diffusive flux of a specified species as a surfaceScalarField

  
specieFlux

Calculate the combined flux of a specified species as a surfaceScalarField

  
streamFunction

Writes the stream-function pointScalarField, calculated from the specified flux surfaceScalarField.

  
surfaceInterpolate

Calculates the surface interpolation of a field.

  
totalEnthalpy

Calculates and writes the total enthalpy ![eqn](img/index387x.png) as the volScalarField ![eqn](img/index388x.png).

  
tr

Calculates the trace of a tensor field.

  
turbulenceFields

Calculates specified turbulence fields and stores it on the database.

  
turbulenceIntensity

Calculates and writes the turbulence intensity field I.

  
volField

Converts a volField::Internal into a volField.

  
vorticity

Calculates the vorticity field, i.e. the curl of the velocity field.

  
wallHeatFlux

Calculates the heat flux at wall patches, outputting the data as a volVectorField.

  
wallHeatTransferCoeff

Calculates the estimated incompressible flow heat transfer coefficient at wall patches, outputting the data as a volScalarField.

  
wallShearStress

Calculates the shear stress at wall patches, outputting the data as a volVectorField.

  
writeCellCentres

Writes the cell-centres volVectorField and the three component fields as volScalarFields; useful for post-processing thresholding.

  
writeCellVolumes

Writes the cell-volumes volScalarField

  
writeVTK

Writes out specified objects in VTK format, e.g. fields, stored on the case database.

  
yPlus

Calculates the turbulence y+, outputting the data as a yPlus field.

### 7.3.2 Field operations

  
add

Add a list of fields.

  
divide

From the first field, divide the remaining fields in the list.

  
multiply

Multiply a list of fields.

  
subtract

From the first field, subtracts the remaining fields in the list.

  
uniform

Create a uniform field.

### 7.3.3 Forces and force coefficients

  
forceCoeffsCompressible

Calculates lift, drag and moment coefficients by summing forces on specified patches for a case where the solver is compressible (pressure is in units M/(LTˆ2), e.g. Pa).

  
forceCoeffsIncompressible

Calculates lift, drag and moment coefficients by summing forces on specified patches for a case where the solver is incompressible (pressure is kinematic, e.g. mˆ2/sˆ2).

  
forcesCompressible

Calculates pressure and viscous forces over specified patches for a case where the solver is compressible (pressure is in units M/(LTˆ2), e.g. Pa).

  
forcesIncompressible

Calculates pressure and viscous forces over specified patches for a case where the solver is incompressible (pressure is kinematic, e.g. mˆ2/sˆ2).

### 7.3.4 Sampling for graph plotting

  
graphCell

Writes graph data for specified fields along a line, specified by start and end points. One graph point is generated in each cell that the line intersects.

  
graphCellFace

Writes graph data for specified fields along a line, specified by start and end points. One graph point is generated on each face and in each cell that the line intersects.

  
graphCutLayerAverage

Writes graphs of cell values, volume-averaged in planes perpendicular to a given direction or in contours of a given distance field, adaptively grading the distribution of graph points to match the resolution of the mesh.

  
graphFace

Writes graph data for specified fields along a line, specified by start and end points. One graph point is generated on each face that the line intersects.

  
graphLayerAverage

Generates plots of fields averaged over the layers in the mesh.

  
graphPatchCutLayerAverage

Writes graphs of patch face values, area-averaged in planes perpendicular to a given direction. It adaptively grades the distribution of graph points to match the resolution of the mesh

  
graphUniform

Writes graph data for specified fields along a line, specified by start and end points. A specified number of graph points are used, distributed uniformly along the line.

### 7.3.5 Lagrangian data

  
dsmcFields

Calculate intensive fields UMean, translationalT, internalT, overallT from averaged extensive fields from a DSMC calculation.

  
stopAtEmptyClouds

Stops the run when all clouds are empty, i.e. have no particles.

### 7.3.6 Volume fields

  
cellMax

Writes out the maximum cell value for one or more fields.

  
cellMaxMag

Writes out the maximum cell value magnitude for one or more fields.

  
cellMin

Writes out the minimum cell value for one or more fields.

  
cellMinMag

Writes out the maximum cell value magnitude for one or more fields.

  
volAverage

Writes out the volume-weighted average of one or more fields.

  
volIntegrate

Writes out the volume integral of one or more fields.

### 7.3.7 Numerical data

  
residuals

For specified fields, writes out the initial residuals for the first solution of each time step; for non-scalar fields (e.g. vectors), writes the largest of the residuals for each component (e.g. x, y, z).

### 7.3.8 Control

  
adjustTimeStepToChemistry

Adjusts the time step to a chemistry model’s bulk chemical time scales

  
adjustTimeStepToCombustion

Adjusts the time step to a combustion model’s bulk reaction time scales

  
removeObjects

Removes the specified objects, e.g. fields, stored in the case database.

  
stopAtClockTime

Stops the run when the specified clock time in second has been reached and optionally write results before stopping.

  
stopAtFile

Stops the run when the file stop is created in the case directory.

  
stopAtTimeStep

Stops the run if the time-step drops below the specified value in seconds and optionally write results before stopping.

  
time

Writes run time, CPU time and clock time and optionally the CPU and clock times per time step.

  
timeStep

Writes the time step to a file for monitoring.

  
userTimeStep

Writes the user time step to a file for monitoring.

  
writeObjects

Writes out specified objects, e.g. fields, stored on the case database.

### 7.3.9 Pressure tools

  
staticPressureIncompressible

Calculates the pressure field in normal units, i.e. Pa in SI, from kinematic pressure by scaling by a specified density.

  
totalPressureCompressible

Calculates the total pressure field in normal units, i.e. Pa in SI, for a case where the solver is compressible.

  
totalPressureIncompressible

Calculates the total pressure field for a case where the solver is incompressible, in kinematic units, i.e. ![eqn](img/index389x.png) in SI.

### 7.3.10 Combustion and chemistry

  
bXiProgress

Writes the combustion progress of the Weller b-Xi combustion models.

  
Qdot

Calculates and outputs the heat release rate for the current combustion model.

  
reactionRates

Writes volume averaged reaction rates in ![eqn](img/index390x.png) for each reaction.

  
specieReactionRates

Writes volume averaged reaction rates in ![eqn](img/index391x.png) for each species and each reaction.

  
XiReactionRate

Writes the turbulent flame-speed and reaction-rate volScalarFields for the Xi-based combustion models.

### 7.3.11 Multiphase

  
phaseForces

Calculates the blended interfacial forces acting on a given phase, i.e. drag, virtual mass, lift, wall-lubrication and turbulent dispersion. Note that it works only in solver post-processing mode and in combination with multiphaseEulerFoam. For a simulation involving more than two phases, the accumulated force is calculated by looping over all phasePairs the phase is a part of.

  
phaseMap

Writes the phase-fraction map field alpha.map with incremental value ranges for each phase e.g., with values 0 for water, 1 for air, 2 for oil, etc.

  
populationBalanceSetPhaseSizeDistribution

Sets the population balance size distribution for a single phase by overwriting the values in the size-group fraction fields with values obtained by integrating a given distribution

  
populationBalanceSetSizeDistribution

Sets the population balance size distribution by overwriting the values in the size-group fraction fields with values obtained by integrating a given distribution.

  
populationBalanceMoments

Calculates and writes out integral (integer moments) or mean properties (mean, variance, standard deviation) of a size distribution computed with multiphaseEulerFoam. Requires solver post-processing.

  
populationBalanceSizeDistribution

Writes out the size distribution computed with multiphaseEulerFoam for the entire domain or a volume region. Requires solver post-processing.

  
wallBoilingProperties

Looks up wall boiling wall functions and collects and writes out out fields of bubble departure diameter, bubble departure frequency, nucleation site density, effective liquid fraction at the wall, quenching heat flux, and evaporative heat flux.

  
wallBoilingProperty

Looks up the wall boiling model and collects and writes out a field of one of the wall boiling properties.

### 7.3.12 Probes

  
boundaryProbes

Writes out values of fields at a cloud of points, interpolated to specified boundary patches.

  
interfaceHeight

Reports the height of the interface above a set of locations. For each location, it writes the vertical distance of the interface above both the location and the lowest boundary. It also writes the point on the interface from which these heights are computed.

  
internalProbes

Writes out values of fields interpolated to a specified cloud of points.

  
probes

Writes out values of fields from cells nearest to specified locations.

### 7.3.13 Surface fields

  
faceZoneAverage

Calculates the average value of one or more fields on a faceZone.

  
faceZoneFlowRate

Calculates the flow rate through a specified face zone by summing the flux on patch faces. For solvers where the flux is volumetric, the flow rate is volumetric; where flux is mass flux, the flow rate is mass flow rate.

  
patchAverage

Calculates the average value of one or more fields on a patch.

  
patchDifference

Calculates the difference between the average values of fields on two specified patches. Calculates the average value of one or more fields on a patch.

  
patchFlowRate

Calculates the flow rate through a specified patch by summing the flux on patch faces. For solvers where the flux is volumetric, the flow rate is volumetric; where flux is mass flux, the flow rate is mass flow rate.

  
patchIntegrate

Calculates the surface integral of one or more fields on a patch.

  
triSurfaceAverage

Calculates the average on a specified triangulated surface by interpolating onto the triangles and integrating over the surface area. Triangles need to be small (¡= cell size) for an accurate result.

  
triSurfaceDifference

Calculates the difference between the average values of fields on two specified triangulated surfaces.

  
triSurfaceVolumetricFlowRate

Calculates volumetric flow rate through a specified triangulated surface by interpolating velocity onto the triangles and integrating over the surface area. Triangles need to be small (¡= cell size) for an accurate result.

### 7.3.14 Meshing

  
checkMesh

Executes primitiveMesh::checkMesh to check the distortion of moving meshes.

  
multiValveEngineState

Writes the multi-valve engine motion state providing details of the piston and valve position, speed etc.

### 7.3.15 ‘Pluggable’ solvers

  
particles

Tracks a cloud of parcels driven by the flow of the continuous phase.

  
phaseScalarTransport

Solves a transport equation for a scalar field within one phase of a multiphase simulation.

  
scalarTransport

Solves a transport equation for a scalar field.

### 7.3.16 Sampling surfaces

  
cutPlaneSurface

Writes out cut-plane surface files with interpolated field data in VTK format.

  
isoSurface

Writes out iso-surface files with interpolated field data in VTK format.

  
patchSurface

Writes out patch surface files with interpolated field data in VTK format.

### 7.3.17 Streamlines

  
streamlinesLine

Writes out files of stream lines with interpolated field data in VTK format, with initial points uniformly distributed along a line.

  
streamlinesPatch

Writes out files of stream lines with interpolated field data in VTK format, with initial points randomly selected within a patch.

  
streamlinesPoints

Writes out files of stream lines with interpolated field data in VTK format, with specified initial points.

  
streamlinesSphere

Writes out files of stream lines with interpolated field data in VTK format, with initial points randomly selected within a sphere.

OpenFOAM v13 User Guide - 7.3 Post-processing functionality

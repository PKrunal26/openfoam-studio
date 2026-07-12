---
source: https://doc.cfd.direct/openfoam/user-guide-v13/models
title: OpenFOAM v13 User Guide - Chapter 8 Models and physical properties
slug: models
---
### How are models configured in OpenFOAM?

Model configuration in OpenFOAM is described in CFD Direct's OpenFOAM Training

[See Training](https://cfd.direct/openfoam-training "See Training")

\[**version 13**\]\[[version 12](../user-guide-v12)\]\[[version 11](../user-guide-v11)\]\[[version 10](../user-guide-v10)\]\[[version 9](../user-guide-v9)\]\[[version 8](../user-guide-v8)\]\[[version 7](../user-guide-v7)\]\[[version 6](../user-guide-v6)\]

\[[table of contents](contents)\]\[[previous topic](post-processing-third-party)\]\[[next topic](thermophysical)\]\[[index](bookindex)\]

## Chapter 8 Models and physical properties

OpenFOAM includes a large range of solvers, each designed for a specific class of flow, as described in section [3.6](standard-solvers#x14-750003.6) . Each solver uses a particular set of models which calculate physical properties and simulate phenomena like transport, turbulence, thermal radiation, etc.

From OpenFOAM v10 onwards, a distinction is made between material properties and models for phenomena such as those mentioned above. Properties are specified in physicalProperties file in the constant directory. In the case of fluids, properties in physicalProperties relate to a fluid at rest. They are the properties you might look up from a table in a book, so can be dependent on temperature ![eqn](img/index404x.png), based on some function.

Properties described in physicalProperties do not include any dependency on the flow itself. For example, turbulence, visco-elasticity and the variation of viscosity ![eqn](img/index405x.png) with strain-rate, are all specified in a momentumTransport file in the constant directory. This chapter includes a description of models for viscosity which are dependent on strain-rate in section [8.3](transport-rheology#x47-2600008.3) and turbulence models in section [8.2](turbulence#x46-2530008.2) . Thermophysical models, which are specified in the physicalProperties file (since they represent temperature dependency of properties) are described in section [8.1](thermophysical#x45-2450008.1) .

 8.1 [Thermophysical models](thermophysical#x45-2450008.1)  
  8.1.1 [Thermophysical and mixture models](thermophysical#x45-2460008.1.1)  
  8.1.2 [Transport model](thermophysical#x45-2470008.1.2)  
  8.1.3 [Thermodynamic models](thermophysical#x45-2480008.1.3)  
  8.1.4 [Composition of each constituent](thermophysical#x45-2490008.1.4)  
  8.1.5 [Equation of state](thermophysical#x45-2500008.1.5)  
  8.1.6 [Selection of energy variable](thermophysical#x45-2510008.1.6)  
  8.1.7 [Thermophysical property data](thermophysical#x45-2520008.1.7)  
 8.2 [Turbulence models](turbulence#x46-2530008.2)  
  8.2.1 [Reynolds-averaged simulation (RAS) modelling](turbulence#x46-2540008.2.1)  
  8.2.2 [RAS turbulence models](turbulence#x46-2550008.2.2)  
  8.2.3 [Large eddy simulation (LES) modelling](turbulence#x46-2560008.2.3)  
  8.2.4 [LES turbulence models](turbulence#x46-2570008.2.4)  
  8.2.5 [Model coefficients](turbulence#x46-2580008.2.5)  
  8.2.6 [Wall functions](turbulence#x46-2590008.2.6)  
 8.3 [Transport/rheology models](transport-rheology#x47-2600008.3)  
  8.3.1 [Bird-Carreau model](transport-rheology#x47-2610008.3.1)  
  8.3.2 [Cross Power Law model](transport-rheology#x47-2620008.3.2)  
  8.3.3 [Power Law model](transport-rheology#x47-2630008.3.3)  
  8.3.4 [Herschel-Bulkley model](transport-rheology#x47-2640008.3.4)  
  8.3.5 [Casson model](transport-rheology#x47-2650008.3.5)  
  8.3.6 [General strain-rate function](transport-rheology#x47-2660008.3.6)  
  8.3.7 [Maxwell model](transport-rheology#x47-2670008.3.7)  
  8.3.8 [Giesekus model](transport-rheology#x47-2680008.3.8)  
  8.3.9 [Phan-Thien-Tanner (PTT) model](transport-rheology#x47-2690008.3.9)  
  8.3.10 [Lambda thixotropic model](transport-rheology#x47-2700008.3.10)

OpenFOAM v13 User Guide - Chapter 8 Models and physical properties

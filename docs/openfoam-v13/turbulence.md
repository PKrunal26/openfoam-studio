---
source: https://doc.cfd.direct/openfoam/user-guide-v13/turbulence
title: OpenFOAM v13 User Guide - 8.2 Turbulence models
slug: turbulence
---
### How are turbulence models initialised in OpenFOAM?

Our Essential CFD course demonstrates the initialisation of turbulence models

[Essential CFD](https://cfd.direct/openfoam-training/essential-cfd "Essential CFD")

\[**version 13**\]\[[version 12](../user-guide-v12)\]\[[version 11](../user-guide-v11)\]\[[version 10](../user-guide-v10)\]\[[version 9](../user-guide-v9)\]\[[version 8](../user-guide-v8)\]\[[version 7](../user-guide-v7)\]\[[version 6](../user-guide-v6)\]

\[[chapter contents](models)\]\[[previous topic](thermophysical)\]\[[next topic](transport-rheology)\]\[[index](bookindex)\]

## 8.2 Turbulence models

Turbulence modelling is part of general momentum transport which is concerned with models for the viscous stress in a fluid. Momentum transport is configured through the momentumTransport file in the constant directory of a case. The file includes the mandatory simulationType keyword that specifies how turbulence is modelled, which includes the following options:

  
laminar

uses no turbulence models;

  
RAS

uses Reynolds-averaged simulation (RAS) modelling;

  
LES

uses large-eddy simulation (LES) modelling.

The file then includes a sub-dictionary of the same name as the chosen simulationType which contains the model selections. A typical example is shown below that uses the ![eqn](img/index531x.png)–![eqn](img/index532x.png) (k-epsilon) turbulence model.

16

17simulationType RAS;

18

19RAS

20{

21  model  kEpsilon;

22

23  turbulence  on;

24}

25

26// \*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\* //
   

The file shows the selected RAS simulation followed by the RAS sub-dictionary containing the model selections, in particular the model which is set to kEpsilon. The choice of RAS models is described in section [8.2.1](#x46-2540008.2.1) and more information can be found in [Chapter 7 of Notes on Computational Fluid Dynamics: General Principles](https://doc.cfd.direct/notes/cfd-general-principles/reynolds-averaged-turbulence-modelling). The LES models are listed in section [8.2.3](#x46-2560008.2.3) .

Where the laminar option is selected, the sub-dictionary is optional and will default to a Newtonian model, using the viscosity specified in the physicalProperties file. Other models, including non-Newtonian and visco-elastic models, are described in section [8.3](transport-rheology#x47-2600008.3) . Non-Newtonian models can also be combined with turbulence models (whereas visco-elastic models cannot).

For a general introduction to turbulence for CFD, the reader may also wish to consult [Chapter 6 of Notes on Computational Fluid Dynamics: General Principles](https://doc.cfd.direct/notes/cfd-general-principles/introduction-to-turbulence).

### 8.2.1 Reynolds-averaged simulation (RAS) modelling

If RAS is selected, the choice of RAS modelling is specified in a RAS sub-dictionary which requires the following entries.

-   model: name of RAS turbulence model.
    
-   turbulence: switch to turn the solving of turbulence modelling on/off.
    
-   printCoeffs: optional switch to print model coeffs to terminal at simulation start up, defaults to false.
    
-   <model\>Coeffs: optional dictionary of coefficients for the respective model, defaults to standard coefficients.
    

Turbulence models can be listed by running foamToC with a relevant table listed from the RAS or LES tables. For example, the RAS tables are listed by running the following command.

  
    foamToC -table RAS

This returns several sub-tables. The user can then list the models within one of those tables, e.g. the incompressible models.

  
    foamToC -table RASincompressibleMomentumTransportModel

The RAS models used in the tutorials can be listed using foamSearch with the following command. The lists of available models are given in the following sections.

  
    foamSearch $FOAM\_TUTORIALS momentumTransport RAS/model

Users can locate tutorials using a particular model, e.g. buoyantKEpsilon, using foamInfo.

  
    foamInfo buoyantKEpsilon

### 8.2.2 RAS turbulence models

For incompressible flows, the RAS model can be chosen from the list below.

  
LRR

Launder, Reece and Rodi Reynolds-stress turbulence model for incompressible flows.

  
LamBremhorstKE

Lam and Bremhorst low-Reynolds number k-epsilon turbulence model for incompressible flows.

  
LaunderSharmaKE

Launder and Sharma low-Reynolds k-epsilon turbulence model for incompressible flows.

  
LienCubicKE

Lien cubic non-linear low-Reynolds k-epsilon turbulence models for incompressible flows.

  
LienLeschziner

Lien and Leschziner low-Reynolds number k-epsilon turbulence model for incompressible flows.

  
RNGkEpsilon

Renormalization group k-epsilon turbulence model for incompressible flows.

  
SSG

Speziale, Sarkar and Gatski Reynolds-stress turbulence model for incompressible flows.

  
ShihQuadraticKE

Shih’s quadratic algebraic Reynolds stress k-epsilon turbulence model for incompressible flows

  
SpalartAllmaras

Spalart-Allmaras one-eqn mixing-length model for incompressible external flows.

  
kEpsilon

Standard k-epsilon turbulence model for incompressible flows.

  
kEpsilonLopesdaCosta

Variant of the standard k-epsilon turbulence model with additional source terms to handle the changes in turbulence in porous regions for atmospheric flows over forested terrain.

  
kOmega

Standard high Reynolds-number k-omega turbulence model for incompressible flows.

  
kOmega2006

Standard (2006) high Reynolds-number k-omega turbulence model for incompressible flows.

  
kOmegaSST

Implementation of the k-omega-SST turbulence model for incompressible flows.

  
kOmegaSSTLM

Langtry-Menter 4-equation transitional SST model based on the k-omega-SST RAS model.

  
kOmegaSSTSAS

Scale-adaptive URAS model based on the k-omega-SST RAS model.

  
kkLOmega

Low Reynolds-number k-kl-omega turbulence model for incompressible flows.

  
qZeta

Gibson and Dafa’Alla’s q-zeta two-equation low-Re turbulence model for incompressible flows

  
realizableKE

Realizable k-epsilon turbulence model for incompressible flows.

  
v2f

Lien and Kalitzin’s v2-f turbulence model for incompressible flows, with a limit imposed on the turbulent viscosity given by Davidson et al.

For compressible flows, the RAS model can be chosen from the list below.

  
LRR

Launder, Reece and Rodi Reynolds-stress turbulence model for compressible flows.

  
LaunderSharmaKE

Launder and Sharma low-Reynolds k-epsilon turbulence model for compressible and combusting flows including rapid distortion theory (RDT) based compression term.

  
RNGkEpsilon

Renormalization group k-epsilon turbulence model for compressible flows.

  
SSG

Speziale, Sarkar and Gatski Reynolds-stress turbulence model for compressible flows.

  
SpalartAllmaras

Spalart-Allmaras one-eqn mixing-length model for compressible external flows.

  
buoyantKEpsilon

Additional buoyancy generation/dissipation term applied to the k and epsilon equations of the standard k-epsilon model.

  
kEpsilon

Standard k-epsilon turbulence model for compressible flows including rapid distortion theory (RDT) based compression term.

  
kOmega

Standard high Reynolds-number k-omega turbulence model for compressible flows.

  
kOmega2006

Standard (2006) high Reynolds-number k-omega turbulence model for compressible flows.

  
kOmegaSST

Implementation of the k-omega-SST turbulence model for compressible flows.

  
kOmegaSSTLM

Langtry-Menter 4-equation transitional SST model based on the k-omega-SST RAS model.

  
kOmegaSSTSAS

Scale-adaptive URAS model based on the k-omega-SST RAS model.

  
realizableKE

Realizable k-epsilon turbulence model for compressible flows.

  
v2f

Lien and Kalitzin’s v2-f turbulence model for compressible flows, with a limit imposed on the turbulent viscosity given by Davidson et al.

### 8.2.3 Large eddy simulation (LES) modelling

If LES is selected, the choice of LES modelling is specified in a LES sub-dictionary which requires the following entries.

-   model: name of LES turbulence model.
    
-   turbulence: switch to turn the solving of turbulence modelling on/off.
    
-   delta: name of delta ![eqn](img/index533x.png) model.
    
-   printCoeffs: optional switch to print model coeffs to terminal at simulation start up, defaults to false.
    
-   <model\>Coeffs:
    
-   <model\>Coeffs: optional dictionary of coefficients for the respective model, to override the default coefficients.
    
-   <delta\>Coeffs: dictionary of coefficients for the delta model.
    

The LES models used in the tutorials can be listed using foamSearch with the following command. The lists of available models are given in the following sections.

  
    foamSearch $FOAM\_TUTORIALS momentumTransport LES/model

### 8.2.4 LES turbulence models

For incompressible and compressible flows, the LES model can be chosen from the list below.

  
DeardorffDiffStress

Differential SGS Stress Equation Model for incompressible flows

  
Smagorinsky

The Smagorinsky SGS model.

  
SpalartAllmarasDDES

SpalartAllmaras DDES turbulence model for incompressible flows

  
SpalartAllmarasDES

SpalartAllmarasDES DES turbulence model for incompressible flows

  
SpalartAllmarasIDDES

SpalartAllmaras IDDES turbulence model for incompressible flows

  
WALE

The Wall-adapting local eddy-viscosity (WALE) SGS model.

  
dynamicKEqn

Dynamic one equation eddy-viscosity model

  
dynamicLagrangian

Dynamic SGS model with Lagrangian averaging

  
kEqn

One equation eddy-viscosity model

  
kOmegaSSTDES

Implementation of the k-omega-SST-DES turbulence model for incompressible flows.

### 8.2.5 Model coefficients

The coefficients for the RAS turbulence models are given default values in their respective source code. If the user wishes to override these default values, then they can do so by adding a sub-dictionary entry to the RAS sub-dictionary file, whose keyword name is that of the model with Coeffs appended, e.g. kEpsilonCoeffs for the kEpsilon model. If the printCoeffs switch is on in the RAS sub-dictionary, an example of the relevant …Coeffs dictionary is printed to standard output when the model is created at the beginning of a run. The user can simply copy this into the RAS sub-dictionary file and edit the entries as required.

### 8.2.6 Wall functions

A range of wall function models is available in OpenFOAM that are applied as boundary conditions on individual patches. This enables different wall function models to be applied to different wall regions. The choice of wall function model is specified through the turbulent viscosity field ![eqn](img/index534x.png) in the 0/nut file. For example, a 0/nut file:

16

17dimensions  \[0 2 -1 0 0 0 0\];

18

19internalField  uniform 0;

20

21boundaryField

22{

23  inlet

24  {

25  type  calculated;

26  value  uniform 0;

27  }

28  outlet

29  {

30  type  calculated;

31  value  uniform 0;

32  }

33  upperWall

34  {

35  type  nutkWallFunction;

36  value  uniform 0;

37  }

38  lowerWall

39  {

40  type  nutkWallFunction;

41  value  uniform 0;

42  }

43  frontAndBack

44  {

45  type  empty;

46  }

47}

48

49

50// \*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\* //
   

There are a number of wall function models available in the release, e.g. nutWallFunction, nutRoughWallFunction, nutUSpaldingWallFunction, nutkWallFunction and nutkAtmWallFunction. The user can get the full list of wall function models using foamInfo:

  
    foamToC -scalarBCs | grep nut

Within each wall function boundary condition the user can over-ride default settings for ![eqn](img/index535x.png), ![eqn](img/index536x.png) and ![eqn](img/index537x.png) through optional E, kappa and Cmu keyword entries.

Having selected the particular wall functions on various wall patches in the nut file, the user should select the following boundary conditions at wall patches for other turbulence fields.

-   epsilon field: apply the epsilonWallFunction to corresponding patches.
    
-   omega field: apply the omegaWallFunction to corresponding patches.
    
-   k, q or R field: apply kqRwallFunction to corresponding patches.
    

OpenFOAM v13 User Guide - 8.2 Turbulence models

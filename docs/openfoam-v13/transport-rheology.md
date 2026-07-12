---
source: https://doc.cfd.direct/openfoam/user-guide-v13/transport-rheology
title: OpenFOAM v13 User Guide - 8.3 Transport/rheology models
slug: transport-rheology
---
### How are transport models initialised in OpenFOAM?

CFD Direct's Essential CFD course demonstrates the initialisation of transport models

[Essential CFD](https://cfd.direct/openfoam-training/essential-cfd "Essential CFD")

\[**version 13**\]\[[version 12](../user-guide-v12)\]\[[version 11](../user-guide-v11)\]\[[version 10](../user-guide-v10)\]\[[version 9](../user-guide-v9)\]\[[version 8](../user-guide-v8)\]\[[version 7](../user-guide-v7)\]\[[version 6](../user-guide-v6)\]

\[[chapter contents](models)\]\[[previous topic](turbulence)\]\[[next topic](bookindex)\]\[[index](bookindex)\]

## 8.3 Transport/rheology models

The momentumTransport file includes any model for the viscous stress in a fluid. That includes turbulence models, described in the previous section [8.2](turbulence#x46-2530008.2) , but also non-Newtonian and visco-elastic models described in this section. These models are described as laminar, located in $FOAM\_SRC/MomentumTransportModels/momentumTransportModels/laminar, including:

-   a family of generalisedNewtonian models for a non-uniform viscosity which is a function of strain rate ![eqn](img/index538x.png), described in sections [8.3.1](#x47-2610008.3.1) , [8.3.2](#x47-2620008.3.2), [8.3.3](#x47-2630008.3.3) , [8.3.4](#x47-2640008.3.4) , [8.3.5](#x47-2650008.3.5) and [8.3.6](#x47-2660008.3.6) ;
    
-   a set of visco-elastic models, including Maxwell, Giesekus and PTT (Phan-Thien & Tanner), described in sections [8.3.7](#x47-2670008.3.7) , [8.3.8](#x47-2680008.3.8) and [8.3.9](#x47-2690008.3.9) , respectively;
    
-   the lambdaThixotropic model, described in section [8.3.10](#x47-2700008.3.10) .
    

When turbulence modelling is selected in the momentumTransport file, the generalisedNewtonian model is used by default to calculate the molecular viscosity. The choice of generalisedNewtonian model, specified by the viscosityModel keyword, is set to Newtonian by default, which simply uses the viscosity nu specified in the physicalProperties file. The following example exposes the default settings used with turbulence modelling.

  
    simulationType RAS  
  
    RAS  
    {  
        model           kEpsilon;  // RAS model  
        turbulence      on;  
        printCoeffs     on;  
  
        // "laminar" model generalisedNewtonian is used by default  
        viscosityModel  Newtonian; // default  
    }

While the viscosityModel entry is generally omitted when turbulence models are used, it can be included to set any of the non-Newtonian generalisedNewtonian models.

When turbulence modelling is not selected, by setting the laminar simulation type, the user can select any of the laminar models through the model keyword entry in the laminar sub-dictionary, including the visco-elastic models. The laminar models are listed by the following command.

  
    foamToC -table laminarincompressibleMomentumTransportModel

If the generalisedNewtonian model is selected, the user must then specify the viscosity model through the viscosityModel keyword as mentioned above. The viscosity models are listed by the following command.

  
    foamToC -table generalisedNewtonianViscosityModel

The example below shows how the the Bird-Carreau viscosity model is selected in a configuration without turbulence modelling.

  
    simulationType laminar  
  
    laminar  
    {  
        model           generalisedNewtonian;  
        viscosityModel  BirdCarreau;  
        // ... followed by the BirdCarreau parameters  
    }  

The laminar models still use the viscosity property ![eqn](img/index539x.png) (nu) specified in the physicalProperties file, e.g.

  
viscosityModel constant;  
  
nu             1.5e-05;

This viscosity is a single value which is constant in time and uniform over the solution domain. The non-Newtonian models adopt ![eqn](img/index540x.png) as the zero strain-rate viscosity ![eqn](img/index541x.png). The visco-elastic models incorporate a linear viscous stress using ![eqn](img/index542x.png), in addition to stress calculated by the respective models. The details of the models are provided in the following sections. 

### 8.3.1 Bird-Carreau model

The Bird-Carreau generalisedNewtonian model is

![ a(n−1)∕a ν = ν∞ + (ν0 − ν∞)\[1 + (k ˙γ) \] \\relax \\special {t4ht=](img/index543x.png)

(8.22)

where the coefficient ![eqn](img/index544x.png) has a default value of 2. An example specification of the model in momentumTransport is:

  
viscosityModel BirdCarreau;  
  
nuInf   1e-05;  
k       1;  
n       0.5;

The constant, uniform viscosity at zero strain-rate, ![eqn](img/index541x.png), is specified by nu in the physicalProperties file.

### 8.3.2 Cross Power Law model

The Cross Power Law generalisedNewtonian model is:

![ -ν0-−-ν∞-- ν = ν∞ + 1 + (m γ˙)n \\relax \\special {t4ht=](img/index546x.png)

(8.23)

An example specification of the model in momentumTransport is:

  
viscosityModel CrossPowerLaw;  
  
nuInf   1e-05;  
m       1;  
n       0.5;

The constant, uniform viscosity at zero strain-rate, ![eqn](img/index547x.png), is specified by nu in the physicalProperties file.

### 8.3.3 Power Law model

The Power Law generalisedNewtonian model provides a function for viscosity, limited by minimum and maximum values, ![eqn](img/index548x.png) and ![eqn](img/index549x.png) respectively. The function is:

![ n− 1 ν = k˙γ νmin ≤ ν ≤ νmax \\relax \\special {t4ht=](img/index550x.png)

(8.24)

An example specification of the model in momentumTransport is:

  
viscosityModel powerLaw;  
  
nuMax    1e-03;  
nuMin    1e-05;  
k        1e-05;  
n        0.5;

### 8.3.4 Herschel-Bulkley model

The Herschel-Bulkley generalisedNewtonian model combines the effects of Bingham plastic and power-law behaviour in a fluid. For low strain rates, the material is modelled as a very viscous fluid with viscosity ![eqn](img/index551x.png). Beyond a threshold in strain-rate corresponding to threshold stress ![eqn](img/index552x.png), the viscosity is described by a power law. The model is:

![ν = min (ν,τ ∕γ˙+ k˙γn− 1) 0 0 \\relax \\special {t4ht=](img/index553x.png)

(8.25)

An example specification of the model in momentumTransport is:

  
viscosityModel HerschelBulkley;  
  
tau0     0.01;  
k        0.001;  
n        0.5;

The constant, uniform viscosity at zero strain-rate, ![eqn](img/index554x.png), is specified in the physicalProperties file.

### 8.3.5 Casson model

The Casson generalisedNewtonian model is a basic model used in blood rheology that specifies minimum and maximum viscosities, ![eqn](img/index555x.png) and ![eqn](img/index556x.png) respectively. Beyond a threshold in strain-rate corresponding to threshold stress ![eqn](img/index557x.png), the viscosity is described by a “square-root” relationship. The model is:

![ (∘ ----- √--)2 ν = τ0∕˙γ + m νmin ≤ ν ≤ νmax \\relax \\special {t4ht=](img/index558x.png)

(8.26)

An example specification of model parameters for blood is:

  
viscosityModel Casson;  
  
m        3.934986e-6;  
tau0     2.9032e-6;  
nuMax    13.3333e-6;  
nuMin    3.9047e-6;

### 8.3.6 General strain-rate function

A strainRateFunction generalisedNewtonian model exists that allows a user to specify viscosity as a function of strain rate at run-time. It uses the same Function1 functionality to specify the function of strain-rate, used by time varying properties in boundary conditions described in section [6.4.4](derived-boundary-conditions#x37-2020006.4.4) . An example specification of the model in momentumTransport is shown below using the polynomial function:

  
viscosityModel  strainRateFunction;  
  
function polynomial ((0 0.1) (1 1.3));

### 8.3.7 Maxwell model

The Maxwell laminar visco-elastic model solves an equation for the fluid stress tensor ![eqn](img/index559x.png):

![∂τ ν 1 ---+ ∇ ∙(U τ) = 2 symm \[τ∙∇U \]− 2-M- symm (∇U ) − -τ ∂t λ λ \\relax \\special {t4ht=](img/index560x.png)

(8.27)

where ![eqn](img/index561x.png) (nuM) is the “Maxwell” viscosity and ![eqn](img/index562x.png) (lambda) is the relaxation time. An example specification of model parameters is shown below:

  
simulationType laminar;  
  
laminar  
{  
    model               Maxwell;  
  
    MaxwellCoeffs  
    {  
        nuM             0.002;  
        lambda          0.03;  
    }  
}

If an additional constant, uniform viscosity at zero strain-rate, ![eqn](img/index563x.png), is specified in the physicalProperties file, the model becomes equivalent to an Oldroyd-B visco-elastic model. The Maxwell model includes a multi-mode option where ![eqn](img/index564x.png) is a sum of stresses, each with an associated relaxation time ![eqn](img/index565x.png). 

### 8.3.8 Giesekus model

The Giesekus laminar visco-elastic model is similar to the Maxwell model but includes an additional “mobility” term in the equation for ![eqn](img/index564x.png):

![∂τ- ∙ ∙ νM- 1- αG- ∙ ∂t + ∇ (U τ) = 2 symm \[τ ∇U \]− 2 λ symm (∇U )− λ τ− νM \[τi τi\] \\relax \\special {t4ht=](img/index567x.png)

(8.28)

where ![eqn](img/index568x.png) (alphaG) is the mobility parameter. An example specification of model parameters is shown below:

  
simulationType laminar;  
  
laminar  
{  
    model               Giesekus;  
  
    GiesekusCoeffs  
    {  
        nuM             0.002;  
        lambda          0.03;  
        alphaG          0.1;  
    }  
}

The Giesekus model includes a multi-mode option where ![eqn](img/index569x.png) is a sum of stresses, each with an associated relaxation time ![eqn](img/index570x.png) and mobility coefficient ![eqn](img/index571x.png). 

### 8.3.9 Phan-Thien-Tanner (PTT) model

The Phan-Thien-Tanner (PTT) laminar visco-elastic model is also similar to the Maxwell model but includes an additional “extensibility” term in the equation for ![eqn](img/index569x.png), suitable for polymeric liquids:

![∂τ νM 1 ( 𝜀λ ) ---+ ∇ ∙(U τ) = 2 symm \[τ∙∇U \]− 2---symm (∇U )− -exp − ---tr(τ) τ ∂t λ λ νM \\relax \\special {t4ht=](img/index573x.png)

(8.29)

where ![eqn](img/index574x.png) (epsilon) is the extensibility parameter. An example specification of model parameters is shown below:

  
simulationType laminar;  
  
laminar  
{  
    model               PTT;  
  
    PTTCoeffs  
    {  
        nuM             0.002;  
        lambda          0.03;  
        epsilon         0.25;  
    }  
}

The PTT model includes a multi-mode option where ![eqn](img/index575x.png) is a sum of stresses, each with an associated relaxation time ![eqn](img/index576x.png) and extensibility coefficient ![eqn](img/index577x.png). 

### 8.3.10 Lambda thixotropic model

The Lambda Thixotropic laminar model calculates the evolution of a structural parameter ![eqn](img/index576x.png) (lambda) according to:

![∂λ-+ ∇ ∙(U λ) = a(1− λ)b − cγ˙dλ ∂t \\relax \\special {t4ht=](img/index579x.png)

(8.30)

with model coefficients ![eqn](img/index580x.png), ![eqn](img/index581x.png), ![eqn](img/index582x.png) and ![eqn](img/index583x.png). The viscosity ![eqn](img/index584x.png) is then calculated according to:

![ ---ν∞--- ν = 1 − K λ2 \\relax \\special {t4ht=](img/index585x.png)

(8.31)

where the parameter ![eqn](img/index586x.png). The viscosities ![eqn](img/index587x.png) and ![eqn](img/index588x.png) are limiting values corresponding to ![eqn](img/index589x.png) and ![eqn](img/index590x.png). 

An example specification of the model in momentumTransport is:

  
simulationType laminar;  
  
laminar  
{  
    model               lambdaThixotropic;  
  
    lambdaThixotropicCoeffs  
    {  
        a       1;  
        b       2;  
        c       1e-3;  
        d       3;  
        nu0     0.1;  
        nuInf   1e-4;  
    }  
}

OpenFOAM v13 User Guide - 8.3 Transport/rheology models

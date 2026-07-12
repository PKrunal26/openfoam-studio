---
source: https://doc.cfd.direct/openfoam/user-guide-v13/thermophysical
title: OpenFOAM v13 User Guide - 8.1 Thermophysical models
slug: thermophysical
---
### How are thermophysical models set up in OpenFOAM?

Our Productive CFD course explains configuration of thermophysical models

[Productive CFD](https://cfd.direct/openfoam-training/productive-cfd "Productive CFD")

\[**version 13**\]\[[version 12](../user-guide-v12)\]\[[version 11](../user-guide-v11)\]\[[version 10](../user-guide-v10)\]\[[version 9](../user-guide-v9)\]\[[version 8](../user-guide-v8)\]\[[version 7](../user-guide-v7)\]\[[version 6](../user-guide-v6)\]

\[[chapter contents](models)\]\[[previous topic](models)\]\[[next topic](turbulence)\]\[[index](bookindex)\]

## 8.1 Thermophysical models

Thermophysical models are concerned with: thermodynamics, e.g. relating internal energy ![eqn](img/index406x.png) to temperature ![eqn](img/index404x.png); transport, e.g. the dependence of properties such as ![eqn](img/index408x.png) on temperature; and state, e.g. dependence of density ![eqn](img/index409x.png) on ![eqn](img/index410x.png) and pressure ![eqn](img/index411x.png). Thermophysical models are specified in the physicalProperties dictionary.

A thermophysical model required an entry named thermoType which specifies the package of thermophysical modelling that is used in the simulation. OpenFOAM includes a large set of pre-compiled combinations of modelling, built within the code using C++ templates. It can also compile on-demand a combination which is not pre-compiled during a simulation.

Thermophysical modelling packages begin with the equation of state and then adding more layers of thermophysical modelling that derive properties from the previous layer(s). The keyword entries in thermoType reflects the multiple layers of modelling and the underlying framework in which they combined. Below is an example entry for thermoType:

  
thermoType  
{  
    type            hePsiThermo;  
    mixture         pureMixture;  
    transport       const;  
    thermo          hConst;  
    equationOfState perfectGas;  
    specie          specie;  
    energy          sensibleEnthalpy;  
}

The keyword entries specify the choice of thermophysical models, e.g. transport constant (constant viscosity, thermal diffusion), equationOfState perfectGas , etc. In addition there is a keyword entry named energy that allows the user to specify the form of energy to be used in the solution and thermodynamics. The following sections explains the entries and options in the thermoType package.

### 8.1.1 Thermophysical and mixture models

Each solver that uses thermophysical modelling constructs an object of a specific thermophysical model class. The model classes are listed below.

  
fluidThermo

Thermophysical model for a general fluid with fixed composition used by the isoThermalFluid and fluid solver modules.

  
rhoThermo

Thermophysical model for liquids and solids, used by the isothermalFilm and film solver module.

  
psiThermo

Thermophysical model for gases only, with fixed composition, used by the shockFluid solver module.

  
fluidMulticomponentThermo

Thermophysical model for fluid of varying composition used by the multicomponentFluid solver module.

  
psiuMulticomponentThermo

Thermophysical model for combustion that modelled by a laminar flame speed and regress variable used by the XiFluid solver module.

  
compressibleMultiphaseVoFMixtureThermo

Thermophysical models for multiple phases used by the compressibleMultiphaseVoF solver module.

  
solidThermo and solidDisplacementThermo

Thermophysical models for solids used by by the solid and solidDisplacement solver modules, respectively.

The type keyword (in the thermoType sub-dictionary) specifies the underlying thermophysical model used by the solver. The user can select from the following.

-   hePsiThermo: available for solvers that construct fluidThermo, psiThermo, fluidMulticomponentThermo and .
    
-   heRhoThermo: available for solvers that construct fluidThermo, rhoThermo, fluidMulticomponentThermo, compressibleMultiphaseVoFMixtureThermo.
    
-   heheuPsiThermo: for solvers that construct psiuMulticomponentThermo.
    
-   heSolidThermo: for solvers that construct solidThermo or solidDisplacementThermo.
    

The mixture specifies the mixture composition. The options available are listed below.

-   pureMixture: mixture with fixed composition, which reads properties from a a sub-dictionary called mixture.
    
-   multicomponentMixture: mixture with variable composition, with species, e.g. O2, N2, listed by the species keyword, and properties specified for each specie within sub-dictionaries named after each specie.
    
-   coefficientWilkeMulticomponentMixture: as multicomponentMixture, but applies Wilke’s equation to calculate transport properties for the mixture.
    
-   valueMulticomponentMixture: as multicomponentMixture, but applies mole-fraction weighting to calculate transport properties for the mixture.
    
-   homogeneousMixture, inhomogeneousMixture and veryInhomogeneousMixture: for combustion based on laminar flame speed and regress variables, constituents are a set of mixtures, such as fuel, oxidant and burntProducts.
    

### 8.1.2 Transport model

The transport modelling concerns evaluating dynamic viscosity ![eqn](img/index412x.png), thermal conductivity ![eqn](img/index413x.png) and thermal diffusivity ![eqn](img/index414x.png) (for internal energy and enthalpy equations). The current transport models are as follows:

  
const

assumes a constant ![eqn](img/index415x.png) and Prandtl number ![eqn](img/index416x.png) which is simply specified by a two keywords, mu and Pr, respectively.

  
sutherland

calculates ![eqn](img/index415x.png) as a function of temperature ![eqn](img/index418x.png) from a Sutherland coefficient ![eqn](img/index419x.png) and Sutherland temperature ![eqn](img/index420x.png), specified by keywords As and Ts; ![eqn](img/index421x.png) is calculated according to:

![ √ -- As T μ = 1+-T-∕T-. s \\relax \\special {t4ht=](img/index422x.png)

(8.1)

  
polynomial

calculates ![eqn](img/index421x.png) and ![eqn](img/index424x.png) as a function of temperature ![eqn](img/index425x.png) from a polynomial of any order ![eqn](img/index426x.png), e.g.:

![ N− 1 μ = ∑ a Ti. i=0 i \\relax \\special {t4ht=](img/index427x.png)

(8.2)

  
logPolynomial

calculates ![eqn](img/index428x.png) and ![eqn](img/index429x.png) as a function of ![eqn](img/index430x.png) from a polynomial of any order ![eqn](img/index426x.png); from which ![eqn](img/index432x.png), ![eqn](img/index433x.png) are calculated by taking the exponential, e.g.:

![ N −1 ln(μ) = ∑ a \[ln(T )\]i. i i=0 \\relax \\special {t4ht=](img/index434x.png)

(8.3)

  
Andrade

calculates ![eqn](img/index435x.png) and ![eqn](img/index436x.png) as a polynomial function of ![eqn](img/index437x.png), e.g. for ![eqn](img/index438x.png):

![ a ln(μ) = a0 + a1T + a2T 2 +--3---. a4 + T \\relax \\special {t4ht=](img/index439x.png)

(8.4)

  
tabulated

uses uniform tabulated data for viscosity and thermal conductivity as a function of pressure and temperature.

  
icoTabulated

uses non-uniform tabulated data for viscosity and thermal conductivity as a function of temperature.

  
WLF

(Williams-Landel-Ferry) calculates ![eqn](img/index438x.png) as a function of temperature from coefficients ![eqn](img/index441x.png) and ![eqn](img/index442x.png) and reference temperature ![eqn](img/index443x.png) specified by keywords C1, C2 and Tr; ![eqn](img/index444x.png) is calculated according to:

![ ( ) μ = μ0 exp −-C1(T-−-Tr) C2 + T − Tr \\relax \\special {t4ht=](img/index445x.png)

(8.5)

### 8.1.3 Thermodynamic models

The thermodynamic models are concerned with evaluating the specific heat ![eqn](img/index446x.png) from which other properties are derived. The current thermo models are as follows:

  
eConst

assumes a constant ![eqn](img/index447x.png) and a heat of fusion ![eqn](img/index448x.png) which is simply specified by a two values ![eqn](img/index449x.png), given by keywords Cv and Hf.

  
eIcoTabulated

calculates ![eqn](img/index450x.png) by interpolating non-uniform tabulated data of ![eqn](img/index451x.png) value pairs, e.g.:  
( (200 1005) (400 1020) );

  
ePolynomial

calculates ![eqn](img/index452x.png) as a function of temperature by a polynomial of any order ![eqn](img/index453x.png):

![ N −1 c = ∑ a Ti. v i i=0 \\relax \\special {t4ht=](img/index454x.png)

(8.6)

  
ePower

calculates ![eqn](img/index455x.png) as a power of temperature according to:

![ ( T )n0 cv = c0 T--- . ref \\relax \\special {t4ht=](img/index456x.png)

(8.7)

  
eTabulated

calculates ![eqn](img/index455x.png) by interpolating uniform tabulated data of ![eqn](img/index458x.png) value pairs, e.g.:  
( (200 1005) (400 1020) );

  
hConst

assumes a constant ![eqn](img/index459x.png) and a heat of fusion ![eqn](img/index460x.png) which is simply specified by a two values ![eqn](img/index461x.png), given by keywords Cp and Hf.

  
hIcoTabulated

calculates ![eqn](img/index462x.png) by interpolating non-uniform tabulated data of ![eqn](img/index463x.png) value pairs, e.g.:  
( (200 1005) (400 1020) );

  
hPolynomial

calculates ![eqn](img/index462x.png) as a function of temperature by a polynomial of any order ![eqn](img/index465x.png):

![ N∑ −1 i cp = aiT . i=0 \\relax \\special {t4ht=](img/index466x.png)

(8.8)

  
hPower

calculates ![eqn](img/index467x.png) as a power of temperature according to:

![ ( ) T---n0 cp = c0 Tref . \\relax \\special {t4ht=](img/index468x.png)

(8.9)

  
hTabulated

calculates ![eqn](img/index467x.png) by interpolating uniform tabulated data of ![eqn](img/index470x.png) value pairs, e.g.:  
( (200 1005) (400 1020) );

  
janaf

calculates ![eqn](img/index471x.png) as a function of temperature ![eqn](img/index472x.png) from a set of coefficients taken from JANAF tables of thermodynamics. The ordered list of coefficients is given in Table [8.1](#x45-2480241). The function is valid between a lower and upper limit in temperature ![eqn](img/index473x.png) and ![eqn](img/index474x.png) respectively. Two sets of coefficients are specified, the first set for temperatures above a common temperature ![eqn](img/index475x.png) (and below ![eqn](img/index474x.png)), the second for temperatures below ![eqn](img/index477x.png) (and above ![eqn](img/index478x.png)). The function relating ![eqn](img/index479x.png) to temperature is:

![cp = R ((((a4T + a3)T + a2)T + a1)T + a0). \\relax \\special {t4ht=](img/index480x.png)

(8.10)

In addition, there are constants of integration, ![eqn](img/index481x.png) and ![eqn](img/index482x.png), both at high and low temperature, used to evaluating ![eqn](img/index483x.png) and ![eqn](img/index484x.png) respectively.

* * *

  

Description

Entry

Keyword

* * *

* * *

* * *

Lower temperature limit

![eqn](img/index485x.png)

Tlow

Upper temperature limit

![eqn](img/index486x.png)

Thigh

Common temperature

![eqn](img/index487x.png)

Tcommon

High temperature coefficients

![eqn](img/index488x.png)

highCpCoeffs (a0 a1 a2 a3 a4...

High temperature enthalpy offset

![eqn](img/index489x.png)

a5...

High temperature entropy offset

![eqn](img/index490x.png)

a6)

Low temperature coefficients

![eqn](img/index491x.png)

lowCpCoeffs (a0 a1 a2 a3 a4...

Low temperature enthalpy offset

![eqn](img/index492x.png)

a5...

Low temperature entropy offset

![eqn](img/index493x.png)

a6)

* * *

* * *

* * *

  

Table 8.1: JANAF thermodynamics coefficients.

* * *

### 8.1.4 Composition of each constituent

There is currently only one option for the specie model which specifies the composition of each constituent. That model is itself named specie, which is specified by the following entries.

-   nMoles: number of moles of component. This entry is only used for combustion modelling based on regress variable with a homogeneous mixture of reactants; otherwise it is set to 1.
    
-   molWeight in grams per mole of specie.
    

### 8.1.5 Equation of state

The following equations of state are available in the thermophysical modelling library.

  
adiabaticPerfectFluid

Adiabatic perfect fluid:

![ ( )1∕γ ρ = ρ0 -p+-B-- , p0 + B \\relax \\special {t4ht=](img/index494x.png)

(8.11)

where ![eqn](img/index495x.png) are reference density and pressure respectively, and ![eqn](img/index496x.png) is a model constant.

  
Boussinesq

Boussinesq approximation

![ρ = ρ0\[1− β (T − T0)\] \\relax \\special {t4ht=](img/index497x.png)

(8.12)

where ![eqn](img/index498x.png) is the coeffient of volumetric expansion and ![eqn](img/index499x.png) is the reference density at reference temperature ![eqn](img/index500x.png).

  
icoPolynomial

Incompressible, polynomial equation of state:

![ N∑− 1 ρ = aiT i, i=0 \\relax \\special {t4ht=](img/index501x.png)

(8.13)

where ![eqn](img/index502x.png) are polynomial coefficients of any order ![eqn](img/index503x.png).

  
icoTabulated

Tabulated data for an incompressible fluid using ![eqn](img/index504x.png) value pairs, e.g.   
rho ( (200 1010) (400 980) );

  
incompressiblePerfectGas

Perfect gas for an incompressible fluid:

![ρ = -1-pref, RT \\relax \\special {t4ht=](img/index505x.png)

(8.14)

where ![eqn](img/index506x.png) is a reference pressure.

  
linear

Linear equation of state:

![ρ = ψp + ρ0, \\relax \\special {t4ht=](img/index507x.png)

(8.15)

where ![eqn](img/index508x.png) is compressibility (not necessarily ![eqn](img/index509x.png)).

  
PengRobinsonGas

Peng Robinson equation of state:

![ 1 ρ = -----p, zRT \\relax \\special {t4ht=](img/index510x.png)

(8.16)

where the complex function ![eqn](img/index511x.png) can be referenced in the source code in PengRobinsonGasI.H, in the $FOAM\_SRC/thermophysicalModels/specie/equationOfState/ directory.

  
perfectFluid

Perfect fluid:

![ρ = -1--p+ ρ , RT 0 \\relax \\special {t4ht=](img/index512x.png)

(8.17)

where ![eqn](img/index513x.png) is the density at ![eqn](img/index514x.png).

  
perfectGas

Perfect gas:

![ 1 ρ = RT-p. \\relax \\special {t4ht=](img/index515x.png)

(8.18)

  
rhoConst

Constant density:

![ρ = constant. \\relax \\special {t4ht=](img/index516x.png)

(8.19)

  
rhoTabulated

Uniform tabulated data for a compressible fluid, calculating ![eqn](img/index517x.png) as a function of ![eqn](img/index518x.png) and ![eqn](img/index519x.png).

  
rPolynomial

Reciprocal polynomial equation of state for liquids and solids:

![1- 2 ρ = C0 + C1T + C2T − C3p − C4pT \\relax \\special {t4ht=](img/index520x.png)

(8.20)

where ![eqn](img/index521x.png) are coefficients.

### 8.1.6 Selection of energy variable

The user must specify the form of energy to be used in the solution, either internal energy ![eqn](img/index522x.png) and enthalpy ![eqn](img/index523x.png), and in forms that include the heat of formation ![eqn](img/index524x.png) or not. This choice is specified through the energy keyword.

We refer to absolute energy where heat of formation is included, and sensible energy where it is not. For example absolute enthalpy ![eqn](img/index525x.png) is related to sensible enthalpy ![eqn](img/index526x.png) by

![ ∑ h = hs + ciΔhif i \\relax \\special {t4ht=](img/index527x.png)

(8.21)

where ![eqn](img/index528x.png) and ![eqn](img/index529x.png) are the molar fraction and heat of formation, respectively, of specie ![eqn](img/index530x.png). In most cases, we use the sensible form of energy, for which it is easier to account for energy change due to reactions. Keyword entries for energy therefore include e.g. sensibleEnthalpy, sensibleInternalEnergy and absoluteEnthalpy.

### 8.1.7 Thermophysical property data

The basic thermophysical properties are specified for each species from input data. Data entries must contain the name of the specie as the keyword, e.g. O2, H2O, mixture, followed by sub-dictionaries of coefficients, including:

  
specie

containing i.e. number of moles, nMoles, of the specie, and molecular weight, molWeight in units of g/mol;

  
thermodynamics

containing coefficients for the chosen thermodynamic model (see below);

  
transport

containing coefficients for the chosen tranpsort model (see below).

The following is an example entry for a specie named fuel modelled using sutherland transport and janaf thermodynamics:

  
fuel  
{  
    specie  
    {  
        nMoles       1;  
        molWeight    16.0428;  
    }  
    thermodynamics  
    {  
        Tlow         200;  
        Thigh        6000;  
        Tcommon      1000;  
        highCpCoeffs (1.63543 0.0100844 -3.36924e-06 5.34973e-10  
                      -3.15528e-14 -10005.6 9.9937);  
        lowCpCoeffs  (5.14988 -0.013671 4.91801e-05 -4.84744e-08  
                      1.66694e-11 -10246.6 -4.64132);  
    }  
    transport  
    {  
        As           1.67212e-06;  
        Ts           170.672;  
    }  
}

The following is an example entry for a specie named air modelled using const transport and hConst thermodynamics:

  
air  
{  
    specie  
    {  
        nMoles          1;  
        molWeight       28.96;  
    }  
    thermodynamics  
    {  
        Cp              1004.5;  
        Hf              2.544e+06;  
    }  
    transport  
    {  
        mu              1.8e-05;  
        Pr              0.7;  
    }  
}

OpenFOAM v13 User Guide - 8.1 Thermophysical models

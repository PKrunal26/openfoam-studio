---
source: https://doc.cfd.direct/openfoam/user-guide-v13/derived-boundary-conditions
title: OpenFOAM v13 User Guide - 6.4 Derived boundary conditions
slug: derived-boundary-conditions
---
### How is a boundary condition programmed in OpenFOAM?

CFD Direct's Programming CFD course shows how to code boundary conditions

[Programming CFD](https://cfd.direct/openfoam-training/programming-cfd "Programming CFD")

\[**version 13**\]\[[version 12](../user-guide-v12)\]\[[version 11](../user-guide-v11)\]\[[version 10](../user-guide-v10)\]\[[version 9](../user-guide-v9)\]\[[version 8](../user-guide-v8)\]\[[version 7](../user-guide-v7)\]\[[version 6](../user-guide-v6)\]

\[[chapter contents](boundary-conditions)\]\[[previous topic](basic-boundary-conditions)\]\[[next topic](postprocessing)\]\[[index](bookindex)\]

## 6.4 Derived boundary conditions

There are numerous more complex boundary conditions derived from the basic conditions. For example, many complex conditions are derived from fixedValue, where the value is calculated by a function of other patch fields, time, geometric information, etc. Some other conditions derived from mixed/directionMixed switch between fixedValue and fixedGradient (usually with a zero gradient).

The available boundary conditions can be listed with foamToC using the \-scalarBCs and \-vectorBCs options, corresponding to boundary conditions for scalar fields and vector fields, respectively. For example, for scalar fields, boundary conditions are listed by

  
    foamToC -scalarBCs

These produce long lists which the user can scan through. If the user wants more information of a particular condition, they can run the foamInfo script which provides a description of the boundary condition and lists example cases where it is used. For example, for the totalPressure boundary condition, run the following.

  
    foamInfo totalPressure

In the following sections we will highlight some particular important, commonly used boundary conditions.

### 6.4.1 The inlet/outlet condition

The inletOutlet condition is one derived from mixed, which switches between zeroGradient when the fluid flows out of the domain at a patch face, and fixedValue, when the fluid is flowing into the domain. For inflow, the inlet value is specified by an inletValue entry. A good example of its use can be seen in the damBreakLaminar tutorial, where it is applied to the phase fraction on the upper atmosphere boundary. Where there is outflow, the condition is well posed, where there is inflow, the phase fraction is fixed with a value of 0, corresponding to 100% air.

16

17dimensions  \[\];

18

19internalField  uniform 0;

20

21boundaryField

22{

23  #includeEtc "caseDicts/setConstraintTypes"

24

25  wall

26  {

27  type  zeroGradient;

28  }

29

30  atmosphere

31  {

32  type  inletOutlet;

33  inletValue  $internalField;

34  value  $internalField;

35  }

36}

37

38

39// \*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\* //
   

### 6.4.2 Entrainment boundary conditions

The combination of the totalPressure condition on pressure and pressureInletOutletVelocity on velocity is extremely common for patches where some inflow occurs and the inlet flow velocity is not known. The conditions are used on the atmosphere boundary in the damBreak tutorial, inlet conditions where only pressure is known, outlets where flow reversal may occur, and where flow in entrained, e.g. on boundaries surrounding a jet through a nozzle.

The idea behind this combination is that the condition is a standard combination in the case of outflow, but for inflow the normal velocity is allowed to find its own value. Under these circumstances, a rapid rise in velocity presents a risk of instability, but the rise is moderated by the reduction of inlet pressure, and hence driving pressure gradient, as the inflow velocity increases.

The totalPressure condition specifies:

![ { p = p0 for outflow p0 − 12ρ|U2 | for inflow (dynamic pressure, subsonic) \\relax \\special {t4ht=](img/index372x.png)

(6.2)

where the user specifies ![eqn](img/index373x.png) through the p0 keyword.

The entrainmentPressure condition also exists which is arguably more robust than totalPressure by using the normal component of velocity ![eqn](img/index374x.png) in the calculation for inflow, i.e.

![ { p0 for outflow p = p − 1ρ|U2 | for inflow (dynamic pressure, subsonic) 0 2 n \\relax \\special {t4ht=](img/index375x.png)

(6.3)

Solver applications which include buoyancy effects, though a gravitational force ![eqn](img/index376x.png) (per unit volume) source term, tend to solve for a pressure field ![eqn](img/index377x.png), where the hydrostatic component is subtracted based on a height ![eqn](img/index378x.png) above some reference. For such solvers, e.g. interFoam, an equivalent prghTotalPressure condition is applied which specifies:

![ { p0 for outflow pρgh = 1 2 p0 − ρ|g|Δh − 2ρ|U | for inflow (dynamic pressure, subsonic) \\relax \\special {t4ht=](img/index379x.png)

(6.4)

The pressureInletOutletVelocity condition specifies zeroGradient at all times, except on the tangential component which is set to fixedValue for inflow, with the tangentialVelocity defaulting to 0.

The specification of these boundary conditions in the U and p\_rgh files, in the damBreak case, are shown below.

16

17dimensions  \[0 1 -1 0 0 0 0\];

18

19internalField  uniform (0 0 0);

20

21boundaryField

22{

23  #includeEtc "caseDicts/setConstraintTypes"

24

25  wall

26  {

27  type  noSlip;

28  }

29

30  atmosphere

31  {

32  type  pressureInletOutletVelocity;

33  value  $internalField;

34  }

35}

36

37

38// \*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\* //
   

16

17dimensions  \[1 -1 -2 0 0 0 0\];

18

19internalField  uniform 0;

20

21boundaryField

22{

23  #includeEtc "caseDicts/setConstraintTypes"

24

25  wall

26  {

27  type  fixedFluxPressure;

28  value  $internalField;

29  }

30

31  atmosphere

32  {

33  type  prghTotalPressure;

34  p0  $internalField;

35  }

36}

37

38

39// \*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\* //
   

### 6.4.3 Fixed flux pressure

In the above example, it can be seen that all the wall boundaries use a boundary condition named fixedFluxPressure. This boundary condition is used for pressure in situations where zeroGradient is generally used, but where body forces such as gravity and surface tension are present in the solution equations. The condition adjusts the gradient accordingly.

### 6.4.4 Time-varying boundary conditions

There are several boundary conditions for which some input parameters are specified by a function of time (using Function1 functionality) class. The available functions from the Function1 can be listed by the following command.

  
    find $FOAM\_SRC/finiteVolume/fields/fvPatchFields -type f -name "\*.H" |\\  
        xargs grep -l Function1 | xargs dirname | sort

They include conditions such as uniformFixedValue, which is a fixedValue condition which applies a single value which is a function of time through a uniformValue keyword entry.

The Function1 is specified by a keyword following the uniformValue entry, followed by parameters that relate to the particular function. The Function1 options can be listed by foamToC by

  
    foamToC -table scalarFunction1

The most relevant functions are those in the core OpenFOAM library which can be filtered using grep

  
    foamToC -table scalarFunction1 | grep OpenFOAM

Most of those function objects are described below.

-   constant: constant value.
    
-   table: inline list of (time value) pairs; interpolates values linearly between times.
    
-   tableFile: as above, but with data supplied in a separate file.
    
-   square: square-wave function.
    
-   squarePulse: single square pulse.
    
-   sine: sine function.
    
-   one and zero: constant one and zero values.
    
-   polynomial: polynomial function using a list (coeff exponent) pairs.
    
-   coded: function specified by user coding.
    
-   scale: scales a given value function by a scalar scale function; both entries can be themselves Function1; scale function is often a ramp function (below), with value controlling the ramp value.
    
-   linearRamp, quadraticRamp, exponentialSqrRamp, halfCosineRamp, quarterCosineRamp and quarterSineRamp: monotonic ramp functions which ramp from 0 to 1 over specified duration.
    
-   reverseRamp: reverses the values of a ramp function, e.g. from 1 to 0.
    
-   add: adds two Function1s together.
    
-   normalise: scales a given Function1 so that the integral over time equals 1 (the integral value can be changed with the scale Function1).
    
-   repeat: repeats a given ’value’ function with a given period or frequency, and with an optional shift along the time axis.
    

There are some other function objects, more commonly to describe properties as a function of something, e.g. temperature.

-   uniformTable: Tabulated property function that linearly interpolates between given values.
    
-   nonUniformTable: Non-uniform tabulated property function that linearly interpolates between the values.
    

Examples or a time-varying inlet for a scalar are shown below.

inlet

{

  type  uniformFixedValue;

  uniformValue constant 2;

}

inlet

{

  type  uniformFixedValue;

  uniformValue table ((0 0) (10 2));

}

inlet

{

  type  uniformFixedValue;

  uniformValue polynomial ((1 0) (2 2)); // = 1\*t^0 + 2\*t^2

}

inlet

{

  type  uniformFixedValue;

  uniformValue

  {

  type  tableFile;

  format  csv;

  nHeaderLine  4;  // number of header lines

  refColumn  0;  // time column index

  componentColumns (1);  // data column index

  separator  ",";  // optional (defaults to ",")

  mergeSeparators  no;  // merge multiple separators

  file  "dataTable.csv";

  }

}

inlet

{

  type  uniformFixedValue;

  uniformValue

  {

  type  square;

  frequency  10;

  amplitude  1;

  scale  2;  // Scale factor for wave

  level  1;  // Offset

  }

}

inlet

{

  type  uniformFixedValue;

  uniformValue

  {

  type  sine;

  frequency  10;

  amplitude  1;

  scale  2;  // Scale factor for wave

  level  1;  // Offset

  }

}

input  // ramp from 0 -> 2, from t = 0 -> 0.4

{

  type  uniformFixedValue;

  uniformValue

  {

  type  scale;

  scale  linearRamp;

  start  0;

  duration  0.4;

  value  2;

  }

}

input  // ramp from 2 -> 0, from t = 0 -> 0.4

{

  type  uniformFixedValue;

  uniformValue

  {

  type  scale;

  scale  reverseRamp;

       ramp  linearRamp;

  start  0;

  duration  0.4;

  value  2;

  }

}

inlet  // pulse with value 2, from t = 0 -> 0.4

{

  type  uniformFixedValue;

  uniformValue

  {

  type  scale;

       scale  squarePulse

  start  0;

  duration  0.4;

  value  2;

  }

}

inlet

{

  type  uniformFixedValue;

  uniformValue  coded;

  name  pulse;

  codeInclude

  #{

  #include "mathematicalConstants.H"

  #};

  code

  #{

  return scalar

  (

  0.5\*(1 - cos(constant::mathematical::twoPi\*min(x/0.3, 1)))

  );

  #};

}
   

OpenFOAM v13 User Guide - 6.4 Derived boundary conditions

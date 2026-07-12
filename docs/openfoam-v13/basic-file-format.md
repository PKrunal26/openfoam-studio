---
source: https://doc.cfd.direct/openfoam/user-guide-v13/basic-file-format
title: OpenFOAM v13 User Guide - 4.2 Basic input/output file format
slug: basic-file-format
---
### What are the syntax rules for OpenFOAM files?

OpenFOAM configuration files are discussed in depth in our OpenFOAM Training

[See Training](https://cfd.direct/openfoam-training "See Training")

\[**version 13**\]\[[version 12](../user-guide-v12)\]\[[version 11](../user-guide-v11)\]\[[version 10](../user-guide-v10)\]\[[version 9](../user-guide-v9)\]\[[version 8](../user-guide-v8)\]\[[version 7](../user-guide-v7)\]\[[version 6](../user-guide-v6)\]

\[[chapter contents](cases)\]\[[previous topic](case-file-structure)\]\[[next topic](global-settings)\]\[[index](bookindex)\]

## 4.2 Basic input/output file format

OpenFOAM needs to read a range of data structures such as strings, words, scalars, vectors, tensors, lists and fields. The input/output (I/O) format of files is extremely flexible, following a consistent set of rules that make the files easy to interpret. The OpenFOAM file format is described in the following sections.

### 4.2.1 General syntax rules

The format resembles C++ code, following the general principles below.

-   Files have free form, with no particular meaning assigned to any column and no need to indicate continuation across lines.
    
-   Lines have no particular meaning except to a // comment delimiter which makes OpenFOAM ignore any text that follows it until the end of line.
    
-   A comment over multiple lines is done by enclosing the text between /\* and \*/ delimiters.
    

### 4.2.2 Dictionaries

OpenFOAM mainly uses dictionaries to specify data, in which data entries are retrieved by means of keywords. Each keyword entry follows the general format, beginning with the keyword and ending in semi-colon (;).

  
    <keyword\>  <dataEntry1\> … <dataEntryN\>;

Many entries include only a single data entry as shown below.

  
    <keyword\>  <dataEntry\>;

Most data files, e.g. controlDict, are themselves dictionaries since they contain a series of keyword entries. Any dictionary can contain one or more sub-dictionaries, usually denoted by a dictionary name and its keyword entries contained within curly braces {} as follows.

  
    <dictionaryName\>  
    {  
        … keyword entries …  
    }

(Sub-)dictionaries can be nested within others, as shown in the following example. The extract, from an fvSolution dictionary file, containing two dictionaries, solvers and PIMPLE. The solvers dictionary contains nested sub-dictionary for different matrix equations based on different solution variables, e.g. p, U and k (with some entries using regular expressions described in section [4.2.13](#x18-1060004.2.13) ).

16

17solvers

18{

19  p

20  {

21  solver  GAMG;

22  tolerance  1e-7;

23  relTol  0.01;

24

25  smoother  DICGaussSeidel;

26

27  }

28

29  pFinal

30  {

31  $p;

32  relTol  0;

33  }

34

35  "(U|k|epsilon)"

36  {

37  solver  smoothSolver;

38  smoother  symGaussSeidel;

39  tolerance  1e-05;

40  relTol  0.1;

41  }

42

43  "(U|k|epsilon)Final"

44  {

45  $U;

46  relTol  0;

47  }

48}

49

50PIMPLE

51{

52  nNonOrthogonalCorrectors 0;

53  nCorrectors  2;

54}

55

56

57// \*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\* //
   

### 4.2.3 The data file header

All data files that are read and written by OpenFOAM begin with a dictionary named FoamFile containing a standard set of keyword entries, listed below:

-   version: I/O format version, optional, defaults to 2.0
    
-   format: data format, ascii or binary
    
-   class: class relating to the data, either dictionary or a field, e.g. volVectorField
    
-   object: filename, e.g. controlDict (mandatory, but not used)
    
-   location: path to the file (optional)
    

A example header for a controlDict file is shown below.

  
    FoamFile  
    {  
        format      ascii;  
        class       dictionary;  
        location    "system";  
        object      controlDict;  
    }

### 4.2.4 Lists

OpenFOAM applications contain lists, e.g. a list of vertex coordinates for a mesh description. Lists are commonly found in I/O and have a format of their own in which the entries are contained within round braces ( ). When a user specifies a list in an input file, e.g. the vertices list in a blockMeshDict file, it just includes the vertices keyword and the data in ( ), e.g.

  
    vertices  
    (  
        … entries …  
    );

When OpenFOAM writes out a list, it invariably prefixes it with the number of elements in the list. For example the points file for the mesh in the pizDailySteady case contains the following (abbreviated) list, where 25012 denotes the number of vertex points in the mesh.

  
    25012  
    (  
        (-0.0206 0 -0.0005)  
        (-0.01901716308 0 -0.0005)  
        … entries …  
    );

In some cases, when OpenFOAM writes out a list, it further prefixes it with the class name of the list. For example, the inGroups entry in a boundary file of a mesh contains a list where each group name is a word. The entry for the lowerWall patch from the pizDailySteady case is shown below, indicating the List¡word¿ class with a single (1) element.

  
    lowerWall  
    {  
        type            wall;  
        inGroups        List<word> 1(wall); // Note!  
        nFaces          250;  
        startFace       24480;  
    }

### 4.2.5 Scalars, vectors and tensors

A scalar is a single number represented as such in a data file. A vector contains three values, expressed using the simple List format so that the vector ![eqn](img/index243x.png) is written:

  
    (1.0 1.1 1.2)

In OpenFOAM, a tensor contains nine elements, such that the identity tensor can be written:

  
    ( 1 0 0 0 1 0 0 0 1 )

The user can write the entry over multiple lines to give the “look” of a tensor as a 3 ![eqn](img/index244x.png) 3 entity.

  
    (  
        1 0 0  
        0 1 0  
        0 0 1  
    )

### 4.2.6 Dimensional units

In continuum mechanics, properties are represented in some chosen units, e.g. mass in kilograms (![eqn](img/index245x.png)), volume in cubic metres (![eqn](img/index246x.png)), pressure in Pascals (![eqn](img/index247x.png)). Algebraic operations must be performed on these properties using consistent units of measurement; in particular, addition, subtraction and equality are only physically meaningful for properties of the same dimensional units. As a safeguard against implementing a meaningless operation, OpenFOAM attaches dimensions to field data and physical properties and performs dimension checking on any operation.

Dimensions are described by the dimensionSet class which has its own unique I/O syntax using square brackets, e.g.

  
    \[0 2 -1 0 0 0 0\]

where each of the values corresponds to the power of each of the base units of measurement listed in sequence below:

1.  mass, e.g. kilogram (kg), pound-mass (lbm);
    
2.  length, e.g. metre (m), foot (ft);
    
3.  time, e.g. second (s);
    
4.  temperature, e.g. Kelvin (K), degree Rankine (![eqn](img/index248x.png)R);
    
5.  quantity, e.g. mole (mol);
    
6.  current, e.g. ampere (A);
    
7.  luminous intensity, e.g. candela (cd).
    

The list presents the base dimensional units used in the Système International (SI) and the United States Customary System (USCS) . OpenFOAM v12 also allows the dimensional units to be specified by name, starting with the base units, named mass, length, time, temperature, moles, current, and luminousIntensity. Dimensional units can be expressed using these names, rather than the array of indices, e.g. dimensions of length can be written

  
    \[length\]

instead of \[0 1 0 0 0 0 0\]. The example, \[0 2 -1 0 0 0 0\], can be written as

  
    \[sqr(length)/time\]

where sqr(length) denotes units of length\*length. There are also names for “composite” dimensional units that are commonly used. For example, area represents sqr(length), so the previous example could be written

  
    \[area/time\]

In fact, these dimensions are those of kinematic viscosity, for which a named dimension is predefined by

  
    \[kinematicViscosity\]

Dimensions do not themselves suggest any particular system of units, e.g. SI or USCS. OpenFOAM can effectively operate in any unit system, the only requirement being that the input data is correct for the chosen set of units. Input data may include physical constants, e.g. the Universal Gas Constant ![eqn](img/index249x.png), whose values must be correct for that specific unit system.

OpenFOAM defines the constants in the DimensionedConstant sub-dictionary of main controlDict file of the OpenFOAM installation ($WM\_PROJECT\_DIR/etc/controlDict). By default the constants are set in SI units. Those wishing to use the USCS or any other system of units should modify these constants to their chosen set of units accordingly, as described in section [4.3](global-settings#x19-1110004.3) .

### 4.2.7 Units and unit conversion

OpenFOAM v12 also allows users to accompany single-valued input data with units. When the data is read with its units, it is converted into the base unit system using an appropriate factor. Units are defined in the UnitConversions sub-dictionary of main controlDict file, including a long list of units and conversions to the SI system.

The defined SI units begin with base units, kg, m, s, K, kmol, A and Cd, with a conversion factor of 1, corresponding to the 7 base dimensional units. There are numerous derived units, e.g. \[min\] for minute which has a base unit of s and a conversion factor of 60. Another example with a slightly more complex definition is \[cal\] for calorie, with a conversion to \[J\], with a factor of 4.184. The unit \[J\] denotes joule, which itself is \[N m\], where newton \[N\] is \[kg m s^-2\].

Units are added to single-valued parameters after the data value, as shown below in a snippet of an input file with a volumetric flow rate specified in litres per second.

  
    inlet  
    {  
        type               flowRateInletVelocity;  
        volumetricFlowRate 0.1 \[l/s\];  
        ...

OpenFOAM includes the foamUnit script, described in section [4.2.7](#x18-1000004.2.7) , which lists available named units and dimensions and provided details about them.

### 4.2.8 Dimensioned types

Physical properties are typically specified with their associated dimensions. They are often described by the dimensioned class which includes three components: a word name; a dimensionSet and a value (scalar, vector, etc.).

The I/O for a dimensioned entry can include all three components, using indexed or named dimensions e.g.

  
    rho   rho \[1 -3 0 0 0 0 0\]      1000;  
    nu    nu  \[kinematicViscosity\]  1e-5;

Note that the first nu is the keyword; the second nu is the word name stored in class word; the next entry is the dimensionSet and the final entry is the scalar value.

Usually, the word and dimensionSet are specified in the code with default values, so can be omitted from the I/O as shown below.

  
    rho   1000;  
    nu    1e-5;

As described in the previous section, a value can be followed by a unit from which the value is converted to base units. In the example for kinematic viscosity nu, the value could be specified in centistokes by

  
    nu    10 \[cSt\];

### 4.2.9 Fields

Field files, e.g. U and p, that are read from and written into the time directories, possess their own customised I/O with the following three key entries.

-   dimensions: the dimensions of the field, e.g. \[1 -1 -2 0 0 0 0\] or \[pressure\].
    
-   internalField: values within the internal field, e.g. within each cell of a mesh.
    
-   boundaryField: condition (type) and data for each patch of the mesh boundary.
    

The internalField can be specified in two ways. First, when the user edits a field file to initialise it, they generally specify a single value across all elements, i.e. the cells (or faces, points, depending on the type of field) of the mesh. A single value of 0 is denoted by the uniform keyword as shown below.

  
    internalField uniform 0;

A uniform field can also be initialised using a set of units, e.g. for a pressure of 1 bar:

  
    internalField uniform 1 \[bar\];

When results are written out, fields cannot generally be represented by a single value. The output uses the nonuniform keyword, followed by a suitable list of values. The abbreviated example below is from an output p file for a mesh of 12225 cells.

  
    internalField  nonuniform  List<scalar>  
    12225  
    (  
    -4.92806  
    -5.42676  
    ...  
    );

The boundaryField is a dictionary containing a set of entries corresponding to each patch listed in the boundary file in the polyMesh directory. Each entry is a sub-dictionary containing a list of keyword entries. The mandatory entry, type, describes the patch field condition specified for the field. The remaining entries correspond to the type of patch field condition selected and can typically include field data specifying initial conditions on patch faces. A selection of patch field conditions available in OpenFOAM are listed in section [6.2](geometric-constraints#x35-1960006.2) , section [6.3](basic-boundary-conditions#x36-1970006.3) and section [6.4](derived-boundary-conditions#x37-1980006.4) , with a description and the data that must be specified with it. Example field dictionary entries for velocity U are shown below:

16dimensions  \[0 1 -1 0 0 0 0\];

17

18internalField  uniform (0 0 0);

19

20boundaryField

21{

22  inlet

23  {

24  type  fixedValue;

25  value  uniform (10 0 0);

26  }

27

28  outlet

29  {

30  type  zeroGradient;

31  }

32

33  upperWall

34  {

35  type  noSlip;

36  }

37

38  lowerWall

39  {

40  type  noSlip;

41  }

42

43  frontAndBack

44  {

45  type  empty;

46  }

47}

48

49// \*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\* //
   

### 4.2.10 Macro expansion

The configuration of case files can benefit from a macro syntax which uses the dollar ($) symbol in front of a keyword to expand the data associated with the keyword. For example the value set for keyword a below, 10, is expanded in the following line, so that the value of b is also 10.

  
    a 10;  
    b $a;

Variables can be accessed within different levels of sub-dictionaries, or scope. Scoping is performed using a ‘/’ (slash) syntax, illustrated by the following example, where b is set to the value of a, specified in a sub-dictionary called subdict.

  
    subdictA  
    {  
        a 20;  
    }  
    b $subdictA/a;

There are further syntax rules for macro expansions:

-   to traverse up one level of sub-dictionary, use the ‘..’ (double-dot) prefix, see below;
    
-   to traverse up two levels use ‘../..’ prefix, etc.;
    
-   to traverse to the top level dictionary use the ‘!’ (exclamation mark) prefix (most useful), see below;
    
-   to traverse into a separate file named otherFile, use ‘otherFile!’, see below;
    
-   for multiple levels of macro substitution, each specified with the ‘$’ dollar syntax, ‘{}’ brackets are required to protect the expansion, see below.
    

When accessing parameters from another file, the $FOAM\_CASE environment variable is useful to specify the path to the file as described in section [4.2.12](#x18-1050004.2.12) and illustrated below.

  
    a 10;  
    b a;  
    c ${$b}; // returns 10, since $b returns "a", and $a returns 10  
  
    subdictA  
    {  
        a 20;  
    }  
  
    subdictB  
    {  
        // double-dot takes scope up 1 level, then into "subdictA" => 20  
        b $../subdictA/a;  
  
        subsubdict  
        {  
            // exclamation mark takes scope to top level => 10  
            b $!a;  
  
            // "a" from another file named "otherFile"  
            c $otherFile!a;  
  
            // "a" from another file "otherFile" in the case directory  
            d ${${FOAM\_CASE}/otherFile!a};  
        }  
    }

### 4.2.11 Including files

Directives are commands that begin with the hash (#) symbol which provide further flexibility when configuring case files. There is a set of directive commands for reading a data file from within another data file. If a case requires a single value of pressure of 100 kPa, used in different input files, we could create a file, e.g. named initialConditions, which contains the following entry:

  
    pressure 1e+05;

In order to use this pressure for internal and initial boundary fields, the user could simply include the initialConditions file using the #include directive, then use a macro expansion on the pressure keyword, as follows.

  
    #include "initialConditions"  
    internalField uniform $pressure;  
    boundaryField  
    {  
        patch1  
        {  
            type fixedValue;  
            value $internalField;  
        }  
    }

This example works if the included file is in the same directory as the file that includes it. Otherwise, more generally the path to the file is required, e.g. if initialConditions is in the constant directory:

  
    #include "$FOAM\_CASE/constant/initialConditions"

Here $FOAM\_CASE represents is the path of the case directory as described in the following section. The following special forms of the #include directive also exist.

-   #includeIfPresent: reads a file if it exists.
    
-   #includeEtc: reads a file with the $FOAM\_ETC directory as the starting path.
    
-   #includeFunc: reads file containing a single functionObject configuration, first searching the case system directory, followed by the $FOAM\_ETC directory.
    
-   #includeModel: reads a file containing a single fvModel configuration, first searching the case constant directory, followed by the $FOAM\_ETC directory.
    
-   #includeConstraint: reads a file containing a single fvConstraint configuration, first searching the case system directory, followed by the $FOAM\_ETC directory.
    

Keyword entries can also be removed with the directive:

  
    #remove <keywordEntry\>

where <keywordEntry\> can be either a single keyword or a regular expression.

### 4.2.12 Environment variables

Environment variables can be used in input files. For example, the $FOAM\_RUN environment variable can be used to identify the run directory, as described in the introduction to Chapter [2](tutorials#x4-30002). This could be used to include a file, e.g. by

  
    #include "$FOAM\_RUN/pitzDailySteady/0/U"

In addition to environment variables like $FOAM\_RUN, set within the operating system, a number of “internal” environment variables are recognised, including the following.

-   $FOAM\_CASE: the path and directory of the running case.
    
-   $FOAM\_CASENAME: the directory name of the running case.
    
-   $FOAM\_APPLICATION: the name of the running application.
    

### 4.2.13 Regular expressions

As discussed, data is looked up from files using keywords. If a particular keyword does not exist, the I/O system will try to match the keyword with any [POSIX regular expression](https://wikipedia.org/wiki/Regular_expression#Standards), specified inside double-quotations ("…") in the input file.

In some cases, when the I/O system searches for a keyword in a case file, a can be used to match the keyword

When running an application, data is initialised by looking up keywords from dictionaries. The user can either provide an entry with a keyword that directly matches the one being looked up, or can provide a that matches the keyword, specified inside double-quotations ("…").

Regular expressions have an extensive syntax for various matches of text patterns but in OpenFOAM input files there are only two expressions that are generally used. Firstly, ‘.’ denoting “any character”, and ‘\*’ denoting “repeated any number of times, including 0 times” is often used in combination to match “any characters”. For example, to specify a noSlip boundary condition for any patch whose name ends Wall…, the user could specify in the boundaryField for U:

  
    ".\*Wall"  
    {  
        type   noSlip;  
    }

The other common regular expression uses () to group expressions. For example, to a noSlip boundary condition on two wall patches named upper and lower, the user could specify:

  
    "(upper|lower)"  
    {  
        type   noSlip;  
    }

### 4.2.14 Keyword ordering

The order in which keywords are listed does not matter, except when the same keyword is specified multiple times. Where the same keyword is duplicated, the last instance is used. The most common example of a duplicate keyword occurs when a keyword is included from the file or expanded from a macro, and then overridden. The example below demonstrates this, where pFinal adopts all the keyword entries, including relTol 0.05 in the p sub-dictionary by the macro expansion $p, then overrides the relTol entry.

  
    p  
    {  
        solver          PCG;  
        preconditioner  DIC;  
        tolerance       1e-6;  
        relTol          0.05;  
    }  
    pFinal  
    {  
        $p;  
        relTol          0;  
    }

Where a data lookup matches both a keyword and a regular expression, the keyword match takes precedence irrespective of the order of the entries.

### 4.2.15 Inline calculations

There are two further directives that enable calculations from within input files: #calc, described here, for simple calculations; and #codeStream, for more complex calculations, described in section [4.2.15](#x18-1080004.2.15) .

The pipeCyclic tutorial in $FOAM\_TUTORIALS/incompressibleFluid demonstrates the #calc directive through its blockMesh configuration in blockMeshDict:

  
    //- Half angle of wedge in degrees  
    halfAngle 45.0;  
  
    //- Radius of pipe \[m\]  
    radius 0.5;  
  
    radHalfAngle    #calc "degToRad($halfAngle)";  
    y               #calc "$radius\*sin($radHalfAngle)";  
    z               #calc "$radius\*cos($radHalfAngle)";

The file contains several calculations that calculate vertex ordinates, e.g. y, z, etc., from geometry dimensions, e.g. radius.

Calculations include standard C++ functions including unit conversions, e.g. degToRad, and trigonometric functions, e.g. sin. They can also include OpenFOAM mathematical functions if the relevant header files are included for those functions. The #calcInclude directive enables header files to be included for use with #calc.

The aerofoilNACA0012Steady example, using the fluid solver module, sets the inlet velocity using an angle of attack using the code below. The transform function is provided by the transform.H header file, to rotate unit vectors by the angle of attack to set the lift and drag directions.

  
    angleOfAttack   5; // degs  
  
    angle           #calc "-degToRad($angleOfAttack)";  
  
    #calcInclude    "transform.H"  
    liftDir         #calc "transform(Ry($angle), vector(0, 0, 1))";  
    dragDir         #calc "transform(Ry($angle), vector(1, 0, 0))";  
  
    Uinlet          #calc "$speed\*$<vector>dragDir";

The final line in the example above shows that dictionary entries constructed with #calc or #codeStream (see below) can use variables that represent OpenFOAM classes, or types, such as vector, tensor, List, Field, string etc.. To create a typed variable, the type is specified inside angled brackets <>, immediately after the $ symbol, e.g. $<vector>var or $<vector>{var} substitutes a variable named var as a vector. A simpler example shows a calculation ![eqn](img/index250x.png) using #calc.

  
    a       (1 2 3);  
    b       (1 1 0);  
    c       #calc "$<vector>a & $<vector>b";

Care is required with calculations involving a division because the / character is otherwise used to identify keywords in sub-dictionaries, "$a/b" looks for a keyword b within a sub-dictionary named a. Where a division is required, the user can put spaces around the /, e.g.

  
    c     #calc "$a / $b";

or they can apply brackets around the first variable, e.g.

  
    c     #calc "$(a)/$b";

The code string can also be delimited by #{…#} instead of quotation marks "…". The former delimiter supports code strings across multiple lines and avoids problems with string typed variables that may contain quotation marks, as shown in the following example.

  
    s "field";  
    fieldName #calc  
    #{  
        $<string>s + "Name"  
    #};

Further examples can be found in files in the test/dictionary directory in the OpenFOAM installation.

### 4.2.16 Inline code

The #codeStream directive takes C++ code which is compiled and executed to deliver the dictionary entry. The code and compilation instructions are specified through the following keywords.

-   code: specifies the code using arguments OStream& os and const dictionary& dict which can be used in the code, e.g. to lookup keyword entries from within the current case file.
    
-   codeInclude (optional): specifies additional C++ #include statements to include code files.
    
-   codeOptions (optional): specifies any extra compilation flags to be added to EXE\_INC in Make/options.
    
-   codeLibs (optional): specifies any extra compilation flags to be added to LIB\_LIBS in Make/options.
    

Code, like any string, can be written across multiple lines by enclosing it within hash-bracket delimiters, i.e. #{…#}. Anything in between these two delimiters becomes a string with all newlines, quotes, etc. preserved.

An example of #codeStream is given below, where the code in the calculates moment of inertia of a box shaped geometry.

momentOfInertia #codeStream

{

  codeInclude

  #{

  #include "diagTensor.H"

  #};

  code

  #{

  scalar sqrLx = sqr($Lx);

  scalar sqrLy = sqr($Ly);

  scalar sqrLz = sqr($Lz);

  os  <<

  $mass

  \*diagTensor(sqrLy + sqrLz, sqrLx + sqrLz, sqrLx + sqrLy)/12.0;

  #};

};
   

### 4.2.17 Conditionals

Input files support two conditional directives: #if…#else…#endif; and, #ifEq… #else… #endif. The #if conditional reads a switch that can be generated by a #calc directive, e.g.:

angle 65;

laplacianSchemes

{

#if #calc "${angle} < 75"

  default  Gauss linear corrected;

#else

  default  Gauss linear limited corrected 0.5;

#endif

}
   

The #ifEq compares a word or string, and executes based on a match, e.g.:

rotating

{

  timeScheme  ${${FOAM\_CASE}/system/fvSchemes!ddtSchemes/default};

#ifeq $timeScheme steadyState

  type  MRFnoSlip;

#else

  type  movingWallVelocity;

#endif

  value  uniform (0 0 0);

}
   

OpenFOAM v13 User Guide - 4.2 Basic input/output file format

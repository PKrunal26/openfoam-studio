---
source: https://doc.cfd.direct/openfoam/user-guide-v13/case-management
title: OpenFOAM v13 User Guide - 4.7 Case management tools
slug: case-management
---
### How do I set up cases in OpenFOAM?

CFD Direct's OpenFOAM Training covers OpenFOAM's tools for productive CFD

[See Training](https://cfd.direct/openfoam-training "See Training")

\[**version 13**\]\[[version 12](../user-guide-v12)\]\[[version 11](../user-guide-v11)\]\[[version 10](../user-guide-v10)\]\[[version 9](../user-guide-v9)\]\[[version 8](../user-guide-v8)\]\[[version 7](../user-guide-v7)\]\[[version 6](../user-guide-v6)\]

\[[chapter contents](cases)\]\[[previous topic](fvsolution)\]\[[next topic](mesh)\]\[[index](bookindex)\]

## 4.7 Case management tools

There are a set of applications and scripts that help with managing case files and help the user find and set keyword data entries in case files. The tools are described in the following sections.

### 4.7.1 General file management

There are some tools for general management of case files, including foamListTimes, foamCleanCase and foamCloneCase. A case includes configuration files for various processes such as meshing, case initialisation, simulation and post-processing. Each process generates new data files in various directories, e.g. mesh data is stored in constant/polyMesh, CFD results in time directories, and further post-processing in a postProcessing directory.

The foamListTimes utility lists the time directories for a case, omitting the 0 directory by default. Prior to re-running a CFD simulation, it can be useful to delete the results from the previous simulation. The foamListTimes utility provides this function through the \-rm option which deletes the listed time directories, executed by the following command.

  
    foamListTimes -rm

The foamCleanCase script aims to reset the case files to their original state, removing all files generated during a workflow including the meshing, post-processing. It deletes directories including: postProcessing and VTK; the constant/polyMesh directory; processor directories from parallel decomposition; and, dynamicCode for run-time compiled code. The script is simply run as follows.

  
    foamCleanCase

The foamCloneCase script creates a new case, by copying the 0, system and constant directories from an existing case. The copied case is ready to run since the mesh is copied through the constant directory. If the original case is set up to run in parallel, the processor directories can also be copied using the \-processor option. The basic command is executed simply as follows, where oldCase refers to an existing case directory.

    foamCloneCase oldCase newCase

### 4.7.2 The foamDictionary utility

The foamDictionary utility offers several options for printing, editing and adding keyword entries in case files. The utility is executed with a case dictionary file as an argument, e.g. from within a case directory on the fvSchemes file.

  
    foamDictionary system/fvSchemes

Without options, the utility prints the entries from the file, removing comments, e.g. as follows for the fvSchemes file in the pitzDailySteady tutorial case.

FoamFile

{

  format  ascii;

  class  dictionary;

  location  "system";

  object  fvSchemes;

}

ddtSchemes

{

  default  steadyState;

}

gradSchemes

{

  default  Gauss linear;

  grad(U)  cellLimited Gauss linear 1;

}

divSchemes

{

  default  none;

  div(phi,U)  bounded Gauss linearUpwind grad(U);

  turbulence  bounded Gauss limitedLinear 1;

  div(phi,k)  $turbulence;

  div(phi,epsilon) $turbulence;

  div(phi,omega)  $turbulence;

  div(phi,v2)  $turbulence;

  div((nuEff\*dev2(T(grad(U))))) Gauss linear;

  div(nonlinearStress) Gauss linear;

}

laplacianSchemes

{

  default  Gauss linear corrected;

}

interpolationSchemes

{

  default  linear;

}

snGradSchemes

{

  default  corrected;

}
   

The output includes the macros before expansion, indicated by the $ symbol, e.g. $turbulence. The macros can be expanded by the \-expand option as shown below

  
    foamDictionary -expand system/fvSchemes

The \-entry option prints the entry for a particular keyword, expanding the macros by default, e.g. divSchemes in the example below

  
    foamDictionary -entry divSchemes system/fvSchemes

The example clearly extracts the divSchemes dictionary.

divSchemes

{

  default  none;

  div(phi,U)  bounded Gauss linearUpwind grad(U);

  turbulence  bounded Gauss limitedLinear 1;

  div(phi,k)  $turbulence;

  div(phi,epsilon) $turbulence;

  div(phi,omega)  $turbulence;

  div(phi,v2)  $turbulence;

  div((nuEff\*dev2(T(grad(U))))) Gauss linear;

  div(nonlinearStress) Gauss linear;

}
   

The “/” syntax allows access to keywords with levels of sub-dictionary. For example, the div(phi,U) keyword can be accessed within the divSchemes sub-dictionary by the following command.

  
    foamDictionary -entry "divSchemes/div(phi,U)" system/fvSchemes

The example returns the single divSchemes/div(phi,U) entry.

div(phi,U)  bounded Gauss linearUpwind grad(U);
   

The \-value option prints only the entry.

  
    foamDictionary -entry "divSchemes/div(phi,U)" -value system/fvSchemes

The example removes the keyword and terminating semicolon, leaving just the data.

bounded Gauss linearUpwind grad(U)
   

The \-keywords option prints only the keywords.

  
    foamDictionary -entry divSchemes -keywords system/fvSchemes

The example produces a list of keywords inside the divSchemes dictionary.

default

div(phi,U)

div(phi,k)

div(phi,epsilon)

div(phi,omega)

div(phi,v2)

div((nuEff\*dev2(T(grad(U)))))

div(nonlinearStress)
   

foamDictionary can set entries with the \-set option. If the user wishes to change the div(phi,U) to the upwind scheme, they can enter the following.

  
    foamDictionary -entry "divSchemes/div(phi,U)" \\  
        -set "bounded Gauss upwind" system/fvSchemes

An alternative “\=” syntax can be used with the \-set option which is particularly useful when modifying multiple entries:

  
    foamDictionary -set "startFrom=startTime, startTime=0" \\  
        system/controlDict

foamDictionary can add entries with the \-add option. If the user wishes to add an entry named turbulence to divSchemes with the upwind scheme, they can enter the following.

  
    foamDictionary -entry "divSchemes/turbulence" \\  
       -add "bounded Gauss upwind" system/fvSchemes

### 4.7.3 The foamSearch script

The foamSearch script, demonstrated extensively in section [4.5](fvschemes#x21-1180004.5) , uses foamDictionary to extract and sort keyword entries from all files of a specified name in a specified dictionary. The \-c option counts the number of entries of each type, e.g. the user could searche for the choice of solver for the p equation in all the fvSolution files in the tutorials.

  
    foamSearch -c $FOAM\_TUTORIALS fvSolution solvers/p/solver

The search shows GAMG to be the most common choice in all the tutorials.

  
     64 solver          GAMG;  
      2 solver          PBiCGStab;  
     26 solver          PCG;  
      5 solver          smoothSolver;

### 4.7.4 The foamGet script

The foamGet script copies configuration files into a case quickly and conveniently. The user must be inside a case directory to run the script or identify the case directory with the \-case option. Its operation can be described using the pitzDailySteady case described in section [2.1](backwardstep#x5-40002.1) . The example begins by copying the case directory as follows:

  
    run  
    cp -r $FOAM\_TUTORIALS/modules/incompressibleFluid/pitzDailySteady .

The mesh is generated for the case by going into the case directory and running blockMesh:

  
    cd pitzDailySteady  
    blockMesh

The user might decide before running the simulation to configure some automatic post-processing as described in section [7.2](post-processing-cli#x40-2150007.2) . The user can list the pre-configured function objects by the following command.

  
    foamPostProcess -list

From the output, the user could select the patchFlowRate function to monitor the flow rate at the outlet patch. The patchFlowRate configuration file can be copied into the system directory using foamGet:

  
    foamGet patchFlowRate

In order to monitor the flow through the outlet patch, the patch entry in patchFlowRate file should be set as follows:

  
    patch    outlet;

The patchFlowRate configuration is then included in the case by adding to a functions file system directory, as discussed in section [7.2](post-processing-cli#x40-2150007.2) .

  
    functions  
    {  
        ...  
        //#includeFunc writeObjects(kEpsilon:G) // existing entry  
        #includeFunc patchFlowRate  
    }

### 4.7.5 The foamInfo script

The foamInfo script provides quick information and examples relating to thing in OpenFOAM that the user can “select”. The selections include models (including boundary conditions and packaged function objects), solver modules, applications and scripts. For example, foamInfo prints information about the incompressibleFluid solver module by typing the following:

  
    foamInfo incompressibleFluid

Information for the flowRateInletVelocity boundary condition can similarly be obtained by typing the following command.

  
    foamInfo flowRateInletVelocity

The output includes: the location of the source code header file for this boundary condition; the description and usage details from the header file; a list of other models of the same type, i.e. other boundary conditions; and, a list of example cases that use the boundary condition. This example is demonstrated in section [2.1.17](backwardstep#x5-210002.1.17) .

When the user requests information about a model with foamInfo, it attempts to provide a list of other models in the “family”. For example, if the user requests information about the kEpsilon turbulence model by

  
    foamInfo kEpsilon

the output includes the following

  
   Model  
    This appears to be the 'kEpsilon' model of the 'RAS' family.  
    The models in the 'RAS' family are:  
    + kEpsilon  
    + kOmega  
    + kOmega2006  
    + kOmegaSST  
    + kOmegaSSTLM  
    + kOmegaSSTSAS  
    + LaunderSharmaKE  
    + LRR  
    + RAS  
    + realizableKE  
    + RNGkEpsilon  
    + SpalartAllmaras  
    + SSG  
    + v2f

It provides fairly complete lists for fvModels and fvConstraints, which can be demonstrated by typing the following commands.

  
    foamInfo clouds  
    foamInfo limitTemperature

It also lists options used in input files, e.g. for Function1 entries in boundary conditions, searchableSurface entries in the configuration of snappyHexMesh. Users could try searching for specific models within those families or the families themselves, e.g.

  
    foamInfo linearRamp  
    foamInfo triSurfaceMesh  
    foamInfo Function1  
    foamInfo searchableSurfaces

### 4.7.6 The foamToC utility

The foamToC utility lists all the options in OpenFOAM which the user can select through input files. The functionality overlaps with foamInfo to some extent but foamToC produces more definitive reporting since it is an OpenFOAM application which directly interrogates the run-time selection tables in the compiled libraries. The “ToC” in the name is an abbreviation for “Table of Contents.”

As well as providing general options to interrogate anything in OpenFOAM, foamToC includes specific options that replicate most of the “\-list…” options included in application solvers prior to v11. These options included: \-listScalarBCs and \-listVectorBCs to list boundary conditions; \-listFunctionObjects to list functionObjects; \-listFvModels to list fvModels; and, \-listFvConstraints to list fvConstraints. The equivalent options in foamToC are listed below, with an additional \-solvers option:

-   \-scalarBCs and \-vectorBCs to list boundary conditions;
    
-   \-functionObjects to list functionObjects;
    
-   \-fvModels to list fvModels;
    
-   \-fvConstraints to list fvConstraints; and,
    
-   \-solvers to list the solver modules.
    

For example, with the last option, foamToC prints the following output

\>> foamToC -fvConstraints

fvConstraints:

Contents of table fvConstraint:

  bound  libfvConstraints.so

  fixedTemperatureConstraint  libfvConstraints.so

  fixedValueConstraint  libfvConstraints.so

  limitMag  libfvConstraints.so

  limitPressure  libfvConstraints.so

  limitTemperature  libfvConstraints.so

  meanVelocityForce  libfvConstraints.so

  patchMeanVelocityForce  libfvConstraints.so

  zeroDimensionalFixedPressure  libfvConstraints.so
   

Each fvConstraint is listed in the left column with the library to which it belongs in the right column. The options listed above essentially invoke the more general \-table option that lists the contents of a run-time selection table. The \-fvConstraints option is equivalent to the following command which lists the items in the fvConstraint table.

  
    foamToC -table fvConstraint

All the selection tables in OpenFOAM are listed by running foamToC with the \-tables option as shown below.

  
    foamToC -tables

This is also the default response of foamToC without options, i.e.

  
    foamToC

By default foamToC loads all the libraries in OpenFOAM to produce a complete list of tables. The user can control the libraries that are loaded with the following options.

-   \-noLibs: only loads the core libOpenFOAM.so library by default.
    
-   \-solver <solver\>: only loads libraries associated with the specified solver module <solver\>.
    
-   \-libs '("lib1.so" ... "libN.so")': additionally pre-loads specified libraries, e.g. customised libraries of the user.
    

An important use of foamToC is to enable users to find alternative models to the one currently configured for their case. The challenge is to find the table that contains the models they wish to list. The \-search option helps with this, since it takes an entry, e.g. a model, and reports the table in which it belongs. For example, if the user was familiar with the BirdCarreau model for viscosity and wished to list alternative non-Newtonian models, they could first issue the following command.

  
    >> foamToC -search BirdCarreau  
  
BirdCarreau is in table  
    generalisedNewtonianViscosityModel  libmomentumTransportModels.so

Having identified the table, the user can then list its contents using the \-table option.

  
    >> foamToC -table generalisedNewtonianViscosityModel  
  
Contents of table generalisedNewtonianViscosityModel:  
    BirdCarreau             libmomentumTransportModels.so  
    Casson                  libmomentumTransportModels.so  
    CrossPowerLaw           libmomentumTransportModels.so  
    HerschelBulkley         libmomentumTransportModels.so  
    Newtonian               libmomentumTransportModels.so  
    powerLaw                libmomentumTransportModels.so  
    strainRateFunction      libmomentumTransportModels.so

If the user wished to list the solver modules, they can run

  
    foamToC -solvers

which is equivalent to running

  
    foamToC -table solver

With turbulence models, a search for kEpsilon lists the following set of tables (the corresponding libraries are not shown here).

  
kEpsilon is in table  
    RAS  
        RAScompressibleMomentumTransportModel  
        RASincompressibleMomentumTransportModel  
        RASphaseCompressibleMomentumTransportModel  
        RASphaseIncompressibleMomentumTransportModel

The output indicates the model exists in different tables corresponding to both incompressible and compressible flows, and both single phase and multi-phase flows (phase indicates multi-phase in the table name). For single phase, incompressible flows, the available RAS turbulence models can be listed as follows.

  
    foamToC -table RASincompressibleMomentumTransportModel

### 4.7.7 The foamUnits script

The foamUnits utility provides details of named units and dimensional units, described in sections [4.2.7](basic-file-format#x18-1000004.2.7) and [4.2.6](basic-file-format#x18-990004.2.6) , respectively. Users can list the named units by running with the \-list option, i.e.

  
    foamUnits -list

It returns the following:

  
Basic units: \[kg\] \[m\] \[s\] \[K\] \[kmol\] \[A\] \[Cd\]  
Derived units: \[Hz\] \[N\] \[Pa\] \[J\] \[W\]  
...

Similarly, they can list dimensional units with the addition of the \-dimension option as follows:

  
    foamUnits -list -dimensions

It returns the following:

  
Base dimensions: \[mass\] \[length\] \[time\] \[temperature\] \[moles\] ...  
Derived dimensions:  
  \[area\] \[volume\] \[rate\] \[velocity\] \[momentum\]  
...

They can print the details of any unit, e.g. calorie \[cal\] by

  
    foamUnits cal

which returns the base units and conversion factor:

  
Unit \[cal\]  
+ Base unit = \[J\]  
+ Conversion factor = 4.184

They can similarly print details of any named dimension, e.g. \[energ\], with the \-dimension option

  
    foamUnits -dimension energy

It produces the following:

  
Dimension \[energy\]  
+ Base dimensions = \[force\*length\]

Finally, the details of all named units or dimensional units can be printed by foamUnits using the \-all option, with or without the \-dimension option.

### 4.7.8 The foamFind script

The foamFind script searches for files in OpenFOAM. It can simply provide the location of files by printing their filename including the path. Alternatively it can print the entire file into the terminal, print lines matching a search string or open the file in a text editor. The script is principally used to locate source code files (so perhaps does not fall much under “Case Management”, the title of this section of the guide).

For example, if a user wished to locate the file wallHeatFlux.C, they could simply type

  
    foamFind wallHeatFlux.C

This would simply return the location of the file, e.g.

  
File: $FOAM\_SRC//functionObjects/field/wallHeatFlux/wallHeatFlux.C

The \-print option would additionally print the contents of the file to the terminal; the argument positioning is flexible:

  
    foamFind -print wallHeatFlux.C  
    foamFind wallHeatFlux.C -print # Alternatively

To view the printed file slowly, the user could pipe the output to the UNIX less command

  
    foamFind wallHeatFlux.C -print | less

less provides some keystroke to scroll, search and quit:

-   click the space bar, page up, page down keys to scroll;
    
-   enter line number after “:” to jump to a line;
    
-   enter “/” followed by a string to search for the string, e.g. /calc to search for “calc”;
    
-   enter “q” to quit.
    

A file can also be opened in a file editor using the \-editor option. For this option to work, the user’s environment must include an $EDITOR environment variable set to the user’s editor of choice. For example, to set the gedit editor, the user could add the following to their $HOME/.bashrc file:

  
export EDITOR=gedit

The following command would then open the wallHeatFlux.C file in the gedit editor:

  
    foamFind wallHeatFlux.C -edit

The foamFind script includes the \-search option to print lines of a file matching a string, e.g. to search “heat”:

  
    foamFind wallHeatFlux.C -search heat

The \-isearch option make the search case insensitive, e.g. so would also match “Heat” (upper case) in the example.

  
    foamFind wallHeatFlux.C -isearch heat

The \-numbers option writes output with line numbers, e.g.

  
    foamFind wallHeatFlux.C -isearch heat -numbers

The source code is ultimately compiled with wmake as described in section [3.2](compiling-applications#x10-480003.2) . The instructions for wmake are included in the files and options files in an associated Make directory. The foamFind script include two options, \-files and \-options, which return the files and options files, respectively, associated with the source code file. The following command would locate the options file associated with wallHeatFlux:

  
    foamFind wallHeatFlux.C -options

By default, foamFind is searching for source code files so begins its search from the $FOAM\_SRC directory within the OpenFOAM installation. Alternative directories for the search can be specified with the following options:

-   \-applications: the $FOAM\_APP (applications) directory;
    
-   \-modules: the $FOAM\_MODULES (modules) directory;
    
-   \-tutorial: the $FOAM\_TUTORIALS (tutorials) directory;
    

The \-dir option also allows the user to specify any other directory.

The foamFind script could find multiple files of the same name in a single search, e.g. looking for createFields.H in the $FOAM\_APP directory by:

  
    foamFind -applications createFields.H -print

This returns a selection of over 20 files, with each one numbered. The user can then enter the number of one particular file, or ENTER to print them all.

### 4.7.9 The foamMergeCase script

There is often a need to run several CFD simulations which are generally similar but include small differences. The foamMergeCase script is designed to help maintain cases in these circumstances. It operates on the basis that there first exists a working “source” case from which “variant” cases are created.

A variant case only contains files which include modifications from those in the source case, organised in the same directory structure The files are given a special .orig extension and only need to include the modified entries. The foamMergeCase script can then be executed from within the variant case directory with the source case directory provided as an argument.

There is an accompanying foamUnMergeCase script which removes files that the foamMergeCase scripts copies from the source case. The variant case should include their own Allrun and Allclean scripts which include the respective foamMergeCase and foamUnMergeCase commands.

Let us provide an example that uses the pitzDaily case as the source. The variant case, pitzDailyWater, will be identical to pitzDaily except that it will run with a kinematic viscosity of ![eqn](img/index311x.png) ![eqn](img/index312x.png) ![eqn](img/index313x.png) cSt (centistokes).

The first step of setting up a variant case is to copy the source case and then delete directories and files that remain unchanged during the merge. In our example, we can start from the run directory using the run alias, copy the pitzDaily case, renaming it pitzDailyWater, and then change into that directory.

  
    run  
    cp -r $FOAM\_TUTORIALS/incompressibleFluid/pitzDaily pitzDailyWater  
    cd pitzDailyWater

The user should then delete the directories and files that are not going to be merged, as follows.

  
    rm -rf 0 system constant/momentumTransport

The kinematic viscosity is configured by the nu in the physicalProperties file in the constant directory. The modification to nu must be stored in a file named physicalProperties.orig in the corresponding directory. Therefore, the user should first rename physicalProperties to physicalProperties.orig.

  
    mv constant/physicalProperties constant/physicalProperties.orig

The physicalProperties.orig should then be opened in an editor. The keyword entry for viscosityModel should be deleted. The entry for nu should be changed to the following (using cSt units described in section [4.7.8](#x23-1420004.7.8) ).

  
    nu       1 \[cSt\];

The current case directory is now the complete variant case to the pitzDaily source case. A simulation can now be run by first merging in the pitzDaily source case using foamMergeCase as follows.

  
    foamMergeCase $FOAM\_TUTORIALS/incompressibleFluid/pitzDaily

The script copies across the relevant files from pitzDaily, while merging the changes in physicalProperties.orig into the physicalProperties file. The case runs with the Allrun script.

  
    ./Allrun

The case results can be visualised using ParaView to demonstrate it all works as expected.

The user can subsequently use foamUnMergeCase, a complementary script to foamMergeCase, to reset the pitzDailyWater case to its original “variant” form, containing only the physicalProperties.orig file. The case should first be cleaned to removed results, log files and post-processed data using the foamCleanCase script.

  
    foamCleanCase

The case directory is then reduced to the basic 0, system and constant directories and the Allrun script. The case can then be “un-merged” by running the following command.

  
    foamUnMergeCase $FOAM\_TUTORIALS/incompressibleFluid/pitzDaily

This returns the case directort to its initial state, with only the constant directory containing the physicalProperties.orig file.

As discussed earlier, it is recommended that the Allrun and Allclean scripts contain the respective foamMergeCase and foamUnMergeCase commands. Therefore, the user should open the Allrun in an editor and add the foamMergeCase command as shown below.

1#!/bin/sh

2cd ${0%/\*} || exit 1  # Run from this directory

3

4# Source tutorial run functions

5. $WM\_PROJECT\_DIR/bin/tools/RunFunctions

6

7foamMergeCase $FOAM\_TUTORIALS/incompressibleFluid/pitzDaily

8

9runApplication blockMesh -dict $FOAM\_TUTORIALS/resources/blockMesh/pitzDaily

10runApplication foamRun
   

The source case does not include an Allclean script, so the user should copy one using the foamGet script as follows.

  
    foamGet Allclean

The foamUnMergeCase command should be added after the cleanCase function, otherwise the un-merging will be incomplete. An example is shown below.

1#!/bin/sh

2

3# Run from this directory

4cd "${0%/\*}" || exit 1

5

6# Source tutorial clean functions

7. "$WM\_PROJECT\_DIR/bin/tools/CleanFunctions"

8

9# ...

10cleanCase

11

12foamMergeCase $FOAM\_TUTORIALS/incompressibleFluid/pitzDaily
   

The case can now be run and cleaned by executing the Allrun and Allclean scripts respectively.

  
    ./Allrun  
    ./Allclean

OpenFOAM v13 User Guide - 4.7 Case management tools

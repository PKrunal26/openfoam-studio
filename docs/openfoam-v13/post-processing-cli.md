---
source: https://doc.cfd.direct/openfoam/user-guide-v13/post-processing-cli
title: OpenFOAM v13 User Guide - 7.2 Post-processing command line interface (CLI)
slug: post-processing-cli
---
### Can I post-process from the command line in OpenFOAM?

Post-processing from the command line in fully explained in our OpenFOAM Training

[See Training](https://cfd.direct/openfoam-training "See Training")

\[**version 13**\]\[[version 12](../user-guide-v12)\]\[[version 11](../user-guide-v11)\]\[[version 10](../user-guide-v10)\]\[[version 9](../user-guide-v9)\]\[[version 8](../user-guide-v8)\]\[[version 7](../user-guide-v7)\]\[[version 6](../user-guide-v6)\]

\[[chapter contents](postprocessing)\]\[[previous topic](paraview)\]\[[next topic](post-processing-functionality)\]\[[index](bookindex)\]

## 7.2 Post-processing command line interface (CLI)

Post-processing is provided directly within OpenFOAM through the command line including data processing, sampling (e.g. probes, graph plotting) visualisation, case control and run-time I/O. Functionality can be executed by:

-   conventional post-processing, a data processing activity that occurs after a simulation has run;
    
-   run-time processing, data processing that is performed during the running of a simulation.
    

Both approaches have advantages. Conventional post-processing allows the user to choose how to analyse data after the results are obtained. Run-time processing offers greater flexibility because it has access to all the data in the database of the run at all times, rather than just the data written during the simulation. It also allows the user to monitor processed data during a simulation and provides a greater level of convenience because the processed results can be available immediately to the user when the simulation ends.

There are 3 methods of post-processing that cover the options described above.

-   The case can be configured to include run-time processing during the simulation.
    
-   The foamPostProcess utility provides conventional post-processing of data after a simulation is completed.
    
-   The foamPostProcessutility is run with a \-solver which provides additional access to data available on the database for the particular solver.
    

All modes of post-processing access the same functionality implemented in OpenFOAM in the function object framework. Function objects can be listed using foamToC by the following command.

  
    foamToC -functionObjects

The list represents the underlying post-processing functionality. Almost all the functionality is packaged into a set of configured tools that are conveniently integrated within the post-processing CLI. Those tools are located in $FOAM\_ETC/caseDicts/functions and are listed by running foamPostProcesswith the \-list option.

  
    foamPostProcess -list

This produces a list of tools catalogued in section [7.3](post-processing-functionality#x41-2180007.3) .

### 7.2.1 Run-time data processing

When a user wishes to process data during a simulation, they need to configure the case accordingly. The configuration process is as follows, using an example of monitoring flow rate at an outlet patch named outlet.

Firstly, the user should include the patchFlowRate function in a functions file in the case system directory. The user can copy a template functions file using foamGet as follows

  
    foamGet functions

Within the functions file, they include the patchFlowRate function with the #includeFunc directive (e.g. by un-commenting the example entry):

  
    #includeFunc  patchFlowRate

Note: prior to v12, the functions were included in a functions sub-dictionary in the case controlDict file, as shown below.

  
functions  
{  
    #includeFunc  patchFlowRate  
    ... other function objects here ...  
}

It is still possible to do this, but using a separate functions file is advantageous because it avoids reading function objects in applications that do not use them. That will include the functionality in the patchFlowRate configuration file, located in the directory hierarchy beginning with $FOAM\_ETC/caseDicts/postProcessing.

The configuration of patchFlowRate requires the name of the patch to be supplied. Option 1 for doing this is that the user copies the patchFlowRate file into their case system directory. The foamGet script copies the file conveniently, e.g. 

  
    foamGet patchFlowRate

The patch name can be edited in the copied file to be outlet. When the solver is run, it will pick up an included function in the local case system directory, in precedence over $FOAM\_ETC/caseDicts/postProcessing. The flow rate through the patch will be calculated and written out into a file within a directory named postProcessing.

Option 2 for specifying the patch name is to provide the name as an argument to the patchFlowRate in the #includeFunc directive, using the syntax keyword=entry.

  
    #includeFunc  patchFlowRate(patch=outlet)

In the case where the keyword is field or fields, only the entry is needed when specifying an argument to a function. For example, if the user wanted to calculate and write out the magnitude of velocity into time directories during a simulation they could simply add the following to the functions sub-dictionary in controlDict.

  
    #includeFunc  mag(U)

This works because the function’s argument U is represented by the keyword field, see $FOAM\_ETC/caseDicts/postProcessing/fields/mag.

Some functions require the setting of many parameters, e.g. to calculate forces and generate elements for visualisation, etc. For those functions, it is more reliable and convenient to copy and configure the function using option 1 (above) rather than through arguments.

### 7.2.2 The foamPostProcess utility

The user can execute post-processing functions after the simulation is complete using the foamPostProcess utility. We can us illustrate the use of foamPostProcessusing the pitzDailySteady case from section [2.1](backwardstep#x5-40002.1) . The tutorial does not need to be run to use the case, it can instead be copied into the user’s run directory and run using its accompanying Allrun script as follows.

  
    run  
    cp -r $FOAM\_TUTORIALS/incompressibleFluid/pitzDailySteady .  
    cd pitzDaily  
    ./Allrun

Now the user can run execute post-processing functions with foamPostProcess. The \-help option provides a summary of its use.

  
    foamPostProcess -help

Simple functions like mag can be executed using the \-func option; text on the command line generally needs to be quoted ("…") if it contains punctuation characters.

  
    foamPostProcess -func "mag(U)"

This operation calculates and writes the field of magnitude of velocity into a file named mag(U) in each time directory. Similarly, the patchFlowRate example can be executed using foamPostProcess.

  
    foamPostProcess -func "patchFlowRate(name=outlet)"

Let us say the user now wants to calculate total pressure ![eqn](img/index385x.png) for incompressible flow with kinematic pressure, ![eqn](img/index386x.png). The function is available, named totalPressureIncompressible, which requires a rhoInf parameter to be specified. The user could attempt first to run as follows.

  
    foamPostProcess -func "totalPressureIncompressible(rhoInf=1.2)"

This returns the following error message.

  
\--> FOAM FATAL IO ERROR:  
request for volVectorField U from objectRegistry region0 failed

The error message is telling the user that the velocity field U is not loaded. For the function to work, both the field needs to be loaded using the \-field option as follows.

  
    foamPostProcess -func "totalPressureIncompressible(rhoInf=1.2)" -field U

A more complex example is calculating wall shear stress using the wallShearStress function.

  
    foamPostProcess -fields "(p U)" -func wallShearStress

Even loading relevant fields, the post-processing fails with the following message.

  
    --> FOAM FATAL ERROR:  
    Unable to find turbulence model in the database

The message is telling us that the foamPostProcessutility has not constructed the necessary models, i.e. a turbulence model, that the incompressibleFluid solver module used when running the simulation. This is a situation where we need to post-process (as opposed to run-time process) using the \-solver option modelling will be available that the post-processing function needs.

  
    foamPostProcess -solver incompressibleFluid -func wallShearStress

Note that no fields need to be supplied, e.g. using ”\-field U”, because incompressibleFluid module constructs and stores the required fields. Functions can also be selected by the #includeFunc directive in functions file, instead of the \-func option.

OpenFOAM v13 User Guide - 7.2 Post-processing command line interface (CLI)

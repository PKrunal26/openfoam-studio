---
source: https://doc.cfd.direct/openfoam/user-guide-v13/controldict
title: OpenFOAM v13 User Guide - 4.4 Time and data input/output control
slug: controldict
---
### What are the settings in the OpenFOAM _controlDict_ file?

The _controlDict_ file is fully explained in CFD Direct's OpenFOAM Training

[See Training](https://cfd.direct/openfoam-training "See Training")

\[**version 13**\]\[[version 12](../user-guide-v12)\]\[[version 11](../user-guide-v11)\]\[[version 10](../user-guide-v10)\]\[[version 9](../user-guide-v9)\]\[[version 8](../user-guide-v8)\]\[[version 7](../user-guide-v7)\]\[[version 6](../user-guide-v6)\]

\[[chapter contents](cases)\]\[[previous topic](global-settings)\]\[[next topic](fvschemes)\]\[[index](bookindex)\]

## 4.4 Time and data input/output control

The OpenFOAM solvers begin all runs by setting up a database. The database controls I/O and, since output of data is usually requested at intervals of time during the run, time is an inextricable part of the database. The controlDict dictionary sets input parameters essential for the creation of the database. The keyword entries in controlDict are listed in the following sections. Only the time control and writeInterval entries are mandatory, with the database using default values for any of the optional entries that are omitted. Example entries from a controlDict dictionary are given below:

16

17solver  incompressibleFluid;

18

19startFrom  latestTime;

20

21startTime  0;

22

23stopAt  endTime;

24

25endTime  0.3;

26

27deltaT  0.0001;

28

29writeControl  adjustableRunTime;

30

31writeInterval  0.01;

32

33purgeWrite  0;

34

35writeFormat  ascii;

36

37writePrecision  6;

38

39writeCompression off;

40

41timeFormat  general;

42

43timePrecision  6;

44

45runTimeModifiable yes;

46

47adjustTimeStep  yes;

48

49maxCo  5;

50

51// \*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\* //
   

### 4.4.1 Modules

  
solver

Choice of solver module for the simulation, e.g. incompressibleFluid

  
regionSolvers

Dictionary of solvers for different domain regions, e.g. heat transfer of water flowing over a plate might use the fluid and solid modules as follows:

regionSolvers  
{  
    water fluid;  
    plate solid;  
}

  
libs

List of additional libraries (existing on $LD\_LIBRARY\_PATH) to be loaded at run-time, e.g. ("libNew1.so" "libNew2.so")

### 4.4.2 Time control

  
startFrom

Controls the start time of the simulation.

-   firstTime: Earliest time step from the set of time directories.
    
-   startTime: Time specified by the startTime keyword entry.
    
-   latestTime: Most recent time step from the set of time directories.
    

  
startTime

Start time for the simulation with startFrom startTime;

  
stopAt

Controls the end time of the simulation.

-   endTime: Time specified by the endTime keyword entry.
    
-   writeNow: Stops simulation on completion of current time step and writes data.
    
-   noWriteNow: Stops simulation on completion of current time step and does not write out data.
    
-   nextWrite: Stops simulation on completion of next scheduled write time, specified by writeControl.
    

  
endTime

End time for the simulation when stopAt endTime; is specified.

  
deltaT

Time step of the simulation.

### 4.4.3 Data writing

  
writeControl

Controls the timing of write output to file.

-   timeStep: Writes data every writeInterval time steps.
    
-   runTime: Writes data every writeInterval seconds of simulated time.
    
-   adjustableRunTime: Writes data every writeInterval seconds of simulated time, adjusting the time steps to coincide with the writeInterval if necessary — used in cases with automatic time step adjustment.
    
-   cpuTime: Writes data every writeInterval seconds of CPU time.
    
-   clockTime: Writes data out every writeInterval seconds of real time.
    

  
writeInterval

Scalar used in conjunction with writeControl described above.

  
purgeWrite

Integer representing a limit on the number of time directories that are stored by overwriting time directories on a cyclic basis. For example, if the simulations starts at ![eqn](img/index251x.png) = 5s and ![eqn](img/index252x.png) = 1s, then with purgeWrite 2;, data is first written into 2 directories, 6 and 7, then when 8 is written, 6 is deleted, and so on so that only 2 new results directories exists at any time. To disable the purging, specify purgeWrite 0; (default).

  
writeFormat

Specifies the format of the data files.

-   ascii (default): ASCII format, written to writePrecision significant figures.
    
-   binary: binary format.
    

  
writePrecision

Integer used in conjunction with writeFormat described above, 6 by default.

  
writeCompression

Switch to specify whether files are compressed with gzip when written: on/off (yes/no, true/false)

  
timeFormat

Choice of format of the naming of the time directories.

-   fixed: ![eqn](img/index253x.png) where the number of ![eqn](img/index254x.png)s is set by timePrecision.
    
-   scientific: ![eqn](img/index255x.png) where the number of ![eqn](img/index254x.png)s is set by timePrecision.
    
-   general (default): Specifies scientific format if the exponent is less than -4 or greater than or equal to that specified by timePrecision.
    

  
timePrecision

Integer used in conjunction with timeFormat described above, 6 by default.

  
graphFormat

Format for graph data written by an application.

-   raw (default): Raw ASCII format in columns.
    
-   gnuplot: Data in gnuplot format.
    
-   csv: Comma-separated values.
    
-   vtk: Visualisation Toolkit (VTK) format.
    
-   ensight: Ensight format.
    

### 4.4.4 Other settings

  
beginTime

Optional entry to for cases with an unusual start time that causes inconvenient write times. With beginTime, the write times are multiples of writeInterval, starting at the beginTime. For example, if the start time of 1.52 and a writeInterval of 1, results would be written at 2.52, 3.52, …If beginTime is set to 0 (or 1), the write times would be 2, 3, etc.

Switch used by some solvers to adjust the time step during the simulation, usually according to maxCo.

  
adjustTimeStep

Switch used by some solvers to adjust the time step during the simulation, usually according to maxCo.

  
maxCo

Maximum Courant number, e.g. 0.5

  
runTimeModifiable

Switch for whether dictionaries, e.g.controlDict, are re-read during a simulation at the beginning of each time step, allowing the user to modify parameters during a simulation.

  
functions

Dictionary of functions, e.g. probes to be loaded at run-time; see examples in $FOAM\_TUTORIALS

OpenFOAM v13 User Guide - 4.4 Time and data input/output control

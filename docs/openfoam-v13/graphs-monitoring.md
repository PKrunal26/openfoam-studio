---
source: https://doc.cfd.direct/openfoam/user-guide-v13/graphs-monitoring
title: OpenFOAM v13 User Guide - 7.4 Sampling and monitoring data
slug: graphs-monitoring
---
### How do I plot graphs in OpenFOAM?

Plotting graphs and sampling surfaces is covered in our Essential CFD course

[Essential CFD](https://cfd.direct/openfoam-training/essential-cfd "Essential CFD")

\[**version 13**\]\[[version 12](../user-guide-v12)\]\[[version 11](../user-guide-v11)\]\[[version 10](../user-guide-v10)\]\[[version 9](../user-guide-v9)\]\[[version 8](../user-guide-v8)\]\[[version 7](../user-guide-v7)\]\[[version 6](../user-guide-v6)\]

\[[chapter contents](postprocessing)\]\[[previous topic](post-processing-functionality)\]\[[next topic](post-processing-third-party)\]\[[index](bookindex)\]

## 7.4 Sampling and monitoring data

There are a set of general post-processing functions for sampling data across the domain for graphs and visualisation. Several functions also provide data in a single file, in the form of time versus values, that can be plotted onto graphs. This time-value data can be monitored during a simulation with the foamMonitor script.

### 7.4.1 Probing data

The functions for probing data are boundaryProbes, internalProbes and probes as listed in section [7.3.12](post-processing-functionality#x41-2300007.3.12) . All functions work on the basis that the user provides some point locations and a list of fields, and the function writes out values of the fields are those locations. The differences between the functions are as follows.

-   probes identifies the nearest cells to the probe locations and writes out the cell values; data is written into a single file in time-value format, suitable for plotting a graph.
    
-   boundaryProbes and internalProbes interpolate field data to the probe locations, with the locations being snapped onto boundaries for boundaryProbes; data sets are written to separate files at scheduled write times (like fields). data.
    

Generally probes is more suitable for monitoring values at smaller numbers of locations, whereas the other functions are typically for sampling at large numbers of locations.

As an example, the user could use the pitzDailySteady case set up in section [2.1](backwardstep#x5-40002.1) . The probes function is best configured by copying the file to the local system directory using foamGet.

  
    foamGet probes

The user can modify the probeLocations in the probes file as follows.

12

13#includeEtc "caseDicts/postProcessing/probes/probes.cfg"

14

15fields (p U);

16probeLocations

17(

18  (0.01 0 0)

19);

20

21// \*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\* //
   

The configuration is completed by adding the #includeFunc directive to a functions file in the system directory.

  
    #includeFunc  probes

When the simulation runs, time-value data is written into p and U files in postProcessing/probes/0.

### 7.4.2 Sampling for graphs

The graphUniform function samples data for graph plotting. To use it, the graphUniform file can be copied into the system directory to be configured. We will configure it here using the pitzDaily case as before. The file is simply copied using foamGet.

  
    foamGet graphUniform

The start and end points of the line, along which data is sampled, should be edited; the entries below provide a vertical line across the full height of the geometry 0.01 m beyond the back step.

14

15start  (0.01 -0.025 0);

16end  (0.01  0.025 0);

17nPoints  100;

18

19fields  (U p);

20

21axis  distance; // The independent variable of the graph. Can be "x",

22  // "y", "z", "xyz" (all coordinates written out), or

23  // "distance" (from the start point).

24

25#includeEtc "caseDicts/postProcessing/graphs/graphUniform.cfg"

26

27// \*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\* //
   

The configuration is completed by adding the #includeFunc directive to a functions file in the system directory.

  
    #includeFunc  graphUniform

The simulation can be then re-run or the user could run the post-processing with the following command.

  
    foamPostProcess -solver incompressibleFluid

Either way, distance-value data is written into files in time directories within postProcessing/graphUniform. The user can quickly display the data for ![eqn](img/index392x.png)\-component of velocity, ![eqn](img/index393x.png) in the last time e.g. 285, by running gnuplot and plotting values.

  
    gnuplot  
    gnuplot> set style data linespoints  
    gnuplot> plot "postProcessing/graphUniform/285/line\_U.xy" u 2:1

This produces the graph shown in Figure [7.5](#x42-2380315). This graph corresponds to the velocity inlet with a uniform profile, rather than a boundary layer profile.

* * *

![ \\relax \\special {t4ht=](img/index394x.png)

  

Figure 7.5: Graph of ![eqn](img/index395x.png) at ![eqn](img/index396x.png) = 0.01, uniform sampling

* * *

The formatting of the graph is specified in configuration files in $FOAM\_ETC/caseDicts/postProcessing/graphs. The graphUniform.cfg file in that directory includes the configuration as follows.

8

9#includeEtc "caseDicts/functions/graphs/graph.cfg"

10

11sets

12{

13  line

14  {

15  type  lineUniform;

16  axis  $axis;

17  start  $start;

18  end  $end;

19  nPoints  $nPoints;

20  }

21}

22

23// \*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\* //
   

It shows that the sampling type is lineUniform, meaning the sampling uses a uniform distribution of points along a line. The other parameters are included by macro expansion from the main file and specify the line start and end, the number of points and the distance parameter specified on the horizontal axis of the graph.

An alternative graph function object, graphCell, samples the data at locations nearest to the cell centres. The user can copy that function object file and configure it as shown below.

13

14start  (0.01 -0.025 0);

15end  (0.01  0.025 0);

16fields  (U p);

17

18axis  distance; // The independent variable of the graph. Can be "x",

19  // "y", "z", "xyz" (all coordinates written out), or

20  // "distance" (from the start point).

21

22#includeEtc "caseDicts/postProcessing/graphs/graphCell.cfg"

23

24// \*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\* //
   

Running the post-processing produces the graph in Figure [7.6](#x42-2380886) .

* * *

![ \\relax \\special {t4ht=](img/index397x.png)

  

Figure 7.6: Graph of ![eqn](img/index398x.png) at ![eqn](img/index399x.png) = 0.01, mid-point sampling

* * *

### 7.4.3 Live monitoring of data

Functions like probes produce a single file of time-value data, suitable for graph plotting. When the function is executed during a simulation, the user may wish to monitor the data live on screen. The foamMonitor script enables this; to discover its functionality, the user run it with the \-help option. The help option includes an example of monitoring residuals that we can demonstrate in this section.

Firstly, include the residuals function in the functions file.

  
    #includeFunc  residuals

The default fields whose residuals are captured are p and U. Should the user wish to configure other fields, they should make copy the residuals file in their system and edit the fields entry accordingly. All functions files are within the $FOAM\_ETC/caseDicts directory. The residuals file can be located using foamInfo:

  
    foamInfo residuals

It can then be copied into the system directory conveniently using foamGet:

  
    foamGet residuals

The user can then run the case in the background.

  
    foamRun > log &

The user should then run foamMonitor using the \-l option for a log scale ![eqn](img/index400x.png)\-axis on the residuals file as follows. If the command is executed before the simulation is complete, they can see the graph being updated live.

  
    foamMonitor -l postProcessing/residuals/0/residuals.dat &

It produces the graph of residuals for pressure and velocity in Figure [7.7](#x42-2390047) .

* * *

![ \\relax \\special {t4ht=](img/index401x.png)

  

Figure 7.7: Live plot of residuals with foamMonitor

* * *

### 7.4.4 Sampling for visualisation

There are several surfaces and streamlines functions, listed in sections [7.3.16](post-processing-functionality#x41-2340007.3.16) and [7.3.17](post-processing-functionality#x41-2350007.3.17) , that can be used to generate files for visualisation. The use of streamlinesLine is already configured in the pitzDailySteady case.

To generate a cutting plane, the cutPlaneSurface function can be configured by copying the cutPlaneSurface file to the system directory using foamGet.

  
    foamGet cutPlaneSurface

The file is configured by setting the origin and normal of the plane and the field data to be sampled. We can edit the file to produce a cutting plane along the pitzDaily geometry, normal to the ![eqn](img/index402x.png)\-direction.

16

17fields  (p U);

18

19interpolate true; // If false, write cell data to the surface triangles.

20  // If true, write interpolated data at the surface points.

21

22#includeEtc "caseDicts/postProcessing/surface/cutPlaneSurface.cfg"

23

24// \*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\* //
   

The function can be included as normal by adding the #includeFunc to a functions file in the system directory. Alternatively, the user could test running the function using the solver post-processing by the following command.

  
    foamPostProcess -solver incompressibleFluid -func cutPlaneSurface

This produces VTK format files of the cutting plane with pressure and velocity data in time directories in the postProcessing/cutPlaneSurface directory. The user can display the cutting plane by opening ParaView (type paraview), then doing File->Open and selecting one of the files, e.g. postProcessing/cutPlaneSurface/285/U\_zNormal.vtk as shown in Figure [7.8](#x42-2400198) .

* * *

![ \\relax \\special {t4ht=](img/index403x.png)

  

Figure 7.8: Cutting plane with velocity

* * *

### 7.4.5 The foamVTKSeries script

The previous section describes how to create surface image files in VTK format which can be read into ParaView and processed. The image files are distributed across time directories within a sub-directory of the postProcessing directory, e.g. postProcessing/cutPlaneSurface/0, postProcessing/cutPlaneSurface/100, postProcessing/cutPlaneSurface/200 and postProcessing/cutPlaneSurface/285 from the case in the previous section.

If the user wishes to read a collection of files into ParaView, e.g. from time directories within the cutPlaneSurface directory, it would be a somewhat laborious job. In addition, ParaView would see no connection between the files and that they form a sequence. Without sequencing it is then not possible to create an animation from the files (without some manual effort).

The foamVTKSeries script overcomes this challenge quickly and easily. The user simply needs to run the script as follows.

  
    foamVTKSeries

The script interrogates the contents of the postProcessing directory and creates a VTK series file, with extension .vtk.series for each collection of files it encounters. In the cutPlaneSurface example, foamVTKSeries would create a file named U\_zNormal.vtk.series in the postProcessing/cutPlaneSurface directory. From ParaView, the user can then load the series of files by going to File->Open and selecting the U\_zNormal.vtk.series file. The files appear in the Pipeline Browser as a single entity, with each file selectable by changing time in the Time selector.

OpenFOAM v13 User Guide - 7.4 Sampling and monitoring data

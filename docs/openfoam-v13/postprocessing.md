---
source: https://doc.cfd.direct/openfoam/user-guide-v13/postprocessing
title: OpenFOAM v13 User Guide - Chapter 7 Post-processing
slug: postprocessing
---
### How do I post-process cases in OpenFOAM?

CFD Direct's OpenFOAM Training extensively covers post-processing in OpenFOAM

[See Training](https://cfd.direct/openfoam-training "See Training")

\[**version 13**\]\[[version 12](../user-guide-v12)\]\[[version 11](../user-guide-v11)\]\[[version 10](../user-guide-v10)\]\[[version 9](../user-guide-v9)\]\[[version 8](../user-guide-v8)\]\[[version 7](../user-guide-v7)\]\[[version 6](../user-guide-v6)\]

\[[table of contents](contents)\]\[[previous topic](derived-boundary-conditions)\]\[[next topic](paraview)\]\[[index](bookindex)\]

## Chapter 7 Post-processing

This chapter describes options for post-processing with OpenFOAM. Post-processing in its most general sense involves data processing (processing results) and visualisation. The functionality for data processing is described in sections [7.2](post-processing-cli#x40-2150007.2) , [7.3](post-processing-functionality#x41-2180007.3) and [7.4](graphs-monitoring#x42-2360007.4) . For visualisation, OpenFOAM relies on ParaView, a third-party open source application described in the example cases in chapter [2](tutorials#x4-30002), with some additional information provided in the following section [7.1](paraview#x39-2040007.1) . Other methods of visualisation using third party software are described in section [7.5](post-processing-third-party#x43-2420007.5) .

 7.1 [ParaView/paraFoam graphical user interface (GUI)](paraview#x39-2040007.1)  
  7.1.1 [Overview of ParaView/paraFoam](paraview#x39-2050007.1.1)  
  7.1.2 [The Parameters panel](paraview#x39-2060007.1.2)  
  7.1.3 [The Display panel](paraview#x39-2070007.1.3)  
  7.1.4 [The button toolbars](paraview#x39-2080007.1.4)  
  7.1.5 [Manipulating the view](paraview#x39-2090007.1.5)  
  7.1.6 [Contour plots](paraview#x39-2100007.1.6)  
  7.1.7 [Vector plots](paraview#x39-2110007.1.7)  
  7.1.8 [Streamlines](paraview#x39-2120007.1.8)  
  7.1.9 [Image output](paraview#x39-2130007.1.9)  
  7.1.10 [Animation output](paraview#x39-2140007.1.10)  
 7.2 [Post-processing command line interface (CLI)](post-processing-cli#x40-2150007.2)  
  7.2.1 [Run-time data processing](post-processing-cli#x40-2160007.2.1)  
  7.2.2 [The foamPostProcess utility](post-processing-cli#x40-2170007.2.2)  
 7.3 [Post-processing functionality](post-processing-functionality#x41-2180007.3)  
  7.3.1 [Field calculation](post-processing-functionality#x41-2190007.3.1)  
  7.3.2 [Field operations](post-processing-functionality#x41-2200007.3.2)  
  7.3.3 [Forces and force coefficients](post-processing-functionality#x41-2210007.3.3)  
  7.3.4 [Sampling for graph plotting](post-processing-functionality#x41-2220007.3.4)  
  7.3.5 [Lagrangian data](post-processing-functionality#x41-2230007.3.5)  
  7.3.6 [Volume fields](post-processing-functionality#x41-2240007.3.6)  
  7.3.7 [Numerical data](post-processing-functionality#x41-2250007.3.7)  
  7.3.8 [Control](post-processing-functionality#x41-2260007.3.8)  
  7.3.9 [Pressure tools](post-processing-functionality#x41-2270007.3.9)  
  7.3.10 [Combustion and chemistry](post-processing-functionality#x41-2280007.3.10)  
  7.3.11 [Multiphase](post-processing-functionality#x41-2290007.3.11)  
  7.3.12 [Probes](post-processing-functionality#x41-2300007.3.12)  
  7.3.13 [Surface fields](post-processing-functionality#x41-2310007.3.13)  
  7.3.14 [Meshing](post-processing-functionality#x41-2320007.3.14)  
  7.3.15 [‘Pluggable’ solvers](post-processing-functionality#x41-2330007.3.15)  
  7.3.16 [Sampling surfaces](post-processing-functionality#x41-2340007.3.16)  
  7.3.17 [Streamlines](post-processing-functionality#x41-2350007.3.17)  
 7.4 [Sampling and monitoring data](graphs-monitoring#x42-2360007.4)  
  7.4.1 [Probing data](graphs-monitoring#x42-2370007.4.1)  
  7.4.2 [Sampling for graphs](graphs-monitoring#x42-2380007.4.2)  
  7.4.3 [Live monitoring of data](graphs-monitoring#x42-2390007.4.3)  
  7.4.4 [Sampling for visualisation](graphs-monitoring#x42-2400007.4.4)  
  7.4.5 [The foamVTKSeries script](graphs-monitoring#x42-2410007.4.5)  
 7.5 [Third-Party post-processing](post-processing-third-party#x43-2420007.5)  
  7.5.1 [Post-processing with Ensight](post-processing-third-party#x43-2430007.5.1)

OpenFOAM v13 User Guide - Chapter 7 Post-processing

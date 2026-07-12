---
source: https://doc.cfd.direct/openfoam/user-guide-v13/post-processing-third-party
title: OpenFOAM v13 User Guide - 7.5 Third-Party post-processing
slug: post-processing-third-party
---
### How do I export OpenFOAM data to third-party tools?

CFD Direct's experts demonstrate exporting OpenFOAM data to third-party tools

[See Training](https://cfd.direct/openfoam-training "See Training")

\[**version 13**\]\[[version 12](../user-guide-v12)\]\[[version 11](../user-guide-v11)\]\[[version 10](../user-guide-v10)\]\[[version 9](../user-guide-v9)\]\[[version 8](../user-guide-v8)\]\[[version 7](../user-guide-v7)\]\[[version 6](../user-guide-v6)\]

\[[chapter contents](postprocessing)\]\[[previous topic](graphs-monitoring)\]\[[next topic](models)\]\[[index](bookindex)\]

## 7.5 Third-Party post-processing

OpenFOAM includes the following applications for converting data to formats for post-processing with several third-party tools. For EnSight, it additionally includes a reader module, described in the next section.

  
foamDataToFluent

Translates OpenFOAM data to Fluent format.

  
foamToEnsight

Translates OpenFOAM data to EnSight format.

  
foamToEnsightParts

Translates OpenFOAM data to Ensight format. An Ensight part is created for each cellZone and patch.

  
foamToGMV

Translates foam output to GMV readable files.

  
foamToTetDualMesh

Converts polyMesh results to tetDualMesh.

  
foamToVTK

Legacy VTK file format writer.

  
smapToFoam

Translates a STAR-CD SMAP data file into OpenFOAM field format.

### 7.5.1 Post-processing with Ensight

OpenFOAM offers the capability for post-processing OpenFOAM cases with EnSight, with a choice of 2 options:

-   converting the OpenFOAM data to EnSight format with the foamToEnsight utility;
    
-   reading the OpenFOAM data directly into EnSight using the ensight74FoamExec module.
    

The foamToEnsight utility converts data from OpenFOAM to EnSight file format. For a given case, foamToEnsight is executed like any normal application. foamToEnsight creates a directory named Ensight in the case directory, deleting any existing Ensight directory in the process. The converter reads the data in all time directories and writes into a case file and a set of data files. The case file is named EnSight\_Case and contains details of the data file names. Each data file has a name of the form EnSight\_nn.ext, where nn is an incremental counter starting from 1 for the first time directory, 2 for the second and so on and ext is a file extension of the name of the field that the data refers to, as described in the case file, e.g.T for temperature, mesh for the mesh. Once converted, the data can be read into EnSight by the normal means:

1.  from the EnSight GUI, the user should select Data (Reader) from the File menu;
    
2.  the appropriate EnSight\_Case file should be highlighted in the Files box;
    
3.  the Format selector should be set to Case, the EnSight default setting;
    
4.  the user should click (Set) Case and Okay.
    

EnSight provides the capability of using a user-defined module to read data from a format other than the standard EnSight format. OpenFOAM includes its own reader module ensightFoamReader that is compiled into a library named libuserd-foam. It is this library that EnSight needs to use which means that it must be able to locate it on the filing system as described in the following section.

In order to run the EnSight reader, it is necessary to set some environment variables correctly. The settings are made in the bashrc (or cshrc) file in the $WM\_PROJECT\_DIR/etc/apps/ensightFoam directory. The environment variables associated with EnSight are prefixed by $CEI\_ or $ENSIGHT7\_ and listed in Table [7.1](#x43-2430191). With a standard user setup, only $CEI\_HOME may need to be set manually, to the path of the EnSight installation.

* * *

 

Environment variable

Description and options

* * *

* * *

$CEI\_HOME

Path where EnSight is installed, eg /usr/local/ensight, added to the system path by default

$CEI\_ARCH

Machine architecture, from a choice of names corresponding to the machine directory names in $CEI\_HOME/ensight74/machines; default settings include linux\_2.4 and sgi\_6.5\_n32

$ENSIGHT7\_READER

Path that EnSight searches for the user defined libuserd-foam reader library, set by default to $FOAM\_LIBBIN

$ENSIGHT7\_INPUT

Set by default to dummy

* * *

* * *

  

Table 7.1: Environment variable settings for EnSight.

* * *

The principal difficulty in using the EnSight reader lies in the fact that EnSight expects that a case to be defined by the contents of a particular file, rather than a directory as it is in OpenFOAM. Therefore in following the instructions for the using the reader below, the user should pay particular attention to the details of case selection, since EnSight does not permit selection of a directory name.

1.  from the EnSight GUI, the user should select Data (Reader) from the File menu;
    
2.  The user should now be able to select the OpenFOAM from the Format menu; if not, there is a problem with the configuration described above.
    
3.  The user should find their case directory from the File Selection window, highlight one of top 2 entries in the Directories box ending in /. or /.. and click (Set) Geometry.
    
4.  The path field should now contain an entry for the case. The (Set) Geometry text box should contain a ‘/’.
    
5.  The user may now click Okay and EnSight will begin reading the data.
    
6.  When the data is read, a new Data Part Loader window will appear, asking which part(s) are to be read. The user should select Load all.
    
7.  When the mesh is displayed in the EnSight window the user should close the Data Part Loader window, since some features of EnSight will not work with this window open.
    

OpenFOAM v13 User Guide - 7.5 Third-Party post-processing

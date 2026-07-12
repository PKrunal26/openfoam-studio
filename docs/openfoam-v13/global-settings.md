---
source: https://doc.cfd.direct/openfoam/user-guide-v13/global-settings
title: OpenFOAM v13 User Guide - 4.3 Global controls
slug: global-settings
---
### Where are the global settings for OpenFOAM?

CFD Direct's experts explain the global settings in their OpenFOAM Training

[See Training](https://cfd.direct/openfoam-training "See Training")

\[**version 13**\]\[[version 12](../user-guide-v12)\]\[[version 11](../user-guide-v11)\]\[[version 10](../user-guide-v10)\]\[[version 9](../user-guide-v9)\]\[[version 8](../user-guide-v8)\]\[[version 7](../user-guide-v7)\]\[[version 6](../user-guide-v6)\]

\[[chapter contents](cases)\]\[[previous topic](basic-file-format)\]\[[next topic](controldict)\]\[[index](bookindex)\]

## 4.3 Global controls

OpenFOAM includes a large number of global parameters that are configured by default in a file named controlDict. This is the so-called “global” controlDict file, as opposed to a case controlDict file that is described in the following section.

The global controlDict file can be found in the installation within a directory named etc, represented by the environment variable $FOAM\_ETC. The file contains sub-dictionaries for the following items.

-   Documentation: for opening documentation in a web browser.
    
-   InfoSwitches: controls information printed to standard output, i.e. the terminal.
    
-   OptimisationSwitches: for parallel communication and I/O, see section [3.4.2](running-applications-parallel#x12-640003.4.2) .
    
-   DebugSwitches: messaging switches to help debug code failures, as described in section [3.2.11](compiling-applications#x10-590003.2.11) .
    
-   DimensionedConstants: defines fundamental physical constants, e.g. Boltzmann’s Constant.
    
-   UnitConversions: defines units and conversion factors, e.g. cal for calorie, see section [4.2.7](basic-file-format#x18-1000004.2.7) .
    

### 4.3.1 Overriding global controls

The values of the DimensionedConstants depend on the unit system being adopted, i.e. the International System of Units (SI units), or US Customary system (USCS), based on English units (pounds, feet, etc.). The default system is naturally SI, but some users may wish to override this with USCS units, either globally or for a specific case. The system is set through the unitSet keyword, i.e. 

DimensionedConstants

{

  unitSet  SI; // USCS

}
   

While a user could modify this setting in the etc/controlDict file in the installation, it is better practice to use a file in their user directory. OpenFOAM provides a set of directory locations, where global configuration files can be included, which it looks up in an order of precedence. To list the locations, simply run the following command.

  
    foamEtcFile -list

The listed locations include a local $HOME/.OpenFOAM directory and follow a descending order of precedence, i.e. the last location listed (etc) is lowest precedence.

If a user therefore wished to work permanently in USCS units, they could maintain a controlDict file in their $HOME/.OpenFOAM directory that includes the following entry.

DimensionedConstants

{

  unitSet  USCS;

}
   

OpenFOAM would read the unitSet entry from this file, but read all other controlDict keyword entries from the global controlDict file.

Alternatively, if a user wished to work on a single case in USCS units, they could add the same entry into the controlDict file in the system directory for their case. This file is discussed in the next section.

OpenFOAM v13 User Guide - 4.3 Global controls

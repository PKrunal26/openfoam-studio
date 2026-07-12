---
source: https://doc.cfd.direct/openfoam/user-guide-v13/running-applications
title: OpenFOAM v13 User Guide - 3.3 Running applications
slug: running-applications
---
### How are applications run in OpenFOAM?

CFD Direct's OpenFOAM Training explains how to run applications in OpenFOAM

[See Training](https://cfd.direct/openfoam-training "See Training")

\[**version 13**\]\[[version 12](../user-guide-v12)\]\[[version 11](../user-guide-v11)\]\[[version 10](../user-guide-v10)\]\[[version 9](../user-guide-v9)\]\[[version 8](../user-guide-v8)\]\[[version 7](../user-guide-v7)\]\[[version 6](../user-guide-v6)\]

\[[chapter contents](applications)\]\[[previous topic](compiling-applications)\]\[[next topic](running-applications-parallel)\]\[[index](bookindex)\]

## 3.3 Running applications

Each application is designed to be executed from a terminal command line, typically reading and writing a set of data files associated with a particular case. The data files for a case are stored in a directory named after the case as described in section [4.1](case-file-structure#x17-920004.1) ; the directory name with full path is here given the generic name <caseDir\>.

For any application, the form of the command line entry for any can be found by simply entering the application name at the command line with the \-help option, e.g. typing

  
    foamRun -help

returns the usage

  
    Usage: foamRun \[OPTIONS\]  
    options:  
      -case <dir>       specify alternate case directory, default is cwd  
      -fileHandler <handler>  
                        override the fileHandler  
      -hostRoots <((host1 dir1) .. (hostN dirN))>  
                        slave root directories for distributed running  
      -libs '("lib1.so" ... "libN.so")'  
                        pre-load libraries  
      -noFunctionObjects  
                        do not execute functionObjects  
      -parallel         run in parallel  
      -roots <(dir1 .. dirN)>  
                        slave root directories for distributed running  
      -solver <name>    Solver name  
      -srcDoc           display source code in browser  
      -doc              display application documentation in browser  
      -help             print the usage

If the application is executed from within a case directory, it will operate on that case. Alternatively, the \-case <caseDir\> option allows the case to be specified directly so that the application can be executed from anywhere in the filing system.

Like any UNIX/Linux executable, applications can be run as a background process, i.e. one which does not have to be completed before the user can give the shell additional commands. If the user wished to run the foamRun example as a background process and output the case progress to a log file, they could enter:

  
    foamRun > log &

OpenFOAM v13 User Guide - 3.3 Running applications

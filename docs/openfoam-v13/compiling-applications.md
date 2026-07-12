---
source: https://doc.cfd.direct/openfoam/user-guide-v13/compiling-applications
title: OpenFOAM v13 User Guide - 3.2 Compiling applications and libraries
slug: compiling-applications
---
### How is code compiled in OpenFOAM?

CFD Direct's Programming CFD course shows how to compile OpenFOAM code

[Programming CFD](https://cfd.direct/openfoam-training/programming-cfd "Programming CFD")

\[**version 13**\]\[[version 12](../user-guide-v12)\]\[[version 11](../user-guide-v11)\]\[[version 10](../user-guide-v10)\]\[[version 9](../user-guide-v9)\]\[[version 8](../user-guide-v8)\]\[[version 7](../user-guide-v7)\]\[[version 6](../user-guide-v6)\]

\[[chapter contents](applications)\]\[[previous topic](programming-language-openfoam)\]\[[next topic](running-applications)\]\[[index](bookindex)\]

## 3.2 Compiling applications and libraries

Compilation is an integral part of code development that requires careful management since every piece of code requires its own set instructions to access dependent components of the OpenFOAM library. In Linux systems there are various tools to help automate the management process, starting with the standard make utility. OpenFOAM uses its own wmake compilation script that is based on make. It is specifically designed for the large number of individual components that are compiled separately in OpenFOAM (approximately 150 applications and 150 libraries).

To understand the compilation process, we first need to explain certain aspects of C++ and its file structure, shown schematically in Figure [3.1](#x10-480071) . A class is defined through a set of instructions such as object construction, data storage and class member functions. The file that defines these functions — the class definition — takes a .C extension, e.g. a class nc would be written in the file nc.C. This file can be compiled independently of other code into a binary executable library file known as a shared object library with the .so file extension, i.e.nc.so. When compiling a piece of code, say newApp.C, that uses the nc class, nc.C need not be recompiled, rather newApp.C calls the nc.so library at runtime. This is known as dynamic linking.

* * *

![ Main code nc class newApp.C Header file nc.H #include "nc.H" -I option int main( ) Declaration... { ... ... nc.C return (0); #include "nc.H " } Definition... Compiled Compiled newApp Linked nc.so Executable - l option Library \\relax \\special {t4ht=](img/index220x.png)

  

Figure 3.1: Header files, source files, compilation and linking

* * *

### 3.2.1 Header .H files

As a means of checking errors, the piece of code being compiled must know that the classes it uses and the operations they perform actually exist. Therefore each class requires a class declaration, contained in a header file with a .H file extension, e.g. nc.H, that includes the names of the class and its functions. This file is included at the beginning of any piece of code using the class, using the #include directive described below, including the class declaration code itself. Any piece of .C code can resource any number of classes and must begin by including all the .H files required to declare these classes. Those classes in turn can resource other classes and so also begin by including the relevant .H files. By searching recursively down the class hierarchy we can produce a complete list of header files for all the classes on which the top level .C code ultimately depends; these .H files are known as the dependencies. With a dependency list, a compiler can check whether the source files have been updated since their last compilation and selectively compile only those that need to be.

Header files are included in the code using the #include directive, e.g.

  
    #include "otherHeader.H";

This causes the compiler to suspend reading from the current file, to read the included file. This mechanism allows any self-contained piece of code to be put into a header file and included at the relevant location in the main code in order to improve code readability. For example, in most OpenFOAM applications the code for creating fields and reading field input data is included in a file createFields.H which is called at the beginning of the code. In this way, header files are not solely used as class declarations.

It is wmake that performs the task of maintaining file dependency lists amongst other functions listed below.

-   Automatic generation and maintenance of file dependency lists, i.e. lists of files which are included in the source files and hence on which they depend.
    
-   Multi-platform compilation and linkage, handled through appropriate directory structure.
    
-   Multi-language compilation and linkage, e.g. C, C++, Java.
    
-   Multi-option compilation and linkage, e.g. debug, optimised, parallel and profiling.
    
-   Support for source code generation programs, e.g. lex, yacc, IDL, MOC.
    
-   Simple syntax for source file lists.
    
-   Automatic creation of source file lists for new codes.
    
-   Simple handling of multiple shared or static libraries.
    

### 3.2.2 Compiling with wmake

OpenFOAM applications are organised using a standard convention that the source code of each application is placed in a directory whose name is that of the application. The top level source file then takes the application name with the .C extension. For example, the source code for an application called newApp would reside is a directory newApp and the top level file would be newApp.C as shown in Figure [3.2](#x10-500012) .

* * *

![ newApp newApp.C otherHeader.H Make files options \\relax \\special {t4ht=](img/index221x.png)

  

Figure 3.2: Directory structure for an application

* * *

wmake then requires the directory must contain a Make subdirectory containing 2 files, options and files, that are described in the following sections.

### 3.2.3 Including headers

The compiler searches for the included header files in the following order, specified with the \-I option in wmake:

1.  the $WM\_PROJECT\_DIR/src/OpenFOAM/lnInclude directory;
    
2.  a local lnInclude directory, i.e.newApp/lnInclude;
    
3.  the local directory, i.e.newApp;
    
4.  platform dependent paths set in files in the $WM\_PROJECT\_DIR/wmake/rules directory, e.g./usr/include/X11;
    
5.  other directories specified explicitly in the Make/options file with the \-I option.
    

The Make/options file contains the full directory paths to locate header files using the syntax:

  
    EXE\_INC = \\  
        -I<directoryPath1\> \\  
        -I<directoryPath2\> \\  
        …                \\  
        -I<directoryPathN\>

Notice first that the directory names are preceded by the \-I flag and that the syntax uses the \\ to continue the EXE\_INC across several lines, with no \\ after the final entry.

### 3.2.4 Linking to libraries

The compiler links to shared object library files in the following directory paths, specified with the \-L option in wmake:

1.  the $FOAM\_LIBBIN directory;
    
2.  platform dependent paths set in files in the $WM\_DIR/rules directory, e.g.$(MPI\_ARCH\_PATH)/lib;
    
3.  other directories specified in the Make/options file.
    

The actual library files to be linked must be specified using the \-l option and removing the lib prefix and .so extension from the library file name, e.g. libnew.so is included with the flag \-lnew. By default, wmake loads the following libraries:

1.  the libOpenFOAM.so library from the $FOAM\_LIBBIN directory;
    
2.  platform dependent libraries specified in set in files in the $WM\_DIR/rules directory, e.g. libm.so and libdl.so;
    
3.  other libraries specified in the Make/options file.
    

The Make/options file contains the full directory paths and library names using the syntax:

  
    EXE\_LIBS = \\  
        -L<libraryPath\> \\  
        -l<library1\>     \\  
        -l<library2\>     \\  
        …               \\  
        -l<libraryN\>

To summarise: the directory paths are preceded by the \-L flag, the library names are preceded by the \-l flag.

### 3.2.5 Source files to be compiled

The compiler requires a list of .C source files that must be compiled. The list must contain the main .C file but also any other source files that are created for the specific application but are not included in a class library. For example, users may create a new class or some new functionality to an existing class for a particular application. The full list of .C source files must be included in the Make/files file. For many applications the list only includes the name of the main .C file, e.g. newApp.C in the case of our earlier example.

The Make/files file also includes a full path and name of the compiled executable, specified by the EXE = syntax. Standard convention stipulates the name is that of the application, i.e.newApp in our example. The OpenFOAM release offers two useful choices for path: standard release applications are stored in $FOAM\_APPBIN; applications developed by the user are stored in $FOAM\_USER\_APPBIN.

If the user is developing their own applications, we recommend they create an applications subdirectory in their $WM\_PROJECT\_USER\_DIR directory containing the source code for personal OpenFOAM applications. As with standard applications, the source code for each OpenFOAM application should be stored within its own directory. The only difference between a user application and one from the standard release is that the Make/files file should specify that the user’s executables are written into their $FOAM\_USER\_APPBIN directory. The Make/files file for our example would appear as follows:

  
    newApp.C  
  
    EXE = $(FOAM\_USER\_APPBIN)/newApp

### 3.2.6 Running wmake

The wmake script is generally executed by typing:

  
    wmake <optionalDirectory\>

The <optionalDirectory\> is the directory path of the application that is being compiled. Typically, wmake is executed from within the directory of the application being compiled, in which case <optionalDirectory\> can be omitted.

### 3.2.7 wmake environment variables

For information, the general environment variable settings used by wmake are listed below.

-   $WM\_PROJECT\_INST\_DIR: full path to the installation directory, e.g.$HOME/OpenFOAM.
    
-   $WM\_PROJECT: name of the project being compiled, i.e. OpenFOAM.
    
-   $WM\_PROJECT\_VERSION: version of the project being compiled, i.e. 13.
    
-   $WM\_PROJECT\_DIR: full path to the main directory of the OpenFOAM release, e.g. $HOME/OpenFOAM/OpenFOAM-13.
    
-   $WM\_PROJECT\_USER\_DIR: full path to the equivalent directory for customised developments in the user account, e.g. $HOME/OpenFOAM/${USER}\-13.
    
-   $WM\_THIRD\_PARTY\_DIR: full path to the directory of ThirdParty software, e.g. $HOME/OpenFOAM/ThirdParty-13.
    

The environment variable settings for the compilation with wmake are listed below.

-   $WM\_ARCH: machine architecture, e.g. linux, linux64, linuxArm64, linuxARM7, linuxPPC64, linuxPPC64le.
    
-   $WM\_ARCH\_OPTION: 32 or 64 bit architecture.
    
-   $WM\_DIR: full path of the wmake directory.
    
-   $WM\_LABEL\_SIZE: 32 or 64 bit size for labels (integers).
    
-   $WM\_LABEL\_OPTION: Int32 or Int64 compilation of labels.
    
-   $WM\_LINK\_LANGUAGE: compiler used to link libraries and executables c++.
    
-   $WM\_MPLIB: parallel communications library, SYSTEMOPENMPI = system version of openMPI, alternatives include OPENMPI, SYSTEMMPI, MPICH, MPICH-GM, HPMPI, MPI, QSMPI, INTELMPI and SGIMPI.
    
-   $WM\_OPTIONS, e.g. linux64GccDPInt32Opt, formed by combining $WM\_ARCH, $WM\_COMPILER, $WM\_PRECISION\_OPTION, $WM\_LABEL\_OPTION, and $WM\_COMPILE\_OPTION.
    
-   $WM\_PRECISION\_OPTION: floating point precision of the compiled binares, SP = single precision, DP = double precision.
    

The environment variable settings relating to the choice of compiler and options withwmake are listed below.

-   $WM\_CC: choice of C compiler, gcc.
    
-   $WM\_CFLAGS: extra flags to the C compiler, e.g. \-m64 -fPIC.
    
-   $WM\_CXX: choice of C++ compiler, g++.
    
-   $WM\_CXXFLAGS: extra flags to the C++ compiler, e.g. \-m64 -fPIC \-std=c++0x.
    
-   $WM\_COMPILER: compiler being used, e.g. Gcc = gcc, Clang = LLVM Clang
    
-   $WM\_COMPILE\_OPTION: compilation option, Debug = debugging, Opt = optimised.
    
-   $WM\_COMPILER\_LIB\_ARCH: compiler library architecture, e.g. 64.
    
-   $WM\_COMPILER\_TYPE: choice of compiler, system, or ThirdParty, i.e. compiled in ThirdParty directory.
    
-   $WM\_LDFLAGS: extra flags for the linker, e.g. \-m64.
    
-   $WM\_LINK\_LANGUAGE: linker language, e.g. c++.
    
-   $WM\_OSTYPE: Operating system, POSIX.
    

### 3.2.8 Removing dependency lists: wclean

When it is run, wmake builds a dependency list file with a .dep file extension, e.g. newApp.C.dep in our example, in a $WM\_OPTIONS sub-directory of the Make directory, e.g. Make/linuxGccDPInt64Opt. If the user wishes to remove these files, e.g. after making code changes, the user can run the wclean script by typing:

  
    wclean <optionalDirectory\>

Again, the <optionalDirectory\> is a path to the directory of the application that is being compiled. Typically, wclean is executed from within the directory of the application, in which case the path can be omitted.

### 3.2.9 Compiling libraries

When compiling a library, there are 2 critical differences in the configuration of the file in the Make directory:

-   in the files file, EXE = is replaced by LIB = and the target directory for the compiled entity changes from $FOAM\_APPBIN to $FOAM\_LIBBIN (and an equivalent $FOAM\_USER\_LIBBIN directory);
    
-   in the options file, EXE\_LIBS = is replaced by LIB\_LIBS = to indicate libraries linked to library being compiled.
    

When wmake is executed it additionally creates a directory named lnInclude that contains soft links to all the files in the library. The lnInclude directory is deleted by the wclean script when cleaning library source code.

### 3.2.10 Compilation example: the foamRun application

The source code for application foamRun is in the $FOAM\_SOLVERS/foamRun directory and the top level source file is named foamRun.C. The foamRun.C source code is:

1/\*---------------------------------------------------------------------------\*\\

2  =========  |

3  \\\\  /  F ield  | OpenFOAM: The Open Source CFD Toolbox

4  \\\\  /  O peration  | Website:  https://openfoam.org

5  \\\\  /  A nd  | Copyright (C) 2022-2025 OpenFOAM Foundation

6  \\\\/  M anipulation  |

7\-------------------------------------------------------------------------------

8License

9  This file is part of OpenFOAM.

10

11  OpenFOAM is free software: you can redistribute it and/or modify it

12  under the terms of the GNU General Public License as published by

13  the Free Software Foundation, either version 3 of the License, or

14  (at your option) any later version.

15

16  OpenFOAM is distributed in the hope that it will be useful, but WITHOUT

17  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or

18  FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public License

19  for more details.

20

21  You should have received a copy of the GNU General Public License

22  along with OpenFOAM.  If not, see <http://www.gnu.org/licenses/>.

23

24Application

25  foamRun

26

27Description

28  Loads and executes an OpenFOAM solver module either specified by the

29  optional \\c solver entry in the \\c controlDict or as a command-line

30  argument.

31

32  Uses the flexible PIMPLE (PISO-SIMPLE) solution for time-resolved and

33  pseudo-transient and steady simulations.

34

35Usage

36  \\b foamRun \[OPTION\]

37

38  - \\par -solver <name>

39  Solver name

40

41  - \\par -libs '(\\"lib1.so\\" ... \\"libN.so\\")'

42  Specify the additional libraries loaded

43

44  Example usage:

45  - To run a \\c rhoPimpleFoam case by specifying the solver on the

46  command line:

47  \\verbatim

48  foamRun -solver fluid

49  \\endverbatim

50

51  - To update and run a \\c rhoPimpleFoam case add the following entry to

52  the controlDict:

53  \\verbatim

54  solver  fluid;

55  \\endverbatim

56  then execute \\c foamRun

57

58\\\*---------------------------------------------------------------------------\*/

59

60#include "argList.H"

61#include "solver.H"

62#include "pimpleSingleRegionControl.H"

63#include "setDeltaT.H"

64

65using namespace Foam;

66

67// \* \* \* \* \* \* \* \* \* \* \* \* \* \* \* \* \* \* \* \* \* \* \* \* \* \* \* \* \* \* \* \* \* \* \* \* \* //

68

69int main(int argc, char \*argv\[\])

70{

71  argList::addOption

72  (

73  "solver",

74  "name",

75  "Solver name"

76  );

77

78  #include "setRootCase.H"

79  #include "createTime.H"

80

81  // Read the solverName from the optional solver entry in controlDict

82  word solverName

83  (

84  runTime.controlDict().lookupOrDefault("solver", word::null)

85  );

86

87  // Optionally reset the solver name from the -solver command-line argument

88  args.optionReadIfPresent("solver", solverName);

89

90  // Check the solverName has been set

91  if (solverName == word::null)

92  {

93  args.printUsage();

94

95  FatalErrorIn(args.executable())

96  << "solver not specified in the controlDict or on the command-line"

97  << exit(FatalError);

98  }

99  else

100  {

101  // Load the solver library

102  solver::load(solverName);

103  }

104

105  // Create the default single region mesh

106  #include "createMesh.H"

107

108  // Instantiate the selected solver

109  autoPtr<solver> solverPtr(solver::New(solverName, mesh));

110  solver& solver = solverPtr();

111

112  // Create the outer PIMPLE loop and control structure

113  pimpleSingleRegionControl pimple(solver.pimple);

114

115  // Set the initial time-step

116  setDeltaT(runTime, solver);

117

118  // \* \* \* \* \* \* \* \* \* \* \* \* \* \* \* \* \* \* \* \* \* \* \* \* \* \* \* \* \* \* \* \* \* \* \* //

119

120  Info<< nl << "Starting time loop\\n" << endl;

121

122  while (pimple.run(runTime))

123  {

124  solver.preSolve();

125

126  // Adjust the time-step according to the solver maxDeltaT

127  adjustDeltaT(runTime, solver);

128

129  runTime++;

130

131  Info<< "Time = " << runTime.userTimeName() << nl << endl;

132

133  // PIMPLE corrector loop

134  while (pimple.loop())

135  {

136  if (solver.pimple.flow())

137  {

138  solver.moveMesh();

139  solver.motionCorrector();

140  }

141

142  if (solver.pimple.models())

143  {

144  solver.fvModels().correct();

145  }

146

147  solver.prePredictor();

148

149  if (solver.pimple.predictTransport())

150  {

151  if (solver.pimple.flow())

152  {

153  solver.momentumTransportPredictor();

154  }

155

156  if (solver.pimple.thermophysics())

157  {

158  solver.thermophysicalTransportPredictor();

159  }

160  }

161

162  if (solver.pimple.flow())

163  {

164  solver.momentumPredictor();

165  }

166

167  if (solver.pimple.thermophysics())

168  {

169  solver.thermophysicalPredictor();

170  }

171

172  if (solver.pimple.flow())

173  {

174  solver.pressureCorrector();

175  }

176

177  if (solver.pimple.correctTransport())

178  {

179  if (solver.pimple.flow())

180  {

181  solver.momentumTransportCorrector();

182  }

183

184  if (solver.pimple.thermophysics())

185  {

186  solver.thermophysicalTransportCorrector();

187  }

188  }

189  }

190

191  solver.postSolve();

192

193  runTime.write();

194

195  Info<< "ExecutionTime = " << runTime.elapsedCpuTime() << " s"

196  << "  ClockTime = " << runTime.elapsedClockTime() << " s"

197  << nl << endl;

198  }

199

200  Info<< "End\\n" << endl;

201

202  return 0;

203}

204

205

206// \*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\* //
   

The code begins with a description of the application contained within comments over 1 line (//) and multiple lines (/\*…\*/). Following that, the code contains several \# include statements, e.g. \# include "argList.H", which causes the compiler to suspend reading from the current file, foamRun.C to read the argList.H file.

foamRun uses the finite volume numerics library and therefore requires the necessary header files, specified by the EXE\_INC = -I… option, and links to the libraries with the EXE\_LIBS = -l… option. The Make/options therefore contains the following:

1EXE\_INC = \\

2  -I$(LIB\_SRC)/finiteVolume/lnInclude

3

4EXE\_LIBS = \\

5  -lfiniteVolume
   

foamRun contains the foamRun.C source and the executable is written to the $FOAM\_APPBIN directory. The application uses functions to initialise and adjust the time step, defined in the setDeltaT.C file. The Make/files therefore contains:

1setDeltaT.C

2foamRun.C

3

4EXE = $(FOAM\_APPBIN)/foamRun
   

Following the recommendations of section [3.2.5](#x10-530003.2.5) , the user can compile a separate version of foamRun into their local $FOAM\_USER\_DIR directory as follows. First, the user should copy the foamRun source code to a local directory, e.g. $FOAM\_RUN.

  
    cd $FOAM\_RUN  
    cp -r $FOAM\_SOLVERS/foamRun .

They should then go into the foamRun directory.

  
    cd foamRun

and edit the Make/files file as follows:

1foamRun.C

2

3EXE = $(FOAM\_USER\_APPBIN)/foamRun
   

Finally, they should run the wmake script.

  
    wmake

The code should compile and produce a message similar to the following

  
    Making dependency list for source file foamRun.C  
    g++ -std=c++14 -m64…  
    …  
    -o ... platforms/linux64GccDPInt32Opt/bin/foamRun

If the user tries recompiling without making any changes to the code file, nothing will happen. The user can compile the application from scratch by removing the dependency list with

  
    wclean

and running wmake.

### 3.2.11 Debug messaging and optimisation switches

OpenFOAM provides a system of messaging that is written during runtime, most of which are to help debugging problems encountered during running of a OpenFOAM case. The switches are listed in the $WM\_PROJECT\_DIR/etc/controlDict file; should the user wish to change the settings they should make a copy to their $HOME directory, i.e. $HOME/.OpenFOAM/13/controlDict file (see section [4.3](global-settings#x19-1110004.3) for more information). The list of possible switches is extensive, relating to a class or range of functionality, and can be switched on by their inclusion in the controlDict file, and by being set to 1. For example, OpenFOAM can perform the checking of dimensional units in all calculations by setting the dimensionSet switch to 1.

A small number of switches control messaging at three levels, 0, 1 and 2, most notably the overall level switch and lduMatrix which provides messaging for solver convergence during a run.

There are some switches that control certain operational and optimisation issues. Of particular importance is fileModificationSkew. OpenFOAM scans the write time of data files to check for modification. When running over a NFS with some disparity in the clock settings on different machines, field data files appear to be modified ahead of time. This can cause a problem if OpenFOAM views the files as newly modified and attempting to re-read this data. The fileModificationSkew keyword is the time in seconds that OpenFOAM will subtract from the file write time when assessing whether the file has been newly modified. The main optimisation switches are listed below:

-   fileModificationSkew: a time in seconds that should be set higher than the maximum delay in NFS updates and clock difference for running OpenFOAM over a NFS.
    
-   fileModificationChecking: method of checking whether files have been modified during a simulation, either reading the timeStamp or using inotify; versions that read only master-node data also exist, termed timeStampMaster and inotifyMaster.
    
-   commsType: parallel communications type, nonBlocking, scheduled or blocking.
    
-   floatTransfer: if 1, will compact numbers to float precision before transfer; default is 0.
    
-   nProcsSimpleSum: optimises the global sum for parallel processing, by setting the number of processors above which a hierarchical sum is performed rather than a linear sum.
    

### 3.2.12 Dynamic linking at run-time

The situation may arise that a user creates a new library, say new1, and wishes the features within that library to be available across a range of applications. For example, the user may create a new boundary condition, compiled into new1, that would need to be recognised by a range of solver applications, pre- and post-processing utilities, mesh tools, etc. Under normal circumstances, the user would need to recompile every application with the new1 linked to it.

Instead there is a simple mechanism to link one or more shared object libraries dynamically at run-time in OpenFOAM. The use can simply add the optional keyword entry libs to the controlDict file for a case and enter the full names of the libraries within a list (as quoted string entries). For example, if a user wished to link the libraries new1 and new2 at run-time, they would simply need to add the following to the case controlDict file:

  
    libs  
    (  
        "libnew1.so"  
        "libnew2.so"  
    );

OpenFOAM v13 User Guide - 3.2 Compiling applications and libraries

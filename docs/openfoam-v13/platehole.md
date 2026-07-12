---
source: https://doc.cfd.direct/openfoam/user-guide-v13/platehole
title: OpenFOAM v13 User Guide - 2.3 Stress analysis of a plate with a hole
slug: platehole
---
### How do I run the OpenFOAM _plateHole_ tutorial?

CFD Direct's OpenFOAM Training describes how to run examples like the _plateHole_

[See Training](https://cfd.direct/openfoam-training "See Training")

\[**version 13**\]\[[version 12](../user-guide-v12)\]\[[version 11](../user-guide-v11)\]\[[version 10](../user-guide-v10)\]\[[version 9](../user-guide-v9)\]\[[version 8](../user-guide-v8)\]\[[version 7](../user-guide-v7)\]\[[version 6](../user-guide-v6)\]

\[[chapter contents](tutorials)\]\[[previous topic](dambreak)\]\[[next topic](applications)\]\[[index](bookindex)\]

## 2.3 Stress analysis of a plate with a hole

This tutorial describes how to pre-process, run and post-process a case involving linear-elastic, steady-state stress analysis on a square plate with a circular hole at its centre. The plate dimensions are: side length 4 ![eqn](img/index166x.png) and radius ![eqn](img/index167x.png) 0.5 ![eqn](img/index166x.png). It is loaded with a uniform traction of ![eqn](img/index169x.png) 10  ![eqn](img/index170x.png)![eqn](img/index171x.png) over its left and right faces as shown in Figure [2.20](#x7-3800320) . Two symmetry planes can be identified for this geometry and therefore the solution domain need only cover a quarter of the geometry, shown by the shaded area in Figure [2.20](#x7-3800320) .

* * *

![ y σ=10kPa σ = 10 kPa symmetry plane x R = 0.5 m symmetry plane 4.0 m \\relax \\special {t4ht=](img/index172x.png)

  

Figure 2.20: Geometry of the plate with a hole.

* * *

The problem can be approximated as 2D since the load is applied in the plane of the plate. In a Cartesian coordinate system there are two possible assumptions to take in regard to the behaviour of the structure in the third dimension: (1) the plane stress condition, in which the stress components acting out of the 2D plane are assumed to be negligible; (2) the plane strain condition, in which the strain components out of the 2D plane are assumed negligible. The plane stress condition is appropriate for solids whose third dimension is thin as in this case; the plane strain condition is applicable for solids where the third dimension is thick.

An analytical solution exists for loading of an infinitely large, thin plate with a circular hole. The solution for the stress normal to the vertical plane of symmetry is

![ ( ( ) { σ 1 + R2--+ 3R4- for |y| ≥ R (σxx )x=0 = 2y2 2y4 ( 0 for |y| < R \\relax \\special {t4ht=](img/index173x.png)

(2.7)

Results from the simulation will be compared with this solution. At the end of the tutorial, the user can: investigate the sensitivity of the solution to mesh resolution and mesh grading; and, increase the size of the plate in comparison to the hole to try to estimate the error in comparing the analytical solution for an infinite plate to the solution of this problem of a finite plate.

The example uses the solidDisplacement modular solver. The user should go to their run directory, copy the plateHole case from the $FOAM\_TUTORIALS/solidDisplacement directory and finally change into the plateHole case directory.

  
    run  
    cp -r $FOAM\_TUTORIALS/solidDisplacement/plateHole .  
    cd plateHole

### 2.3.1 Mesh generation

The domain consists of four blocks, some of which have arc-shaped edges. The block structure for the part of the mesh in the ![eqn](img/index174x.png) plane is shown in Figure [2.21](#x7-3900121). As already mentioned in section [2.1.2](backwardstep#x5-60002.1.2) , all geometries are generated in 3D in OpenFOAM even if the case is to be as a 2D problem. Therefore a dimension of the block in the ![eqn](img/index175x.png) direction has to be chosen; here, 0.5 ![eqn](img/index176x.png) is selected. It does not affect the solution since the traction boundary condition is specified as a stress rather than a force, thereby making the solution independent of the cross-sectional area. The user should open the blockMeshDict file in an editor, as listed below.

* * *

![ up 7 up 8 6 left 4 3 right x 2 9 x1 x2 left 0 4 3 x1 10 x2 x1 2 right 5 1 hole y x2 x2 x 0 x1 1 x1 down 2 down \\relax \\special {t4ht=](img/index177x.png)

  

Figure 2.21: Block structure of the mesh for the plate with a hole.

* * *

16convertToMeters 1;

17

18vertices

19(

20  (0.5 0 0)

21  (1 0 0)

22  (2 0 0)

23  (2 0.707107 0)

24  (0.707107 0.707107 0)

25  (0.353553 0.353553 0)

26  (2 2 0)

27  (0.707107 2 0)

28  (0 2 0)

29  (0 1 0)

30  (0 0.5 0)

31  (0.5 0 0.5)

32  (1 0 0.5)

33  (2 0 0.5)

34  (2 0.707107 0.5)

35  (0.707107 0.707107 0.5)

36  (0.353553 0.353553 0.5)

37  (2 2 0.5)

38  (0.707107 2 0.5)

39  (0 2 0.5)

40  (0 1 0.5)

41  (0 0.5 0.5)

42);

43

44blocks

45(

46  hex (5 4 9 10 16 15 20 21) (10 10 1) simpleGrading (1 1 1)

47  hex (0 1 4 5 11 12 15 16) (10 10 1) simpleGrading (1 1 1)

48  hex (1 2 3 4 12 13 14 15) (20 10 1) simpleGrading (1 1 1)

49  hex (4 3 6 7 15 14 17 18) (20 20 1) simpleGrading (1 1 1)

50  hex (9 4 7 8 20 15 18 19) (10 20 1) simpleGrading (1 1 1)

51);

52

53edges

54(

55  arc 0 5 (0.469846 0.17101 0)

56  arc 5 10 (0.17101 0.469846 0)

57  arc 1 4 (0.939693 0.34202 0)

58  arc 4 9 (0.34202 0.939693 0)

59  arc 11 16 (0.469846 0.17101 0.5)

60  arc 16 21 (0.17101 0.469846 0.5)

61  arc 12 15 (0.939693 0.34202 0.5)

62  arc 15 20 (0.34202 0.939693 0.5)

63);

64

65boundary

66(

67  left

68  {

69  type symmetryPlane;

70  faces

71  (

72  (8 9 20 19)

73  (9 10 21 20)

74  );

75  }

76  right

77  {

78  type patch;

79  faces

80  (

81  (2 3 14 13)

82  (3 6 17 14)

83  );

84  }

85  down

86  {

87  type symmetryPlane;

88  faces

89  (

90  (0 1 12 11)

91  (1 2 13 12)

92  );

93  }

94  up

95  {

96  type patch;

97  faces

98  (

99  (7 8 19 18)

100  (6 7 18 17)

101  );

102  }

103  hole

104  {

105  type patch;

106  faces

107  (

108  (10 5 16 21)

109  (5 0 11 16)

110  );

111  }

112  frontAndBack

113  {

114  type empty;

115  faces

116  (

117  (10 9 4 5)

118  (5 4 1 0)

119  (1 4 3 2)

120  (4 7 6 3)

121  (4 9 8 7)

122  (21 16 15 20)

123  (16 11 12 15)

124  (12 13 14 15)

125  (15 14 17 18)

126  (15 18 19 20)

127  );

128  }

129);

130

131

132// \*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\* //
   

Until now, we have only specified straight edges in the geometries of previous tutorials but here we need to specify curved edges. These are specified under the edges keyword entry which is a list of non-straight edges. The syntax of each list entry begins with the type of curve, including arc, simpleSpline, polyLine etc., described further in section [5.4.3](blockmesh#x28-1580005.4.3) . In this example, all the edges are circular and so can be specified by the arc keyword entry. The following entries are the labels of the start and end vertices of the arc and a point vector through which the circular arc passes.

The blocks in this blockMeshDict do not all have the same orientation. As can be seen in Figure [2.21](#x7-3900121) the ![eqn](img/index178x.png) direction of block 0 is equivalent to the ![eqn](img/index179x.png) direction for block 4. This means care must be taken when defining the number and distribution of cells in each block so that the cells match up at the block faces.

Six patches are defined: one for each side of the plate, one for the hole and one for the front and back planes. The left and down patches are both a symmetry plane. Since this is a geometric constraint, it is included in the definition of the mesh, rather than being purely a specification on the boundary condition of the fields. Therefore they are defined as such using a special symmetryPlane type as shown in the blockMeshDict.

The frontAndBack patch represents the plane which is ignored in a 2D case. Again this is a geometric constraint so is defined within the mesh, using the empty type as shown in the blockMeshDict. For further details of boundary types and geometric constraints, the user should refer to section [5.3](boundaries#x27-1470005.3) .

The remaining patches are of the regular patch type. The mesh should be generated using blockMesh and can be viewed in paraFoam as described in section [2.1.3](backwardstep#x5-70002.1.3) . It should appear as in Figure [2.22](#x7-3923822) .

* * *

![ \\relax \\special {t4ht=](img/index180x.png)

  

Figure 2.22: Mesh of the hole in a plate problem.

* * *

### 2.3.2 Boundary and initial conditions

Once the mesh generation is complete, the initial field with boundary conditions must be set. For a stress analysis case without thermal stresses, only displacement D needs to be set. The 0/D is as follows:

16dimensions  \[0 1 0 0 0 0 0\];

17

18internalField  uniform (0 0 0);

19

20boundaryField

21{

22  left

23  {

24  type  symmetryPlane;

25  }

26  right

27  {

28  type  tractionDisplacement;

29  traction  uniform (10000 0 0);

30  pressure  uniform 0;

31  value  uniform (0 0 0);

32  }

33  down

34  {

35  type  symmetryPlane;

36  }

37  up

38  {

39  type  tractionDisplacement;

40  traction  uniform (0 0 0);

41  pressure  uniform 0;

42  value  uniform (0 0 0);

43  }

44  hole

45  {

46  type  tractionDisplacement;

47  traction  uniform (0 0 0);

48  pressure  uniform 0;

49  value  uniform (0 0 0);

50  }

51  frontAndBack

52  {

53  type  empty;

54  }

55}

56

57// \*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\* //
   

Firstly, it can be seen that the displacement initial conditions are set to ![eqn](img/index181x.png) ![eqn](img/index182x.png). The left and down patches must be both of symmetryPlane type since they are specified as such in the mesh description in the constant/polyMesh/boundary file. Similarly the frontAndBack patch is declared empty.

The other patches are traction boundary conditions, set by a specialist tractionDisplacement boundary type. The traction boundary conditions are specified by a linear combination of: (1) a boundary traction vector under keyword traction; (2) a pressure that produces a traction normal to the boundary surface that is defined as negative when pointing out of the surface, under keyword pressure. The up and hole patches are zero traction so the boundary traction and pressure are set to zero. For the right patch the traction should be ![eqn](img/index183x.png) ![eqn](img/index184x.png) and the pressure should be 0 ![eqn](img/index184x.png).

### 2.3.3 Physical properties

The physical properties for the case are set in the physicalProperties dictionary in the constant directory, shown below:

16

17rho

18{

19  type  uniform;

20  value  7854;

21}

22

23nu

24{

25  type  uniform;

26  value  0.3;

27}

28

29E

30{

31  type  uniform;

32  value  2e+11;

33}

34

35Cv

36{

37  type  uniform;

38  value  434;

39}

40

41kappa

42{

43  type  uniform;

44  value  60.5;

45}

46

47alphav

48{

49  type  uniform;

50  value  1.1e-05;

51}

52

53planeStress  yes;

54thermalStress  no;

55

56

57// \*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\* //
   

The file includes mechanical properties of steel:

-   Density rho = 7854 ![eqn](img/index186x.png)
    
-   Young’s modulus E = ![eqn](img/index187x.png) ![eqn](img/index188x.png)
    
-   Poisson’s ratio nu = 0.3
    

The planeStress switch is set to yes to adopt the plane stress assumption in this 2D case. The solidDisplacementFoam solver may optionally solve a thermal equation that is coupled with the momentum equation through the thermal stresses that are generated. The user specifies at run time whether OpenFOAM should solve the thermal equation by the thermalStress switch (currently set to no). The thermal properties are also specified for steel for this case, i.e.:

-   Specific heat capacity Cp = 434 ![eqn](img/index189x.png)![eqn](img/index190x.png)![eqn](img/index191x.png)
    
-   Thermal conductivity kappa = 60.5 ![eqn](img/index192x.png)![eqn](img/index193x.png)![eqn](img/index194x.png)
    
-   Thermal expansion coefficient alphav = ![eqn](img/index195x.png) ![eqn](img/index196x.png)
    

For thermal calculations, the temperature field variable T is present in the 0 directory.

### 2.3.4 Control

As before, the information relating to the control of the solution procedure are read in from the controlDict dictionary. For this case, the startTime is 0 ![eqn](img/index197x.png). The time step is not important since this is a steady state case; in this situation it is best to set the time step deltaT to 1 so it simply acts as an iteration counter for the steady-state case. The endTime, set to 100, then acts as a limit on the number of iterations. The writeInterval can be set to ![eqn](img/index198x.png).

The controlDict entries are as follows:

16

17solver  solidDisplacement;

18

19startFrom  startTime;

20

21startTime  0;

22

23stopAt  endTime;

24

25endTime  100;

26

27deltaT  1;

28

29writeControl  timeStep;

30

31writeInterval  20;

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

45runTimeModifiable true;

46

47// \*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\* //
   

### 2.3.5 Discretisation schemes and linear-solver control

Let us turn our attention to the fvSchemes dictionary. Firstly, the problem we are analysing is steady-state so the user should select SteadyState for the time derivatives in timeScheme. This essentially switches off the time derivative terms. Not all solvers, especially in fluid dynamics, work for both steady-state and transient problems but solidDisplacementFoam does work, since the base algorithm is the same for both types of simulation.

The momentum equation in linear-elastic stress analysis includes several explicit terms containing the gradient of displacement. The calculations benefit from accurate and smooth evaluation of the gradient. Normally, in the finite volume method the discretisation is based on Gauss’s theorem. The Gauss method is sufficiently accurate for most purposes but, in this case, the least squares method will be used. The user should therefore open the fvSchemes dictionary in the system directory and ensure the leastSquares method is selected for the grad(U) gradient discretisation scheme in the gradSchemes sub-dictionary:

16

17d2dt2Schemes

18{

19  default  steadyState;

20}

21

22ddtSchemes

23{

24  default  Euler;

25}

26

27gradSchemes

28{

29  default  leastSquares;

30}

31

32divSchemes

33{

34  default  none;

35  div(sigmaD)  Gauss linear;

36}

37

38laplacianSchemes

39{

40  default  Gauss linear corrected;

41}

42

43interpolationSchemes

44{

45  default  linear;

46}

47

48snGradSchemes

49{

50  default  none;

51}

52

53// \*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\* //
   

The fvSolution dictionary in the system directory controls the linear equation solvers and algorithms used in the solution. The user should first look at the solvers sub-dictionary and notice that the choice of solver for D is GAMG. The solver tolerance should be set to ![eqn](img/index199x.png) for this problem. The solver relative tolerance, denoted by relTol, sets the required reduction in the residuals within each iteration. It is uneconomical to set a tight (low) relative tolerance within each iteration since a lot of terms in each equation are explicit and are updated as part of the segregated iterative procedure. Therefore a reasonable value for the relative tolerance is ![eqn](img/index200x.png), or possibly even higher, say ![eqn](img/index201x.png), or in some cases even ![eqn](img/index202x.png) (as in this case).

16

17solvers

18{

19  "(D|e)"

20  {

21  solver  GAMG;

22  tolerance  1e-06;

23  relTol  0.9;

24  smoother  GaussSeidel;

25  nCellsInCoarsestLevel 20;

26  }

27}

28

29PIMPLE

30{

31  compactNormalStress yes;

32}

33

34

35// \*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\* //
   

### 2.3.6 Running the code

The user can now try running foamRun in the background of the terminal. When running an OpenFOAM application in the background, the standard output (log information) should be redirected to a file. In the command below, standard output is written to a file named log which can be examined afterwards.

  
    foamRun > log &

The user should check the convergence information by viewing the generated log file. It shows the number of iterations and the initial and final residuals of the displacement in each direction being solved. The final residual should always be less than 0.9 times the initial residual as this iteration tolerance set. By the end of the simulation, the initial residuals have reduced towards the convergence tolerance of ![eqn](img/index203x.png). 

### 2.3.7 Post-processing

The solidDisplacementFoam solver outputs the stress field ![eqn](img/index204x.png) as a symmetric tensor field sigma. To post-process individual scalar field components, ![eqn](img/index205x.png), ![eqn](img/index206x.png) etc., the user can run the foamPostProcess utility, calling the components function object on the sigma field using the \-func option as follows:

  
    foamPostProcess -func "components(sigma)"

Components named sigmaxx, sigmaxy etc. are written to time directories of the case. The ![eqn](img/index207x.png) stresses can be viewed in ParaView as shown in Figure [2.23](#x7-4500323) .

* * *

![ 30 25 20 15 σxx (kPa ) 10 5 0 \\relax \\special {t4ht=](img/index208x.png)

  

Figure 2.23: ![eqn](img/index209x.png) stress field in the plate with hole.

* * *

In order to compare the solution to the analytical solution of Equation [2.7](#x7-38004r7) , data of ![eqn](img/index210x.png) must be extracted along the left edge symmetry plane of our domain. The user may generate the required graph data using the foamPostProcess utility with the graphUniform function. Unlike earlier examples of foamPostProcess where no configuration is required, this example includes a graphUniform file pre-configured in the system directory. The sample line is set between ![eqn](img/index211x.png) and ![eqn](img/index212x.png), and the fields are specified in the fields list:

9  Writes graph data for specified fields along a line, specified by start and

10  end points. A specified number of graph points are used, distributed

11  uniformly along the line.

12

13\\\*---------------------------------------------------------------------------\*/

14

15start  (0 0.5 0.25);

16end  (0 2 0.25);

17nPoints  100;

18

19fields  (sigmaxx);

20

21axis  y;

22

23#includeEtc "caseDicts/functions/graphs/graphUniform.cfg"

24

25// \*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\* //
   

The user should execute postProcessing with the graphUniform function:

  
    foamPostProcess -func graphUniform

Data is written in raw 2 column format into files within time subdirectories of a postProcessing/graphUniform directory, e.g. the data at ![eqn](img/index213x.png) s is found within the file graphUniform/100/line.xy. If the user has GnuPlot installed they launch it (by typing gnuplot) and then plot both the numerical data and analytical solution as follows:

  
    plot \[0.5:2\] \[0:\] "postProcessing/graphUniform/100/line.xy",  
        1e4\*(1+(0.125/(x\*\*2))+(0.09375/(x\*\*4)))

An example plot is shown in Figure [2.24](#x7-4503824) .

* * *

![ 35 30 25 20 Stress(σxx)x=015(kPa) 10 5 0 0.6 0.8 1.0 1.2 1.4 1.6 1.8 2.0 Distance, y (m) Numerical prediction Analytical solution \\relax \\special {t4ht=](img/index214x.png)

  

Figure 2.24: Normal stress along the vertical symmetry ![eqn](img/index215x.png) 

* * *

OpenFOAM v13 User Guide - 2.3 Stress analysis of a plate with a hole

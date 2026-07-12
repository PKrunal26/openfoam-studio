---
source: https://doc.cfd.direct/openfoam/user-guide-v13/programming-language-openfoam
title: OpenFOAM v13 User Guide - 3.1 The programming language of OpenFOAM
slug: programming-language-openfoam
---
### How do I learn C++ to program OpenFOAM?

The C++ needed to program OpenFOAM is explained on our Programming CFD

[Programming CFD](https://cfd.direct/openfoam-training/programming-cfd "Programming CFD")

\[**version 13**\]\[[version 12](../user-guide-v12)\]\[[version 11](../user-guide-v11)\]\[[version 10](../user-guide-v10)\]\[[version 9](../user-guide-v9)\]\[[version 8](../user-guide-v8)\]\[[version 7](../user-guide-v7)\]\[[version 6](../user-guide-v6)\]

\[[chapter contents](applications)\]\[[previous topic](applications)\]\[[next topic](compiling-applications)\]\[[index](bookindex)\]

## 3.1 The programming language of OpenFOAM

This chapter provides some information to help understand how OpenFOAM applications and libraries are compiled. It provides some background knowledge of C++, the base language of OpenFOAM. Henry Weller chose C++ as the main programming language of OpenFOAM when he created it in the late 1980s.

The idea was to use object-oriented programming to express abstract concepts efficiently, just as verbal language and mathematics can do. For example, in fluid flow, we use the term “velocity field”, which has meaning without any reference to the nature of the flow or any specific velocity data. The term encapsulates the idea of movement with direction and magnitude and relates to other physical properties. In mathematics, “velocity field” can be replaced by a single symbol, e.g. ![eqn](img/index216x.png), and other symbols express operations and functions, e.g. “the field of velocity magnitude” by ![eqn](img/index217x.png).

CFD deals with partial differential equations in 3 dimensions of space and time. The equations contain: fields of scalars, vectors and tensors; tensor algebra; tensor calculus; and, dimensional units. The solution to these equations involves discretisation procedures, matrices, solvers, and solution algorithms.

Rather than program CFD in terms of intrinsic entities known to a computer, e.g. bits, bytes, integers, floating point numbers, OpenFOAM provides classes that define the entities encountered in CFD. For example, a velocity field can be defined by a vectorField class, allowing a programmer to create an instance, or object, of that class. The object can be created with the name U to mimic the symbol used in mathematics. Associated functions can be created with names which also try to emulate the simplicity of mathematics, e.g. mag(U) can represent ![eqn](img/index217x.png).

The class structure concentrates code development to contained regions of the code, i.e. the classes themselves, thereby making the code easier to manage. New classes can be derived or inherit properties from other classes, e.g. the vectorField can be derived from a vector class and a Field class. C++ provides the mechanism of template classes such that the template class Field<Type\> can represent a field of any <Type\>, e.g.scalar, vector, tensor. The general features of the template class are passed on to any class created from the template. Templating and inheritance reduce duplication of code and create class hierarchies that impose an overall structure on the code.

A theme of the OpenFOAM design is that it has a syntax that closely resembles the partial differential equations being solved. For example the equation

![∂ρU--+ ∇ ∙ϕU − ∇ ∙μ∇U = − ∇p ∂t \\relax \\special {t4ht=](img/index219x.png)

is represented by the code

  
    solve  
    (  
        fvm::ddt(rho, U)  
      + fvm::div(phi, U)  
      - fvm::laplacian(mu, U)  
        ==  
      - fvc::grad(p)  
    );

The equation syntax is most evident in the code for solvers, both the modules and solver applications. Users do not need a deep knowledge of C++ programming to interpret the equations written in a solver. Instead, an understanding of the underlying equations, models and solution method and algorithms is perhaps more helpful, which can be found in [Notes on Computational Fluid Dynamics: General Principles](https://doc.cfd.direct/notes/cfd-general-principles/).

It does help to have a rudimentary understanding of the the principles behind object-orientation and classes, and to have a basic knowledge of some C++ code syntax. To program in OpenFOAM, there is often little need for a user to immerse themselves in the code of any of the OpenFOAM classes. The essence of object-orientation is that the user should not have to go through the code of each class they use; merely the knowledge of the class’ existence and its functionality are sufficient to use the class. A description of each class and its functions is supplied with the OpenFOAM distribution in HTML documentation generated with Doxygen at [https://cpp.openfoam.org](https://cpp.openfoam.org)

OpenFOAM v13 User Guide - 3.1 The programming language of OpenFOAM

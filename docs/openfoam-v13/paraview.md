---
source: https://doc.cfd.direct/openfoam/user-guide-v13/paraview
title: OpenFOAM v13 User Guide - 7.1 ParaView/paraFoam graphical user interface (GUI)
slug: paraview
---
### How do I use _ParaView_ with OpenFOAM?

CFD Direct's OpenFOAM Training explains using _ParaView_ with OpenFOAM

[See Training](https://cfd.direct/openfoam-training "See Training")

\[**version 13**\]\[[version 12](../user-guide-v12)\]\[[version 11](../user-guide-v11)\]\[[version 10](../user-guide-v10)\]\[[version 9](../user-guide-v9)\]\[[version 8](../user-guide-v8)\]\[[version 7](../user-guide-v7)\]\[[version 6](../user-guide-v6)\]

\[[chapter contents](postprocessing)\]\[[previous topic](postprocessing)\]\[[next topic](post-processing-cli)\]\[[index](bookindex)\]

## 7.1 ParaView/paraFoam graphical user interface (GUI)

OpenFOAM includes a native reader module to visualise data with ParaView, an open-source, visualisation application. The module comprises of the PVFoamReader and vtkPVFoam libraries, which currently supports version 5.10.1 of ParaView. It is recommended that this version of ParaView is used, although it is possible that the latest binary release of the software will run adequately. Further details about ParaView can be found at [http://www.paraview.org](http://www.paraview.org).

ParaView uses the Visualisation Toolkit (VTK) as its data processing and rendering engine and can therefore read any data in VTK format. OpenFOAM includes a variety of tools which can write data in VTK and other supported formats, which can be read directly by ParaView. Entire case data can be converted to VTK using the foamToVTK utility if the user wishes to process their results without the OpenFOAM reader.

In summary, we recommend the reader module for ParaView as the primary visualisation option for OpenFOAM. Alternatively OpenFOAM data can be converted into VTK format to be read by ParaView or any other VTK-based graphics tools.

### 7.1.1 Overview of ParaView/paraFoam

paraFoam is a script that launches ParaView using the reader module supplied with OpenFOAM. It is executed like any of the OpenFOAM utilities either by the single command from within the case directory or with the \-case option with the case path as an argument, e.g.:

  
    paraFoam -case <caseDir\>

* * *

![PICT\\relax \\special {t4ht=](img/index380x.png)

  

Figure 7.1: The ParaView window

* * *

ParaView is launched and opens the window shown in Figure [7.1](#x39-2050011). The case is controlled from the left panel, which contains the following:

-   The Pipeline Browser lists the modules opened in ParaView, where the selected modules are highlighted in blue and the graphics for the given module can be enabled/disabled by clicking the eye button alongside;
    
-   The Properties panel contains the input selections for the case, such as times, regions and fields; it includes the Display panel that controls the visual representation of the selected module, e.g. colours;
    
-   Other panels can be selected from the View menu, including the Information panel which gives case statistics such as mesh geometry and size.
    

ParaView operates a tree-based structure in which data can be filtered from the top-level case module to create sets of sub-modules. For example, a contour plot of, say, pressure could be a sub-module of the case module which contains all the pressure data. The strength of ParaView is that the user can create a number of sub-modules and display whichever ones they need to create the desired image or animation. For example, they may add some solid geometry, mesh and velocity vectors, to a contour plot of pressure, switching any of the items on and off as necessary.

The general operation of the system is based on the user making a selection and then clicking the green Apply button in the Properties panel. The additional buttons are: the Reset button which can be used to reset the settings if necessary; and, the Delete button that will delete the active module.

### 7.1.2 The Parameters panel

The Properties window for the case module includes the Parameters panel that contains the settings for mesh, fields and global controls.

* * *

![PICT\\relax \\special {t4ht=](img/index381x.png)

  

Figure 7.2: The Properties panel for the case module

* * *

The controls are described in Figure [7.2](#x39-2060052) . The user can select mesh and field data which is loaded for all time directories into ParaView. The buttons in the Current Time Controls and VCR Controls toolbars then select the time data to be displayed, as shown is section [7.1.4](#x39-2080007.1.4).

As with any operation in ParaView, the user must click Apply after making any changes to any selections. The Apply button is highlighted in green to alert the user if changes have been made but not accepted. This method of operation has the advantage of allowing the user to make a number of selections before accepting them, which is particularly useful in large cases where data processing is best kept to a minimum.

If new data is written to time directories while the user is running ParaView, the user must load the additional time directories by checking the Refresh Times button. Where there are occasions when the case data changes on file and ParaView needs to load the changes, the user can also toggle the Cache Mesh button in the Parameters panel and apply the changes.

### 7.1.3 The Display panel

The Properties window contains the Display panel that includes the settings for visualising the data for a given case module.

* * *

![PICT\\relax \\special {t4ht=](img/index382x.png)

  

Figure 7.3: The Display panel

* * *

The following points are particularly important:

-   the data range may not be automatically updated to the max/min limits of a field, so the user should take care to select Rescale at appropriate intervals, in particular after loading the initial case module;
    
-   clicking the Edit Color Map button, brings up a window in which there are two panels:
    
    1.  The Color Scale panel in which the colours within the scale can be chosen. The standard blue to red colour scale for CFD can be selected by clicking Choose Preset and searching for Blue to Red Rainbow and selecting.
        
    2.  The Color Legend panel has a toggle switch for a colour bar legend and contains settings for the layout of the legend, e.g. font.
        
-   the underlying mesh can be represented by selecting Wireframe in the Representation menu of the Style panel;
    
-   the geometry, e.g. a mesh (if Wireframe is selected), can be visualised as a single colour by selecting Solid Color from the Color By menu and specifying the colour in the Set Ambient Color window;
    
-   the image can be made translucent by editing the value in the Opacity text box (1 = solid, 0 = invisible) in the Style panel.
    

### 7.1.4 The button toolbars

ParaView duplicates functionality from pull-down menus at the top of the main window and the major panels, within the toolbars below the main pull-down menus. The displayed toolbars can be selected from Toolbars in the main View menu. The default layout with all toolbars is shown in Figure [7.4](#x39-2080074) with each toolbar labelled. The function of many of the buttons is clear from their icon and, with tooltips enabled in the Help menu, the user is given a concise description of the function of any button.

* * *

![PICT\\relax \\special {t4ht=](img/index383x.png)

  

Figure 7.4: Toolbars in ParaView

* * *

### 7.1.5 Manipulating the view

This section describes operations for setting and manipulating the view in ParaView. Firstly, the View Settings are available in the Render View panel below the Display panel in the Properties window. Settings that are generally important only appear when the user checks the gearwheel button at the top of the Properties window, next to the search bar. These advanced properties include setting the background colour, where white is often a preferred choice for creating images for printed and website material.

The Lights button opens detailed lighting controls within the Light Kit panel. A separate Headlight panel controls the direct lighting of the image. Checking the Headlight button with white light colour of strength 1 seems to help produce images with strong bright colours, e.g. with an isosurface.

The Camera Parallel Projection is the usual choice for CFD, especially for 2D cases, and so should generally be checked. Other settings include Cube Axes which displays axes on the selected object to show its orientation and geometric dimensions.

The general Settings are selected from the Edit menu, which opens a general Options window with General, Camera, Render View Color Arrays and Color Palette menu items.

The General panel controls some default behaviour of ParaView. In particular, there is an Auto Apply button that enables ParaView to accept changes automatically without clicking the green Apply button in the Properties window. For larger cases, this option is generally not recommended: the user does not generally want the image to be re-rendered between each of a number of changes he/she selects, but be able to apply a number of changes to be re-rendered in their entirety once.

The Render View panel contains level of detail (LOD) which controls the rendering of the image while it is being manipulated, e.g. translated, resized, rotated; lowering the levels set by the sliders, allows cases with large numbers of cells to be re-rendered quickly during manipulation.

The Camera panel includes control settings for 3D and 2D movements. This presents the user with a map of rotation, translate and zoom controls using the mouse in combination with Shift- and Control-keys. The map can be edited to suit by the user.

### 7.1.6 Contour plots

A contour plot is created by selecting Contour from the Filter menu at the top menu bar. The filter acts on a given module so that, if the module is the 3D case module itself, the contours will be a set of 2D surfaces that represent a constant value, i.e. isosurfaces. The Properties panel for contours contains an Isosurfaces list that the user can edit, most conveniently by the New Range window. The chosen scalar field is selected from a pull down menu.

Very often a user will wish to create a contour plot across a plane rather than producing isosurfaces. To do so, the user must first use the Slice filter to create the cutting plane, on which the contours can be plotted. The Slice filter allows the user to specify a cutting Plane, Box or Sphere in the Slice Type menu by a center and normal/radius respectively. The user can manipulate the cutting plane like any other using the mouse.

The user can then run the Contour filter on the cut plane to generate contour lines.

### 7.1.7 Vector plots

Vector plots are created using the Glyph filter. The filter reads the field selected in Vectors and offers a range of Glyph Types for which the Arrow provides a clear vector plot images. Each glyph has a selection of graphical controls in a panel which the user can manipulate to best effect.

The remainder of the Properties panel contains mainly the Scale Mode menu for the glyphs. The most common options for Scale Mode are: Vector, where the glyph length is proportional to the vector magnitude; and, Off where each glyph is the same length. The Set Scale Factor parameter controls the base length of the glyphs.

Vectors are by default plotted on cell vertices but, very often, we wish to plot data at cell centres. This is done by first applying the Cell Centers filter to the case module, and then applying the Glyph filter to the resulting cell centre data.

### 7.1.8 Streamlines

Streamlines are created by first creating tracer lines using the Stream Tracer filter. The tracer Seed panel specifies a distribution of tracer points over a Line Source or Point Cloud. The user can view the tracer source, e.g. the line, but it is displayed in white, so they may need to change the background colour in order to see it.

The distance the tracer travels and the length of steps the tracer takes are specified in the text boxes in the main Stream Tracer panel. The process of achieving desired tracer lines is largely one of trial and error in which the tracer lines obviously appear smoother as the step length is reduced but with the penalty of a longer calculation time.

Once the tracer lines have been created, the Tubes filter can be applied to the Tracer module to produce high quality images. The tubes follow each tracer line and are not strictly cylindrical but have a fixed number of sides and given radius. When the number of sides is set above, say, 10, the tubes do however appear cylindrical, but again this adds a computational cost.

### 7.1.9 Image output

The simplest way to output an image to file from ParaView is to select Save Screenshot from the File menu. On selection, a window appears in which the user can select the resolution for the image to save. There is a button that, when clicked, locks the aspect ratio, so if the user changes the resolution in one direction, the resolution is adjusted in the other direction automatically. After selecting the pixel resolution, the image can be saved. To achieve high quality output, the user might try setting the pixel resolution to 1000 or more in the ![eqn](img/index384x.png)\-direction so that when the image is scaled to a typical size of a figure in an A4 or US letter document, perhaps in a PDF document, the resolution is sharp.

### 7.1.10 Animation output

To create an animation, the user should first select Save Animation from the File menu. A dialogue window appears in which the user can specify a number of things including the image resolution. The user should specify the resolution as required. The other noteworthy setting is number of frames per timestep. While this would intuitively be set to 1, it can be set to a larger number in order to introduce more frames into the animation artificially. This technique can be particularly useful to produce a slower animation because some movie players have limited speed control, particularly over mpeg movies.

On clicking the Save Animation button, another window appears in which the user specifies a file name root and file format for a set of images. On clicking OK, the set of files will be saved according to the naming convention “<fileRoot\>\_<imageNo\>.<fileExt\>”, e.g. the third image of a series with the file root “animation”, saved in jpg format would be named “animation\_0002.jpg” (<imageNo\> starts at 0000).

Once the set of images are saved the user can convert them into a movie using their software of choice. One option is to use the built in foamCreateVideo script from the command line whose usage is shown with the \-help option.

OpenFOAM v13 User Guide - 7.1 ParaView/paraFoam graphical user interface (GUI)

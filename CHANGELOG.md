#### v0.3.25
    - feat(sld): WebGL 2D renderer for Single Line Debugger — toggle between Canvas 2D and WebGL with the button in the footer; state is remembered across sessions
    - feat(sld): hover highlighting in WebGL renderer — elements under the cursor are highlighted in gold
    - feat(sld): click an element to jump to its source line; double-click a subroutine element to open a popup with syntax-highlighted code, call stack and an "Edit" button
    - feat(sld): selected lines in the editor create a glow on the corresponding trajectory segment in the WebGL renderer
    - feat(sld): pin mode — SLD can be locked to a specific file when navigating subroutines; switching to an unrelated file suggests unpinning
    - feat(sld): subroutine buffers are read from open editors, so unsaved changes are picked up without saving
    - feat(sld): slow debug and pause mode now work in the WebGL 2D renderer and in the 3D viewport
    - feat(sld): progress bar scrubbing (click, arrow keys) works in all three renderers during slow debug
    - feat(sld): during slow debug the active source line is highlighted with a yellow background (marker decoration — user cursor is not moved); if the frame comes from a subroutine, both the main editor and the subroutine editor (if open) scroll to and highlight the active line

#### v0.3.24
    - fix(contourEdit): double-traversal element in burnForest is highlighted red; clicking canvas exits selectArea, opens Contour Tools and selects the element for splitting
    - fix(contourEdit): arc division now correctly recomputes middle point for each half via changeRadius
    - fix(contourEdit): dragging an endpoint onto another point of the same element is blocked (< 1 mm threshold applies to start, end and arc middle)
    - fix(contourEdit): burnedContour area built only from intersection points where both parent elements have > 1 rasterized point in burnedPoints (prevents single-point intruders from corrupting arc segments)
    - feat(contourEdit): selected element in the list always scrolls into view

#### v0.3.23
    - fix: machine data (machines.json) is now stored in ~/.pulsar/sinumerik-highlight/ and is no longer lost on package update; existing data is migrated automatically

#### v0.3.22
    - fix: programs with the same filename in different folders now correctly load their own machine, blank and contour settings
    - fix: selected lines highlight no longer bleeds into subroutines; selecting a CALL line highlights the entire subroutine
    - fix: Details button now works from 3D view; camera position is preserved when returning to 3D
    - fix: C4 spindle axis no longer causes parse error
    - fix: ruler labels no longer disappear at extreme zoom levels

#### v0.3.20
    - optimize lathes C axis debugging

#### v0.3.19
    - add progressBar for slow forward & backward debugging

#### v0.3.17
    - added divide line by other line feature in contourEdit mode

#### v0.3.16
    - added contour elements loading from contour & blank files
    - short elements highlighting in contour edit list
    - added area contour saving to file feature
    - added selecting element by mouse feature

#### v0.3.15
    - add support for user .DEF files placed in subroutine folder
    - increase selectArea function speed
    - add loading contour from blank & contour files

#### v0.3.12
    - fix G33 interpretation error in MIRROR mode
    - add machining time calculation
    - save viewport position & scale for every file in SLD & ContourEditModes

#### v0.3.11
    - fix some change editor errors
    - add optons for FANUC toolchange
    - 3D viewport redraw with ctrl-alt-r, fix zoom/pan/rotate bug
    - Abort parsing when NaN is received
    - fix ENDWHILE searching
    - fix area selection bug

#### v0.3.8
    - fix turning cycle safety distance

#### v0.3.7
    - display contours for all programs in directory
    - add closed contour turning cycle
    - fix turning cycle direction selector

#### v0.3.6
    - add 3D toolpath wiev

#### v0.0.44 - v0.3.5
    - many features inc. Contour tools for roughing 

#### v0.0.43
    - fix contours saving func for windows

#### v0.0.41
    - tool orientation (T10[1-9]) can be parsed from comment in previous line ex. ';T103'
    - cnc type selector for sinumerik-to-nc pack
    - contour edit tools

#### v0.0.39
    - MCALL support (1000 calls max)
    - reduced errors num in the condition calculations
    - fix G2/G3 (distance == 2 * CR) math error
    - bug COS/ACOS SIN/ASIN fixed
    - scale & offset in slow debug mode without canvas reset
    - bolding selected rows on drawing

#### v0.0.37
    - critical rounding bug fix

#### v0.0.36
    - FOR-ENDFOR with named variable
    - calculation of RP perfomed in WCS
    - calculation of ANG with MIRROR in WCS
    - Circle end point tolerance increased

#### v0.0.35
    - $P_GG[29] - only for G group 29 (DIAMOF/DIAMON/DIAM90)
    - fix some bugs

#### v0.0.34
    - blank & contour file path selector
    - blank & contour filled figures
    - fix pole bug in DIAMON/DIAM90 mode
    - EXECSTRING parse
    - WHILE - ENDWILE support
    - FOR - ENDFOR support only for R-vars
    - [A]MIRROR support
    - select containing folder for program file via teletype

#### v0.0.33
    - display C axis as ROT

#### v0.0.32
    - OFFN support
    - individual snippets for machine tools

#### v0.0.30
    - last element with "RND|CHR" drawing bug fixed.
    - decrease timeout for short elements in SlowDebug.
    - fixed render queue in Slow Debug Mode.

#### v0.0.28
    - parse variables in subroutine call
    - fix "<>" bug in condition parse
    - recursive subroutine call
    - fix float bug in conditions
    - fix 'OR' replacement
    - pasing STRING concatenation

#### v0.0.26
    - fix subroutines path dialog for Win

#### v0.0.25
    - display MSG in slow debug mode
    - fix subroutine call bug
    - string parse
    - ROUND bug fix

#### v0.0.24
    - fix float accuracy in comparisons
    - discarding a comment from string when parsing

#### v0.0.23
    - fix subroutines path bug

#### v0.0.22
    - coordinate rulers
    - different colors for G40/41/42 lines
    - check conditions for float fix
    - call subroutine with math/R-vars
    - smooth rendering for debugging

#### v0.0.19
    - ctrl - alt - r   : rewrite function
    - REPEAT support added
    - RND support between line & arc
    - MAXVAL support
    - Tool orientation: T101 - 109 accords to $TC_DP2 1 - 9
    - Subroutines folder path selection area.
    - IC moves parse for AP & RP operators
    - DIAM90 mode for lathes
    - CHR between lines parser

#### v0.0.18
    - 1 RND bug fix

#### v0.0.17
    - 'comment selected lines' function added (Ctrl + Alt + ;)
    - RND support between lines

#### v0.0.16
    - add third axis in circular intrpolation
    - TURN support

#### v0.0.14
    - clear console log :)

#### v0.0.13
    - add support polar coordinates (AP, RP, G110-G112).
    - DIAMON/DIAMOF interpreter.

#### v0.0.12
    - working in Windows restored (dir path bug fixed).
    - add support for IF - ELSE - ENDIF  jumps.
    - add support for GOTO[BF] without IF jumps.

#### v0.0.8
    - add circular interpolation with CR and AR

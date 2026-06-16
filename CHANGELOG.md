#### v0.3.31
    - feat(bounding-contour): right-click a subroutine call line (e.g. `YAMA(...)`) → **Create bounding contour** generates a parametric outer contour described in the subroutine source between `;BOUNDING_CONTOUR_BEGIN` / `;BOUNDING_CONTOUR_END` markers. Each line of the block is a regular G-code expression prefixed with `;` so it stays inert at runtime; PROC parameters and `$AA_IW[X/Y/Z]` are resolved at the moment of the call. Useful for building remnant-blank contours without retyping the call-site values.
    - feat(bounding-contour): generated bounding shapes show up in the contourEdit folder list as `SUBNAME · row N`, tinted with the info color. Clicking adds the contour into editContour and highlights the call row in the editor with the slow-debug active-line decoration; moving the cursor in that editor clears the highlight.
    - feat(bounding-contour): preflight check rejects calls inside `WHILE` / `FOR`; calls revisited at runtime (e.g. via `REPEAT` or `GOTOB`) surface a clear notification instead of silently capturing a stale snapshot.
    - feat(contourEdit): when two lines fully or partially overlap in the same 1 mm cell, hover now picks one or the other based on the side of the cursor relative to the lowest-id line (cross product sign). Vertical/horizontal lines disambiguate without ambiguity.
    - feat(contourEdit): the cursor-hovered element is always drawn on top of every other highlight (selected-from-list, elementProperties, doubleTraversal) — relevant for overlapping lines where the shorter one used to be hidden underneath the longer.
    - fix(contourEdit): right-clicking a point with the context menu open no longer arms a drag that the menu swallows the mouseup for — `mousedown` now ignores non-left buttons, eliminating the "ghost point follows the cursor after Divide" glitch.
    - fix(contourEdit): the **Divide** context-menu entry now appears for intersection points that are also the endpoint of another element (only the selected element's own endpoints are filtered out, since dividing there would produce a zero-length piece).
    - fix(contourEdit): folder labels in the contour list strip the directory path and extension — long file paths no longer push the +/- icon onto the next row.
    - fix(snippets): opening the snippets menu when no editor is open, or for a file/machine that has no snippets, no longer throws; an empty menu now shows a "No snippets for this machine" hint with an `×` close button and ESC handler.

#### v0.3.30
    - fix(contourEdit): dragging an arc endpoint onto the opposite endpoint of the same arc no longer merges them into a degenerate full circle — the drop-time snap now ignores points of the dragged element, and the drag handler reverts the moved arc point to its original position when the proximity check triggers
    - fix(contourEdit): editing an arc endpoint coordinate in ElementProperties is rejected with an alert when the new value would merge start with end
    - fix(contourEdit): loading shape elements from blank/contour now includes CHR chamfers — `insertChr` pushes the truncated leading line and the chamfer line to `parseData.contourElements` with explicit X/Y/Z indexing so coordinates stay in the right slots across G17/G18/G19 planes

#### v0.3.29
    - feat(theme): UI and syntax highlighting now follow Pulsar theme variables — the package looks correct in both light themes (baseline: One Light) and dark themes (One Dark and similar)
    - feat(theme): native `<input>`/`<select>` elements adopt theme background, text and border colors; checkbox/radio glyphs use the theme accent color and render in the matching dark/light style
    - feat(syntax): token colors that read poorly on dark editor backgrounds (axis, operator, feed, message, G-functions, circle centers, etc.) have been adjusted for cross-theme contrast
    - fix(machine-manager): tool orientation triangles no longer disappear into the background on dark themes
    - fix(styles): replaced theme-specific `@accent-bg-color` with a universal Pulsar UI variable — checkbox/radio styling no longer fails to compile on Atom Light/Dark themes
    - fix(contourEdit): shapes (blank, contour) are now rendered in the contourEdit tab regardless of which SLD renderer (Canvas 2D / WebGL / 3D) was active before the switch
    - change(sld): blank and contour shapes are now always loaded from the saved file on disk while the main program trajectory still follows the live editor buffer — editing a shape file lets you compare the saved shape against the live trajectory at a glance

#### v0.3.28
    - feat(sld): slow debug animation stops immediately when the user starts editing the source file or switches to another editor; all remaining elements are rendered instantly without scrolling the editor
    - feat(sld): after animation ends (naturally or interrupted), the last active source line stays highlighted until the user moves the cursor in that file
    - feat(sld): Canvas / WebGL renderer switcher is now a segmented control — the active renderer is visually highlighted

#### v0.3.26
    - fix(sld): clicking a trajectory element in WebGL renderer now highlights the source line with a marker decoration (same as slow debug) instead of moving the cursor; subroutine lines are highlighted in their editor if open

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

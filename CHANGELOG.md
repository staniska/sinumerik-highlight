#### v0.3.35
    - feat(tools): tools are now drawn. A machine carries a list of tools (`machineData.tools[machine]`), each one a shape file describing the insert and its holder as coloured sections; the **Tool list** opener sits in machineManager and, as of this release, in the SLDebug footer next to Equipment, where it falls back to the machine the open program names so the list is reachable without a detour. A tool is put into a program as `;TOOL:NAME` at the cursor, and is drawn translucently on the trajectory during slow debug in both the WebGL and the 3D view. The file's zero is the control's reference point P, and the nose circle comes from the declared `$TC_DP2` (cutting-edge position) and `$TC_DP6` (nose radius), with the drawing used only when they are absent. The nine cutting-edge positions live in one table (`lib/tipPosition.js`) from which machineManager's four per-machine arrangements of those positions are now derived rather than written out beside it.
    - feat(shape-file): one sectioned-file parser (`;---SECTION COLOR: ROLE:`, `;---VARIABLES`) shared by tools and fixtures, so a section can declare whether it cuts, collides or is ignored, and can carry `$TC_DP*` numbers alongside its geometry.
    - feat(material-trace): slow debug now paints the stock the tool has removed, and reports what it hit. Three kinds of damage are called out under the canvas: a cut into the finished contour, a holder striking material that is still there, and a rapid (G0) that cuts — the last being one of the most ordinary ways a machine is wrecked, and previously invisible. Depths are measured as distances into the part, radial or axial whichever the cut really was, and reported in diameters when the program works in diameters. The material is held as columns along the turning axis with exact radial intervals, so the picture stays exact across the diameter at any length of part; the axial step is 0.2 mm, coarsened only if a part is too long to hold at that. Scrubbing the progress bar is served by encoded keyframes and stepping back by an undo log, so neither replays the program from the blank. A self-check reports when a tool file's zero is not the point the control compensates about — the one error that otherwise leaves no trace but a picture that is quietly wrong everywhere.
    - fix(g-code): tool-radius compensation at the ends and corners of a compensated contour. The correction at the end of an approach is now taken from the contour block it is about to cut, as the control does with NORM, instead of from the approach's own direction — with the two running along different axes, which is the ordinary case, that turned the offset through ninety degrees and drove the nose a full radius into the material, leaving a gouge no later block took back. Departures had the mirror of it. Where two compensated blocks meet, both are now stopped at the crossing of their offset paths when the material fills the corner, and the nose rolls around the programmed corner on an arc (G450) when it does not; each block was previously offset alone, which overcut the inside of every corner by up to a nose radius and left a wedge standing on the outside.
    - fix(sld): the tool outline is drawn where the tool actually is. Under G41/G42 the control keeps the nose tangent to the programmed path, so the reference point runs on its own line; the outline was placed on the programmed point and hung a nose radius away from the material it had just removed. Both now come from one function.
    - feat(g-code): `RND` between two arcs. On a G2/G3 block followed by another G2/G3 the value used to be read, carried as far as the next block, and dropped. The geometry — a circle tangent to two circles, a case of Apollonius' problem — lives in a module of its own (`lib/arcFilletMath.js`) with no access to parser state; a radius too large for the corner is reduced to the largest that fits, as the control does and as the line-to-line case already did.
    - perf(sld): slow debug and scrubbing on a program with the material trace running are 15x faster on long roughing passes and 7.8x on a finishing pass of short blocks, with identical results to the last digit. The trace now runs on program blocks rather than on the pieces the animation reveals, sweeps a convex tool outline as one hull scanned with a pointer per chain, settles a column against its own ceiling instead of the sweep's bounding box, and keeps its undo log as one flat buffer per block instead of a record per column — garbage collection went from a third of the run to an eighth. Separately, the trajectory line and the tool outline are built once and then revealed rather than rebuilt and re-uploaded for every frame, which on a long program was the largest single cost in the profile.
    - chore(sld): `calcToolCompensation` and its checkbox are gone, replaced by the tool geometry above.
    - test: 634 cases, up from 203. New suites for the shape-file parser, the tools list, the material-trace core and its driving layer, the cutting-edge position table, the arc-arc fillet geometry and its wiring.
    - feat(machine-manager): "Edit Machine" button on the machine properties panel (between "Select Default" and "Remove Machine") opens the same form used to create a machine, pre-filled with its current values — previously the panel only showed a read-only JSON dump, and changing anything meant deleting and recreating the machine. The name field is editable; renaming migrates the machine's subroutine/snippet folder links and the default-machine flag to the new key. Saving mutates the existing machine object in place rather than replacing it, so a program already Attached/Activated to it picks up the edit immediately without re-attaching.
    - chore(machine-manager): the Create Machine form's Lathe-specific fields (sub-type, carriage, spindle) are now built once up front and shown/hidden via a CSS class instead of being created on the fly in response to type-select `change` events — groundwork for the Edit Machine feature above (pre-filling the form no longer needs to replay a chain of UI events just to make the fields exist). No behavior change for Create.
    - fix(defParser): `DEF STRING[8] NAME="text"` declared directly in a program body (as opposed to an external `.DEF` file) no longer keeps the surrounding quotes in the stored value. `checkDef` was missing the quote-stripping that the `.DEF`-file and post-declaration-assignment paths already had.
    - fix(snippets): snippet list items now get a DOM id derived from render position instead of from the snippet's name — two snippets sharing a name across different folders no longer confuse Up/Down keyboard navigation (`document.getElementById` was always jumping to the first match). The snippet list is also capped in height with a scrollbar instead of growing past the visible area when there are many snippets.
    - fix(sld): panning or zooming the Canvas 2D viewport while a re-parse is in flight (e.g. right after toggling the contour/blank duplicate checkbox) no longer draws a half-built trajectory. `drawChanges()` clears `parseData.canvas` synchronously before an awaited, potentially multi-tick parse, and the raw mousemove/wheel handlers used to read it mid-flight; `changeCanvas()` now skips the redraw while a parse is in progress and keeps the last complete frame instead. WebGL and 3D were never affected — their pan/zoom moves a camera over an already-built scene rather than re-reading the parsed geometry.
    - feat(g-code): `RNDM=value` (modal corner rounding — applies to every following move with a corner until `RNDM=0`) now actually works. It was previously tokenized alongside `ANG`/`CHF` in a way that discarded the number after `=`, silently making it a no-op.
    - feat(g-code): `CHF=value` (chamfer specified by the diagonal length of the cut, as opposed to `CHR`'s per-edge trim distance) is now implemented — same discarded-number bug as `RNDM` had, plus a trigonometric conversion into the existing `CHR` geometry since the two aren't the same quantity. A near-180° corner (chamfer geometrically impossible) reports an error instead of producing garbage geometry.
    - test: added 17 cases across `defParser` (DEF STRING quote-stripping), `primitives` (RNDM/CHF), and a new `elementInsert.test.js` — the first test coverage for `element-insert.js` — covering the CHF chamfer geometry. Total test count is now 203.

#### v0.3.34
    - fix(contourEdit): the right-hand panel (`.sinumerikContourEditRight`) now scrolls as a whole when its content — plane/units selectors, saved-contours list, "Get elements from" list, processing tools, view tools — is taller than the panel. Previously the panel had no `overflow`, so with many contours across several files the lower part of the list spilled past the panel's bottom edge and became unclickable instead of being reachable by scrolling.
    - fix(contourEdit): selecting a saved contour from the list, and saving a new one, no longer throws `Cannot read properties of undefined (reading 'click')`. The G17/G18/G19 plane picker was switched from three buttons to a `<select>` in v0.3.33's units work, but `fs.js` still queried for the removed `.contourEditPlaneButton`/`.contourEditPlaneButtonSelected` classes; both call sites now read/write `planes.select` directly.

#### v0.3.33
    - feat(units): metric/inch support for the whole package. Each machine now has a units setting (metric by default); `G70`/`G700` switches a program to inch and `G71`/`G710` back to metric, with the machine's setting used as the default when neither appears. All linear-axis values scale accordingly — coordinates (X/Y/Z), arc centers (I/J/K), `CR`, `RP`, `RND`, `CHR`, and `[A]TRANS` shifts — while angles (`AR`, `AP`, the `ANG` modifier), `[A]ROT`, `[A]SCALE`, and rotary/spindle axes are never scaled. `$AA_IW[axis]` returns its value in the currently active units. Machines and programs saved before this existed default to metric.
    - feat(sld): a metric/inch toggle in the Single Line Debugger footer changes how the ruler is labeled. It's display-only — the parsed toolpath always follows the machine's configured units or an explicit `G70`/`G71` in the code, never the toggle. The Real-time Debug checkbox is hidden (not removed) to make room for it.
    - feat(contourEdit): the plane selector is now a G17/G18/G19 dropdown (previously three buttons), and a new metric/inch toggle controls the precision snap grid (`1/0.5/0.1/0.01` mm vs. `0.1/0.05/0.01/0.001"`), the coordinate/radius fields in the element properties panel, the live cursor-position readout, and the numbers written into generated turning cycles. The underlying contour geometry is always stored in millimeters — switching units only changes how it's displayed and how new points snap.
    - test: added 20 cases covering unit scaling in the parser, `$AA_IW` in inch mode, and machine.units back-compat. Total test count is now 186.

#### v0.3.32
    - fix(sld): contour/blank now also dedup when called from a subroutine (not just from main). Each called subroutine has its own auto-comment parsed and stored in `parseData.subroutineMeta`, and the dedup check consults that map in addition to `programmData[mainFile]`. Toggling the new **Duplicate drawing the same blank from program** checkbox (mirror of the contour one) controls the same suppression for blanks.
    - fix(sld): `contourElements` and its metadata are now reset on every re-parse (preserving only `BOUNDING_*` buckets) — toggling the contour/blank duplicate checkbox no longer doubles the bucket contents on each click. Without this every redraw appended a fresh copy of the shape geometry, producing the duplicated lines + extra G0 the user observed.
    - fix(contourEdit): shape panel filter switched from prefix matching (`startsWith(name + '_')`) to exact equality on `contourElementsMeta[k].basename`. Previously `contour.name = "CONTOUR"` accidentally also matched `CONTOUR_MIRR_MPF`, `CONTOUR_MPF_r` and any other `CONTOUR_*` subroutine; now only the exact-named shape entry shows up. Wrappers (e.g. `CONTOUR_MIRR.MPF` doing `MIRROR / CONTOUR / MIRROR`) load their nested geometry into the wrapper's bucket so the panel entry that matches the auto-comment is populated with the transformed contour.
    - fix(contour): bucket key for `contourElements` is no longer suffixed with `_r` on recursive subroutine calls. `_r` stays only on the variable scope (where it belongs), so the contourEdit panel no longer shows ghost entries like `CONTOUR_MPF_r`.
    - fix(contour): subroutine basename is derived cross-platform (`subroutine.path.split(/[\\/]/).pop()` + `normalizeFileName`), so the same bucket key is produced on Linux and Windows.
    - test: added 11 cases for `normalizeFileName` and 9 for the newly-extracted `parseAutoComment` pure function. Total test count is now 150.
    - chore: `parseAutoComment(text)` is now a pure function in `inner-comment.js` reused by `loadDataFromComment` for the active editor and by `primitives.js` for every called subroutine.
    - feat(sld-popup): subroutine popup now shows the full call stack as a row of clickable chips (one per nesting level plus the element's own file). Clicking a chip switches the code block, header, and Edit/Pin button to that level — the entire chain from the main call site down to the leaf subroutine is navigable without closing the popup.
    - fix(sld): `mainRow` is now correctly propagated through the full call stack. Previously the guard `if (mainRow === undefined)` caused elements from deeply nested subroutines to keep an intermediate call-site row instead of the main-program row, so WebGL click-to-jump landed on the wrong line.
    - fix(sld): Details button now works when the WebGL 2D renderer is active. Previously it tried to `removeChild` the Canvas 2D element which was already detached in WebGL mode; the open/close handlers now check the active renderer and call the correct tear-down path.
    - fix(sld): click-to-jump decoration in the WebGL viewport is now cleared on the first cursor move, the same way as the slow-debug decoration — it no longer persists and expands to new lines after editing.
    - fix(3d): pause and other non-geometry elements are now filtered out of blank/contour shape arrays before building the closing connector. Subroutine calls inside BLANK/CONTOUR programs could produce pause entries that ended up as the last element, producing a malformed closing segment in the 3D viewport.
    - fix(3d): blank and contour shapes in the 3D viewport are now flat `ShapeGeometry` meshes with `polygonOffset` instead of extruded volumes. Eliminates z-fighting at any camera angle; `depthWrite: false` prevents the semi-transparent shapes from occluding the toolpath.
    - fix(3d): pan and zoom speed now scale proportionally with camera distance. Speed is boosted by `max(1, 200/dist)` so close-up work on large scenes stays responsive; the `> 500` target-chase guard that capped effective distance is removed. Orbit minimum distance guard (`< 100`) is preserved to prevent the camera from merging with the target.
    - fix(ui): time calculation button now shows a pointer cursor and a hover background color, matching the visual behaviour of other buttons in the panel.

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

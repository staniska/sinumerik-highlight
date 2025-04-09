#### v0.0.8
    - add circular interpolation with CR and AR

#### v0.0.12
    - working in Windows restored (dir path bug fixed).
    - add support for IF - ELSE - ENDIF  jumps.
    - add support for GOTO[BF] without IF jumps.

#### v0.0.13
    - add support polar coordinates (AP, RP, G110-G112).
    - DIAMON/DIAMOF interpreter.
    
#### v0.0.14
    - clear console log :)
    
#### v0.0.16
    - add third axis in circular intrpolation 
    - TURN support
    
#### v0.0.17
    - 'comment selected lines' function added (Ctrl + Alt + ;)
    - RND support between lines
    
#### v0.0.18
    - 1 RND bug fix
    
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
    
#### v0.0.22
    - coordinate rulers
    - different colors for G40/41/42 lines
    - check conditions for float fix
    - call subroutine with math/R-vars
    - smooth rendering for debugging
    
#### v0.0.23
    - fix subroutines path bug

#### v0.0.24
    - fix float accuracy in comparisons
    - discarding a comment from string when parsing
   
#### v0.0.25
    - display MSG in slow debug mode
    - fix subroutine call bug
    - string parse
    - ROUND bug fix

#### v0.0.26
    - fix subroutines path dialog for Win

#### v0.0.28
    - parse variables in subroutine call
    - fix "<>" bug in condition parse
    - recursive subroutine call
    - fix float bug in conditions
    - fix 'OR' replacement
    - pasing STRING concatenation

#### v0.0.30
    - last element with "RND|CHR" drawing bug fixed.
    - decrease timeout for short elements in SlowDebug.
    - fixed render queue in Slow Debug Mode.
    

#### v0.0.32
    - OFFN support
    - individual snippets for machine tools

#### v0.0.33
    - display C axis as ROT

#### v0.0.34
    - blank & contour file path selector
    - blank & contour filled figures
    - fix pole bug in DIAMON/DIAM90 mode
    - EXECSTRING parse
    - WHILE - ENDWILE support
    - FOR - ENDFOR support only for R-vars
    - [A]MIRROR support
    - select containing folder for program file via teletype

#### v0.0.35
    - $P_GG[29] - only for G group 29 (DIAMOF/DIAMON/DIAM90)
    - fix some bugs

#### v0.0.36
    - FOR-ENDFOR with named variable
    - calculation of RP perfomed in WCS
    - calculation of ANG with MIRROR in WCS
    - Circle end point tolerance increased

#### v0.0.37
    - critical rounding bug fix

#### v0.0.39
    - MCALL support (1000 calls max)
    - reduced errors num in the condition calculations
    - fix G2/G3 (distance == 2 * CR) math error
    - bug COS/ACOS SIN/ASIN fixed
    - scale & offset in slow debug mode without canvas reset
    - bolding selected rows on drawing

#### v0.0.41
    - tool orientation (T10[1-9]) can be parsed from comment in previous line ex. ';T103'
    - cnc type selector for sinumerik-to-nc pack
    - contour edit tools

#### v0.0.43
    - fix contours saving func for windows

#### v0.0.44 - v0.3.5
    - many features inc. Contour tools for roughing 

#### v0.3.6
    - add 3D toolpath wiev

#### v0.3.7
    - display contours for all programs in directory
    - add closed contour turning cycle
    - fix turning cycle direction selector

#### v0.3.8
    - fix turning cycle safety distance

#### v0.3.11
    - fix some change editor errors
    - add optons for FANUC toolchange
    - 3D viewport redraw with ctrl-alt-r, fix zoom/pan/rotate bug
    - Abort parsing when NaN is received
    - fix ENDWHILE searching
    - fix area selection bug

#### v0.3.12
    - fix G33 interpretation error in MIRROR mode
    - add machining time calculation
    - save viewport position & scale for every file in SLD & ContourEditModes

#### v0.3.15
    - add support for user .DEF files placed in subroutine folder
    - increase selectArea function speed
    - add loading contour from blank & contour files
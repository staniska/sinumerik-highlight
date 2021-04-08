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
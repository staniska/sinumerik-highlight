## sinumerik-highlight package


**Be sure to check the toolpath in a normal debugger, for example in the Sinutrain.**

**Package contain many errors. Infinite loop possible.**

**Please write issues as accurately as possible, with a minimum G-code for clarification.**

***
**Important! Before update package save ~.pulsar/packages/sinumerik-highlight/userData/ contents.**

***
Press Ctrl + Alt + o to activate highlight and show right panel.
Backlight colors are set tightly and were not checked in a dark theme.

You can select Lathe or mill type in Machine manager. The selected type affects the DIAMON settings (for lather) and the main plane (G17 for mill and G18 for lathe).
Subroutine folder path can be installed for every machine. CNC type can be selected for translation Sinumerik code to others CNC's using "sinumerik-to-nc" package (beta testing state).

Paths to corresponding snippets can be defined for each machine. 
See the snippet syntax on https://github.com/staniska/cnc-subroutines/tree/master/snippets/DMG_CTX510. " Alt + Spacebar" - open snippets menu. Navigation through the snippets 
menu items is carried out using the arrows keys. 

Single line debugger allows you to see an approximate tool path.
Parsing errors can be seen by clicking on the button "Details".
Clicking on the graphic window allows you to control the view using the arrows as well as + (=) and - buttons.
Scroll and drag works too

Blank & part contours can be programmed with G-code path & drawed on SingleLineDebug canvas
Default names: BLANK.MPF & CONTOUR.MPF

3D viewport of Single line debugger displays toolpath in perspective mode.
Slow debug not supported in 3D mode yet. Mouse contols:
- LMB - rotate view
- Wheel - zoom
- Shift + LMB - pan view
- Ctrl - decrease rotate / pan / zoom speed

The ContourEdit panel can help create roughing cycles ,
but it is still being tested. The contour must be closed.
The calculated intersection points will turn red. 
Starting elements are highlighted in green, ending elements 
are highlighted in blue. The result code is inserted into
the program when the cursor position changes.

Linear interpolation supported including Ang modifier.
Circular interpolation programming is possible through:
- the end point and center
- the end point and radius CR (including arc > 180 degrees - CR < 0)
- the end point and AR
- the center point and AR

#### Supported futures:
- Polar coordinates (AP, RP)
- Rounding (RND) between two lines or line and arc
- Chamfer (only CHR) between lines
- DIAMON / DIAMOF / DIAM90
- [A]TRANS & [A]ROT $ [A]MIRROR
- Subroutines can be called from the same directory as the program and subroutine path of active machine with the parameters.
- R-variables
- User variables definition and call assignment.
- User variables from a .DEF file placed in the subroutine folder are supported (REAL, INT and STING types). CHAN is ignored.
- G40/41/42 different colors
- OFFN
- $AA_IW[axis]
- Tool orientation $TC_DP2 can be used for tools T101-T109, where the units place corresponds to orientation (there are help image in machine manager)\
  >T103
- Tool orientation (T10[1-9]) can be parsed from comment in previous line ex. ';T103'
- $P_TOOLR (tool radius) set as comment line e.g. ;T103 R0.8 before tool change operator:\
  >;T103 R0.8\
  T="FINE_TOOL" D1 M6
- Calc lathe tool compensation function decrease approach/departure paths for G41/42 without taking into tangent point. 
  Programmed path not tool center point renders. Use with caution
- Math SIN COS TAN ASIN ACOS ATAN2 POT SQRT TRUNC ROUND
- GOTO[BF] jumps
- IF - ELSE - ENDIF
- REPEAT
- WHILE - ENDWHILE
- FOR TO  - ENDFOR
- MSG(" ") 
- EXECSTRING(" ")
- string concatenation (<<) works correctly for strings without spaces; only for EXECSTRING there are no such restrictions
- MCALL (max 1000 calls)

SINUMERIK standart cycles (eg HOLES2, CYCLE81) not supported.**



#### Keyboard shortcuts:
- "Ctrl + Alt + o" - open/close right panel
- "Ctrl + Alt + ;" - comment/uncomment selected lines;<br>
- "Ctrl + Alt + R" - draw tool path without changing scale
- " Alt + Spacebar" - open snippets menu

![A screenshot of your package](images/Screenshot_1.png)

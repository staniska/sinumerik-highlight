# sinumerik package

Siemens Sinumerik highlight.

**Be sure to check the toolpath in a normal debugger, for example in the Sinutrain
Package contain many errors. Infinite loop possible.
Please write issues as accurately as possible, with a minimum G-code for clarification.**

Press Ctrl + Alt + o to activate higlight and show right panel.
Backlight colors are set tightly and were not checked in a dark theme.

You can select Lathe or mill type in Machine manager. 
The selected type affects the DIAMON settings (for lather) and the main plane (G17 for mill and G18 for lathe).

Single line debug allows you to see an approximate tool path.
Clicking on the graphic window allows you to control the view using the arrows as well as + (=) and - buttons

Linear interpolation supported including Ang modifier.
Circular interpolation programming is possible through:
  - the end point and center
  - the end point and radius CR (including arc > 180 degrees - CR < 0)
  - the end point and AR
  - the center point and AR
[A]TRANS & [A]ROT supported.
Subroutines in the same directory as the program can be called along with the parameters. <br>
R-variables supported.<br>
Math SIN COS TAN ASIN ACOS ATAN2 POT SQRT TRUNC ROUND supported.<br>
User variables definition and call assignment.<br>
GOTO[BF] jumps supported<br>
IF - ELSE - ENDIF  supported<br>

**MCALL not supported;<br>
G2/G3 with TURN or third Axis not supported;<br> 
SINUMERIK standart cycles (eg HOLES2, CYCLE81) not supported.**



![A screenshot of your package](https://f.cloud.github.com/assets/69169/2290250/c35d867a-a017-11e3-86be-cd7c5bf3ff9b.gif)

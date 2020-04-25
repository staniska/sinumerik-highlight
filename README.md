# sinumerik package

Siemens Sinumerik highlight.

**Be sure to check the toolpath in a normal debugger, for example in the Sinutrain
Package contain many errors. Infinite loop possible.
Please write issues as accurately as possible, with a minimum G-code for clarification.**

Press Ctrl + Alt + o to activate higlight and show right panel <br>.
Backlight colors are set tightly and were not checked in a dark theme.<br>
<br>
You can select Lathe or mill type in Machine manager. <br>
The selected type affects the DIAMON settings (for lather) and the main plane (G17 for mill and G18 for lathe).
<br>
<br>
Single line debug allows you to see an approximate tool path.<br>
Parsing errors can be seen by clicking on the button "Details" <br>
Clicking on the graphic window allows you to control the view using the arrows as well as + (=) and - buttons

Linear interpolation supported including Ang modifier.<br>
Circular interpolation programming is possible through:
  - the end point and center
  - the end point and radius CR (including arc > 180 degrees - CR < 0)
  - the end point and AR
  - the center point and AR
  
Polar coordinates (AP, RP) supported. <br>
DIAMON / DIAMOF <br>
[A]TRANS & [A]ROT supported. <br>
Subroutines in the same directory as the program can be called along with the parameters. <br>
R-variables supported.<br>
Math SIN COS TAN ASIN ACOS ATAN2 POT SQRT TRUNC ROUND supported.<br>
User variables definition and call assignment.<br>
GOTO[BF] jumps supported<br>
IF - ELSE - ENDIF  supported<br>

**MCALL not supported;<br>
SINUMERIK standart cycles (eg HOLES2, CYCLE81) not supported.**



![A screenshot of your package](images/Screenshot_1.png)

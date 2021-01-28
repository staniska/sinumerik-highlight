# sinumerik package

Siemens Sinumerik highlight.

**Be sure to check the toolpath in a normal debugger, for example in the Sinutrain<br>
Package contain many errors. Infinite loop possible.<br>
Please write issues as accurately as possible, with a minimum G-code for clarification.**

Press Ctrl + Alt + o to activate higlight and show right panel <br>
Backlight colors are set tightly and were not checked in a dark theme.<br>
<br>
You can select Lathe or mill type in Machine manager. <br>
The selected type affects the DIAMON settings (for lather) and the main plane (G17 for mill and G18 for lathe).<br>
Subroutine folder path can be installed for every machine

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
Rounding (RND) between two lines or line and arc supported <br>
Chamfer (only CHR) between lines supported<br>
DIAMON / DIAMOF / DIAM90 <br>
[A]TRANS & [A]ROT supported. <br>
Subroutines can be called from the same directory as the program and subroutine path of active machine with the parameters. <br>
R-variables supported.<br>
'$AA_IW[axis]' supported<br>
Tool orientation $TC_DP2 can be used for tools T101-T109, where the units place corresponds to orientation (there are help image in machine manager)<br>
Math SIN COS TAN ASIN ACOS ATAN2 POT SQRT TRUNC ROUND supported.<br>
User variables definition and call assignment.<br>
GOTO[BF] jumps supported<br>
IF - ELSE - ENDIF  supported<br>

**MCALL not supported;<br>
SINUMERIK standart cycles (eg HOLES2, CYCLE81) not supported.**



"Ctrl + Alt + ;" - comment selected lines;<br>
"Ctrl + Alt + R" - draw tool path without changing scale

![A screenshot of your package](images/Screenshot_1.png)

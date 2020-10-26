'use babel';



export let replacements = {};

    replacements.Math = {};
    replacements.Math.desired = [];
    replacements.Math.substitution = [];
    //TAN
    replacements.Math.desired[0] = 'TAN';
    replacements.Math.substitution[0] = 'myMath.tan';
    //SIN
    replacements.Math.desired[1] = 'SIN';
    replacements.Math.substitution[1] = 'myMath.sin';
    //COS
    replacements.Math.desired[2] = 'COS';
    replacements.Math.substitution[2] = 'myMath.cos';
    //ASIN
    replacements.Math.desired[3] = 'ASIN';
    replacements.Math.substitution[3] = 'myMath.asin';
    //ACOS
    replacements.Math.desired[4] = 'ACOS';
    replacements.Math.substitution[4] = 'myMath.acos';
    //ATAN2
    replacements.Math.desired[5] = 'ATAN2';
    replacements.Math.substitution[5] = 'myMath.atan2';
    //SQRT
    replacements.Math.desired[6] = 'SQRT';
    replacements.Math.substitution[6] = 'Math.sqrt';
    //POT
    replacements.Math.desired[7] = 'POT';
    replacements.Math.substitution[7] = 'myMath.pot';
    //ABS
    replacements.Math.desired[8] = 'ABS';
    replacements.Math.substitution[8] = 'Math.abs';
    //TRUNC
    replacements.Math.desired[9] = 'TRUNC';
    replacements.Math.substitution[9] = 'Math.trunc';
    //ROUND
    replacements.Math.desired[10] = 'ROUND';
    replacements.Math.substitution[10] = 'Math.round';
    //MAXVAL
    replacements.Math.desired[11] = 'MAXVAL';
    replacements.Math.substitution[11] = 'Math.max';



    replacements.Bool = {};
    replacements.Bool.desired = [];
    replacements.Bool.substitution = [];
    replacements.Bool.desired[0] = 'AND';
    replacements.Bool.substitution[0] = '&&';

    replacements.Bool.desired[1] = 'OR';
    replacements.Bool.substitution[1] = '||';




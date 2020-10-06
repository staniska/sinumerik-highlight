'use babel';

var fs = require("fs-extra");
var path = require("path");

import View from './sinumerik'
import sinumerikMath from "./degreesMath";
import {replacements} from "./replacements";
import {insertRnd, insertChr} from './element-insert';

const myMath = new sinumerikMath();

export function progParser(lastLineNum) {
    const Editor = atom.workspace.getActiveTextEditor();
    var filename = Editor.getTitle().replace('.','_').toUpperCase();
    let sinumerikEventHandler = View.sinumerikView.eventRouter.route.bind(this);


    //First call or change filename
    if (!View.sinumerikView.parseData ||
        View.sinumerikView.parseData.length < 1 ||
        View.sinumerikView.parseData.filename != filename) {

        View.sinumerikView.parseData = {};
        View.sinumerikView.parseData.filename = filename;

        Editor.onDidStopChanging(function () {
            // const Editor = atom.workspace.getActiveTextEditor();
            // var filename = Editor.getTitle().replace('.','_').toUpperCase();
            // if (View.sinumerikView.parseData.filename == filename){
            //     var changedRow = Editor.getCursorBufferPosition().row;
            //     if (View.sinumerikView.parseData.lastChangedRow) {
            //         View.sinumerikView.parseData.lastChangedRow = Math.min(View.sinumerikView.parseData.lastChangedRow,changedRow);
            //     } else {
            //         View.sinumerikView.parseData.lastChangedRow = changedRow;
            //     }
            //     // console.log(View.sinumerikView.singleLineDebugInfoDiv.realTimeDebugCheck.checked);
            //     // console.log('last changed row: ' + View.sinumerikView.parseData.lastChangedRow);
            //
            //     if (View.sinumerikView.singleLineDebugInfoDiv.realTimeDebugCheck.checked) {
            //         parseDataClear(filename);
            //         parseRows(Editor.getText().split('\n'), filename);
            //         parseDataErrorsDisplay(filename);
            //         sinumerikEventHandler('{"emitter": "singleLine", "event": "changeCanvasPrimitives"}');
            //     }
            // }
            drawChanges(0);
        });
    }


    var dirPath = Editor.getPath();
    //check Windovs :)
    var dirPathSlicer = '/';
    if (dirPath[1] == ':') {
        dirPathSlicer = '\\';
    }
    dirPath = dirPath.slice(0, dirPath.lastIndexOf(dirPathSlicer));

    parseDataClear(Editor.getTitle().replace('.','_').toUpperCase());

    // ЭТО ОЧЕНЬ ВАЖНАЯ ХЕРНЯ, ТПА АСИНХРОННАЯ И ВСЕ ТАКОЕ. МОЖЕТ ПОТОМ ПРИМЕНИМ.
    // fs.readdir(dirPath, function (err, files) {
    //     //handling error
    //     if (err) {
    //         return console.log('Unable to scan directory: ' + err);
    //     }
    //     //listing all files using forEach
    //     files.forEach(function (file) {
    //         // Do whatever you want to do with the file
    //         fs.stat(`${dirPath}/${file}`, function (err, stat) {
    //             if (stat.isFile() && path.extname(file).toUpperCase().match(/MPF|SPF/)) {
    //                 var subroutine = {};
    //                 subroutine.name = file.slice(0, file.lastIndexOf('.')).toUpperCase();
    //                 subroutine.path = `${dirPath}/${file}`;
    //                 View.sinumerikView.parseData.subroutines.push(subroutine);
    //             }
    //         });
    //     });
    // });
    View.sinumerikView.parseData.subroutines = [];

    var files = fs.readdirSync(dirPath);
    if (files) {
        files.forEach(function (file) {
             var stat = fs.statSync(`${dirPath}/${file}`);
             if (stat.isFile() && path.extname(file).toUpperCase().match(/MPF|SPF/)) {
                 var subroutine = {};
                 subroutine.name = file.slice(0, file.lastIndexOf('.')).toUpperCase();
                 subroutine.path = `${dirPath}/${file}`;
                 View.sinumerikView.parseData.subroutines.push(subroutine);
             }
        })
    }
    if (View.sinumerikView.machineData.subroutines[View.sinumerikView.programmData[filename].machine.machineName]) {
        for (let i = 0; i < View.sinumerikView.machineData.subroutines[View.sinumerikView.programmData[filename].machine.machineName].length; i ++) {
            dirPath = View.sinumerikView.machineData.subroutines[View.sinumerikView.programmData[filename].machine.machineName][i];
            // console.log(View.sinumerikView.machineData.subroutines[View.sinumerikView.programmData[filename].machine.machineName][i]);
            files = fs.readdirSync(dirPath);
            if (files) {
                files.forEach(function (file) {
                    var stat = fs.statSync(`${dirPath}/${file}`);
                    if (stat.isFile() && path.extname(file).toUpperCase().match(/MPF|SPF/)) {
                        var subroutine = {};
                        subroutine.name = file.slice(0, file.lastIndexOf('.')).toUpperCase();
                        subroutine.path = `${dirPath}/${file}`;
                        View.sinumerikView.parseData.subroutines.push(subroutine);
                    }
                })
            }
        }
    }

    // console.log(View.sinumerikView.parseData.subroutines);

    parseRows(Editor.getText().split('\n'), filename);

    parseDataErrorsDisplay();

}

export function drawChanges (redraw) {
    // console.log("drawChanges");
    let sinumerikEventHandler = View.sinumerikView.eventRouter.route.bind(this);
    const Editor = atom.workspace.getActiveTextEditor();
    var filename = Editor.getTitle().replace('.','_').toUpperCase();
    if (View.sinumerikView.parseData.filename == filename){
        var changedRow = Editor.getCursorBufferPosition().row;
        if (View.sinumerikView.parseData.lastChangedRow) {
            View.sinumerikView.parseData.lastChangedRow = Math.min(View.sinumerikView.parseData.lastChangedRow,changedRow);
        } else {
            View.sinumerikView.parseData.lastChangedRow = changedRow;
        }
        // console.log(View.sinumerikView.singleLineDebugInfoDiv.realTimeDebugCheck.checked);
        // console.log('last changed row: ' + View.sinumerikView.parseData.lastChangedRow);

        if (View.sinumerikView.singleLineDebugInfoDiv.realTimeDebugCheck.checked || redraw) {
            parseDataClear(filename);
            parseRows(Editor.getText().split('\n'), filename);
            parseDataErrorsDisplay(filename);
            sinumerikEventHandler('{"emitter": "singleLine", "event": "changeCanvasPrimitives"}');
        }
    }
}


function parseDataErrorsDisplay() {
    if (View.sinumerikView.singleLineDebugStringParseDetailsDiv.errors) {
        if (View.sinumerikView.singleLineDebugStringParseDetailsDiv.errors.parentElement) {
            View.sinumerikView.singleLineDebugStringParseDetailsDiv.removeChild(View.sinumerikView.singleLineDebugStringParseDetailsDiv.errors);
            delete View.sinumerikView.singleLineDebugStringParseDetailsDiv.errors;
            View.sinumerikView.singleLineDebugStringParseDetailsDiv.errors = document.createElement('div');
        }
    } else {
        View.sinumerikView.singleLineDebugStringParseDetailsDiv.errors = document.createElement('div');
    }
    View.sinumerikView.singleLineDebugStringParseDetailsDiv.errors.className = 'sinumerikErrorDiv';

    View.sinumerikView.singleLineDebugStringParseDetailsDiv.appendChild(View.sinumerikView.singleLineDebugStringParseDetailsDiv.errors);

    View.sinumerikView.parseData.errors.forEach(function (error, i) {
        View.sinumerikView.singleLineDebugStringParseDetailsDiv.errors[`error_${i}_Div`] = document.createElement('div');
        View.sinumerikView.singleLineDebugStringParseDetailsDiv.errors[`error_${i}_Div`].innerText = error.text;
        View.sinumerikView.singleLineDebugStringParseDetailsDiv.errors.appendChild(View.sinumerikView.singleLineDebugStringParseDetailsDiv.errors[`error_${i}_Div`]);
    });

    if (View.sinumerikView.parseData.errors.length) {
        View.sinumerikView.singleLineDebugParseStringDiv.stringDiv.innerText = `ERR (${View.sinumerikView.parseData.errors.length}).  Last: ${View.sinumerikView.parseData.errors[View.sinumerikView.parseData.errors.length - 1].text}`;
        View.sinumerikView.singleLineDebugParseStringDiv.stringDiv.style.color = 'red';
    } else {
        View.sinumerikView.singleLineDebugParseStringDiv.stringDiv.innerText = 'PARSE OK';
        View.sinumerikView.singleLineDebugParseStringDiv.stringDiv.style.color = 'dimgray';
    }

}

function parseDataClear(programName) {
    //region Frame
    View.sinumerikView.parseData.frame = {};
    View.sinumerikView.parseData.frame.trans = {}
    View.sinumerikView.parseData.frame.trans.X = 0;
    View.sinumerikView.parseData.frame.trans.Y = 0;
    View.sinumerikView.parseData.frame.trans.Z = 0;
    View.sinumerikView.parseData.frame.rot = {};
    View.sinumerikView.parseData.frame.rot.X = 0;
    View.sinumerikView.parseData.frame.rot.Y = 0;
    View.sinumerikView.parseData.frame.rot.Z = 0;
    View.sinumerikView.parseData.frame.basis = [[1,0,0],[0,1,0],[0,0,1]];
    View.sinumerikView.parseData.frame.invertBasis = [[1,0,0],[0,1,0],[0,0,1]];


    //endregion

    View.sinumerikView.parseData.canvas = [];
    View.sinumerikView.parseData.axesPos = {};
    View.sinumerikView.parseData.axesPos.X = 10000;
    View.sinumerikView.parseData.axesPos.Z = 10000;
    View.sinumerikView.parseData.pole = {X:0, Y:0, Z:0, AP:0, RP:0};

    View.sinumerikView.parseData.prevMove = [];

    View.sinumerikView.parseData.plane = 'G17';
    if (View.sinumerikView.singleLineDebugData.machine.machineType == 'Lathe') {
        View.sinumerikView.parseData.diamon = 1;
        View.sinumerikView.parseData.diam90 = 0;
        View.sinumerikView.parseData.axesPos.Y = 0;
        View.sinumerikView.parseData.plane = 'G18';
    } else {
        View.sinumerikView.parseData.axesPos.Y = 10000;
        View.sinumerikView.parseData.diamon = 0;
    }

    if (View.sinumerikView.programmData[programName].machine.diam90) {
        View.sinumerikView.parseData.diam90 = 1;
    }


    View.sinumerikView.parseData.moveGroup = '';
    View.sinumerikView.parseData.primitives = [];
    View.sinumerikView.parseData.errors = [];
    View.sinumerikView.parseData.variables = {};
    View.sinumerikView.parseData.variables.firstChannelVariables = {};
    View.sinumerikView.parseData.jumps = {};
    View.sinumerikView.parseData.jumps[programName] = {};
    View.sinumerikView.parseData.jumps[programName].ifGoto = {};
    View.sinumerikView.parseData.jumps[programName].goto = {};
    View.sinumerikView.parseData.jumps[programName].ifElseEndif = {};
    View.sinumerikView.parseData.jumps[programName].repeat = {};
    View.sinumerikView.parseData.activeTool = 0;
    View.sinumerikView.parseData.toolRadiusCompensation = 'G40';

    // console.log(View.sinumerikView.programmData[programName].machine);

}

function parseRows(programText, programName, variables) {
    console.log('parseRows for ' + programName);
    // console.log(programText);

    var rowAfterDefs = 0;
    View.sinumerikView.parseData.variables[programName] = {};

    if (variables) {
        variables.forEach(function(variable, i) {
            variables[i] = mathParse(variable.trim(), programName);
        });
        // console.log('CALL with Variables: ' + variables.toString());
        // console.log(variables);
    } else {
        variables = [];
    }
    //search PROC DEF
    for (let i = 0; i < programText.length; i++) {
        if (programText[i].trim().substring(0,1) != ';' &&
            programText[i].trim().length > 2) {
            // console.log(i + ' ' + programText[i]);
            if (programText[i].split(' ')[0].match(/PROC|DEF/)) {
                checkDef(programText[i],programName, variables, i);
                // console.log(programmText[i]);
                // console.log('Search PROC DEF');
            } else {
                // console.log(`${programName} Definitions search end at row ${rowAfterDefs + 1}`);
                break;
            }
        }
        rowAfterDefs ++ ;
    }

    for (let row = rowAfterDefs; row < programText.length; row ++) {
        var rowText = programText[row];


        if (rowText.match(';')) {
            rowText = rowText.substring(0, rowText.indexOf(';'));
        }

        // console.log(rowText);

        if (rowText.trim().length < 2 ||
            rowText.trim().substring(0,1).match(';')) {
            if (rowText.trim().length && rowText.trim().length < 2 && rowText.trim() != ';') {
                View.sinumerikView.parseData.errors.push({text: `Line too short "${rowText.trim()}"  prog ${programName} row ${row + 1}`, row: row})
            }
        } else {

            if (!View.sinumerikView.parseData.jumps[programName]) {
                View.sinumerikView.parseData.jumps[programName] = {};
                View.sinumerikView.parseData.jumps[programName].ifElseEndif = [];
                View.sinumerikView.parseData.jumps[programName].repeat = [];
                View.sinumerikView.parseData.jumps[programName].goto = [];
                View.sinumerikView.parseData.jumps[programName].ifGoto = [];

            }

            //check IF () GOTO
            var jump = checkIfGoto(rowText, programName, programText, row);
            if (jump >= 0) {
                row = jump - 1;
                continue;
            }
            //check GOTO
            jump = checkGoTo(rowText, programName, programText, row);
            if (jump >= 0) {
                row = jump -1;
                continue;
            }

            jump = checkIfElseEndif(rowText, programName, programText, row);
            if (jump >= 0) {
                // console.log(rowText + '   row: ' + jump);
                row = jump -1;
                continue;
            }

            jump = checkRepeat(rowText, programName, programText, row);
            if (jump >=0) {
                row = jump - 1;
                continue;
            }


            var primitives = generatePrimitives(rowText, programName, row);

            if (primitives) {
                for (let i = 0; i < primitives.length; i++) {

                    for (var iter in primitives[i].operators) {
                       // console.log(primitives[i].operators[iter]);
                        var operator = primitives[i].operators[iter];
                        if (operator.type == 'assignment') {
                            if (operator.name.match(/R\d*/) && operator.name.match(/R\d*/) == operator.name) {
                                //console.log('R assign');
                                if (!View.sinumerikView.parseData.variables.firstChannelVariables[operator.name]) {
                                    View.sinumerikView.parseData.variables.firstChannelVariables[operator.name] = {};
                                    View.sinumerikView.parseData.variables.firstChannelVariables[operator.name].name = operator.name;
                                    View.sinumerikView.parseData.variables.firstChannelVariables[operator.name].type = 'real';
                                }
                                View.sinumerikView.parseData.variables.firstChannelVariables[operator.name].value = operator.value;
                            } else {
                                //TODO добавить обработку ошибок в присвоении (правая сторона выражения)
                                View.sinumerikView.parseData.variables[`${programName}`][`${operator.name}`].value = operator.value;
                            }

                        }
                        if (operator.type == 'diamon') {
                            View.sinumerikView.parseData.diamon = 1;
                            View.sinumerikView.parseData.diam90 = 0
                        }
                        if (operator.type == 'diam90') {
                            View.sinumerikView.parseData.diamon = 1;
                            View.sinumerikView.parseData.diam90 = 1;
                        }
                        if (operator.type == 'diamof') {
                            View.sinumerikView.parseData.diamon = 0;
                            View.sinumerikView.parseData.diam90 = 0;
                        }

                        if (operator.type == 'T_name') {
                            View.sinumerikView.parseData.activeTool = operator.value;
                        }

                        if (operator.type == 'toolRadiusCompensation') {
                            View.sinumerikView.parseData.toolRadiusCompensation = operator.value;
                            // console.log(View.sinumerikView.parseData.toolRadiusCompensation);
                        }

                    }

                    generateCanvasPrimitives(primitives[i], programName, row);
                    View.sinumerikView.parseData.primitives.push(primitives[i]);
                    View.sinumerikView.parseData.primitives[View.sinumerikView.parseData.primitives.length - 1].row = row;
                    View.sinumerikView.parseData.primitives[View.sinumerikView.parseData.primitives.length - 1].filename = programName;
                }
            }
        }
        if ( row == (programText.length - 1)) {
            if (View.sinumerikView.parseData.prevMove.length) {
                if (View.sinumerikView.parseData.prevMove[0].type == 'G1') {
                    View.sinumerikView.parseData.prevMove[0].toolRadiusCompensation = View.sinumerikView.parseData.toolRadiusCompensation;
                    View.sinumerikView.parseData.canvas.push(View.sinumerikView.parseData.prevMove[0]);
                    View.sinumerikView.parseData.prevMove.shift();
                }
                if (View.sinumerikView.parseData.prevMove[0].type.match(/G[23]/)) {
                    generateCirclePrimitives();
                    View.sinumerikView.parseData.prevMove.shift();
                }

            }
        }
    }
}

function checkRepeat(rowText, programName, programText, row) {
    var regEx_REPEAT = /(?<!\w)REPEAT(?!\w)/;
    if (rowText.match(regEx_REPEAT)) {
        // console.log('REPEAT');

        // var Editor = atom.workspace.getActiveTextEditor();

        if (!View.sinumerikView.parseData.jumps[programName].repeat[row] || View.sinumerikView.parseData.jumps[programName].repeat[row].destinationRow == -1) {
            View.sinumerikView.parseData.jumps[programName].repeat[row] = {};
            View.sinumerikView.parseData.jumps[programName].repeat[row].jumps = 0;
            View.sinumerikView.parseData.jumps[programName].repeat[row].destinationRow = -1;

            rowText = rowText.replace(/[ ]+/g, ' ').trim().split(' ');
            if (rowText.length == 3) {
                if (rowText[2].match(/[P]\d/) != null) {
                    View.sinumerikView.parseData.jumps[programName].repeat[row].maxJumps = rowText[2].slice(1);
                } else if (rowText[2].match(/[P]=/) != null) {
                    View.sinumerikView.parseData.jumps[programName].repeat[row].maxJumps = mathParse(rowText[2].slice(2), programName);
                } else {
                    return -1;
                }
                if (View.sinumerikView.parseData.jumps[programName].repeat[row].maxJumps == null || View.sinumerikView.parseData.jumps[programName].repeat[row].maxJumps < 0) {
                    View.sinumerikView.parseData.errors.push({
                        text: `Pereat parse error P "${rowText[2]}". prog ${programName} row ${row + 1}`,
                        row: row
                    });
                    return -1;
                }
                var destinationName = rowText[1];
                var destinationRow = -1;
                var regEx_destName = new RegExp(`(?<!\\w)${destinationName}\\:(?!\\w)`);
                for (let i = row - 1; i > 0; i--) {
                    if (programText[i].match(regEx_destName)) {
                        destinationRow = i;
                        View.sinumerikView.parseData.jumps[programName].repeat[row].destinationRow = destinationRow;
                        break;
                    }
                }
                if (destinationRow < 0) {
                    View.sinumerikView.parseData.errors.push({
                        text: `Destination "${destinationName}" not found. prog ${programName} row ${row + 1}`,
                        row: row
                    });
                    return (row + 1);
                }
            }
        }

        if (View.sinumerikView.parseData.jumps[programName].repeat[row].jumps >= View.sinumerikView.parseData.jumps[programName].repeat[row].maxJumps) {
            View.sinumerikView.parseData.jumps[programName].repeat[row].jumps = 0;
            return (row + 1);
        }

        View.sinumerikView.parseData.jumps[programName].repeat[row].jumps ++;
        return View.sinumerikView.parseData.jumps[programName].repeat[row].destinationRow;
    }
    return (-1);
}

function checkIfElseEndif(rowText, programName, programText, row) {
    var regEx_IF = /(?<!\w)IF(?!\w)/;
    if (rowText.match(regEx_IF)) {
        // var Editor = atom.workspace.getActiveTextEditor();


        if (!View.sinumerikView.parseData.jumps[programName].ifElseEndif[row]) {
            View.sinumerikView.parseData.jumps[programName].ifElseEndif[row] = {};
            View.sinumerikView.parseData.jumps[programName].ifElseEndif[row].jumps = 0;
            View.sinumerikView.parseData.jumps[programName].ifElseEndif[row].maxJumps = 1000;
            if (View.sinumerikView.savedMaxJumps && View.sinumerikView.savedMaxJumps[programName] && View.sinumerikView.savedMaxJumps[programName][row]) {
                View.sinumerikView.parseData.jumps[programName].ifElseEndif[row].maxJumps = View.sinumerikView.savedMaxJumps[programName][row];
            }

            var string = programText[row];
            if (string.match(/GOTO[BF]?/) == null) {
                View.sinumerikView.parseData.jumps[programName].ifElseEndif[row].Else = searchIfElseEndif(programText, 'ELSE', row, 1);
                View.sinumerikView.parseData.jumps[programName].ifElseEndif[row].Endif = searchIfElseEndif(programText, 'ENDIF', row, 1);
                if (View.sinumerikView.parseData.jumps[programName].ifElseEndif[row].Endif < 0) {
                    View.sinumerikView.parseData.errors.push({text: `ENDIF not founded.  prog ${programName} row ${row + 1}`, row: row});
                    if (View.sinumerikView.parseData.jumps[programName].ifElseEndif[row].Else > 0) {
                        View.sinumerikView.parseData.jumps[programName].ifElseEndif[row].Endif = View.sinumerikView.parseData.jumps[programName].ifElseEndif[row].Else;
                    } else {
                        View.sinumerikView.parseData.jumps[programName].ifElseEndif[row].Endif = row + 1;
                    }
                }
                if (View.sinumerikView.parseData.jumps[programName].ifElseEndif[row].Else < 0) {
                    View.sinumerikView.parseData.jumps[programName].ifElseEndif[row].Else = View.sinumerikView.parseData.jumps[programName].ifElseEndif[row].Endif;
                }
            }
        }
        // console.log(View.sinumerikView.parseData.jumps[programName].ifElseEndif[row].Else);
        // console.log(View.sinumerikView.parseData.jumps[programName].ifElseEndif[row].Endif);

        if (View.sinumerikView.parseData.jumps[programName].ifElseEndif[row].jumps > View.sinumerikView.parseData.jumps[programName].ifElseEndif[row].maxJumps) {
            if (confirm(`Row ${row + 1}. The number of jumps exceeded ${View.sinumerikView.parseData.jumps[programName].ifElseEndif[row].maxJumps}. Add 1000 more jumps?`)) {
                View.sinumerikView.parseData.jumps[programName].ifElseEndif[row].maxJumps += 1000;
            } else {
                return (programText.length - 1);
            }
        }

        var conditionRow = rowText.slice(rowText.match(regEx_IF).index + 2).trim();
        var condition = checkCondition(conditionRow, programName);

        // console.log(row + ' ' + conditionRow);
        // console.log(View.sinumerikView.parseData.variables.firstChannelVariables);
        // console.log(condition);

        if (condition < 0) {
            if (View.sinumerikView.parseData.jumps[programName].ifElseEndif[row].jumps > 0) {
                View.sinumerikView.parseData.jumps[programName].ifElseEndif[row].jumps = 0;
            }
            View.sinumerikView.parseData.jumps[programName].ifElseEndif[row].jumps --;
            View.sinumerikView.parseData.errors.push({text: `Error in condition "${conditionRow}"  prog ${programName} row ${row + 1}`, row: row});
            return (row + 1);
        }
        if (condition == 0) {
            return (View.sinumerikView.parseData.jumps[programName].ifElseEndif[row].Else + 1);
        }
        if (View.sinumerikView.parseData.jumps[programName].ifElseEndif[row].jumps < 0) {
            View.sinumerikView.parseData.jumps[programName].ifElseEndif[row].jumps = 0;
        }
        View.sinumerikView.parseData.jumps[programName].ifElseEndif[row].jumps ++;
        return (row + 1);

    }

    var regEx_Else = /(?<!\w)ELSE(?!\w)/;
    if (rowText.match(regEx_Else)) {
        for (var key in View.sinumerikView.parseData.jumps[programName].ifElseEndif) {
            //console.log(View.sinumerikView.parseData.jumps[programName].ifElseEndif[key]);
            if (row == View.sinumerikView.parseData.jumps[programName].ifElseEndif[key].Else) {
                return (View.sinumerikView.parseData.jumps[programName].ifElseEndif[key].Endif + 1);
            }
        }
        View.sinumerikView.parseData.errors.push({text: `Error in the control structure. Unknown ELSE.  prog ${programName} row ${row + 1}`, row: row});
        return (row + 1);
    }

    var regEx_Endif = /(?<!\w)ENDIF(?!\w)/;
    if (rowText.match(regEx_Endif)) {
        for (var key in View.sinumerikView.parseData.jumps[programName].ifElseEndif) {
            // console.log(View.sinumerikView.parseData.jumps[programName].ifElseEndif[key]);
            if (row == View.sinumerikView.parseData.jumps[programName].ifElseEndif[key].Endif) {
                return (View.sinumerikView.parseData.jumps[programName].ifElseEndif[key].Endif + 1);
            }
        }
        View.sinumerikView.parseData.errors.push({text: `Error in the control structure. Unknown ENDIF.  prog ${programName} row ${row + 1}`, row: row});
        return (row + 1);
    }



    return -1;

    function searchIfElseEndif(programText, word, row, direction) {
        var lastRow = programText.length;
        var level = 0;
        var levelIncIf = direction;
        var levelIncEndif = - direction;

        row += direction;

        while (row < lastRow && row >= 0) {
            var string = programText[row];
            var operatorArr = string.trim().split(" ");
            var firstOperator = operatorArr[0];

            if (string.match(/GOTO[BF]?/) == null) {

                if (firstOperator == word && level == 0) {
                    return row;
                }
                if (firstOperator == 'IF') {
                    level += levelIncIf;
                }
                if (firstOperator == 'ENDIF') {
                    level += levelIncEndif;
                }
                if (level < 0) {
                    row = -2;
                }

            }

            row += direction;
        }
        return -1;
    }

}

function checkGoTo(rowText, programName, programText, row) {
    var regEx_GOTO = /(?<!\w)GOTO[B|F]?(?!\w)/
    if (rowText.match(regEx_GOTO)) {
        // var Editor = atom.workspace.getActiveTextEditor();

        if (!View.sinumerikView.parseData.jumps[programName].goto[row] || View.sinumerikView.parseData.jumps[programName].goto[row].destinationRow == -1) {
            View.sinumerikView.parseData.jumps[programName].goto[row] = {};
            View.sinumerikView.parseData.jumps[programName].goto[row].jumps = 0;
            View.sinumerikView.parseData.jumps[programName].goto[row].maxJumps = 1000;
            View.sinumerikView.parseData.jumps[programName].goto[row].type = 'GOTO';
            var match = rowText.match(regEx_GOTO);
            var destinationName = rowText.slice(match.index + match[0].length).trim();
            var destinationRow = -1;
            View.sinumerikView.parseData.jumps[programName].goto[row].destinationRow = destinationRow;
            var regEx_destName = new RegExp(`(?<!\\w)${destinationName}\\:(?!\\w)`);
            // console.log(match);
            if (match[0] == 'GOTOB') {
                for (let i = row - 1; i > 0; i --) {
                    if ( programText[i].match(regEx_destName)) {
                        destinationRow = i;
                        View.sinumerikView.parseData.jumps[programName].goto[row].destinationRow = destinationRow;
                        break;
                    }
                }
            }
            if (match[0] == 'GOTOF') {
                for (let i = row + 1; i < programText.length; i ++) {
                    if (programText[i].match(regEx_destName)) {
                        destinationRow = i;
                        View.sinumerikView.parseData.jumps[programName].goto[row].destinationRow = destinationRow;
                        break;
                    }
                }
            }
            if (match[0] == 'GOTO') {
                for (let i = 0; i < programText.length; i ++) {
                    if (programText[i].match(regEx_destName)) {
                        destinationRow = i;
                        View.sinumerikView.parseData.jumps[programName].goto[row].destinationRow = destinationRow;
                        break;
                    }
                }
            }
            if (destinationRow < 0) {
                View.sinumerikView.parseData.errors.push({text: `Destination "${destinationName}" not found. prog ${programName} row ${row + 1}`, row: row});
                return (row + 1);
            }
        }
        if (View.sinumerikView.parseData.jumps[programName].goto[row].jumps > View.sinumerikView.parseData.jumps[programName].goto[row].maxJumps) {
            if (confirm('The number of jumps exceeded 1000. Add 1000 more jumps?')) {
                View.sinumerikView.parseData.jumps[programName].goto[row].maxJumps += 1000;
            } else {
                return (programText.length - 1);
            }
        }

        View.sinumerikView.parseData.jumps[programName].goto[row].jumps ++;
        return View.sinumerikView.parseData.jumps[programName].goto[row].destinationRow;

    }
    return -1;
}

function checkIfGoto (rowText, programName, programText, row) {
    var regEx_IF = /(?<!\w)IF(?!\w)/;
    var regEx_GOTO = /(?<!\w)GOTO[B|F]?(?!\w)/
    if (rowText.match(regEx_IF) && rowText.match(regEx_GOTO)) {
        // var Editor = atom.workspace.getActiveTextEditor();

        var conditionRow = rowText.slice(rowText.match(regEx_IF).index + 2, rowText.match(regEx_GOTO).index).trim();
        var condition = checkCondition(conditionRow, programName);

        if (condition < 0) {
            View.sinumerikView.parseData.errors.push({text: `Error in condition "${conditionRow}"  prog ${programName} row ${row + 1}`, row: row});
            return (row + 1);
        }

        if (condition == 0) {
            return (row + 1)
        }

        if (!View.sinumerikView.parseData.jumps[programName].ifGoto[row] || View.sinumerikView.parseData.jumps[programName].ifGoto[row].destinationRow == -1) {
            View.sinumerikView.parseData.jumps[programName].ifGoto[row] = {};
            View.sinumerikView.parseData.jumps[programName].ifGoto[row].jumps = 0;
            View.sinumerikView.parseData.jumps[programName].ifGoto[row].maxJumps = 1000;
            if (View.sinumerikView.savedMaxJumps && View.sinumerikView.savedMaxJumps[programName] && View.sinumerikView.savedMaxJumps[programName][row]) {
                View.sinumerikView.parseData.jumps[programName].ifGoto[row].maxJumps = View.sinumerikView.savedMaxJumps[programName][row];
            }

            View.sinumerikView.parseData.jumps[programName].ifGoto[row].type = 'IF_GOTO';
            var match = rowText.match(regEx_GOTO);
            var destinationName = rowText.slice(match.index + match[0].length).trim();
            var destinationRow = -1;
            View.sinumerikView.parseData.jumps[programName].ifGoto[row].destinationRow = destinationRow;
            var regEx_destName = new RegExp(`(?<!\\w)${destinationName}\\:(?!\\w)`);
            // console.log(match);
            if (match[0] == 'GOTOB') {
                for (let i = row - 1; i > 0; i --) {
                    if (programText[i].match(regEx_destName)) {
                        destinationRow = i;
                        View.sinumerikView.parseData.jumps[programName].ifGoto[row].destinationRow = destinationRow;
                        break;
                    }
                }
            }
            if (match[0] == 'GOTOF') {
                for (let i = row + 1; i < programText.length; i ++) {
                    if (programText[i].match(regEx_destName)) {
                        destinationRow = i;
                        View.sinumerikView.parseData.jumps[programName].ifGoto[row].destinationRow = destinationRow;
                        break;
                    }
                }
            }
            if (match[0] == 'GOTO') {
                for (let i = 0; i < programText.length; i ++) {
                    if (programText[i].match(regEx_destName)) {
                        destinationRow = i;
                        View.sinumerikView.parseData.jumps[programName].ifGoto[row].destinationRow = destinationRow;
                        break;
                    }
                }
            }
            if (destinationRow < 0) {
                View.sinumerikView.parseData.errors.push({text: `Destination "${destinationName}" not found. prog ${programName} row ${row + 1}`, row: row});
                return (row + 1);
            }
        }
        if (View.sinumerikView.parseData.jumps[programName].ifGoto[row].jumps > View.sinumerikView.parseData.jumps[programName].ifGoto[row].maxJumps) {
            if (confirm(`Row ${row + 1}. The number of jumps exceeded ${View.sinumerikView.parseData.jumps[programName].ifGoto[row].maxJumps}. Doubled max jumps?`)) {
                View.sinumerikView.parseData.jumps[programName].ifGoto[row].maxJumps *= 2;
                console.log(View.sinumerikView.parseData.jumps[programName].ifGoto[row].maxJumps);
                if (!View.sinumerikView.savedMaxJumps) {
                    View.sinumerikView.savedMaxJumps = {};
                }
                if (!View.sinumerikView.savedMaxJumps[programName]) {
                    View.sinumerikView.savedMaxJumps[programName] = {};
                }

                View.sinumerikView.savedMaxJumps[programName][row] = View.sinumerikView.parseData.jumps[programName].ifGoto[row].maxJumps;
            } else {
                return (programText.length - 1);
            }
        }
        View.sinumerikView.parseData.jumps[programName].ifGoto[row].jumps ++;
        return View.sinumerikView.parseData.jumps[programName].ifGoto[row].destinationRow;

    }
    return -1;
}

function checkCondition(expression, programName) {
    // console.log(programName);
    // console.log(expression);
    // console.log(View.sinumerikView.parseData.variables);


    if (Object.keys(View.sinumerikView.parseData.variables.firstChannelVariables).length) {
        for (var variable in View.sinumerikView.parseData.variables.firstChannelVariables) {
            regEx = new RegExp(`(?<=\\W|^)${View.sinumerikView.parseData.variables.firstChannelVariables[variable].name}(?=\\W|$)`, 'g');
            if (regEx.exec(expression)) {
                expression = expression.replace(regEx, `${View.sinumerikView.parseData.variables.firstChannelVariables[variable].value}`);
            }
        }
    }

    if (Object.keys(View.sinumerikView.parseData.variables[`${programName}`]).length) {
        for (var variable in View.sinumerikView.parseData.variables[`${programName}`]) {
            regEx = new RegExp(`(?<=\\W|^)${View.sinumerikView.parseData.variables[`${programName}`][variable].name}(?=\\W|$)`, 'g');
            // console.log(variable);
            // console.log(regEx);
            if (regEx.exec(expression)) {
                // console.log(View.sinumerikView.parseData.variables[programName][variable].name);
                // console.log(View.sinumerikView.parseData.variables[programName][variable].value);
                // console.log(View.sinumerikView.parseData.variables);

                expression = expression.replace(regEx, `${View.sinumerikView.parseData.variables[`${programName}`][variable].value}`);
            }
        }
    }

    //Затычка для радиуса инструмента
    if (expression.match(/\$P_TOOLR/)) {
        expression = expression.replace(/\$P_TOOLR/, 0);
        // console.log(expression);
    }

    //Затычка для положения режущей кромки
    if (expression.match(/\$TC_DP2/)) {
        if (expression.match(/\$TC_DP2\[[\w,\$]*\]/)) {
            if (View.sinumerikView.parseData.activeTool > 100 && View.sinumerikView.parseData.activeTool < 110) {
                expression = expression.replace(/\$TC_DP2\[[\w,\$]*\]/, (View.sinumerikView.parseData.activeTool - 100));
                console.log(`Tool orientation ($TC_DP2): ${(View.sinumerikView.parseData.activeTool - 100)}`);
            } else {
                expression = expression.replace(/\$TC_DP2\[[\w,\$]*\]/, 0);
            }
        }
    }


    for (let i = 0; i < replacements.Math.desired.length; i++) {
        var regEx = new RegExp(`(?<!\\w)${replacements.Math.desired[i]}(?=\\W?)`);
        var while_iter = 0;
        while (true) {
            var regExExec = regEx.exec(expression);
            if (regExExec) {
                expression = expression.replace(expression.substring(regExExec.index, regExExec.index + replacements.Math.desired[i].length),replacements.Math.substitution[i]);
            } else {
                break;
            }
            while_iter++;
            if (while_iter > 100) {
                break;
            }
        }
    }

    for (let i = 0; i < replacements.Bool.desired.length; i++) {
        var regEx = new RegExp(`(?<=\\W)${replacements.Bool.desired[i]}(?=\\W?)`);
        // console.log(regEx);
        var while_iter = 0;
        while (true) {
            var regExExec = regEx.exec(expression);
            if (regExExec) {
                expression = expression.replace(expression.substring(regExExec.index, regExExec.index + replacements.Bool.desired[i].length),replacements.Bool.substitution[i]);
            } else {
                break;
            }
            while_iter++;
            if (while_iter > 100) {
                break;
            }
        }
    }
    if (expression.match('--')) {
        expression = expression.replace(/--/g,'+');
        // console.log('replacement string: ' + expression);
    }

    //Для чисел Float > 5 знаков после запятой приводим их к фиксированной точности
    while (expression.match(/\d\.\d{6,50}/)) {
        // console.log(expression.match(/\d\.?\d*/)[0]);
        expression = expression.replace(expression.match(/\d\.\d{6,50}/)[0], parseFloat(expression.match(/\d\.\d{6,50}/)[0]).toFixed(5))
    }
    // console.log('expr:'+expression);


    var value = 0;
    var codeString = 'if (' + expression + ') {value = 1} else {value = 0}';

    // console.log(codeString);

    try {
        eval(codeString);
        // console.log('check condition result: ' + value);
        return value;
    } catch (err) {
        return -1;
    }
}

//generate canvas element
function generateCanvasPrimitives(primitives, programName, row) {
    // console.log(View.sinumerikView.parseData.axesPos);
    var vectorInFrame = getCoordinatesInFrame({X:View.sinumerikView.parseData.axesPos.X, Y:View.sinumerikView.parseData.axesPos.Y, Z:View.sinumerikView.parseData.axesPos.Z});
    // console.log(JSON.stringify(vectorInFrame));
    var coordsInFrame = {X: vectorInFrame[0], Y: vectorInFrame[1], Z: vectorInFrame[2]};
    // console.log(coordsInFrame);

    //region pole
    var pole = {};
    //check G111-112 (Pole)
    primitives.operators.forEach(function(operator) {
        if (operator.type == 'Pole') {
            pole.type = operator.value;
            // console.log(pole);
            primitives.operators.forEach(function(operator) {
                if (operator.type == 'coordinate') {
                    pole[operator.name] = parseFloat(operator.value);
                }
            });
        }
    });
    if (pole.type) {
        if (pole.type == 'G110') {
            if (pole.X != undefined) {
                View.sinumerikView.parseData.pole.X = coordsInFrame.X + pole.X;
            }
            if (pole.Y != undefined) {
                View.sinumerikView.parseData.pole.X = coordsInFrame.Y + pole.Y;
            }
            if (pole.Z != undefined) {
                View.sinumerikView.parseData.pole.Z = coordsInFrame.Z + pole.Z;
            }
        }
        if (pole.type == 'G111') {
            if (pole.X != undefined) {
                View.sinumerikView.parseData.pole.X = pole.X;
            }
            if (pole.Y != undefined) {
                View.sinumerikView.parseData.pole.Y = pole.Y;
            }
            if (pole.Z != undefined) {
                View.sinumerikView.parseData.pole.Z = pole.Z;
            }
        }
        if (pole.type == 'G112') {
            if (pole.X != undefined) {
                View.sinumerikView.parseData.pole.X = View.sinumerikView.parseData.pole.X + pole.X;
            }
            if (pole.Y != undefined) {
                View.sinumerikView.parseData.pole.Y = View.sinumerikView.parseData.pole.Y + pole.Y;
            }
            if (pole.Z != undefined) {
                View.sinumerikView.parseData.pole.Z = View.sinumerikView.parseData.pole.Z + pole.Z;
            }
        }
        var plane_Axes;
        if (View.sinumerikView.parseData.plane == 'G17') {
            plane_Axes = ['X', 'Y'];
        }
        if (View.sinumerikView.parseData.plane == 'G18') {
            plane_Axes = ['Z', 'X'];
        }
        if (View.sinumerikView.parseData.plane == 'G19') {
            plane_Axes = ['Y', 'Z'];
        }
        View.sinumerikView.parseData.pole.AP = myMath.atan2((View.sinumerikView.parseData.axesPos[plane_Axes[1]] - View.sinumerikView.parseData.pole[plane_Axes[1]]), (View.sinumerikView.parseData.axesPos[plane_Axes[0]] - View.sinumerikView.parseData.pole[plane_Axes[0]]));
        View.sinumerikView.parseData.pole.RP = Math.sqrt((View.sinumerikView.parseData.axesPos[plane_Axes[1]] - View.sinumerikView.parseData.pole[plane_Axes[1]]) ** 2 + (View.sinumerikView.parseData.axesPos[plane_Axes[0]] - View.sinumerikView.parseData.pole[plane_Axes[0]]) **2);
        return;
    }
    //endregion

    var move = {};
    primitives.operators.forEach(function(operator) {
        //if !moveGroup & operator type == 'coordinates' => generate error
        if (!View.sinumerikView.parseData.moveGroup && operator.type == 'coordinate') {
            View.sinumerikView.parseData.errors.push({text:`coordinate ${operator.name} without move (eg G1, G2).  prog ${programName} row ${row + 1}`, row: row});
        }
        if (operator.type == 'Plane') {
            View.sinumerikView.parseData.plane = operator.value;
        }

        if (operator.type == 'moveGroup') {
            View.sinumerikView.parseData.moveGroup = operator.value;
        }

        if (operator.type == 'coordinate') {
            if (!operator.subtype) {
                move[operator.name] = parseFloat(operator.value);
            } else {
                if (operator.subtype == 'IC') {
                    // console.log(operator);
                    if (View.sinumerikView.parseData.diamon && View.sinumerikView.parseData.diam90 && operator.name == 'X') {
                        operator.value *= 2;
                    }
                    move[operator.name] = coordsInFrame[operator.name] + parseFloat(operator.value);
                } else if (operator.subtype == 'AP' || operator.subtype == 'RP') {
                    move[operator.subtype] = parseFloat(operator.value);
                } else if (operator.subtype == 'RND') {
                    move[operator.subtype] = parseFloat(operator.value);
                } else if (operator.subtype == 'CHR') {
                    move[operator.subtype] = parseFloat(operator.value);
                } else {
                        View.sinumerikView.parseData.errors.push({text:`Сoordinate modifier ${operator.subtype} not supported.  prog ${programName} row ${row + 1}`, row: row});
                }
            }
            if (operator.modificator && operator.modificator.ang) {
                var axes = [];
                if (View.sinumerikView.parseData.plane == 'G17') {
                    axes = ['X', 'Y'];
                } else if (View.sinumerikView.parseData.plane == 'G18') {
                    axes = ['Z', 'X'];
                } else {
                    axes = ['Y', 'Z'];
                }
                if (operator.name == axes[1]) {
                    var distance = move[axes[1]] - coordsInFrame[axes[1]];
                    while (operator.modificator.ang < 0) {
                        operator.modificator.ang += 360;
                    }
                    while (operator.modificator.ang >= 360) {
                        operator.modificator.ang -= 360;
                    }
                    if ((operator.modificator.ang < 180 && distance > 0) || (operator.modificator.ang > 180 && distance < 0)) {
                        if (move[axes[0]] && move[axes[1]]) {
                            View.sinumerikView.parseData.errors.push({text:`ANG & 2 axes in one command.  prog ${programName} row ${row + 1}`, row: row});
                        }

                        move[axes[0]] = coordsInFrame[axes[0]] + distance / Math.tan(((operator.modificator.ang % 180 )/ 180) * Math.PI);
                    } else {
                        View.sinumerikView.parseData.errors.push({text:`ANG direction error.  prog ${programName} row ${row + 1}`, row: row});
                    }
                }
                if (operator.name == axes[0]) {
                    var distance = move[axes[0]] - coordsInFrame[axes[0]];
                    while (operator.modificator.ang < 0) {
                        operator.modificator.ang += 360;
                    }
                    while (operator.modificator.ang >= 360) {
                        operator.modificator.ang -= 360;
                    }
                    if ((operator.modificator.ang > 90 && operator.modificator.ang < 270 && distance < 0) || ((operator.modificator.ang < 90 || operator.modificator.ang >270) && distance > 0)) {
                        if (move[axes[0]] && move[axes[1]]) {
                            View.sinumerikView.parseData.errors.push({text:`ANG & 2 axes in one command.  prog ${programName} row ${row + 1}`, row: row});
                        }
                        move[axes[1]] = coordsInFrame[axes[1]] + distance * Math.tan(((operator.modificator.ang % 180 )/ 180) * Math.PI);
                    } else {
                        View.sinumerikView.parseData.errors.push({text:`ANG direction error.  prog ${programName} row ${row + 1}`, row: row});
                    }
                }

            }
        }

        if (operator.type == 'circleCenter') {
            // console.log(operator);
            if (!operator.subtype || operator.subtype == 'IC') {
                var axis;
                if (operator.name == 'I') {axis = 'X'}
                if (operator.name == 'J') {axis = 'Y'}
                if (operator.name == 'K') {axis = 'Z'}
                move[operator.name] = coordsInFrame[axis] + parseFloat(operator.value);
            } else if (operator.subtype == 'AC') {
                move[operator.name] = parseFloat(operator.value);
            } else {
                View.sinumerikView.parseData.errors.push({text:`Сircle center syntax error.  prog ${programName} row ${row + 1}`, row: row});
            }
        }
        if (operator.type == 'circle_AR') {
            move.circle_AR = operator.value;
            // console.log(operator);
        }
        if (operator.type =='circle_CR') {
            move.circle_CR = operator.value;
            //console.log(operator);
        }
        if (operator.type == 'TURN') {
            move.Turn = operator.value;
        }
    })

    if (move.AP != undefined || move.RP != undefined) {
        if (move.AP == undefined) {
            move.AP = View.sinumerikView.parseData.pole.AP;
        }
        if (move.RP == undefined) {
            move.RP = View.sinumerikView.parseData.pole.RP;
        }
        var axes = [];
        if (View.sinumerikView.parseData.plane == 'G17') {
            axes = ['X', 'Y'];
        } else if (View.sinumerikView.parseData.plane == 'G18') {
            axes = ['Z', 'X'];
        } else {
            axes = ['Y', 'Z'];
        }
        move[axes[0]] = move.RP * myMath.cos(move.AP) + View.sinumerikView.parseData.pole[axes[0]];
        move[axes[1]] = move.RP * myMath.sin(move.AP) + View.sinumerikView.parseData.pole[axes[1]];

    }

    if (Object.keys(move).length) {
        var canvasElement = {
            X_start: View.sinumerikView.parseData.axesPos.X,
            Y_start: View.sinumerikView.parseData.axesPos.Y,
            Z_start: View.sinumerikView.parseData.axesPos.Z,
            row: row
        };
        if (View.sinumerikView.parseData.moveGroup.match(/G1|G2|G3|G0|G33/)) {
            canvasElement.type = View.sinumerikView.parseData.moveGroup;

            // console.log(JSON.stringify(move));
            // console.log(move.Z);
            if (move.X != undefined) {
                canvasElement.X = move.X;
            } else {
                canvasElement.X = coordsInFrame.X;
            }
            if (move.Y != undefined) {
                canvasElement.Y = move.Y;
            } else {
                canvasElement.Y = coordsInFrame.Y;
            }
            if (move.Z != undefined) {
                canvasElement.Z = move.Z;
            } else {
                canvasElement.Z = coordsInFrame.Z;
            }
        }

        if (View.sinumerikView.parseData.moveGroup == 'G2' ||
            View.sinumerikView.parseData.moveGroup == 'G3') {
            var circleAxes = [];
            var circleCenterAxes = [];
            if (View.sinumerikView.parseData.plane == 'G17') {
                circleAxes = ['X', 'Y', 'Z'];
                circleCenterAxes = ['I', 'J'];
            } else if (View.sinumerikView.parseData.plane == 'G18') {
                circleAxes = ['Z', 'X', 'Y'];
                circleCenterAxes = ['K','I'];
            } else {
                circleAxes = ['Y', 'Z', 'X'];
                circleCenterAxes = ['J', 'K'];
            }

            var circleError = 0;

            if (move.circle_AR && move.circle_CR) {
                View.sinumerikView.parseData.errors.push({text:`Circle AR & CR together.  prog ${programName} row ${row + 1}`, row: row});
                circleError = 1;
            }

            if (move.AP != View.sinumerikView.parseData.pole.AP && move.RP == View.sinumerikView.parseData.pole.RP) {
                move[circleCenterAxes[0]] = View.sinumerikView.parseData.pole[circleAxes[0]];
                move[circleCenterAxes[1]] = View.sinumerikView.parseData.pole[circleAxes[1]];
            }

            // console.log(move);
            if (move.circle_AR != undefined) {
                // console.log(move.circle_AR);
                // console.log(move);
                if (move[circleAxes[0]] != undefined && move[circleAxes[1]] != undefined) {
                    var distance = Math.sqrt((canvasElement[circleAxes[0]]-coordsInFrame[circleAxes[0]])**2 + (canvasElement[circleAxes[1]]-coordsInFrame[circleAxes[1]])**2);
                    move.circle_CR = (distance/2)/ myMath.sin(move.circle_AR/2);
                    if (move.circle_AR > 180) {
                        move.circle_CR *= -1;
                    }
                } else if (move[circleCenterAxes[0]] != undefined && move[circleCenterAxes[1]] != undefined) {
                    var vectorStartAng = myMath.atan2(coordsInFrame[circleAxes[1]] - move[circleCenterAxes[1]], coordsInFrame[circleAxes[0]] - move[circleCenterAxes[0]]);
                    var circleRadius = Math.sqrt((coordsInFrame[circleAxes[0]] - move[circleCenterAxes[0]])**2 + (coordsInFrame[circleAxes[1]] - move[circleCenterAxes[1]])**2)
                    var G2_factor = 1;
                    if (View.sinumerikView.parseData.moveGroup == 'G2') {
                        G2_factor = -1;
                    }
                    var vectorEndAng = vectorStartAng + G2_factor * move.circle_AR;

                    // console.log(vectorStartAng);
                    // console.log(vectorEndAng);
                    canvasElement[circleAxes[0]] = myMath.cos(vectorEndAng) * circleRadius + move[circleCenterAxes[0]];
                    canvasElement[circleAxes[1]] = myMath.sin(vectorEndAng) * circleRadius + move[circleCenterAxes[1]];
                }

            }

            if (move.circle_CR != undefined) {
                var distance = Math.sqrt((canvasElement[circleAxes[0]]-coordsInFrame[circleAxes[0]])**2 + (canvasElement[circleAxes[1]]-coordsInFrame[circleAxes[1]])**2);
                // console.log('Distance: ' + distance);
                // console.log(canvasElement);
                // console.log(coordsInFrame);
                if (distance > Math.abs(move.circle_CR) * 2) {
                    View.sinumerikView.parseData.errors.push({text:`Circle CR too small.  prog ${programName} row ${row + 1}`, row: row});
                    circleError = 1;
                }
                if (!circleError) {
                    var G3_center = [];
                    var G2_center = [];

                    var d = distance;
                    var h = Math.sqrt(move.circle_CR ** 2 - (d/2) ** 2);

                    G2_center[0] = coordsInFrame[circleAxes[0]] + (canvasElement[circleAxes[0]] - coordsInFrame[circleAxes[0]])/2 + h * (canvasElement[circleAxes[1]] - coordsInFrame[circleAxes[1]]) / d
                    G2_center[1] = coordsInFrame[circleAxes[1]] + (canvasElement[circleAxes[1]] - coordsInFrame[circleAxes[1]])/2 - h * (canvasElement[circleAxes[0]] - coordsInFrame[circleAxes[0]]) / d

                    G3_center[0] = coordsInFrame[circleAxes[0]] + (canvasElement[circleAxes[0]] - coordsInFrame[circleAxes[0]])/2 - h * (canvasElement[circleAxes[1]] - coordsInFrame[circleAxes[1]]) / d
                    G3_center[1] = coordsInFrame[circleAxes[1]] + (canvasElement[circleAxes[1]] - coordsInFrame[circleAxes[1]])/2 + h * (canvasElement[circleAxes[0]] - coordsInFrame[circleAxes[0]]) / d

                    // console.log(G3_center);
                    // console.log(G2_center);
                    //
                    //
                    // console.log(move.circle_CR);
                    if ((View.sinumerikView.parseData.moveGroup.match(/G3/) && move.circle_CR > 0) || (View.sinumerikView.parseData.moveGroup.match(/G2/) && move.circle_CR < 0)) {
                        move[circleCenterAxes[0]] = G3_center[0];
                        move[circleCenterAxes[1]] = G3_center[1];
                    } else {
                        move[circleCenterAxes[0]] = G2_center[0];
                        move[circleCenterAxes[1]] = G2_center[1];
                    }
                }
            }

            for (let i = 0; i <2 ; i++) {
                if (move[circleCenterAxes[i]] == undefined) {
                    View.sinumerikView.parseData.errors.push({text:`Circle center axis ${circleCenterAxes[i]} not found .  prog ${programName} row ${row + 1}`, row: row});
                    circleError = 1;
                }
            }

            var vectorStart = (coordsInFrame[circleAxes[0]] - move[circleCenterAxes[0]]) ** 2 + (coordsInFrame[circleAxes[1]] - move[circleCenterAxes[1]]) ** 2;
            var vectorEnd = (canvasElement[circleAxes[0]] - move[circleCenterAxes[0]]) ** 2 + (canvasElement[circleAxes[1]] - move[circleCenterAxes[1]]) ** 2;
            if (Math.abs(vectorEnd-vectorStart) > 3e-2) {
                View.sinumerikView.parseData.errors.push({text:`Circle end point error.  prog ${programName} row ${row + 1}`, row: row});
                circleError = 1;
            }

            if (!circleError) {


                var vectorStartAng = myMath.atan2(coordsInFrame[circleAxes[1]] - move[circleCenterAxes[1]], coordsInFrame[circleAxes[0]] - move[circleCenterAxes[0]]);
                var vectorEndAng = myMath.atan2(canvasElement[circleAxes[1]] - move[circleCenterAxes[1]], canvasElement[circleAxes[0]] - move[circleCenterAxes[0]]);

                // console.log(move);
                // console.log(coordsInFrame);
                // console.log(move);
                // console.log(circleCenterAxes);
                //
                // console.log(vectorStartAng);
                // console.log(vectorEndAng);


                if (View.sinumerikView.parseData.prevMove.length) {
                    // console.log(JSON.stringify(View.sinumerikView.parseData.prevMove[0]));
                    if (View.sinumerikView.parseData.prevMove[0].type == 'G2' || View.sinumerikView.parseData.prevMove[0].type == 'G3') {
                        generateCirclePrimitives();
                    }

                    if (View.sinumerikView.parseData.prevMove[0].type.match(/G1|G33/)) {
                        // console.log(canvasElement);
                        // console.log(View.sinumerikView.parseData.prevMove[0]);

                        canvasElement[circleCenterAxes[0]] = move[circleCenterAxes[0]];
                        canvasElement[circleCenterAxes[1]] = move[circleCenterAxes[1]];

                        var elements = insertRnd(View.sinumerikView.parseData.prevMove[0], canvasElement, programName, 0);

                        // console.log(elements);
                        var startInBase = getCoordinatesInBase({X:canvasElement.X_start, Y:canvasElement.Y_start, Z:canvasElement.Z_start});
                        canvasElement.X_start = startInBase[0];
                        canvasElement.Y_start = startInBase[1];
                        canvasElement.Z_start = startInBase[2];


                        vectorStartAng = myMath.atan2(elements[1][`${circleAxes[1]}_start`] - elements[1][circleCenterAxes[1]], elements[1][`${circleAxes[0]}_start`] - elements[1][circleCenterAxes[0]]);
                        View.sinumerikView.parseData.prevMove[0].toolRadiusCompensation = View.sinumerikView.parseData.toolRadiusCompensation;
                        View.sinumerikView.parseData.canvas.push(View.sinumerikView.parseData.prevMove[0]);
                    }
                    View.sinumerikView.parseData.prevMove.shift();
                    // }
                }

                if (move.RND != undefined) {
                    // console.log(JSON.stringify(canvasElement));

                    var startInFrame = getCoordinatesInFrame({X:canvasElement.X_start, Y:canvasElement.Y_start, Z:canvasElement.Z_start});
                    canvasElement.X_start = startInFrame[0];
                    canvasElement.Y_start = startInFrame[1];
                    canvasElement.Z_start = startInFrame[2];
                    canvasElement.RND = move.RND;
                    canvasElement[circleCenterAxes[0]] = move[circleCenterAxes[0]];
                    canvasElement[circleCenterAxes[1]] = move[circleCenterAxes[1]];
                    View.sinumerikView.parseData.prevMove.push(canvasElement);
                    // console.log(JSON.stringify(View.sinumerikView.parseData.prevMove));

                    var canvasElementInBase = getCoordinatesInBase({X: canvasElement.X, Y: canvasElement.Y, Z: canvasElement.Z});

                    // console.log(JSON.stringify())
                    var canvasCircleElement = {};
                    canvasCircleElement.X = canvasElementInBase[0];
                    canvasCircleElement.Y = canvasElementInBase[1];
                    canvasCircleElement.Z = canvasElementInBase[2];

                    View.sinumerikView.parseData.axesPos.X = canvasCircleElement.X;
                    View.sinumerikView.parseData.axesPos.Y = canvasCircleElement.Y;
                    View.sinumerikView.parseData.axesPos.Z = canvasCircleElement.Z;

                    return;
                }

                var arcAng = vectorEndAng - vectorStartAng;
                var arcFactor = 1;
                if (View.sinumerikView.parseData.moveGroup.match(/G2/)) {
                    // console.log('G2');
                    arcFactor = -1;
                }
                arcAng *= arcFactor;
                if (arcAng <= 0) {
                    arcAng += 360;
                }
                arcAng *= arcFactor;
                if (move.Turn != undefined) {
                    arcAng += move.Turn * arcFactor * 360;
                }

                var circleRarius = Math.sqrt((vectorStart + vectorEnd) / 2);
                var pointsNum = Math.round((circleRarius * Math.PI) * (Math.abs(arcAng) / 180));
                if (pointsNum < 30) {
                    pointsNum = 30;
                }
                if (pointsNum > 300) {
                    pointsNum = 300;
                }
                if (move.Turn != undefined && pointsNum == 300) {
                    pointsNum *= move.Turn;
                    if (pointsNum > 1500) {
                        pointsNum = 1500;
                    }
                }
                // console.log(View.sinumerikView.parseData.axesPos);
                // console.log(canvasElement);

                for (let i = 0; i < pointsNum; i++) {

                    var canvasCircleElement = {
                        X_start: View.sinumerikView.parseData.axesPos.X,
                        Y_start: View.sinumerikView.parseData.axesPos.Y,
                        Z_start: View.sinumerikView.parseData.axesPos.Z,
                        row: row,
                        type: 'G1'
                    }
                    var thisPointAng = vectorStartAng + (arcAng / pointsNum) * (i + 1);
                    var thisPoint = {};
                    // console.log(vectorStartAng);
                    // console.log(circleAxes);
                    var circleElementAxesInFrame = {};
                    for (let i=0; i<3; i++) {
                        circleElementAxesInFrame[circleAxes[i]] = canvasElement[`${circleAxes[i]}_start`];
                    }
                    // console.log(circleElementAxesInFrame)

                    circleElementAxesInFrame = getCoordinatesInFrame(circleElementAxesInFrame);
                    // console.log(circleElementAxesInFrame)
                    circleElementAxesInFrame = {X:circleElementAxesInFrame[0],Y:circleElementAxesInFrame[1],Z:circleElementAxesInFrame[2]};
                    // console.log(circleElementAxesInFrame);

                    thisPoint[circleAxes[0]] = parseFloat(myMath.cos(thisPointAng) * circleRarius + move[circleCenterAxes[0]]);
                    thisPoint[circleAxes[1]] = parseFloat(myMath.sin(thisPointAng) * circleRarius + move[circleCenterAxes[1]]);
                    thisPoint[circleAxes[2]] = circleElementAxesInFrame[circleAxes[2]] + (canvasElement[circleAxes[2]] - circleElementAxesInFrame[circleAxes[2]]) * ((i+1)/pointsNum);

                    var canvasElementInBase = getCoordinatesInBase(thisPoint);

                    // console.log(JSON.stringify())
                    canvasCircleElement.X = canvasElementInBase[0];
                    canvasCircleElement.Y = canvasElementInBase[1];
                    canvasCircleElement.Z = canvasElementInBase[2];

                    View.sinumerikView.parseData.axesPos.X = canvasCircleElement.X;
                    View.sinumerikView.parseData.axesPos.Y = canvasCircleElement.Y;
                    View.sinumerikView.parseData.axesPos.Z = canvasCircleElement.Z;

                    // console.log(JSON.stringify(canvasCircleElement));
                    canvasCircleElement.toolRadiusCompensation = View.sinumerikView.parseData.toolRadiusCompensation;
                    View.sinumerikView.parseData.canvas.push(canvasCircleElement);
                }
            }

            // console.log('CIRCLE');
            // console.log(move);



        }

        if (View.sinumerikView.parseData.moveGroup.match(/G0|G1|G33/)) {
            // console.log(JSON.stringify(canvasElement));
            var canvasElementByFrame = getCoordinatesInBase(canvasElement);

            canvasElement.X = canvasElementByFrame[0];
            canvasElement.Y = canvasElementByFrame[1];
            canvasElement.Z = canvasElementByFrame[2];

            //console.log(JSON.stringify(canvasElement));

            if (View.sinumerikView.parseData.prevMove.length && View.sinumerikView.parseData.prevMove[0].RND) {
                // console.log(View.sinumerikView.parseData.prevMove[0]);
                if (View.sinumerikView.parseData.prevMove[0].type.match(/G[1-3]/)) {
                    var elements = insertRnd(View.sinumerikView.parseData.prevMove[0], canvasElement, programName, 0);
                    if (View.sinumerikView.parseData.prevMove[0].type == 'G1') {
                        View.sinumerikView.parseData.prevMove[0].toolRadiusCompensation = View.sinumerikView.parseData.toolRadiusCompensation;
                        View.sinumerikView.parseData.canvas.push(View.sinumerikView.parseData.prevMove[0]);
                    }
                    View.sinumerikView.parseData.prevMove.shift();
                }
            }

            if (View.sinumerikView.parseData.prevMove.length && View.sinumerikView.parseData.prevMove[0].CHR) {
                // console.log(View.sinumerikView.parseData.prevMove[0]);
                if (View.sinumerikView.parseData.prevMove[0].type.match(/G[1-3]/)) {
                    var elements = insertChr(View.sinumerikView.parseData.prevMove[0], canvasElement, programName);
                    if (View.sinumerikView.parseData.prevMove[0].type == 'G1') {
                        View.sinumerikView.parseData.prevMove[0].toolRadiusCompensation = View.sinumerikView.parseData.toolRadiusCompensation;
                        View.sinumerikView.parseData.canvas.push(View.sinumerikView.parseData.prevMove[0]);
                    }
                    View.sinumerikView.parseData.prevMove.shift();
                }
            }


            View.sinumerikView.parseData.axesPos.X = canvasElement.X;
            View.sinumerikView.parseData.axesPos.Y = canvasElement.Y;
            View.sinumerikView.parseData.axesPos.Z = canvasElement.Z;

            if (move.RND != undefined) {
                canvasElement.RND = move.RND;
                View.sinumerikView.parseData.prevMove.push(canvasElement);
                // console.log(JSON.stringify(View.sinumerikView.parseData.prevMove));
                return;
            } else {
                View.sinumerikView.parseData.prevMove = [];
            }
            if (move.CHR != undefined) {
                canvasElement.CHR = move.CHR;
                View.sinumerikView.parseData.prevMove.push(canvasElement);
                return;
            } else {
                View.sinumerikView.parseData.prevMove = [];
            }
            canvasElement.toolRadiusCompensation = View.sinumerikView.parseData.toolRadiusCompensation;
            View.sinumerikView.parseData.canvas.push(canvasElement);
        }

        if (move.AP != undefined) {
            View.sinumerikView.parseData.pole.AP = move.AP;
            View.sinumerikView.parseData.pole.RP = move.RP;
        }
    }
}

function generateCirclePrimitives() {
    var circleAxes = [];
    var circleCenterAxes = [];
    if (View.sinumerikView.parseData.plane == 'G17') {
        circleAxes = ['X', 'Y', 'Z'];
        circleCenterAxes = ['I', 'J'];
    } else if (View.sinumerikView.parseData.plane == 'G18') {
        circleAxes = ['Z', 'X', 'Y'];
        circleCenterAxes = ['K','I'];
    } else {
        circleAxes = ['Y', 'Z', 'X'];
        circleCenterAxes = ['J', 'K'];
    }

    var element_prev = View.sinumerikView.parseData.prevMove[0];
    var row = element_prev.row;

    // console.log(View.sinumerikView.parseData.prevMove[0]);

    var vectorStartAng_prev = myMath.atan2(element_prev[`${circleAxes[1]}_start`] - element_prev[circleCenterAxes[1]], element_prev[`${circleAxes[0]}_start`] - element_prev[circleCenterAxes[0]]);
    var vectorEndAng_prev = myMath.atan2(element_prev[circleAxes[1]] - element_prev[circleCenterAxes[1]], element_prev[circleAxes[0]] - element_prev[circleCenterAxes[0]]);

    //

    var arcAng_prev = vectorEndAng_prev - vectorStartAng_prev;
    var arcFactor_prev = 1;
    if (element_prev.type.match(/G2/)) {
        // console.log('G2');
        arcFactor_prev = -1;
    }
    arcAng_prev *= arcFactor_prev;
    if (arcAng_prev <= 0) {
        arcAng_prev += 360;
    }
    arcAng_prev *= arcFactor_prev;
    if (element_prev.Turn != undefined) {
        arcAng_prev += element_prev.Turn * arcFactor_prev * 360;
    }
    //TODO найти все circleRarius и разобраться что ето :-)
    var circleRarius_prev = Math.sqrt(((element_prev[`${circleAxes[0]}_start`] - element_prev[circleCenterAxes[0]]) ** 2 + (element_prev[`${circleAxes[1]}_start`] - element_prev[circleCenterAxes[1]]) ** 2));
    var pointsNum = Math.round((circleRarius_prev * Math.PI) * (Math.abs(arcAng_prev) / 180));
    if (pointsNum < 30) {
        pointsNum = 30;
    }
    if (pointsNum > 300) {
        pointsNum = 300;
    }
    if (element_prev.Turn != undefined && pointsNum == 300) {
        pointsNum *= element_prev.Turn;
        if (pointsNum > 1500) {
            pointsNum = 1500;
        }
    }

    var coordsInBase_prev = getCoordinatesInBase({X:element_prev.X_start, Y: element_prev.Y_start, Z:element_prev.Z_start});
    View.sinumerikView.parseData.axesPos.X = coordsInBase_prev[0];
    View.sinumerikView.parseData.axesPos.Y = coordsInBase_prev[1];
    View.sinumerikView.parseData.axesPos.Z = coordsInBase_prev[2];


    for (let i = 0; i < pointsNum; i++) {

        var canvasCircleElement = {
            X_start: View.sinumerikView.parseData.axesPos.X,
            Y_start: View.sinumerikView.parseData.axesPos.Y,
            Z_start: View.sinumerikView.parseData.axesPos.Z,
            row: row,
            type: 'G1'
        }
        var thisPointAng = vectorStartAng_prev + (arcAng_prev / pointsNum) * (i + 1);
        var thisPoint = {};
        // console.log(vectorStartAng);
        // console.log(circleAxes);
        var circleElementAxesInFrame_prev = {};
        for (let i=0; i<3; i++) {
            circleElementAxesInFrame_prev[circleAxes[i]] = element_prev[`${circleAxes[i]}_start`];
        }
        // console.log(circleElementAxesInFrame)

        // circleElementAxesInFrame = getCoordinatesInFrame(circleElementAxesInFrame);
        // console.log(circleElementAxesInFrame)
        // circleElementAxesInFrame = {X:circleElementAxesInFrame[0],Y:circleElementAxesInFrame[1],Z:circleElementAxesInFrame[2]};
        // console.log(circleElementAxesInFrame);

        thisPoint[circleAxes[0]] = parseFloat(myMath.cos(thisPointAng) * circleRarius_prev + element_prev[circleCenterAxes[0]]);
        thisPoint[circleAxes[1]] = parseFloat(myMath.sin(thisPointAng) * circleRarius_prev + element_prev[circleCenterAxes[1]]);
        thisPoint[circleAxes[2]] = circleElementAxesInFrame_prev[circleAxes[2]] + (element_prev[circleAxes[2]] - circleElementAxesInFrame_prev[circleAxes[2]]) * ((i+1)/pointsNum);

        var canvasElementInBase = getCoordinatesInBase(thisPoint);

        // console.log(JSON.stringify())
        canvasCircleElement.X = canvasElementInBase[0];
        canvasCircleElement.Y = canvasElementInBase[1];
        canvasCircleElement.Z = canvasElementInBase[2];

        View.sinumerikView.parseData.axesPos.X = canvasCircleElement.X;
        View.sinumerikView.parseData.axesPos.Y = canvasCircleElement.Y;
        View.sinumerikView.parseData.axesPos.Z = canvasCircleElement.Z;

        // console.log(JSON.stringify(canvasCircleElement));
        canvasCircleElement.toolRadiusCompensation = View.sinumerikView.parseData.toolRadiusCompensation;
        View.sinumerikView.parseData.canvas.push(canvasCircleElement);
    }

}

function checkDef(str,programName, variables, programRow) {
    // console.log(str);
    var returnVal = {};
    if (!str.trim().split(' ')[0].match(/PROC|DEF/)) {
        //console.log('PROC DEF not detected');
        return;
    }

    if (str.trim().split(' ')[0] == 'PROC') {
        //console.log('PROC detect');

        try {
            str = str.substring(str.match(/\(/).index + 1, str.match(/\)/).index);
            var regEx = /(\w+\s[A-Za-z_][A-Za-z_][A-Za-z_0-9]*)(?=[\)\s\,]?)/g;
            var regExMatch = str.match(regEx) || [];
            if (regExMatch.length) {
                if (str.split(',').length == regExMatch.length) {
                    for (let i = 0; i < regExMatch.length; i++) {
                        var parseDef = parseDefPart(regExMatch[i]);
                        if (parseDef) {
                            View.sinumerikView.parseData.variables[programName][parseDef.name] = {};
                            View.sinumerikView.parseData.variables[programName][parseDef.name].name = parseDef.name;
                            View.sinumerikView.parseData.variables[programName][parseDef.name].type = parseDef.type;
                            if (!variables[i] && variables[i] != 0) {
                                //TODO Поменять имя программы и строчку на вызывающую строку главной программы.
                                View.sinumerikView.parseData.errors.push({text:`Missing variable ${parseDef.name} value in the call. ${programName} row ${programRow + 1}`, row: programRow});
                                if (parseDef.type == 'real') {
                                    View.sinumerikView.parseData.variables[`${programName}`][parseDef.name].value = 0;
                                    // console.log(View.sinumerikView.parseData.variables[programName][parseDef.name]);
                                }
                            } else {
                                if (parseDef.type == 'real') {
                                    View.sinumerikView.parseData.variables[programName][parseDef.name].value = parseFloat(variables[i]);
                                } else if (parseDef.type == 'int') {
                                    View.sinumerikView.parseData.variables[programName][parseDef.name].value = parseInt(variables[i]);
                                } else {
                                    View.sinumerikView.parseData.variables[programName][parseDef.name].value = variables[i];
                                }
                            }                        }
                    }
                } else {
                    View.sinumerikView.parseData.errors.push({text:`PROC parse error. Definitions divided incorrectly. ${programName} row ${programRow + 1}`, row: programRow});
                }
                if (Object.keys(View.sinumerikView.parseData.variables[programName]).length < variables.length) {
                    View.sinumerikView.parseData.errors.push({text:`PROC parse error. Too many variables. ${programName} row ${programRow + 1}`, row: programRow});
                }
            }
        } catch (e) {
            View.sinumerikView.parseData.errors.push({text:`PROC parse error. ${programName} row ${programRow + 1}`, row: programRow});
        }
    }

    if (str.trim().split(' ')[0] == 'DEF') {
        //console.log('DEF detect');

        try {
            var strLastChar = str.length;
            if (str.match(';')) {
                strLastChar = str.indexOf(';');
            }
            str = str.substring(4, strLastChar).trim();
            var value = 0;
            if (str.match('=')) {
                str = str.split('=');
                value = str[1];
            } else {
                var val = str;
                str = []
                str[0] = val;
            }


            var parseDef = parseDefPart(str[0]);
            if (parseDef) {
                View.sinumerikView.parseData.variables[programName][parseDef.name] = {};
                View.sinumerikView.parseData.variables[programName][parseDef.name].name = parseDef.name;
                View.sinumerikView.parseData.variables[programName][parseDef.name].type = parseDef.type;
                if (parseDef.type == 'real') {
                    View.sinumerikView.parseData.variables[programName][parseDef.name].value = parseFloat(value);
                } else if (parseDef.type == 'int') {
                    View.sinumerikView.parseData.variables[programName][parseDef.name].value = parseInt(value);
                } else {
                    View.sinumerikView.parseData.variables[programName][parseDef.name].value = value;
                }
            } else {
                View.sinumerikView.parseData.errors.push({text:`DEF parse error_1. ${programName} row ${programRow + 1}`, row: programRow});
            }
        } catch (e) {
            View.sinumerikView.parseData.errors.push({text:`DEF parse error. ${programName} row ${programRow + 1}`, row: programRow});
        }
    }

}

//INT REAL BOOL CHAR STRING AXIS FRAME
function parseDefPart(str) {
    var returnDef = {};
    str = str.split(' ');
    if (str.length > 2) {
        for (let i = 0; i < str.length; i ++) {
            str[i] = str[i].trim();
            if (str[i].length == 0) {
                stp.splice(i, 1);
            }
        }
    }
    if (str.length != 2) {
        return false;
    }
    if (str[0] == 'REAL' ||
        str[0] == 'INT' ||
        str[0] == 'CHAR' ||
        str[0] == 'AXIS' ||
        str[0] == 'FRAME' ||
        str[0] == 'BOOL' ||
        str[0].match(/STRING\[\d+\]/)) {
        returnDef.type = str[0].toLowerCase();
    } else {
        return false;
    }
    if (str[1].match(/[a-zA-Z_][a-zA-Z_]\w*/)[0].length == str[1].length) {
        returnDef.name = str[1];
    } else {
        return false;
    }
//        console.log('partDef OK: ' + JSON.stringify(returnDef));
    return returnDef;
}

function generateFrame(additive, type, value, prog, row) {
    // console.log('Generate Frame');
    // console.log(additive);
    // console.log(type);
    // console.log(value);
    if (type == 'MIRROR' || type == 'SCALE') {
        View.sinumerikView.parseData.errors.push({text:`${type} not supported yet.  prog ${prog} row ${row + 1}`, row: row});
        return;
    }

    if (!additive) {
        View.sinumerikView.parseData.frame.trans.X = 0;
        View.sinumerikView.parseData.frame.trans.Y = 0;
        View.sinumerikView.parseData.frame.trans.Z = 0;
        View.sinumerikView.parseData.frame.rot.X = 0;
        View.sinumerikView.parseData.frame.rot.Y = 0;
        View.sinumerikView.parseData.frame.rot.Z = 0;
        View.sinumerikView.parseData.frame.basis = [[1,0,0],[0,1,0],[0,0,1]];
        View.sinumerikView.parseData.frame.invertBasis = [[1,0,0],[0,1,0],[0,0,1]];
    }
    if (type == 'TRANS') {
        var trans = {X:0, Y:0, Z:0};
        for (var coordinate in value) {
            trans[value[coordinate].name] = parseFloat(value[coordinate].value);
        }
        trans = getCoordinatesInBase(trans);
        View.sinumerikView.parseData.frame.trans.X = trans[0];
        View.sinumerikView.parseData.frame.trans.Y = trans[1];
        View.sinumerikView.parseData.frame.trans.Z = trans[2];
    }

    if (type == 'ROT') {
        var rot = {};
        var matrixRotZ = [[1,0,0],[0,1,0],[0,0,1]];
        var matrixRotY = [[1,0,0],[0,1,0],[0,0,1]];
        var matrixRotX = [[1,0,0],[0,1,0],[0,0,1]];


            // console.log(value);
        for (var coord in value) {
            rot[value[coord].name] = value[coord].value;
        }
        if (rot.Z) {
            matrixRotZ = [[myMath.cos(rot.Z), -1 * myMath.sin(rot.Z), 0],
                        [myMath.sin(rot.Z), myMath.cos(rot.Z),0],
                        [0,              0,               1]];
        }
        if (rot.Y) {
            matrixRotY = [[myMath.cos(rot.Y), 0 , myMath.sin(rot.Y)],
                          [0,                 1,                 0],
                    [ -1 * myMath.sin(rot.Y), 0,  myMath.cos(rot.Y)]];
        }
        if (rot.X) {
            matrixRotX = [[1, 0, 0],
                         [0, myMath.cos(rot.X), -1 * myMath.sin(rot.X)],
                         [0, myMath.sin(rot.X), myMath.cos(rot.X)]];
        }
        var rotMatrix = myMath.matrixProduct(View.sinumerikView.parseData.frame.invertBasis, myMath.matrixProduct(matrixRotX, myMath.matrixProduct(matrixRotY, matrixRotZ)));
        // console.log(rotMatrix);
        View.sinumerikView.parseData.frame.invertBasis = rotMatrix;
    }
    // console.log(trans);
    generateBasis();
    // console.log(View.sinumerikView.parseData.frame);
}

function generateBasis() {
    var basis = View.sinumerikView.parseData.frame.invertBasis;

    var matrixDeterminant =
        basis[0][0] * basis[1][1] * basis[2][2] +
        basis[2][0] * basis[0][1] * basis[1][2] +
        basis[1][0] * basis[2][1] * basis[0][2] -
        basis[2][0] * basis[1][1] * basis[0][2] -
        basis[0][0] * basis[2][1] * basis[1][2] -
        basis[1][0] * basis[0][1] * basis[2][2];

    //console.log(matrixDeterminant);

    var minorMatrix = [[],[],[]];
    minorMatrix[0][0] = basis[1][1]*basis[2][2] - basis[2][1]*basis[1][2];
    minorMatrix[1][0] = basis[0][1]*basis[2][2] - basis[2][1]*basis[0][2];
    minorMatrix[2][0] = basis[0][1]*basis[1][2] - basis[1][1]*basis[0][2];
    minorMatrix[0][1] = basis[1][0]*basis[2][2] - basis[2][0]*basis[1][2];
    minorMatrix[1][1] = basis[0][0]*basis[2][2] - basis[2][0]*basis[0][2];
    minorMatrix[2][1] = basis[0][0]*basis[1][2] - basis[1][0]*basis[0][2];
    minorMatrix[0][2] = basis[1][0]*basis[2][1] - basis[2][0]*basis[1][1];
    minorMatrix[1][2] = basis[0][0]*basis[2][1] - basis[2][0]*basis[0][1];
    minorMatrix[2][2] = basis[0][0]*basis[1][1] - basis[1][0]*basis[0][1];

    var complementMatrix = [[minorMatrix[0][0],       -1 * minorMatrix[0][1],  minorMatrix[0][2]],
        [-1 * minorMatrix[1][0],  minorMatrix[1][1],      -1 * minorMatrix[1][2]],
        [minorMatrix[2][0],    -1 * minorMatrix[2][1],      minorMatrix[2][2]]];

    var transposedComplementMatrix = [[],[],[]];
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j ++) {
            transposedComplementMatrix[i][j] = complementMatrix[j][i];
        }
    }
    // console.log(complementMatrix);
    // console.log(transposedComplementMatrix);

    var inverseMatrix = [[],[],[]];
    for (let i = 0; i < 3; i ++) {
        for (let j = 0; j < 3; j ++) {
            inverseMatrix[i][j] = (1/matrixDeterminant) * transposedComplementMatrix[i][j];
            if (Math.abs(inverseMatrix[i][j]) < 1e-12) {
                inverseMatrix[i][j] = 0;
            }
        }
    }




    // console.log(inverseMatrix);

    View.sinumerikView.parseData.frame.basis = inverseMatrix;
    //console.log(basis);


}

export function getCoordinatesInFrame (coordinates) {

    var basis = View.sinumerikView.parseData.frame.basis;
    // console.log(basis);

    // console.log('get coord by frame');
    var vectorWithoutTrans = [coordinates.X, coordinates.Y, coordinates.Z];
    // console.log(vectorWithoutTrans);
    // console.log(View.sinumerikView.parseData.frame.trans);
    vectorWithoutTrans[0] -= View.sinumerikView.parseData.frame.trans.X;
    vectorWithoutTrans[1] -= View.sinumerikView.parseData.frame.trans.Y;
    vectorWithoutTrans[2] -= View.sinumerikView.parseData.frame.trans.Z;
    // console.log(vectorWithoutTrans[0]);
    // console.log(vectorWithoutTrans[1]);
    // console.log(vectorWithoutTrans[2]);


    //console.log(JSON.stringify(vectorWithoutTrans));

    var matrixSystem = JSON.parse(JSON.stringify(basis));
    matrixSystem[3] = [];
    matrixSystem[3][0] = vectorWithoutTrans[0];
    matrixSystem[3][1] = vectorWithoutTrans[1];
    matrixSystem[3][2] = vectorWithoutTrans[2];

    var matrixCoeffSum = 0;

    // console.log(JSON.stringify(matrixSystem));
    for (let i = 0; i < 4; i ++) {
        for (let j = 0; j < 3; j++) {
            if (Math.abs(matrixSystem[i][j]) < 1e-12) {
                matrixSystem[i][j] = 0;
            }
            if (i < 3) {
                matrixCoeffSum += Math.abs(matrixSystem[i][j]);
            }
        }
    }
    //search first !null coeff
    // console.log(JSON.stringify(matrixSystem));
    // console.log(matrixCoeffSum);

    var first_col = -1;
    for (let i = 0; i < 3; i ++) {
        if (matrixSystem[0][i] != 0) {
            first_col = i;
            var coeff = 1 / matrixSystem[0][first_col];
            for (let j = 0; j < 4; j++) {
                matrixSystem[j][first_col] *=coeff;
            }
            break;
        }
    }
    // console.log('first ' + first_col);
    for (let i = 0; i < 3; i ++) {
        if (i != first_col) {
            var coeff = matrixSystem[0][i] / matrixSystem[0][first_col];
            for (let j = 0; j < 4; j++) {
                matrixSystem[j][i] -= matrixSystem[j][first_col] * coeff;
                if (Math.abs(matrixSystem[j][i]) < 1e-12) {
                    matrixSystem[j][i] = 0;
                }
            }
        }
    }
    // console.log(JSON.stringify(matrixSystem));
    var second_col = -1;
    for (let i = 0; i < 3; i ++) {
        if (i != first_col && matrixSystem[1][i] != 0) {
            second_col = i;
            var coeff = 1 / matrixSystem[1][second_col];
            for (let j = 1; j < 4; j++) {
                matrixSystem[j][second_col] *=coeff;
            }
            break;
        }
    }
    // console.log('second ' + second_col);

    for (let i = 0; i < 3; i ++) {
        if (i != second_col) {
            var coeff = matrixSystem[1][i] / matrixSystem[1][second_col];
            for (let j = 1; j < 4; j++) {
                matrixSystem[j][i] -= matrixSystem[j][second_col] * coeff;
                if (Math.abs(matrixSystem[j][i]) < 1e-12) {
                    matrixSystem[j][i] = 0;
                }
            }
        }
    }
    // console.log(JSON.stringify(matrixSystem));
    var third_col;
    for (let i = 0; i < 3; i++) {
        if (i != first_col && i !=second_col) {
            third_col = i;
            var coeff = 1 / matrixSystem[2][third_col];
            for (let j = 2; j < 4; j++) {
                matrixSystem[j][third_col] *=coeff;
            }
        }
    }
    // console.log(JSON.stringify(matrixSystem));

    for (let i = 0; i < 3; i ++) {
        if (i != third_col) {
            var coeff = matrixSystem[2][i] / matrixSystem[2][third_col];
            for (let j = 2; j < 4; j++) {
                matrixSystem[j][i] -= matrixSystem[j][third_col] * coeff;
                if (Math.abs(matrixSystem[j][i]) < 1e-12) {
                    matrixSystem[j][i] = 0;
                }
            }
        }
    }
    // console.log(JSON.stringify(matrixSystem));

    var result = [];

    result[0] = matrixSystem[3][first_col];
    result[1] = matrixSystem[3][second_col];
    result[2] = matrixSystem[3][third_col];

    return result;

    return matrixSystem[3];
}

export function getCoordinatesInBase (coordinates) {
    // console.log(JSON.stringify(coordinates));
    var invertBasis = View.sinumerikView.parseData.frame.invertBasis;
    // console.log('get coord by frame');
    var vector = [coordinates.X, coordinates.Y, coordinates.Z];
    // console.log(vector);

    var matrixSystem = JSON.parse(JSON.stringify(invertBasis));
    matrixSystem[3] = vector;
    var matrixCoeffSum = 0;

    // console.log(JSON.stringify(matrixSystem));
    for (let i = 0; i < 4; i ++) {
        for (let j = 0; j < 3; j++) {
            if (Math.abs(matrixSystem[i][j]) < 1e-12) {
                matrixSystem[i][j] = 0;
            }
            if (i < 3) {
                matrixCoeffSum += Math.abs(matrixSystem[i][j]);
            }
        }
    }
    //search first !null coeff
    // console.log(JSON.stringify(matrixSystem));
    // console.log(matrixCoeffSum);

    var first_col = -1;
    for (let i = 0; i < 3; i ++) {
        if (matrixSystem[0][i] != 0) {
            first_col = i;
            var coeff = 1 / matrixSystem[0][first_col];
            for (let j = 0; j < 4; j++) {
                matrixSystem[j][first_col] *=coeff;
            }
            break;
        }
    }
    // console.log('first ' + first_col);
    for (let i = 0; i < 3; i ++) {
        if (i != first_col) {
            var coeff = matrixSystem[0][i] / matrixSystem[0][first_col];
            for (let j = 0; j < 4; j++) {
                matrixSystem[j][i] -= matrixSystem[j][first_col] * coeff;
                if (Math.abs(matrixSystem[j][i]) < 1e-12) {
                    matrixSystem[j][i] = 0;
                }
            }
        }
    }
    // console.log(JSON.stringify(matrixSystem));
    var second_col = -1;
    for (let i = 0; i < 3; i ++) {
        if (i != first_col && matrixSystem[1][i] != 0) {
            second_col = i;
            var coeff = 1 / matrixSystem[1][second_col];
            for (let j = 1; j < 4; j++) {
                matrixSystem[j][second_col] *=coeff;
            }
            break;
        }
    }
    // console.log('second ' + second_col);

    for (let i = 0; i < 3; i ++) {
        if (i != second_col) {
            var coeff = matrixSystem[1][i] / matrixSystem[1][second_col];
            for (let j = 1; j < 4; j++) {
                matrixSystem[j][i] -= matrixSystem[j][second_col] * coeff;
                if (Math.abs(matrixSystem[j][i]) < 1e-12) {
                    matrixSystem[j][i] = 0;
                }
            }
        }
    }
    // console.log(JSON.stringify(matrixSystem));
    var third_col;
    for (let i = 0; i < 3; i++) {
        if (i != first_col && i !=second_col) {
            third_col = i;
            var coeff = 1 / matrixSystem[2][third_col];
            for (let j = 2; j < 4; j++) {
                matrixSystem[j][third_col] *=coeff;
            }
        }
    }
    // console.log(JSON.stringify(matrixSystem));

    for (let i = 0; i < 3; i ++) {
        if (i != third_col) {
            var coeff = matrixSystem[2][i] / matrixSystem[2][third_col];
            for (let j = 2; j < 4; j++) {
                matrixSystem[j][i] -= matrixSystem[j][third_col] * coeff;
                if (Math.abs(matrixSystem[j][i]) < 1e-12) {
                    matrixSystem[j][i] = 0;
                }
            }
        }
    }
    // console.log(JSON.stringify(matrixSystem));

    var result = [];

    result[0] = matrixSystem[3][first_col] + View.sinumerikView.parseData.frame.trans.X;
    result[1] = matrixSystem[3][second_col] + View.sinumerikView.parseData.frame.trans.Y;
    result[2] = matrixSystem[3][third_col] + View.sinumerikView.parseData.frame.trans.Z;

    return result;

}

function generatePrimitives(rowText, programName, progRowNum) {
    // console.log(`${programName}: ${progRowNum}    ${rowText}`);
    var primitives = [];
    var programRow = rowText.trim();
    var splitRow = programRow.split(' ');
    var regEx;
    //delete empty parts
    for (let index = 0; index < splitRow.length; index++) {
        splitRow[index] = splitRow[index].trim();
        if (splitRow[index] == 0) {
            splitRow.splice(index, 1);
            index --;
        }
    }

    primitives[0] = {};
    primitives[0].operators = [];

    var spindleAxis = '';
    if (View.sinumerikView.singleLineDebugData.machine.firstSpindle) {
        spindleAxis = View.sinumerikView.singleLineDebugData.machine.firstSpindle.name;
    }

    //region Check call
    //check call
    View.sinumerikView.parseData.subroutines.forEach(function (subroutine) {
        var regExp = new RegExp(`(?<=^)${subroutine.name}(?=[\(\s])`);
        if (programRow.match(regExp)) {
            // console.log('call without "CALL" '+ programRow.match(regExp)[0]);
            programRow = 'CALL ' + programRow;
            splitRow.unshift('CALL');
        }
    })

    if (splitRow[0] == 'CALL') {
        var subroutineWithVariables = programRow.slice(5);
        var subroutineName = '';
        var subroutineVariables = [];
        if (subroutineWithVariables.indexOf('(') && subroutineWithVariables.lastIndexOf(')')){
            subroutineName = subroutineWithVariables.slice(0,subroutineWithVariables.indexOf('('));
            subroutineVariables = subroutineWithVariables.slice(subroutineWithVariables.indexOf('(') + 1, subroutineWithVariables.lastIndexOf(')')).split(',');
        }
        if (subroutineWithVariables.match(/\w*/)[0] == subroutineWithVariables) {
            subroutineName = subroutineWithVariables;
        }
        if (subroutineName == '') {
            primitives[0].operators[0] = {};
            primitives[0].operators[0].type = 'parseError_004';
            return primitives;
        }

        View.sinumerikView.parseData.subroutines.forEach(function (subroutine) {
            if (subroutineName == subroutine.name) {
                const programmText = fs.readFileSync(`${subroutine.path}`, 'utf8').split('\n');
                var programmName = subroutine.path.slice(subroutine.path.lastIndexOf('/') + 1).replace('.','_').toUpperCase();
                // console.log(`CALL ${programmName}`);
                parseRows(programmText, programmName, subroutineVariables);

                return;
            }
        });
        return false;
    }
    //endregion

    //region Frame
    regEx = /(?<!\w)A?(TRANS|MIRROR|ROT|SCALE)(?!\w)/;
    if (programRow.match(regEx)) {
        var additive = 0;
        var value = [];
        var type = programRow.match(regEx)[0].match(/TRANS|MIRROR|ROT|SCALE/)[0];
        if (programRow.match(/(?<!\w)(TRANS|MIRROR|ROT|SCALE)(?!\w)/)) {
//            console.log('Main frame');
        } else {
            additive = 1;
//            console.log('Additive frame');
        }
        var frameRow = programRow.split(' ').slice(1);
//        console.log(frameRow);
        frameRow.forEach(function (str) {
            var returnVal = checkCoordinates(str);
            if (returnVal) {
                value.push(returnVal)
            } else {
                View.sinumerikView.parseData.errors.push({text:`Error in ${programRow.match(regEx)[0]}.  prog ${programName} row ${progRowNum + 1}`, row: progRowNum});
                primitives[0].operators[0] = {};
                primitives[0].operators[0].type = 'parseError';
                return primitives;
            }
        })
        generateFrame(additive, type, value, programName, progRowNum);
        primitives[0].operators[0] = {};
        primitives[0].operators[0].type = 'Frame';
        return primitives;
    }
    //endregion

    //region MSG
    if (programRow.substring(0,3) == 'MSG'){
        primitives[0].operators[0] = {};
        primitives[0].operators[0].type = 'MSG';
        if (programRow.indexOf('(') && programRow.lastIndexOf(')')) {
            primitives[0].operators[0].value = programRow.substring(programRow.indexOf('('), programRow.lastIndexOf(')'));
        }
        return primitives;
    }
    //endregion

    //region G4
    regEx = /(?<!\w)G4(?!\w)/;
    if (regEx.exec(programRow)) {
        primitives[0].operators[0] = {};
        primitives[0].operators[0].type = 'Delay';
        return primitives;
    }
    //endregion

    for (let i = 0; i < splitRow.length; i ++) {
        primitives[0].operators[i] = {};

        //
        while (true) {
            //region only for 1st operator check rowNum
            if (!i && checkRowNum(splitRow[i])) {
                primitives[0].operators[i].type = 'rowNum';
                primitives[0].operators[i].value = splitRow[i];
                break;
            }
            //endregion

            //region M-func
            var regEx = /(?<!\w)M(?=\d+)/;
            if (regEx.exec(splitRow[i])) {
                //TODO eg M1=4
                primitives[0].operators[i].type = 'M_func';
                primitives[0].operators[i].value = splitRow[i].substring(1);
                break;
                // console.log(primitives[0].operators[i]);
            }
            //endregion

            //region T-name
            regEx = /(?<!\w)T(?=[\=\d])/;
            if (regEx.exec(splitRow[i])) {
                primitives[0].operators[i].type = 'T_name';
                regEx = /(?<!\w)T(?=[\d])/;
                if (regEx.exec(splitRow[i])) {
                    primitives[0].operators[i].value = splitRow[i].substring(1);
                } else {
                    //TODO парсить имя инструмента
                    primitives[0].operators[i].value = 100;
                }

                break;
                // console.log(primitives[0].operators[i]);
            }
            //endregion

            //region D-Num
            regEx = /(?<!\w)D(?=[\=\d])/;
            if (regEx.exec(splitRow[i])) {
                primitives[0].operators[i].type = 'D_num';
                primitives[0].operators[i].value = splitRow[i].substring(1);
                break;
                // console.log(primitives[0].operators[i]);
            }
            //endregion


            //region spindle speed
            regEx = /(?<!\w)S(?=[\=\d])/;
            if (regEx.exec(splitRow[i])) {
                primitives[0].operators[i].type = 'S_speed';
                primitives[0].operators[i].value = splitRow[i].substring(1);
                break;
                // console.log(primitives[0].operators[i]);
            }
            //endregion

            //region feed
            regEx = /(?<!\w)F(?=[\=\d])/;
            if (regEx.exec(splitRow[i])) {
                primitives[0].operators[i].type = 'F_feed';
                primitives[0].operators[i].value = splitRow[i].substring(1);
                break;
                // console.log(primitives[0].operators[i]);
            }
            regEx = /(?<!\w)FB=/;
            if (regEx.exec(splitRow[i])) {
                primitives[0].operators[i].type = 'F_feed';
                break;
                // console.log(primitives[0].operators[i]);
            }
            //endregion

            //region SUPA
            if (splitRow[i] == 'SUPA') {
                primitives[0].operators[i].type = 'supa';
                break;
                // console.log(primitives[0].operators[i]);
            }
            //endregion

            //region G93 - G96
            regEx = /(?<!\w)G9[3-6](?!\w)/;
            if (regEx.exec(splitRow[i])) {
                primitives[0].operators[i].type = 'generalGroup15';
                primitives[0].operators[i].value = splitRow[i];
                break;
                // console.log(primitives[0].operators[i]);
            }
            //endregion

            //region G40 - G42
            //tool radius compensation
            regEx = /(?<!\w)G4[0-2](?!\w)/;
            if (regEx.exec(splitRow[i])) {
                primitives[0].operators[i].type = 'toolRadiusCompensation';
                primitives[0].operators[i].value = splitRow[i];
                break;
                // console.log(primitives[0].operators[i]);
            }
            //endregion

            //region G17 - G19
            regEx = /(?<!\w)G1[7-9](?!\w)/;
            if (regEx.exec(splitRow[i])) {
                primitives[0].operators[i].type = 'Plane';
                primitives[0].operators[i].value = splitRow[i];
                break;
            }
            //endregion

            //region G110 - G112  pole
            regEx = /(?<!\w)G11[0-2](?!\w)/;
            if (regEx.exec(splitRow[i])) {
                primitives[0].operators[i].type = 'Pole';
                primitives[0].operators[i].value = splitRow[i];
                break;
            }
            //endregion

            //region check Marker
            if (checkMark(splitRow[i])) {
                primitives[0].operators[i].type = 'Marker';
                primitives[0].operators[i].value = splitRow[i];
                break;
            }
            //endregion
            //region check move group operator
            if (checkMoveGroup(splitRow[i])) {
                primitives[0].operators[i].type = 'moveGroup';
                primitives[0].operators[i].value = splitRow[i];
                break;
            }
            //endregion
            //region check coordinates
            var returnVal = checkCoordinates(splitRow[i]);
            //console.log(returnVal);
            if (returnVal) {
                if (returnVal.type && returnVal.type.match('parseError')) {
                    primitives[0].operators[i].type = returnVal.type;
                    View.sinumerikView.parseData.errors.push({text:`Coordinate parse error "${returnVal.type}".  prog ${programName} row ${progRowNum + 1}`, row: progRowNum});
                    break;
                }
                if (i) {
                    primitives[0].operators.forEach(function (operator, index) {
                        if (operator.type == 'coordinate' && returnVal.name == operator.name) {
                            View.sinumerikView.parseData.errors.push({text:`"${returnVal.name}" axis name is used more than once.  prog ${programName} row ${progRowNum + 1}`, row: progRowNum});
                        }
                    });
                }
                primitives[0].operators[i].type = `coordinate`;
                if (returnVal.type) {
                    primitives[0].operators[i].subtype = returnVal.type;
                }
                primitives[0].operators[i].name = returnVal.name;

                if (View.sinumerikView.parseData.diamon && returnVal.name == 'X') {
                    primitives[0].operators[i].value = returnVal.value / 2;
                } else {
                    primitives[0].operators[i].value = returnVal.value;
                }
                if (returnVal.modificator) {
                    primitives[0].operators[i].modificator = returnVal.modificator;
                }

                //check the same coordinate names
                break;
            }
            //endregion

            //region check circle_Center_axes
            var returnVal = checkCircleCenterAxes(splitRow[i]);
            // console.log(returnVal);
            if (returnVal) {
                if (returnVal.type && returnVal.type.match('parseError')) {
                    primitives[0].operators[i].type = returnVal.type;
                    View.sinumerikView.parseData.errors.push({text:`Circle center parse error "${returnVal.type}".  prog ${programName} row ${progRowNum + 1}`, row: progRowNum});
                    break;
                }
                if (i) {
                    primitives[0].operators.forEach(function (operator, index) {
                        if (operator.type == 'circleCenter' && returnVal.name == operator.name) {
                            View.sinumerikView.parseData.errors.push({text:`"${returnVal.name}" axis name is used more than once.  prog ${programName} row ${progRowNum + 1}`, row: progRowNum});
                        }
                    });
                }
                primitives[0].operators[i].type = `circleCenter`;
                if (returnVal.type) {
                    primitives[0].operators[i].subtype = returnVal.type;
                }
                primitives[0].operators[i].name = returnVal.name;

                if (returnVal.type && returnVal.type == 'AC' && returnVal.name == 'I' && View.sinumerikView.parseData.diamon) {
                    primitives[0].operators[i].value = (returnVal.value) / 2;
                } else {
                    primitives[0].operators[i].value = (returnVal.value);
                }
                //check the same coordinate names
                break;
            }
            //endregion

            //region TURN
            if (splitRow[i].match(/(?<!\w)TURN\=/)) {
                primitives[0].operators[i].type = 'TURN';
                var mathVal = mathParse(splitRow[i].slice(3), programName);
                if (mathVal != null) {
                    if (mathVal % 1 == 0) {
                        primitives[0].operators[i].value = mathVal;
                    } else {
                        View.sinumerikView.parseData.errors.push({text:`Right part of TURN assignment not integer ${mathVal}. prog ${programName} row ${progRowNum + 1}`, row: progRowNum})
                    }
                } else {
                    View.sinumerikView.parseData.errors.push({text:`Right part of TURN assignment error. prog ${programName} row ${progRowNum + 1}`, row: progRowNum})
                }
                break;
            }
            //endregion

            //region circle AR CR
            if (splitRow[i].match(/(?<!\w)AR\=/)) {
                primitives[0].operators[i].type = 'circle_AR';
                var mathVal = mathParse(splitRow[i].slice(3), programName);
                if (mathVal != null) {
                    primitives[0].operators[i].value = mathVal;
                } else {
                    View.sinumerikView.parseData.errors.push({text:`Right part of AR assignment error. prog ${programName} row ${progRowNum + 1}`, row: progRowNum})
                }
                break;
            }

            if (splitRow[i].match(/(?<!\w)CR\=/)) {
                primitives[0].operators[i].type = 'circle_CR';
                var mathVal = mathParse(splitRow[i].slice(3), programName);
                if (mathVal != null) {
                    primitives[0].operators[i].value = mathVal;
                } else {
                    View.sinumerikView.parseData.errors.push({text:`Right part of CR assignment error. prog ${programName} row ${progRowNum + 1}`, row: progRowNum})
                }
                break;
            }
            //endregion

            //region polar AP RP
            if (splitRow[i].match(/(?<!\w)AP\=/)) {
                primitives[0].operators[i].type = 'coordinate';
                primitives[0].operators[i].subtype = 'AP';
                if (splitRow[i].match(/(?<!\w)IC\(/)) {
                    // console.log(splitRow[i].substring(splitRow[i].match(/(?<!\w)IC\(/).index + 3, splitRow[i].length - 1));
                    var mathVal = mathParse(splitRow[i].substring(splitRow[i].match(/(?<!\w)IC\(/).index + 3, splitRow[i].length - 1), programName);
                    // console.log(mathVal);
                    // console.log(View.sinumerikView.parseData.pole.AP);
                    if (mathVal != null) {
                        primitives[0].operators[i].value = mathVal + View.sinumerikView.parseData.pole.AP;
                    } else {
                        View.sinumerikView.parseData.errors.push({
                            text: `Right part of AP assignment error (${splitRow[i].substring(splitRow[i].match(/(?<!\w)IC\(/).index + 3, splitRow[i].length - 1)}). prog ${programName} row ${progRowNum + 1}`,
                            row: progRowNum
                        })
                    }
                } else {
                    var mathVal = mathParse(splitRow[i].slice(3), programName);
                    if (mathVal != null) {
                        primitives[0].operators[i].value = mathVal;
                    } else {
                        View.sinumerikView.parseData.errors.push({
                            text: `Right part of AP assignment error. prog ${programName} row ${progRowNum + 1}`,
                            row: progRowNum
                        })
                    }
                }
                break;
            }

            if (splitRow[i].match(/(?<!\w)RP\=/)) {
                primitives[0].operators[i].type = 'coordinate';
                primitives[0].operators[i].subtype = 'RP';
                if (splitRow[i].match(/(?<!\w)IC\(/)) {
                    // console.log(splitRow[i].substring(splitRow[i].match(/(?<!\w)IC\(/).index + 3, splitRow[i].length - 1));
                    var mathVal = mathParse(splitRow[i].substring(splitRow[i].match(/(?<!\w)IC\(/).index + 3, splitRow[i].length - 1), programName);
                    // console.log(mathVal);
                    // console.log(View.sinumerikView.parseData.pole.AP);
                    if (mathVal != null) {
                        primitives[0].operators[i].value = mathVal + View.sinumerikView.parseData.pole.RP;
                    } else {
                        View.sinumerikView.parseData.errors.push({
                            text: `Right part of PR assignment error (${splitRow[i].substring(splitRow[i].match(/(?<!\w)IC\(/).index + 3, splitRow[i].length - 1)}). prog ${programName} row ${progRowNum + 1}`,
                            row: progRowNum
                        })
                    }
                } else {
                    var mathVal = mathParse(splitRow[i].slice(3), programName);
                    if (mathVal != null) {
                        primitives[0].operators[i].value = mathVal;
                    } else {
                        View.sinumerikView.parseData.errors.push({
                            text: `Right part of RP assignment error. prog ${programName} row ${progRowNum + 1}`,
                            row: progRowNum
                        })
                    }
                }
                break;
            }
            //endregion

            // region ANG etc modificators
            if (splitRow[i].match(/(?<!\w)(ANG|CHF|RNDM)(?=[\=])/)) {
                primitives[0].operators[i].type = 'Move modificator';
                primitives[0].operators[i].value = splitRow[i].match(/(?<!\w)ANG|CHF|RNDM(?=[\=])/)[0];
                break;
            }
            // endregion

            //region RND
            if (splitRow[i].match(/(?<!\w)RND\=/)) {
                primitives[0].operators[i].type = 'coordinate';
                primitives[0].operators[i].subtype = 'RND';
                var mathVal = mathParse(splitRow[i].slice(4),programName);
                if (mathVal != null) {
                    primitives[0].operators[i].value = mathVal;
                } else {
                    View.sinumerikView.parseData.errors.push({text:`Right part of RND assignment error. prog ${programName} row ${progRowNum + 1}`, row: progRowNum})
                }
                break;
            }
            //endregion

            //region CHR
            if (splitRow[i].match(/(?<!\w)CHR\=/)) {
                primitives[0].operators[i].type = 'coordinate';
                primitives[0].operators[i].subtype = 'CHR';
                var mathVal = mathParse(splitRow[i].slice(4),programName);
                if (mathVal != null) {
                    primitives[0].operators[i].value = mathVal;
                } else {
                    View.sinumerikView.parseData.errors.push({text:`Right part of CHR assignment error. prog ${programName} row ${progRowNum + 1}`, row: progRowNum})
                }
                break;
            }
            //endregion


            returnVal = checkAssignment(splitRow[i], programName);
            // console.log('check assignment:' + splitRow[i]);
            if (returnVal) {
                if (returnVal.type) {
                    primitives[0].operators[i].type = returnVal.type;
                    View.sinumerikView.parseData.errors.push({text:`${returnVal.type}.  prog ${programName} row ${progRowNum + 1}`, row: progRowNum});
                    break;
                } else {
                    primitives[0].operators[i].type = 'assignment';
                    primitives[0].operators[i].name = returnVal.name;
                    primitives[0].operators[i].value = returnVal.value;
                }
               // console.log(returnVal);

                break;
            }

            //region DIAMON
            if (splitRow[i] == 'DIAMON') {
                primitives[0].operators[i].type = 'diamon';
                break;
            }
            if (splitRow[i] == 'DIAM90') {
                primitives[0].operators[i].type = 'diam90';
                break;
            }
            if (splitRow[i] == 'DIAMOF') {
                primitives[0].operators[i].type = 'diamof';
                break;
            }

            //endregion



            //If can not parse

            primitives[0].operators[i].type = 'parseError';
            View.sinumerikView.parseData.errors.push({text:`${splitRow[i]}. Not one parser worked. prog ${programName} row ${progRowNum + 1}`, row: progRowNum});
            break;
            //check math
        }
    }

    return primitives;


    function checkCircleCenterAxes(str) {
        var returnVal = {};
        var regEx = /(?<!\w)([IJK])(?=[\d\=\-\+])/;

        var regExExec = regEx.exec(str);
        if (regExExec) {
            returnVal.name = regExExec[0];
            if (str.substring(regExExec[0].length, regExExec[0].length + 1) != '=') {
                var regExLocal = /^[\-\+]?\d+[\.]?\d*/;
                var regExExecLocal = regExLocal.exec(str.substring(regExExec[0].length));
                // console.log(regExExecLocal);
                if (regExExecLocal && regExExecLocal.input && regExExecLocal[0] == regExExecLocal.input) {
                    returnVal.value = regExExecLocal[0];
                } else {
                    returnVal.type = 'parseError_001';
                }
                // console.log('AAA ' + str.substring(regExExec[0].length));
            } else {
                var mathVal;
                if (str.substring(regExExec[0].length + 1, regExExec[0].length + 3).match(/IC|AC/)) {
                    mathVal = mathParse(str.substring(str.indexOf('(') + 1, str.lastIndexOf(')')), programName);
                    returnVal.type = str.substring(regExExec[0].length + 1, regExExec[0].length + 3);
                } else {
                    mathVal = mathParse(str.substring(regExExec[0].length + 1), programName);
                }
                // console.log(mathVal);
                if (mathVal != null) {
                    returnVal.value = mathVal;
                } else {
                    returnVal.type = 'parseError_002';
                }
            }
            return returnVal;
        }
        return false;
    }

    function checkCoordinates(str) {
        var returnVal = {};
        var regEx = /(?<!\w)([XYZABC])(?=[\d\=\-\+])/;
        if (spindleAxis != '' && spindleAxis != 'C' ) {
            var regEx = new RegExp(`(?<!\\w)((${spindleAxis})|([XYZABC]))(?=[\\d\\=\\-\\+])`);
        }

//        console.log(regEx);

        var regExExec = regEx.exec(str);
        // console.log('coord regExExec:');
        // console.log(regExExec);
        if (regExExec) {
            returnVal.name = regExExec[0];
//            console.log(str.substring(regExExec[0].length, regExExec[0].length + 1));
            if (str.substring(regExExec[0].length, regExExec[0].length + 1) != '=') {
                var regExLocal = /^[\-\+]?\d+[\.]?\d*/;
                var regExExecLocal = regExLocal.exec(str.substring(regExExec[0].length));
                // console.log(regExExecLocal);
                if (regExExecLocal && regExExecLocal.input && regExExecLocal[0] == regExExecLocal.input) {
                    returnVal.value = regExExecLocal[0];
                } else {
                    returnVal.type = 'parseError_001';
                }
                // console.log('AAA ' + str.substring(regExExec[0].length));
            } else {
                var mathVal;
                if (str.substring(regExExec[0].length + 1, regExExec[0].length + 3).match(/IC|AC/)) {
                    mathVal = mathParse(str.substring(str.indexOf('(') + 1, str.lastIndexOf(')')), programName);
                    returnVal.type = str.substring(regExExec[0].length + 1, regExExec[0].length + 3);
                } else {
                    mathVal = mathParse(str.substring(regExExec[0].length + 1),programName);
                }
                if (mathVal != null) {
                    returnVal.value = mathVal;
                } else {
                    returnVal.type = 'parseError_002';
                }
            }
            if (programRow.match(/(?<!\w)ANG(?=[\=])/)) {
                if (!returnVal.modificator) {
                    returnVal.modificator = {};
                }
                var endAngIndex = programRow.indexOf(' ', programRow.indexOf('ANG') + 4);
                var mathVal = mathParse(programRow.substring(programRow.indexOf('ANG') + 4).split(' ')[0], programName);
                if (mathVal != null) {
                    returnVal.modificator.ang = mathVal;
                } else {
                    View.sinumerikView.parseData.errors.push({text:`Right part of ANG assignment error. prog ${programName} row ${progRowNum + 1}`, row: progRowNum})
                }
            }



            return returnVal;
        }
        return false;
    }

    function checkMoveGroup(str) {
        var regEx = /G33|G[0-3]/;
        var regExExec = regEx.exec(str);
        if (regExExec && regExExec[0] == regExExec.input) {
            return true;
        }
        regEx = /G[23]/;
        var regExExec = regEx.exec(str);
        if (regExExec && regExExec[0] == regExExec.input) {
            return true;
        }

        return false;
    }

    function checkRowNum(str) {
        var regEx = /N\d+/;
        var regExExec = regEx.exec(str);
        if (regExExec && regExExec[0] == regExExec.input) {
            return true;
        }
        return false;
    }

    function checkMark(str) {
        var regEx = /[A-Z_][A-Z_]\S*\:/;
        var regExExec = regEx.exec(str);
        if (regExExec && regExExec[0] == regExExec.input) {
            return true;
        }
        return false;
    }

    function checkAssignment(str, programName) {
       // console.log('check assignment: ' + str);

        var returnVal = {};
        if (Object.keys(View.sinumerikView.parseData.variables[`${programName}`]).length) {
            for (var variable in View.sinumerikView.parseData.variables[`${programName}`]) {
                regEx = new RegExp(`(?<=\\W|^)${View.sinumerikView.parseData.variables[`${programName}`][variable].name}(?=[\\=])`);
                if (regEx.exec(str)) {
                    returnVal.name = View.sinumerikView.parseData.variables[`${programName}`][variable].name;
                    returnVal.nameLength = regEx.exec(str)[0].length;
                    // console.log(returnVal.nameLength);
                }
            }
        }

        var regEx = /(?<!\w)R\d+(?=[\=])/;

        var regExExec = regEx.exec(str);
        if (regExExec) {
            returnVal.name = regExExec[0];
            returnVal.nameLength = regExExec[0].length;
        }

        if (returnVal.name != undefined) {
            var splitStr = str.split('=');
            if (splitStr.length!=2) {
                returnVal.type = `Error in assignment ${str}`;
            }
            // returnVal.name = regExExec[0];
            // console.log(View.sinumerikView.parseData.variables);

            var mathVal = mathParse(str.substring(returnVal.nameLength + 1), programName);
            if (mathVal != null) {
                returnVal.value = mathVal;
            } else {
                returnVal.type = `Error in right part ${str}`;
            }
            return returnVal;
        }
        return false;
    }

}

function mathParse(expression, programName) {
    // console.log(expression);
    // console.log(View.sinumerikView.parseData.variables);
    if (Object.keys(View.sinumerikView.parseData.variables.firstChannelVariables).length) {
        for (var variable in View.sinumerikView.parseData.variables.firstChannelVariables) {
           // console.log(View.sinumerikView.parseData.variables.firstChannelVariables[variable].name);
            regEx = new RegExp(`(?<=\\W|^)${View.sinumerikView.parseData.variables.firstChannelVariables[variable].name}(?=\\W|$)`, 'g');
            if (regEx.exec(expression)) {
                expression = expression.replace(regEx, `${View.sinumerikView.parseData.variables.firstChannelVariables[variable].value}`);
           //     console.log('Variable replace: ' + expression);
                //expression.replace()
            }

        }
    }

    if (Object.keys(View.sinumerikView.parseData.variables[`${programName}`]).length) {
        for (var variable in View.sinumerikView.parseData.variables[`${programName}`]) {
            regEx = new RegExp(`(?<=\\W|^)${View.sinumerikView.parseData.variables[`${programName}`][variable].name}(?=\\W|$)`, 'g');
            // console.log(variable);
            // console.log(regEx);
            if (regEx.exec(expression)) {
                expression = expression.replace(regEx, `${View.sinumerikView.parseData.variables[`${programName}`][variable].value}`);
            }
        }
    }

    // console.log('mathParse: ' + expression);

//    console.log('input string: ' + expression);
    for (let i = 0; i < replacements.Math.desired.length; i++) {
        var regEx = new RegExp(`(?<!\\w)${replacements.Math.desired[i]}(?=\\W?)`);
        var while_iter = 0;
        while (true) {
            var regExExec = regEx.exec(expression);
            if (regExExec) {
                expression = expression.replace(expression.substring(regExExec.index, regExExec.index + replacements.Math.desired[i].length),replacements.Math.substitution[i]);
            } else {
                break;
            }
            while_iter++;
            if (while_iter > 100) {
                break;
            }
        }
    }
    if (expression.match('--')) {
        expression = expression.replace(/--/g,'+');
        // console.log('replacement string: ' + expression);
    }

    //Текущие координаты $AA_IW[...]
    while (expression.match(/\$AA_IW\[[XYZ]\]/)) {
        var AA_value = getCoordinatesInFrame(View.sinumerikView.parseData.axesPos);
        AA_value = {X:AA_value[0], Y:AA_value[1], Z:AA_value[2]};
        AA_value = AA_value[expression.match(/\$AA_IW\[[XYZ]\]/)[0].match(/[XYZ]/)];
        if (View.sinumerikView.parseData.diamon && expression.match(/\$AA_IW\[[XYZ]\]/)[0].match(/[X]/)) {
            AA_value *= 2;
        }
        // console.log(AA_value);
        expression = expression.replace(/\$AA_IW\[[XYZ]\]/,`${AA_value}`);
    }

    //region Затычка параметров инструмента
    //
    //TODO Убрать эту затычку и реализовать инструменты

    //Затычка для радиуса инструмента
    if (expression.match(/\$P_TOOLR/)) {
        expression = expression.replace(/\$P_TOOLR/, 0);
        // console.log(expression);
    }

    //Затычка для положения режущей кромки
    if (expression.match(/\$TC_DP2/)) {
        if (expression.match(/\$TC_DP2\[[\w,\$]*\]/)) {
            if (View.sinumerikView.parseData.activeTool > 100 && View.sinumerikView.parseData.activeTool < 110) {
                expression = expression.replace(/\$TC_DP2\[[\w,\$]*\]/, (View.sinumerikView.parseData.activeTool - 100));
                // console.log(`Tool orientation ($TC_DP2): ${(View.sinumerikView.parseData.activeTool - 100)}`);
            } else {
                expression = expression.replace(/\$TC_DP2\[[\w,\$]*\]/, 0);
                // console.log(expression);
            }
        }
    }
    //endregion





    var value;
    var codeString = 'value = ' + expression;
    try {
        eval(codeString);
        return value;
    } catch (err) {
        return null;
    }
}

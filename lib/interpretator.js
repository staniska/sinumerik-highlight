'use babel';

//TODO Сделать парсинг G1/0 без движения с записью в группу

const fs = require("fs-extra");
const fsPromises = fs.promises
const path = require("path");
const {dialog} = require("electron").remote;

import View from './sinumerik'
import {normalizeFileName, readProgramLines} from "./utils";
import {clearAxesPos, generateFrame, generateBasis, getCoordinatesInFrame, getCoordinatesInBase} from './coordinates';
import {mathParse, calcValue, checkCondition, getExpressionInBrackets} from './mathParser';
import {checkDef, parseDefPart} from './defParser';
import {checkRepeat, checkIfElseEndif, checkGoTo, checkWhile, checkFor, checkIfGoto} from './controlFlow';
import {generatePrimitives, generateCanvasPrimitives, generateCirclePrimitives, addY_for_C_rot} from './primitives';
import stringParse from './stringParse';
import offn from "./offn";
import {confirmDialog} from "./dialog/confirm";
import {select2DView} from "./3d_view/view";

class CanvasElementsArray extends Array {
    push(element) {
        element.offn = View.sinumerikView.parseData.offn;
        element.toolRadiusCompensation = View.sinumerikView.parseData.toolRadiusCompensation
        element.activeTool = {
            type: View.sinumerikView.parseData.activeTool,
            r: View.sinumerikView.parseData.activeToolR
        }
        element.workPlane = View.sinumerikView.parseData.plane
        element.spindleSpeed = {...View.sinumerikView.parseData.spindleSpeed}
        element.feed = {...View.sinumerikView.parseData.feed}
        Array.prototype.push.call(this, element)
    }
}

export async function progParser(lastLineNum) {
    const pinned = View.sinumerikView.sldPinnedFile
    const Editor = pinned
        ? atom.workspace.getTextEditors().find(e => e.getPath() === pinned)
        : atom.workspace.getActiveTextEditor()
    if (!Editor) return 'machine not founded'
    const filename = Editor.getPath();
    let sinumerikEventHandler = View.sinumerikView.eventRouter.route.bind(this);
    if (!View.sinumerikView.programmData[filename].machine) {
        return 'machine not founded'
    }

    //First call or change filename
    if (!View.sinumerikView.parseData ||
        View.sinumerikView.parseData.length < 1 ||
        View.sinumerikView.parseData.filename !== filename) {

        if (View.sinumerikView.singleLineDebugViewDiv?.plane2D3D?.innerText === '2D') {
            select2DView();
        }
        View.sinumerikView.singleLineDebug3DCameraState = null;
        View.sinumerikView.parseData = {};
        View.sinumerikView.parseData.filename = filename;

        View.sinumerikView.parseData.contourElements = {}

        Editor.onDidStopChanging(function () {
            drawChanges(0);
        });
    }

    let dirPath = Editor.getPath();
    //check Windovs :)
    let dirPathSlicer = '/';
    if (dirPath[1] == ':') {
        dirPathSlicer = '\\';
    }
    dirPath = dirPath.slice(0, dirPath.lastIndexOf(dirPathSlicer));

    parseDataClear(filename);

    View.sinumerikView.parseData.subroutines = [];

    let files = []
    if (dirPath[0] !== '@') {
        files = await fsPromises.readdir(dirPath);
    } else {
        let selectedDir
        if (confirmDialog(`Teletype detected ${filename}.\n Do you want to select a local directory containing additional files? \n
            Хотите ли вы выбрать локальную папку с дополнительными файлами для текущей программы `)) {
            const {canceled, filePaths} = await dialog.showOpenDialog({properties: ['openDirectory']})
            if (!canceled) selectedDir = filePaths[0]
        }

        if (selectedDir) {
            dirPath = selectedDir
            files = await fsPromises.readdir(selectedDir)
        }
    }
    for (const file of files) {
        const stat = await fsPromises.stat(`${dirPath}/${file}`);
        if (stat.isFile() && path.extname(file).toUpperCase().match(/MPF|SPF/)) {
            const subroutine = {};
            subroutine.name = file.slice(0, file.lastIndexOf('.')).toUpperCase();
            subroutine.path = `${dirPath}/${file}`;
            View.sinumerikView.parseData.subroutines.push(subroutine);
        }
    }
    if (View.sinumerikView.machineData.subroutines &&
        View.sinumerikView.machineData.subroutines[View.sinumerikView.programmData[filename].machine.machineName]) {
        for (let i = 0; i < View.sinumerikView.machineData.subroutines[View.sinumerikView.programmData[filename].machine.machineName].length; i++) {
            dirPath = View.sinumerikView.machineData.subroutines[View.sinumerikView.programmData[filename].machine.machineName][i];
            files = await fsPromises.readdir(dirPath);
            for (const file of files) {
                const stat = await fsPromises.stat(`${dirPath}/${file}`);
                if (stat.isFile()) {
                    if (path.extname(file).toUpperCase().match(/MPF|SPF/)) {
                        const subroutine = {};
                        subroutine.name = file.slice(0, file.lastIndexOf('.')).toUpperCase();
                        subroutine.path = `${dirPath}/${file}`;
                        View.sinumerikView.parseData.subroutines.push(subroutine);
                    }
                    if (path.extname(file).toUpperCase().match(/DEF/)) {
                        await readDefFile(`${dirPath}/${file}`)
                    }
                }
            }
        }
    }

    await parseRows(Editor.getText().split('\n'), filename, null, true);
    offn()

    parseDataErrorsDisplay();
}

const readDefFile = async (file) => {
    const text = await fsPromises.readFile(file, 'utf8')
    const lines = text
        .split('\n')
        .filter(l => l.match(/(?<=^)DEF/) || l.match(/(?<=\s)DEF/))
        .map(l => l.split(' ')
            .filter(w => !w.match(/N\d/))
            .filter(w => w !== 'DEF')
            .join(' ')
        )

    lines.forEach(l => {
        let defPart = l
        let value = ''
        if (l.match('=')) {
            defPart = l.split('=')[0]
            value = l.split('=')[1]
        }
        const parseDef = parseDefPart(defPart)
        if (!parseDef) return

        const variables = View.sinumerikView.parseData.variables.firstChannelVariables
        variables[parseDef.name] = {name: parseDef.name, type: parseDef.type}

        if (parseDef.type === 'real') {
            variables[parseDef.name].value = parseFloat(value);
        } else if (parseDef.type === 'int') {
            variables[parseDef.name].value = parseInt(value);
        } else if (parseDef.type.substring(0, 6) === 'string') {
            variables[parseDef.name].value = value.split('').filter(ch => ch !== '"').join('')
        } else {
            variables[parseDef.name].value = value;
        }
    })
}

let _parseGeneration = 0

export async function drawChanges(redraw) {
    let sinumerikEventHandler = View.sinumerikView.eventRouter.route.bind(this);
    const pinned = View.sinumerikView.sldPinnedFile
    const Editor = pinned
        ? atom.workspace.getTextEditors().find(e => e.getPath() === pinned)
        : atom.workspace.getActiveTextEditor()
    if (!Editor) return
    const filename = Editor.getPath();
    if (View.sinumerikView.parseData.filename == filename) {
        const changedRow = Editor.getCursorBufferPosition().row;
        if (View.sinumerikView.parseData.lastChangedRow) {
            View.sinumerikView.parseData.lastChangedRow = Math.min(View.sinumerikView.parseData.lastChangedRow, changedRow);
        } else {
            View.sinumerikView.parseData.lastChangedRow = changedRow;
        }

        if (View.sinumerikView.singleLineDebugInfoDiv.realTimeDebugCheck.checked || redraw) {
            const generation = ++_parseGeneration
            const definedVarsEntries = Object.fromEntries(
                Object.entries(JSON.parse(JSON.stringify(View.sinumerikView.parseData.variables.firstChannelVariables)))
                    .filter(e => {
                        return !e[0].match(/^R\d+/)
                    })
            )
            parseDataClear(filename);
            View.sinumerikView.parseData.variables.firstChannelVariables = definedVarsEntries

            await parseRows(Editor.getText().split('\n'), filename, null, true);

            // Discard results if a newer parse started while we were awaiting
            if (generation !== _parseGeneration) return
            offn()
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

    View.sinumerikView.parseData.frame.trans = {X: 0, Y: 0, Z: 0}
    View.sinumerikView.parseData.frame.mirror = {X: 1, Y: 1, Z: 1}
    View.sinumerikView.parseData.frame.rot = {X: 0, Y: 0, Z: 0};

    View.sinumerikView.parseData.frame.basis = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    View.sinumerikView.parseData.frame.invertBasis = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

    //endregion

    View.sinumerikView.parseData.canvas = new CanvasElementsArray();
    View.sinumerikView.parseData.elementIdCounter = 0;
    View.sinumerikView.parseData.calledSubroutines = new Set();
    //Массив для уже отрисованных элементов
    View.sinumerikView.parseData.drawnElementsNums = 0
    View.sinumerikView.parseData.elements = []

    clearAxesPos(programName)

    View.sinumerikView.parseData.moveGroup = '';
    View.sinumerikView.parseData.primitives = [];
    View.sinumerikView.parseData.errors = [];
    View.sinumerikView.parseData.variables = {};
    View.sinumerikView.parseData.variables.firstChannelVariables = {};
    View.sinumerikView.parseData.jumps = {};
    View.sinumerikView.parseData.jumps[programName] = {};
    View.sinumerikView.parseData.jumps[programName].ifGoto = [];
    View.sinumerikView.parseData.jumps[programName].goto = [];
    View.sinumerikView.parseData.jumps[programName].ifElseEndif = [];
    View.sinumerikView.parseData.jumps[programName].repeat = [];
    View.sinumerikView.parseData.jumps[programName].while = [];
    View.sinumerikView.parseData.jumps[programName].for = [];
    View.sinumerikView.parseData.activeTool = 0;
    View.sinumerikView.parseData.activeToolR = 0;
    View.sinumerikView.parseData.toolRadiusCompensation = 'G40';
    View.sinumerikView.parseData.offn = 0;
    View.sinumerikView.parseData.mcall = {};
    View.sinumerikView.parseData.mcall[programName] = undefined;

    View.sinumerikView.parseData.calcComp = false;
    View.sinumerikView.parseData.spindleSpeed = {type: 'G97', value: 1, limit: 20000};
    View.sinumerikView.parseData.feed = {type: 'G94', value: 100};
    if (View.sinumerikView.programmData[programName].machine.machineType === 'Lathe') {
        View.sinumerikView.parseData.feed.type = 'G95'
    }

}

async function parseRows(programText, programName, variables, firstCall) {
    View.sinumerikView.parseData.contourElements[programName] = []

    //Затычка для работы поворотной оси
    if (View.sinumerikView.singleLineDebugHelpDiv.C_As_Rot.input.checked) {
        programText.forEach((row, idx) => {
            if (row.match(/(?<=\s|^)A[=|\d]/)) {
                ['X', 'Y', 'Z'].forEach(axis => {
                    const regExp = new RegExp(`(?<=\\s|^)${axis}[=|\\d]`)
                    if (!row.match(regExp)) {
                        row = row + ` ${axis}=$AA_IW[${axis}]`
                    }
                })
                programText[idx] = row
                console.log('Rot axes additions')
            }
        })
    }

    //Мегазатычка для ограничения модальных вызовов
    let mcall_lim = 1000

    let rowAfterDefs = 0;
    View.sinumerikView.parseData.variables[programName] = {};

    if (variables) {
        variables.forEach(function (variable, i) {
            variables[i] = mathParse(variable.trim(), programName, 0);
        });
    } else {
        variables = [];
    }
    //search PROC DEF
    for (let i = 0; i < programText.length; i++) {
        if (programText[i].trim().substring(0, 1) !== ';' &&
            programText[i].trim().length > 1) {
            if (programText[i].split(' ')[0].match(/PROC|DEF/)) {
                checkDef(programText[i], programName, variables, i);
            } else {
                break;
            }
        }
        rowAfterDefs++;
    }

    //region main_prog
    if (firstCall) {
        //Если в подпрограммах найдется заготовка
        if (View.sinumerikView.parseData.subroutines.filter(subroutine => {
            return subroutine.name === View.sinumerikView.programmData[programName].blank.name
        }).length) {
            const blank = View.sinumerikView.parseData.subroutines.filter(subroutine => {
                return subroutine.name === View.sinumerikView.programmData[programName].blank.name
            })[0]
            const blankProgText = await readProgramLines(blank.path);
            View.sinumerikView.parseData.calledSubroutines.add(blank.path)
            const blankProgName = blank.path.slice(blank.path.lastIndexOf('/') + 1).replace('.', '_').toUpperCase();
            await parseRows(blankProgText, blankProgName, null, false)
            View.sinumerikView.parseData.canvas.forEach(element => {
                // if (element.type !== 'pause') {
                element.blank = true
                // }
            })
            if (View.sinumerikView.parseData.canvas.length &&
                View.sinumerikView.parseData.canvas[View.sinumerikView.parseData.canvas.length - 1].type === 'pause') {
                View.sinumerikView.parseData.canvas.pop()
            }

            clearAxesPos(programName)
        }
        //Если в подпрограммах найдется контур
        if (View.sinumerikView.parseData.subroutines.filter(subroutine => {
            return subroutine.name === View.sinumerikView.programmData[programName].contour.name
        }).length) {
            const contour = View.sinumerikView.parseData.subroutines.filter(subroutine => {
                return subroutine.name === View.sinumerikView.programmData[programName].contour.name
            })[0]
            const contourProgText = await readProgramLines(contour.path);
            View.sinumerikView.parseData.calledSubroutines.add(contour.path)
            const contourProgName = contour.path.slice(contour.path.lastIndexOf('/') + 1).replace('.', '_').toUpperCase();
            await parseRows(contourProgText, contourProgName, null, false)
            View.sinumerikView.parseData.canvas.forEach(element => {
                // if (element.type !== 'pause') {
                element.contour = true
                // }
            })
            if (View.sinumerikView.parseData.canvas[View.sinumerikView.parseData.canvas.length - 1].type === 'pause') {
                View.sinumerikView.parseData.canvas.pop()
            }

            clearAxesPos(programName)
        }
    }
    //endregion

    for (let row = rowAfterDefs; row < programText.length; row++) {
        let rowText = programText[row];
        let end_of_parse = 0;

        if (rowText.match('EXECSTRING')) {
            if (View.sinumerikView.parseData.jumps[programName] &&
                View.sinumerikView.parseData.jumps[programName].goto &&
                View.sinumerikView.parseData.jumps[programName].goto[row]) {
                delete View.sinumerikView.parseData.jumps[programName].goto[row]
            }
            rowText = stringParse(rowText.substring(rowText.indexOf('(') + 1, rowText.lastIndexOf(')')), programName, row)
        }

        if (rowText.match(';')) {
            rowText = rowText.substring(0, rowText.indexOf(';'));
        }

        if (rowText.trim().length < 2 ||
            rowText.trim().substring(0, 1).match(';')) {
            if (rowText.trim().length && rowText.trim().length < 2 && rowText.trim() != ';') {
                View.sinumerikView.parseData.errors.push({
                    text: `Line too short "${rowText.trim()}"  prog ${programName} row ${row + 1}`,
                    row: row
                })
            }
        } else {

            if (!View.sinumerikView.parseData.jumps[programName]) {
                View.sinumerikView.parseData.jumps[programName] = {};
                View.sinumerikView.parseData.jumps[programName].ifElseEndif = [];
                View.sinumerikView.parseData.jumps[programName].repeat = [];
                View.sinumerikView.parseData.jumps[programName].goto = [];
                View.sinumerikView.parseData.jumps[programName].ifGoto = [];
                View.sinumerikView.parseData.jumps[programName].while = [];
                View.sinumerikView.parseData.jumps[programName].for = [];
            }

            //check IF () GOTO
            let jump = checkIfGoto(rowText, programName, programText, row);
            if (jump >= 0) {
                row = jump - 1;
                continue;
            }
            //check GOTO
            jump = checkGoTo(rowText, programName, programText, row);
            if (jump >= 0) {
                row = jump - 1;
                continue;
            }

            //WHILE
            jump = checkWhile(rowText, programName, programText, row);
            if (jump >= 0) {
                row = jump;
                continue;
            }

            //FOR
            jump = checkFor(rowText, programName, programText, row);
            if (jump >= 0) {
                row = jump;
                continue;
            }

            // IF - ELSE - ENDIF
            jump = checkIfElseEndif(rowText, programName, programText, row);
            if (jump >= 0) {
                row = jump - 1;
                continue;
            }

            //check REPEAT
            jump = checkRepeat(rowText, programName, programText, row);
            if (jump >= 0) {
                row = jump - 1;
                continue;
            }

            const primitive = await generatePrimitives(rowText, programName, row, programText, parseRows)

            if (primitive) {

                //OFFN check
                let offn = primitive.operators.find(value => value.type === 'OFFN')
                if (offn !== undefined) {
                    View.sinumerikView.parseData.offn = offn.value;
                }

                if (View.sinumerikView.parseData.moveGroup === 'transform') {
                    if (!primitive.operators.filter((o) => o.type === 'moveGroup').length) {
                        primitive.operators.push({
                            type: 'moveGroup',
                            value: View.sinumerikView.parseData.moveBeforeTransform
                        })
                    }
                }

                for (const iter in primitive.operators) {

                    const operator = primitive.operators[iter];
                    const machine = View.sinumerikView.programmData[View.sinumerikView.parseData.filename].machine

                    if (operator.type === 'transformation') {
                        const prevValue = View.sinumerikView.parseData.transformation
                        if (operator.value === 'TRAFOOF') {
                            View.sinumerikView.parseData.transformation = null
                        } else {
                            View.sinumerikView.parseData.transformation = operator.value
                        }
                        if (machine.machineType === 'Lathe') {
                            if (prevValue === 'TRANSMIT' && !View.sinumerikView.parseData.transformation) {
                                const {X, Y} = View.sinumerikView.parseData.axesPos
                                primitive.operators.push(
                                    {
                                        type: 'coordinate',
                                        name: 'X',
                                        value: Math.sqrt(X ** 2 + Y ** 2)
                                    }
                                )
                                View.sinumerikView.parseData.moveBeforeTransform = View.sinumerikView.parseData.moveGroup
                                primitive.operators.push({
                                    type: 'moveGroup',
                                    value: 'transform'
                                })
                            }
                            addY_for_C_rot(primitive)
                        }
                    }

                    if (operator.type === 'coordinate' &&
                        operator.name === View.sinumerikView.singleLineDebugData.machine.firstSpindle.name &&
                        View.sinumerikView.singleLineDebugHelpDiv.C_As_Rot.input.checked) {
                        generateFrame(0, 'ROT', [{name: 'Z', value: operator.value}], row)
                        if (machine.machineType === 'Lathe' && !View.sinumerikView.parseData.transformation) {
                            addY_for_C_rot(primitive)
                            const {X, Y} = View.sinumerikView.parseData.axesPos
                            primitive.operators.push(
                                {
                                    type: 'coordinate',
                                    name: 'X',
                                    value: Math.sqrt(X ** 2 + Y ** 2)
                                }
                            )
                        }
                    }

                    if (operator.type === 'coordinate' &&
                        operator.name === 'A' &&
                        View.sinumerikView.singleLineDebugHelpDiv.C_As_Rot.input.checked) {
                        generateFrame(0, 'ROT', [{name: 'X', value: operator.value}], row)

                    }

                    //MIRROR
                    if (operator.type === 'coordinate' &&
                        operator.name &&
                        operator.name.match(/[XYZ]/)) {
                        operator.value *= View.sinumerikView.parseData.frame.mirror[operator.name]
                    }

                    if (operator.type === 'assignment') {
                        if (operator.name.match(/R\d*/) && operator.name.match(/R\d*/) == operator.name) {
                            if (!View.sinumerikView.parseData.variables.firstChannelVariables[operator.name]) {
                                View.sinumerikView.parseData.variables.firstChannelVariables[operator.name] = {};
                                View.sinumerikView.parseData.variables.firstChannelVariables[operator.name].name = operator.name;
                                View.sinumerikView.parseData.variables.firstChannelVariables[operator.name].type = 'real';
                            }
                            View.sinumerikView.parseData.variables.firstChannelVariables[operator.name].value = operator.value;
                        } else {
                            //TODO добавить обработку ошибок в присвоении (правая сторона выражения)
                            if (View.sinumerikView.parseData.variables.firstChannelVariables[`${operator.name}`] !== undefined) {
                                View.sinumerikView.parseData.variables.firstChannelVariables[`${operator.name}`].value = operator.value
                            } else {
                                View.sinumerikView.parseData.variables[`${programName}`][`${operator.name}`].value = operator.value;
                            }
                        }

                    }
                    if (operator.type === 'diamon') {
                        View.sinumerikView.parseData.diamon = 1;
                        View.sinumerikView.parseData.diam90 = 0
                    }
                    if (operator.type === 'diam90') {
                        View.sinumerikView.parseData.diamon = 1;
                        View.sinumerikView.parseData.diam90 = 1;
                    }
                    if (operator.type === 'diamof') {
                        View.sinumerikView.parseData.diamon = 0;
                        View.sinumerikView.parseData.diam90 = 0;
                    }

                    if (operator.type === 'T_name') {
                        View.sinumerikView.parseData.activeTool = operator.value;
                        if (operator.toolr) {
                            View.sinumerikView.parseData.activeToolR = parseFloat(operator.toolr);
                        }
                    }

                    if (operator.type === 'toolRadiusCompensation') {
                        View.sinumerikView.parseData.toolRadiusCompensation = operator.value
                    }

                    if (operator.type === 'MSG') {
                        var msg = {
                            type: 'msg',
                            value: operator.value
                        }
                        View.sinumerikView.parseData.canvas.push(msg);
                    }
                    if (operator.type === 'M_func') {
                        if (operator.value === '30' || operator.value === '17') {
                            msg = {
                                type: 'pause',
                                value: 'The end',
                                programName: programName,
                            }
                            View.sinumerikView.parseData.canvas.push(msg);
                            end_of_parse = 1;
                        }
                        if (operator.value === '0' || operator.value === '1') {
                            const pause = {
                                type: 'pause',
                                value: `M${operator.value}`
                            }
                            View.sinumerikView.parseData.canvas.push(pause);
                        }
                    }

                    if (operator.type === 'S_speed') View.sinumerikView.parseData.spindleSpeed.value = calcValue(operator.value, programName, row)
                    if (operator.type === 'F_feed') View.sinumerikView.parseData.feed.value = calcValue(operator.value, programName, row)
                    if (operator.type === 'LIMS') View.sinumerikView.parseData.spindleSpeed.limit = calcValue(operator.value, programName, row)
                    if (operator.type === 'generalGroup15') {
                        if (operator.value === 'G96' || operator.value === 'G97') {
                            View.sinumerikView.parseData.spindleSpeed.type = operator.value
                        } else {
                            View.sinumerikView.parseData.feed.type = operator.value
                        }
                    }
                }

                generateCanvasPrimitives(primitive, programName, row);
                if (primitive.operators.filter(o => Number.isNaN(o.value)).length) {
                    View.sinumerikView.parseData.errors.push({
                        text: `NaN value. prog ${programName} row ${row + 1}`,
                        row: row
                    })
                    end_of_parse = 1
                }

                View.sinumerikView.parseData.primitives.push(primitive);
                View.sinumerikView.parseData.primitives[View.sinumerikView.parseData.primitives.length - 1].row = row;
                View.sinumerikView.parseData.primitives[View.sinumerikView.parseData.primitives.length - 1].filename = programName;

                if (end_of_parse > 0) {
                    row = programText.length - 1;
                }

                if (primitive.operators.filter(el => {
                        return el.type === 'coordinate'
                    }).length &&
                    View.sinumerikView.parseData.mcall[programName] &&
                    mcall_lim) {

                    // if (programName === View.sinumerikView.parseData.filename) {

                    mcall_lim--

                    programText.splice(row + 1, 0, View.sinumerikView.parseData.mcall[programName])
                    // }
                }

            }
        }
        if (row === (programText.length - 1)) {
            if (View.sinumerikView.parseData.prevMove.length) {
                if (View.sinumerikView.parseData.prevMove[0].type === 'G1') {
                    View.sinumerikView.parseData.canvas.push(View.sinumerikView.parseData.prevMove[0]);
                    View.sinumerikView.parseData.prevMove.shift();
                    return;
                }
                if (View.sinumerikView.parseData.prevMove[0].type.match(/G[23]/)) {
                    generateCirclePrimitives(programName);
                    View.sinumerikView.parseData.prevMove.shift();
                }
            }
        }
    }
}


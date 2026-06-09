'use babel';

import View from './sinumerik';
import {mathParse, checkCondition} from './mathParser';
import {confirmDialog} from './dialog/confirm';

export function checkRepeat(rowText, programName, programText, row) {
    const regEx_REPEAT = /(?<!\w)REPEAT(?!\w)/;
    if (rowText.match(regEx_REPEAT)) {

        if (!View.sinumerikView.parseData.jumps[programName].repeat[row] || View.sinumerikView.parseData.jumps[programName].repeat[row].destinationRow == -1) {
            View.sinumerikView.parseData.jumps[programName].repeat[row] = {};
            View.sinumerikView.parseData.jumps[programName].repeat[row].jumps = 0;
            View.sinumerikView.parseData.jumps[programName].repeat[row].destinationRow = -1;

            rowText = rowText.replace(/[ ]+/g, ' ').trim().split(' ');
            if (rowText.length == 3) {
                if (rowText[2].match(/[P]\d/) != null) {
                    View.sinumerikView.parseData.jumps[programName].repeat[row].maxJumps = rowText[2].slice(1);
                } else if (rowText[2].match(/[P]=/) != null) {
                    View.sinumerikView.parseData.jumps[programName].repeat[row].maxJumps = mathParse(rowText[2].slice(2), programName, row);
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
                const destinationName = rowText[1];
                let destinationRow = -1;
                const regEx_destName = new RegExp(`(?<!\\w)${destinationName}\\:(?!\\w)`);
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

        View.sinumerikView.parseData.jumps[programName].repeat[row].jumps++;
        return View.sinumerikView.parseData.jumps[programName].repeat[row].destinationRow;
    }
    return (-1);
}

export function checkIfElseEndif(rowText, programName, programText, row) {
    const regEx_IF = /(?<!\w)IF(?!\w)/;
    if (rowText.match(regEx_IF)) {
        if (!View.sinumerikView.parseData.jumps[programName].ifElseEndif[row]) {
            View.sinumerikView.parseData.jumps[programName].ifElseEndif[row] = {};
            View.sinumerikView.parseData.jumps[programName].ifElseEndif[row].jumps = 0;
            View.sinumerikView.parseData.jumps[programName].ifElseEndif[row].maxJumps = 1000;
            if (View.sinumerikView.savedMaxJumps && View.sinumerikView.savedMaxJumps[programName] && View.sinumerikView.savedMaxJumps[programName][row]) {
                View.sinumerikView.parseData.jumps[programName].ifElseEndif[row].maxJumps = View.sinumerikView.savedMaxJumps[programName][row];
            }

            const string = programText[row];
            if (string.match(/GOTO[BF]?/) == null) {
                View.sinumerikView.parseData.jumps[programName].ifElseEndif[row].Else = searchIfElseEndif(programText, 'ELSE', row, 1);
                View.sinumerikView.parseData.jumps[programName].ifElseEndif[row].Endif = searchIfElseEndif(programText, 'ENDIF', row, 1);
                if (View.sinumerikView.parseData.jumps[programName].ifElseEndif[row].Endif < 0) {
                    View.sinumerikView.parseData.errors.push({
                        text: `ENDIF not founded.  prog ${programName} row ${row + 1}`,
                        row: row
                    });
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

        if (View.sinumerikView.parseData.jumps[programName].ifElseEndif[row].jumps > View.sinumerikView.parseData.jumps[programName].ifElseEndif[row].maxJumps) {
            if (confirmDialog(`Row ${row + 1}. The number of jumps exceeded ${View.sinumerikView.parseData.jumps[programName].ifElseEndif[row].maxJumps}. Add 1000 more jumps?`)) {
                View.sinumerikView.parseData.jumps[programName].ifElseEndif[row].maxJumps += 1000;
            } else {
                return (programText.length - 1);
            }
        }

        const conditionRow = rowText.slice(rowText.match(regEx_IF).index + 2).trim();
        const condition = checkCondition(conditionRow, programName);

        if (condition < 0) {
            if (View.sinumerikView.parseData.jumps[programName].ifElseEndif[row].jumps > 0) {
                View.sinumerikView.parseData.jumps[programName].ifElseEndif[row].jumps = 0;
            }
            View.sinumerikView.parseData.jumps[programName].ifElseEndif[row].jumps--;
            View.sinumerikView.parseData.errors.push({
                text: `Error in condition "${conditionRow}"  prog ${programName} row ${row + 1}`,
                row: row
            });
            return (row + 1);
        }
        if (condition == 0) {
            return (View.sinumerikView.parseData.jumps[programName].ifElseEndif[row].Else + 1);
        }
        if (View.sinumerikView.parseData.jumps[programName].ifElseEndif[row].jumps < 0) {
            View.sinumerikView.parseData.jumps[programName].ifElseEndif[row].jumps = 0;
        }
        View.sinumerikView.parseData.jumps[programName].ifElseEndif[row].jumps++;
        return (row + 1);
    }

    const regEx_Else = /(?<!\w)ELSE(?!\w)/;
    if (rowText.match(regEx_Else)) {
        for (const key in View.sinumerikView.parseData.jumps[programName].ifElseEndif) {
            if (row == View.sinumerikView.parseData.jumps[programName].ifElseEndif[key].Else) {
                return (View.sinumerikView.parseData.jumps[programName].ifElseEndif[key].Endif + 1);
            }
        }
        View.sinumerikView.parseData.errors.push({
            text: `Error in the control structure. Unknown ELSE.  prog ${programName} row ${row + 1}`,
            row: row
        });
        return (row + 1);
    }

    const regEx_Endif = /(?<!\w)ENDIF(?!\w)/;
    if (rowText.match(regEx_Endif)) {
        for (const key in View.sinumerikView.parseData.jumps[programName].ifElseEndif) {
            if (row == View.sinumerikView.parseData.jumps[programName].ifElseEndif[key].Endif) {
                return (View.sinumerikView.parseData.jumps[programName].ifElseEndif[key].Endif + 1);
            }
        }
        View.sinumerikView.parseData.errors.push({
            text: `Error in the control structure. Unknown ENDIF.  prog ${programName} row ${row + 1}`,
            row: row
        });
        return (row + 1);
    }

    return -1;

    function searchIfElseEndif(programText, word, row, direction) {
        const lastRow = programText.length;
        let level = 0;
        const levelIncIf = direction;
        const levelIncEndif = -direction;

        row += direction;

        while (row < lastRow && row >= 0) {
            const string = programText[row];
            const operatorArr = string.trim().split(" ");
            const firstOperator = operatorArr[0];

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

export function checkGoTo(rowText, programName, programText, row) {
    const regEx_GOTO = /(?<!\w)GOTO[B|F]?(?!\w)/
    if (rowText.match(regEx_GOTO)) {
        if (!View.sinumerikView.parseData.jumps[programName].goto[row] || View.sinumerikView.parseData.jumps[programName].goto[row].destinationRow == -1) {
            View.sinumerikView.parseData.jumps[programName].goto[row] = {};
            View.sinumerikView.parseData.jumps[programName].goto[row].jumps = 0;
            View.sinumerikView.parseData.jumps[programName].goto[row].maxJumps = 1000;
            View.sinumerikView.parseData.jumps[programName].goto[row].type = 'GOTO';
            const match = rowText.match(regEx_GOTO);
            const destinationName = rowText.slice(match.index + match[0].length).trim();
            let destinationRow = -1;
            View.sinumerikView.parseData.jumps[programName].goto[row].destinationRow = destinationRow;
            const regEx_destName = new RegExp(`(?<!\\w)${destinationName}\\:(?!\\w)`);
            if (match[0] == 'GOTOB') {
                for (let i = row - 1; i > 0; i--) {
                    if (programText[i].match(regEx_destName)) {
                        destinationRow = i;
                        View.sinumerikView.parseData.jumps[programName].goto[row].destinationRow = destinationRow;
                        break;
                    }
                }
            }
            if (match[0] == 'GOTOF') {
                for (let i = row + 1; i < programText.length; i++) {
                    if (programText[i].match(regEx_destName)) {
                        destinationRow = i;
                        View.sinumerikView.parseData.jumps[programName].goto[row].destinationRow = destinationRow;
                        break;
                    }
                }
            }
            if (match[0] == 'GOTO') {
                for (let i = 0; i < programText.length; i++) {
                    if (programText[i].match(regEx_destName)) {
                        destinationRow = i;
                        View.sinumerikView.parseData.jumps[programName].goto[row].destinationRow = destinationRow;
                        break;
                    }
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
        if (View.sinumerikView.parseData.jumps[programName].goto[row].jumps > View.sinumerikView.parseData.jumps[programName].goto[row].maxJumps) {
            if (confirmDialog('The number of jumps exceeded 1000. Add 1000 more jumps?')) {
                View.sinumerikView.parseData.jumps[programName].goto[row].maxJumps += 1000;
            } else {
                return (programText.length - 1);
            }
        }

        View.sinumerikView.parseData.jumps[programName].goto[row].jumps++;
        return View.sinumerikView.parseData.jumps[programName].goto[row].destinationRow;
    }
    return -1;
}

export function checkWhile(rowText, programName, programText, row) {
    const regEx_While = /(?<!\w)(END)?WHILE(?!\w)/

    if (rowText.match(regEx_While)) {
        if (rowText.match(regEx_While)[0] === 'WHILE') {
            if (!View.sinumerikView.parseData.jumps[programName].while[row]) {
                View.sinumerikView.parseData.jumps[programName].while[row] = {};
                View.sinumerikView.parseData.jumps[programName].while[row].jumps = 0;
                View.sinumerikView.parseData.jumps[programName].while[row].maxJumps = 1000;
                View.sinumerikView.parseData.jumps[programName].while[row].type = 'WHILE';
                View.sinumerikView.parseData.jumps[programName].while[row].while = row

                let while_level = 0
                for (let i = row + 1; i < programText.length; i++) {
                    let row_without_comment = programText[i]
                    if (row_without_comment.indexOf(';') >= 0) {
                        row_without_comment = row_without_comment.slice(0, row_without_comment.indexOf(';'))
                    }
                    if (row_without_comment.match(/(?<!\w)WHILE(?=\W|$)/)) {
                        while_level++
                    }
                    if (row_without_comment.match(/ENDWHILE(?=\W|$)/) && while_level === 0) {
                        View.sinumerikView.parseData.jumps[programName].while[row].endwhile = i;
                        break;
                    }
                    if (row_without_comment.match(/ENDWHILE(?=\W|$)/)) {
                        while_level--
                    }
                }

                if (View.sinumerikView.parseData.jumps[programName].while[row].endwhile === undefined) {
                    View.sinumerikView.parseData.errors.push({
                        text: `ENDWHILE not found. prog ${programName} row ${row + 1}`,
                        row: row
                    });
                    return -1
                }
            }

            if (checkCondition(rowText.trim().substring(6), programName)) {
                return row
            } else {
                return View.sinumerikView.parseData.jumps[programName].while[row].endwhile
            }
        }

        if (rowText.match(regEx_While)[0] === 'ENDWHILE') {
            let while_row = View.sinumerikView.parseData.jumps[programName].while.filter(jump => {
                return jump.endwhile === row
            })[0].while
            View.sinumerikView.parseData.jumps[programName].while[while_row].jumps++
            if (View.sinumerikView.parseData.jumps[programName].while[while_row].jumps > View.sinumerikView.parseData.jumps[programName].while[while_row].maxJumps) {
                if (confirmDialog(`The number of jumps at WHILE (row${View.sinumerikView.parseData.jumps[programName].while[while_row].while})
                 exceeded ${View.sinumerikView.parseData.jumps[programName].while[while_row].maxJumps}. Add 1000 more jumps?`)) {
                    View.sinumerikView.parseData.jumps[programName].while[while_row].maxJumps += 1000;
                } else {
                    return (View.sinumerikView.parseData.jumps[programName].while[while_row].endwhile)
                }
            }
            return View.sinumerikView.parseData.jumps[programName].while[while_row].while - 1
        }
    }
    return -1;
}

export function checkFor(rowText, programName, programText, row) {
    const regEx_For = /(?<!\w)(END)?FOR(?!\w)/

    if (!rowText.match(regEx_For)) {
        return -1
    }
    if (rowText.match(regEx_For)[0] === 'FOR') {
        if (!View.sinumerikView.parseData.jumps[programName].for[row]) {
            View.sinumerikView.parseData.jumps[programName].for[row] = {};
            View.sinumerikView.parseData.jumps[programName].for[row].jumps = 0;
            View.sinumerikView.parseData.jumps[programName].for[row].maxJumps = 1000;
            View.sinumerikView.parseData.jumps[programName].for[row].type = 'FOR';
            View.sinumerikView.parseData.jumps[programName].for[row].for = row;

            let varString = rowText.trim().substring(4).split('=')[0].trim()
            if (varString.length > 1) {
                if (varString.match(/R[0-9]+/) &&
                    varString.match(/R[0-9]+/).input === varString) {
                    try {
                        View.sinumerikView.parseData.variables.firstChannelVariables[varString] = {
                            name: varString,
                            type: 'real',
                            value: mathParse(rowText.split('=')[1].split('TO')[0].trim(), programName, row)
                        }
                    } catch (e) {
                        View.sinumerikView.parseData.errors.push({
                            text: `Error in FOR . prog ${programName} row ${row + 1}`,
                            row: row
                        });
                    }
                    View.sinumerikView.parseData.jumps[programName].for[row].var = {ref: varString}
                    View.sinumerikView.parseData.jumps[programName].for[row].var.val = () => {
                        return View.sinumerikView.parseData.variables.firstChannelVariables[View.sinumerikView.parseData.jumps[programName].for[row].var.ref].value
                    }
                    View.sinumerikView.parseData.jumps[programName].for[row].var.inc = () => {
                        View.sinumerikView.parseData.variables.firstChannelVariables[View.sinumerikView.parseData.jumps[programName].for[row].var.ref].value++
                    }
                } else {
                    console.log(varString)
                    if (View.sinumerikView.parseData.variables[programName][varString]) {
                        View.sinumerikView.parseData.variables[programName][varString]
                            .value = mathParse(rowText.split('=')[1].split('TO')[0].trim(), programName, row)
                        View.sinumerikView.parseData.jumps[programName].for[row].var = {ref: varString}
                        View.sinumerikView.parseData.jumps[programName].for[row].var.val = () => {
                            return View.sinumerikView.parseData.variables[programName]
                                [View.sinumerikView.parseData.jumps[programName].for[row].var.ref].value
                        }
                        View.sinumerikView.parseData.jumps[programName].for[row].var.inc = () => {
                            View.sinumerikView.parseData.variables[programName]
                                [View.sinumerikView.parseData.jumps[programName].for[row].var.ref].value++
                        }
                    } else {
                        View.sinumerikView.parseData.errors.push({
                            text: `Error in FOR . prog ${programName} row ${row + 1}`,
                            row: row
                        });
                    }
                }
            }
            let toString = rowText.split('TO')[1].trim()
            if (varString.length > 1) {
                View.sinumerikView.parseData.jumps[programName].for[row].toVal = toString
            }

            let for_level = 0
            for (let i = row + 1; i < programText.length; i++) {
                if (programText[i].match(/(?<!\w)FOR(?=\W|$)/)) {
                    for_level++
                }
                if (programText[i].match(/ENDFOR(?=\W|$)/) && for_level === 0) {
                    View.sinumerikView.parseData.jumps[programName].for[row].endfor = i;
                    break;
                }
                if (programText[i].match(/ENDFOR(?=\W|$)/)) {
                    for_level--
                }
            }

            if (View.sinumerikView.parseData.jumps[programName].for[row].endfor === undefined) {
                View.sinumerikView.parseData.errors.push({
                    text: `ENDFOR not found. prog ${programName} row ${row + 1}`,
                    row: row
                });
                return -1
            }
        }
        if (checkCondition(View.sinumerikView.parseData.jumps[programName].for[row].var.val() +
            '<=' + View.sinumerikView.parseData.jumps[programName].for[row].toVal, programName)) {
            return row
        } else {
            return View.sinumerikView.parseData.jumps[programName].for[row].endfor
        }
    }

    if (rowText.match(regEx_For)[0] === 'ENDFOR') {
        let for_row = View.sinumerikView.parseData.jumps[programName].for.filter(jump => {
            return jump.endfor === row
        })[0].for
        View.sinumerikView.parseData.jumps[programName].for[for_row].jumps++
        if (View.sinumerikView.parseData.jumps[programName].for[for_row].jumps > View.sinumerikView.parseData.jumps[programName].for[for_row].maxJumps) {
            if (confirmDialog(`The number of jumps at FOR (row${View.sinumerikView.parseData.jumps[programName].for[for_row].for})
                 exceeded ${View.sinumerikView.parseData.jumps[programName].for[for_row].maxJumps}. Add 1000 more jumps?`)) {
                View.sinumerikView.parseData.jumps[programName].for[for_row].maxJumps += 1000;
            } else {
                return (View.sinumerikView.parseData.jumps[programName].for[for_row].endfor)
            }
        }
        View.sinumerikView.parseData.jumps[programName].for[for_row].var.inc()
        return View.sinumerikView.parseData.jumps[programName].for[for_row].for - 1
    }
    return -1
}

export function checkIfGoto(rowText, programName, programText, row) {
    const regEx_IF = /(?<!\w)IF(?!\w)/;
    const regEx_GOTO = /(?<!\w)GOTO[B|F]?(?!\w)/
    if (rowText.match(regEx_IF) && rowText.match(regEx_GOTO)) {
        const conditionRow = rowText.slice(rowText.match(regEx_IF).index + 2, rowText.match(regEx_GOTO).index).trim();
        const condition = checkCondition(conditionRow, programName);

        if (condition < 0) {
            View.sinumerikView.parseData.errors.push({
                text: `Error in condition "${conditionRow}"  prog ${programName} row ${row + 1}`,
                row: row
            });
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
            const match = rowText.match(regEx_GOTO);
            const destinationName = rowText.slice(match.index + match[0].length).trim();
            let destinationRow = -1;
            View.sinumerikView.parseData.jumps[programName].ifGoto[row].destinationRow = destinationRow;
            const regEx_destName = new RegExp(`(?<!\\w)${destinationName}\\:(?!\\w)`);
            if (match[0] == 'GOTOB') {
                for (let i = row - 1; i > 0; i--) {
                    if (programText[i].match(regEx_destName)) {
                        destinationRow = i;
                        View.sinumerikView.parseData.jumps[programName].ifGoto[row].destinationRow = destinationRow;
                        break;
                    }
                }
            }
            if (match[0] == 'GOTOF') {
                for (let i = row + 1; i < programText.length; i++) {
                    if (programText[i].match(regEx_destName)) {
                        destinationRow = i;
                        View.sinumerikView.parseData.jumps[programName].ifGoto[row].destinationRow = destinationRow;
                        break;
                    }
                }
            }
            if (match[0] == 'GOTO') {
                for (let i = 0; i < programText.length; i++) {
                    if (programText[i].match(regEx_destName)) {
                        destinationRow = i;
                        View.sinumerikView.parseData.jumps[programName].ifGoto[row].destinationRow = destinationRow;
                        break;
                    }
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
        if (View.sinumerikView.parseData.jumps[programName].ifGoto[row].jumps > View.sinumerikView.parseData.jumps[programName].ifGoto[row].maxJumps) {
            if (confirmDialog(`Row ${row + 1}. The number of jumps exceeded ${View.sinumerikView.parseData.jumps[programName].ifGoto[row].maxJumps}. Doubled max jumps?`)) {
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
        View.sinumerikView.parseData.jumps[programName].ifGoto[row].jumps++;
        return View.sinumerikView.parseData.jumps[programName].ifGoto[row].destinationRow;
    }
    return -1;
}

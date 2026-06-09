'use babel';

import View from './sinumerik';

//INT REAL BOOL CHAR STRING AXIS FRAME
export function parseDefPart(str) {
    if (str.match('CHAN')) {
        str = str.split(' ').filter(w => w !== 'CHAN').join(' ')
    }
    const returnDef = {};
    str = str.split(' ');
    if (str.length > 2) {
        for (let i = 0; i < str.length; i++) {
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
    const nameMatch = str[1].match(/[a-zA-Z_][a-zA-Z_]\w*/);
    if (nameMatch && nameMatch[0].length == str[1].length) {
        returnDef.name = str[1];
    } else {
        return false;
    }
    return returnDef;
}

export function checkDef(str, programName, variables, programRow) {
    const returnVal = {};
    if (!str.trim().split(' ')[0].match(/PROC|DEF/)) {
        return;
    }

    if (str.trim().split(' ')[0] == 'PROC') {

        try {
            str = str.substring(str.match(/\(/).index + 1, str.match(/\)/).index);
            const regEx = /(\w+\s[A-Za-z_][A-Za-z_][A-Za-z_0-9]*)(?=[\)\s\,]?)/g;
            const regExMatch = str.match(regEx) || [];
            if (regExMatch.length) {
                if (str.split(',').length == regExMatch.length) {
                    for (let i = 0; i < regExMatch.length; i++) {
                        const parseDef = parseDefPart(regExMatch[i]);
                        if (parseDef) {
                            View.sinumerikView.parseData.variables[programName][parseDef.name] = {};
                            View.sinumerikView.parseData.variables[programName][parseDef.name].name = parseDef.name;
                            View.sinumerikView.parseData.variables[programName][parseDef.name].type = parseDef.type;
                            if (!variables[i] && variables[i] != 0) {
                                //TODO Поменять имя программы и строчку на вызывающую строку главной программы.
                                View.sinumerikView.parseData.errors.push({
                                    text: `Missing variable ${parseDef.name} value in the call. ${programName} row ${programRow + 1}`,
                                    row: programRow
                                });
                                if (parseDef.type == 'real') {
                                    View.sinumerikView.parseData.variables[`${programName}`][parseDef.name].value = 0;
                                }
                            } else {
                                if (parseDef.type == 'real') {
                                    View.sinumerikView.parseData.variables[programName][parseDef.name].value = parseFloat(variables[i]);
                                } else if (parseDef.type == 'int') {
                                    View.sinumerikView.parseData.variables[programName][parseDef.name].value = parseInt(variables[i]);
                                } else {
                                    View.sinumerikView.parseData.variables[programName][parseDef.name].value = variables[i];
                                }
                            }
                        }
                    }
                } else {
                    View.sinumerikView.parseData.errors.push({
                        text: `PROC parse error. Definitions divided incorrectly. ${programName} row ${programRow + 1}`,
                        row: programRow
                    });
                }
                if (Object.keys(View.sinumerikView.parseData.variables[programName]).length < variables.length) {
                    View.sinumerikView.parseData.errors.push({
                        text: `PROC parse error. Too many variables. ${programName} row ${programRow + 1}`,
                        row: programRow
                    });
                }
            }
        } catch (e) {
            View.sinumerikView.parseData.errors.push({
                text: `PROC parse error. ${programName} row ${programRow + 1}`,
                row: programRow
            });
        }
    }

    if (str.trim().split(' ')[0] == 'DEF') {

        try {
            let strLastChar = str.length;
            if (str.match(';')) {
                strLastChar = str.indexOf(';');
            }
            str = str.substring(4, strLastChar).trim();
            let value = 0;
            if (str.match('=')) {
                str = str.split('=');
                value = str[1];
            } else {
                const val = str;
                str = []
                str[0] = val;
            }

            const parseDef = parseDefPart(str[0]);
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
                View.sinumerikView.parseData.errors.push({
                    text: `DEF parse error_1. ${programName} row ${programRow + 1}`,
                    row: programRow
                });
            }
        } catch (e) {
            View.sinumerikView.parseData.errors.push({
                text: `DEF parse error. ${programName} row ${programRow + 1}`,
                row: programRow
            });
        }
    }

}

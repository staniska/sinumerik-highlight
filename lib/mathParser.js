'use babel';

import View from './sinumerik';
import {replacements} from './replacements';
import sinumerikMath from './degreesMath';
import {getCoordinatesInFrame} from './coordinates';

const myMath = new sinumerikMath();

export const calcValue = (value, programName, row) => {
    return value[0] === '=' ? mathParse(value.substring(1), programName, row) : value
}

export function checkCondition(expression, programName) {
    expression = expression.replace(/<>/g, '!=')

    const namedVars = Object.assign({}, View.sinumerikView.parseData.variables.firstChannelVariables, View.sinumerikView.parseData.variables[programName])

    if (Object.keys(namedVars).length) {
        for (const variable in namedVars) {
            let regEx = new RegExp(`(?<=\\W|^)${namedVars[variable].name}(?=\\W|$)`, 'g');
            if (regEx.exec(expression)) {
                expression = expression.replace(regEx, `${namedVars[variable].value}`);
            }
        }
    }

    //Активная функция DIAMON/DIAMOF
    while (expression.match(/\$P_GG\[29\]/)) {
        let replacer = 1
        if (View.sinumerikView.parseData.diamon) {
            replacer = 2
        }
        if (View.sinumerikView.parseData.diam90) {
            replacer = 3
        }
        expression = expression.replace(/\$P_GG\[29\]/, replacer);
    }

    //Затычка для радиуса инструмента
    while (expression.match(/\$P_TOOLR/)) {
        expression = expression.replace(/\$P_TOOLR/, View.sinumerikView.parseData.activeToolR);
    }

    //Затычка для длины инструмента
    while (expression.match(/\$P_TOOLL\[\d\]/)) {
        expression = expression.replace(/\$P_TOOLL\[\d\]/, 0);
    }

    //Затычка для положения режущей кромки
    if (expression.match(/\$TC_DP2/)) {
        if (expression.match(/\$TC_DP2\[[\w,\$]*\]/)) {
            if (View.sinumerikView.parseData.activeTool > 100 && View.sinumerikView.parseData.activeTool < 110) {
                expression = expression.replace(/\$TC_DP2\[[\w,\$]*\]/, (View.sinumerikView.parseData.activeTool - 100));
            } else {
                expression = expression.replace(/\$TC_DP2\[[\w,\$]*\]/, 0);
            }
        }
    }

    for (let i = 0; i < replacements.Math.desired.length; i++) {
        const regEx = new RegExp(`(?<!\\w)${replacements.Math.desired[i]}(?=\\W?)`);
        let while_iter = 0;
        while (true) {
            const regExExec = regEx.exec(expression);
            if (regExExec) {
                expression = expression.replace(expression.substring(regExExec.index, regExExec.index + replacements.Math.desired[i].length), replacements.Math.substitution[i]);
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
        const regEx = new RegExp(`(?<=\\W)${replacements.Bool.desired[i]}(?=\\W?)`);
        let while_iter = 0;
        while (true) {
            const regExExec = regEx.exec(expression);
            if (regExExec) {
                expression = expression.replace(expression.substring(regExExec.index, regExExec.index + replacements.Bool.desired[i].length), replacements.Bool.substitution[i]);
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
        expression = expression.replace(/--/g, '+');
    }

    // Для чисел Float > 5 знаков после запятой приводим их к фиксированной точности
    while (expression.match(/\d\.\d{6,50}/)) {
        expression = expression.replace(expression.match(/\d\.\d{6,50}/)[0], parseFloat(expression.match(/\d\.\d{6,50}/)[0]).toFixed(4))
    }

    expression.split(/[&|]+/).forEach((exp_part) => {
        //insert '(' & ')' in string for normal work of match
        let exp_part_with_brackets = '(' + exp_part.trim() + ')';

        while (exp_part_with_brackets.match(/\(/g).length > exp_part_with_brackets.match(/\)/g).length) {
            exp_part_with_brackets = exp_part_with_brackets.slice(1);
        }

        while (exp_part_with_brackets.match(/\(/g).length < exp_part_with_brackets.match(/\)/g).length) {
            exp_part_with_brackets = exp_part_with_brackets.slice(0, -1);
        }

        const check_redundant_brackets = (str) => {
            const left = str.substring(0, str.indexOf(str.match(/[<>=!]/)[0]))
            const right = str.substring(str.lastIndexOf(str.match(/[<>=!]/g)[str.match(/[<>=]/g).length - 1]) + 1)

            const left_redundant =
                (left.match(/\(/g) ? left.match(/\(/g).length : 0) -
                (left.match(/\)/g) ? left.match(/\)/g).length : 0)
            const right_redundant =
                (right.match(/\)/g) ? right.match(/\)/g).length : 0) -
                (right.match(/\(/g) ? right.match(/\(/g).length : 0)
            return left_redundant > 0 &&
                left_redundant === right_redundant
        }

        while (check_redundant_brackets(exp_part_with_brackets)) {
            exp_part_with_brackets = exp_part_with_brackets.substring(1, exp_part_with_brackets.length - 1)
        }

        const add_1e = (part_condidion) => {

            if (part_condidion.match('=')) return part_condidion
            //TODO переделать с учетом открывающих и закрывающих скобочек в левой и правой частях

            const bracket = (part_condidion.trim()[0] === '(' && part_condidion.trim()[part_condidion.trim().length - 1] === ')')
            const sign = part_condidion.match('>') ? '+' : '-'
            let response
            if (bracket) {
                response = part_condidion.replace(part_condidion.trim(), part_condidion.trim().substring(0, part_condidion.trim().length - 1) + `${sign}0.000001)`)
            } else {
                response = part_condidion.replace(part_condidion.trim(), part_condidion.trim() + `${sign}0.000001`)
            }
            return response
        }

        //Вот тут вычисляем лево и право, потом приводим к фиксированной длине

        const left = exp_part_with_brackets.substring(0, exp_part_with_brackets.indexOf(exp_part_with_brackets.match(/[<>=!]/)[0]))
        const right = exp_part_with_brackets.substring(exp_part_with_brackets.lastIndexOf(exp_part_with_brackets.match(/[<>=!]/g)[exp_part_with_brackets.match(/[<>=!]/g).length - 1]) + 1)

        let left_value = 0, right_value = 0
        const bool = exp_part_with_brackets.match(/[<>=!]+/)[0]
        try {
            eval(`left_value = ${left}`);
            eval(`right_value = ${right}`)
            exp_part_with_brackets = '' + left_value.toFixed(5) + bool + right_value.toFixed(5)
        } catch (err) {
            console.log(`value error: left: ${left}   right: ${right}`)
        }

        //А теперь для пущей уверенности добавим + или - 0.000001 в правую часть и подставим в исходное выражение

        expression = expression.replace(exp_part, add_1e(exp_part_with_brackets))
    });

    let value = 0;
    const codeString = 'if (' + expression + ') {value = 1} else {value = 0}';

    try {
        eval(codeString);
        return value;
    } catch (err) {
        console.log(err)
        return -1;
    }
}

export function mathParse(expression, programName, row) {

    const namedVars = Object.assign({}, View.sinumerikView.parseData.variables[programName], View.sinumerikView.parseData.variables.firstChannelVariables)
    if (Object.keys(namedVars).length) {
        for (const variable in namedVars) {
            let regEx = new RegExp(`(?<=\\W|^)${namedVars[variable].name}(?=\\W|$)`, 'g')
            if (regEx.exec(expression)) {
                expression = expression.replace(regEx, `${namedVars[variable].value}`)
            }

        }
    }

    for (let i = 0; i < replacements.Math.desired.length; i++) {
        const regEx = new RegExp(`(?<!\\w)${replacements.Math.desired[i]}(?=\\W?)`);
        let while_iter = 0;
        while (true) {
            const regExExec = regEx.exec(expression);
            if (regExExec) {
                expression = expression.replace(expression.substring(regExExec.index, regExExec.index + replacements.Math.desired[i].length), replacements.Math.substitution[i]);
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
        expression = expression.replace(/--/g, '+');
    }

    //Текущие координаты $AA_IW[...]
    while (expression.match(/\$AA_IW\[[XYZ]\]/)) {
        let AA_value = getCoordinatesInFrame(View.sinumerikView.parseData.axesPos);
        AA_value = {X: AA_value[0], Y: AA_value[1], Z: AA_value[2]};
        AA_value = AA_value[expression.match(/\$AA_IW\[[XYZ]\]/)[0].match(/[XYZ]/)];
        if (View.sinumerikView.parseData.diamon && expression.match(/\$AA_IW\[[XYZ]\]/)[0].match(/[X]/)) {
            AA_value *= 2;
        }
        expression = expression.replace(/\$AA_IW\[[XYZ]\]/, `${AA_value}`);
    }

    while (expression.match(/\$PI/)) {
        expression = expression.replace(/\$PI/, Math.PI)
    }

    //Активная функция DIAMON/DIAMOF
    while (expression.match(/\$P_GG\[29\]/)) {
        let replacer = 1
        if (View.sinumerikView.parseData.diamon) {
            replacer = 2
        }
        if (View.sinumerikView.parseData.diam90) {
            replacer = 3
        }
        expression = expression.replace(/\$P_GG\[29\]/, replacer);
    }

    //Затычка для радиуса инструмента
    while (expression.match(/\$P_TOOLR/)) {
        expression = expression.replace(/\$P_TOOLR/, View.sinumerikView.parseData.activeToolR);
    }

    //Затычка для длины инструмента
    while (expression.match(/\$P_TOOLL\[\d\]/)) {
        expression = expression.replace(/\$P_TOOLL\[\d\]/, 0);
    }

    //Затычка для подачи
    while (expression.match(/\$P_F/)) {
        expression = expression.replace(/\$P_F/, 0.5);
    }

    //Затычка для положения режущей кромки
    if (expression.match(/\$TC_DP2/)) {
        if (expression.match(/\$TC_DP2\[[\w,\$]*\]/)) {
            if (View.sinumerikView.parseData.activeTool > 100 && View.sinumerikView.parseData.activeTool < 110) {
                expression = expression.replace(/\$TC_DP2\[[\w,\$]*\]/, (View.sinumerikView.parseData.activeTool - 100));
            } else {
                expression = expression.replace(/\$TC_DP2\[[\w,\$]*\]/, 0);
            }
        }
    }
    //endregion

    // Для чисел Float > 5 знаков после запятой приводим их к фиксированной точности
    // while (expression.match(/\d\.\d{6,50}/)) {
    //     // console.log(expression.match(/\d\.\d{6,50}/));
    //     expression = expression.replace(expression.match(/\d\.\d{6,50}/)[0], parseFloat(expression.match(/\d\.\d{6,50}/)[0]).toFixed(5))
    // }

    if (expression.match('Math.sqrt')) {
        const resp = getExpressionInBrackets(expression, 'Math.sqrt')
        expression = expression.replace(resp.string, resp.value)
        if (resp.error) {
            if (row === undefined) {
                row = 0
            }
            View.sinumerikView.parseData.errors.push({
                text: `${resp.error} row ${row + 1}`,
                row: row
            })
        }
    }

    let value;
    const codeString = 'value = ' + expression;
    try {
        eval(codeString);
        value = value.toString()
        if (value.match(/\d\.\d{6,50}/)) {
            // value = value.replace(value.match(/\d\.\d{6,50}/)[0], parseFloat(value.match(/\d\.\d{6,50}/)[0]).toFixed(5))
            value = parseFloat(value).toFixed(5).toString()
        }
        return Number.parseFloat(value)  //.toFixed(5);
    } catch (err) {
        return null;
    }
}

export const getExpressionInBrackets = (expression, matcher) => {
    let openBracketIndex = expression.match(matcher)
    if (openBracketIndex.index !== undefined) {
        openBracketIndex = openBracketIndex.index + matcher.length + 1
    } else {
        return null
    }
    let closeBracketIndex = null
    let i = openBracketIndex
    let level = 0
    while (closeBracketIndex === null && i < expression.length) {
        i++
        if (expression[i] === ')' && level === 0) {
            closeBracketIndex = i
        }
        if (expression[i] === '(') {
            level++
        }
        if (expression[i] === ')') {
            level--
        }
    }

    const responce = {
        string: expression.substring(openBracketIndex, closeBracketIndex)
    }

    try {
        let value
        eval('value = ' + responce.string)
        if (Math.abs(value) < 1e-10) {
            value = 0
        }
        if (value < 0) {
            value = 0
            responce.error = "SQRT arg < 0. "
        }
        responce.value = value
    } catch (e) {
        responce.value = responce.string
        responce.error = "Ahtung!"
    }

    return responce
}

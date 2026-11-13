'use babel';

import View from './sinumerik';
import {replacements} from './replacements';
import sinumerikMath from './degreesMath';
import {getCoordinatesInFrame} from './coordinates';
import {displayCoordinate} from "./axisDisplay";
import {numericVariable} from './shapeFile';

const myMath = new sinumerikMath();

// `$AA_IW[<axis>]`, the position of an axis. The name is captured rather than
// enumerated — see the loop in mathParse.
const AA_IW_RE = /\$AA_IW\[([A-Za-z]\w*)\]/;

// The active tool's declared numbers, for `$P_TOOLR` and `$TC_DP2`.
//
// Two sources, and only the older one used to be read here. The legacy one is
// the comment `;T10x R..` above a `T=` word in the program itself, which the
// tokenizer turns into `parseData.activeTool` / `activeToolR`
// (primitives.js, region T-name). The current one is the tool FILE: a
// `;TOOL:NAME` marker records only which tool works from here on
// (`parseData.activeToolDef`), while its numbers live in that file's
// `;---VARIABLES` block and are cached by path in `View.sinumerikView.toolGeometry`
// (shapeFile.js::parseVariablesBlock turns `; T102 R12.5` into
// `$TC_DP2 = 2`, `$TC_DP6 = 12.5`).
//
// So a program driven by `;TOOL:` markers read `$P_TOOLR` as 0 while its
// radius sat in the cache. The file wins when it declares the number; the
// legacy fields stay as the fallback, which is what keeps old programs
// working.
//
// The cache is warm by the time the parse reads an expression because
// `interpretator.js::prewarmToolGeometry` loads the files the markers name
// BEFORE the parse starts; the post-parse `preloadToolGeometry` remains the
// backstop for a marker the prewarm could not see (one written inside a
// subroutine). A tool whose file is not cached yet falls back as before.
function activeToolVariables() {
    const pd = View.sinumerikView.parseData;
    const path = pd?.activeToolDef?.path;
    if (!path) return undefined;

    const variables = View.sinumerikView.toolGeometry?.[path]?.variables;
    // A tool is named and its file has not been read yet. The value below falls
    // back, as it must — but the parse has now computed geometry from a number
    // it did not have, so the TRAJECTORY is stale, not just the picture. Said
    // out loud so the post-parse preload can parse again once the file is in
    // (`interpretator.js::reparseForToolNumbers`); without it, the right path
    // appeared only when the user pressed Redraw.
    if (!variables && pd) pd.toolNumbersMissed = true;
    return variables;
}

// Nose radius. Taken as declared: the tool file is written in radii and in the
// machine's units, and nothing here converts it — the same as the legacy
// comment, whose number was used as typed too.
function activeToolRadius() {
    const declared = numericVariable(activeToolVariables(), '$TC_DP6');
    return declared !== undefined ? declared : View.sinumerikView.parseData.activeToolR;
}

// Cutting-edge position, 1…9. The file states it directly; the legacy path
// carries it as `activeTool` offset by 100 (the `;T10\d` spelling). Unknown
// still reads 0.
function activeToolTipPosition() {
    const declared = numericVariable(activeToolVariables(), '$TC_DP2');
    if (declared !== undefined) return declared;

    const legacy = View.sinumerikView.parseData.activeTool;
    return legacy > 100 && legacy < 110 ? legacy - 100 : 0;
}

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
        expression = expression.replace(/\$P_TOOLR/, activeToolRadius());
    }

    //Затычка для длины инструмента
    while (expression.match(/\$P_TOOLL\[\d\]/)) {
        expression = expression.replace(/\$P_TOOLL\[\d\]/, 0);
    }

    //Затычка для положения режущей кромки
    if (expression.match(/\$TC_DP2/)) {
        if (expression.match(/\$TC_DP2\[[\w,\$]*\]/)) {
            expression = expression.replace(/\$TC_DP2\[[\w,\$]*\]/, activeToolTipPosition());
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
    // Any axis the program has named, not only X/Y/Z: A, B, C, U, V, W and
    // whatever the machine calls its spindle axis. The name is matched rather
    // than listed, because the spindle axis is named by the machine and may be
    // anything — `C1`, `SP1` — and `auxPos` already holds exactly the axes the
    // program has mentioned.
    while (expression.match(AA_IW_RE)) {
        const parseData = View.sinumerikView.parseData;
        const name = expression.match(AA_IW_RE)[1];
        const axis = name.toUpperCase();

        let stored;
        if (axis === 'X' || axis === 'Y' || axis === 'Z') {
            const vector = getCoordinatesInFrame(parseData.axesPos);
            stored = {X: vector[0], Y: vector[1], Z: vector[2]}[axis];
        } else {
            // No frame: an additional axis is not part of the basis a frame is
            // built on, here or in the rest of the parser. Read before the
            // block that is being tokenized, exactly as `axesPos` is — both are
            // moved on when the block's element is made.
            stored = parseData.auxPos?.[name] ?? parseData.auxPos?.[axis];
        }

        // axesPos is stored in mm and X as a radius: the three rules that turn
        // that into what the control shows are shared with the SLD panel, so
        // the readout and this variable cannot drift apart. They also decide
        // that an angle takes no unit, which is why A/B/C need no special case.
        const AA_value = displayCoordinate(stored, {
            axis,
            diamon:   parseData.diamon,
            unitMult: parseData.unitMult,
        });

        // An axis the program has never named has no position here. A control
        // would answer with wherever the axis physically stands; this is a
        // reader of G-code, and a guessed position would go into the geometry
        // silently. Refused by name instead, the way an R-parameter that was
        // never assigned is refused — and refused here rather than by leaving
        // the expression for `eval` to choke on, because the loop above would
        // not end.
        if (AA_value === null) {
            const atRow = row === undefined ? 0 : row;
            parseData.errors.push({
                text: `$AA_IW[${name}]: axis never programmed. prog ${programName} row ${atRow + 1}`,
                row: atRow,
            });
            return null;
        }

        expression = expression.replace(AA_IW_RE, `${AA_value}`);
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
        expression = expression.replace(/\$P_TOOLR/, activeToolRadius());
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
            expression = expression.replace(/\$TC_DP2\[[\w,\$]*\]/, activeToolTipPosition());
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

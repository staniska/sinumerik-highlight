'use babel';

import View from './sinumerik';
import {mathParse, checkCondition} from './mathParser';
import {confirmDialog} from './dialog/confirm';

export const DEFAULT_MAX_JUMPS = 1000;

// How a raised jump limit is remembered: by what the construction SAYS, not by
// the row it sits on.
//
// `savedMaxJumps` used to be keyed by row number, so inserting a line above a
// loop handed its hard-won limit to whatever now sits on that row. The text of
// the loop header survives row shifts, and — unlike a running count of the
// constructions met during the parse — it also survives a changed control flow:
// an `IF … GOTOF` that fires in this run and not the last one renumbers
// everything after it, while it renames nothing.
//
// Two identical headers in one program are told apart by an occurrence number
// counted PER TEXT (`WHILE R1<5#2`), not globally, so adding a third one does
// not rename the first two. Identical headers that do collide share a limit,
// which is the answer the user most likely wanted anyway.
//
// Scope is `programName`, so edits in the main program never renumber or
// rename anything inside a subroutine.
function jumpKey(kind, programName, rowText) {
    const text = String(rowText).replace(/\s+/g, ' ').trim().toUpperCase();
    const base = `${kind}:${text}`;

    // Per-parse, so the occurrence numbers of one parse cannot leak into the
    // next. Reset by parseDataClear, borrowed around mini-parses.
    const seq = View.sinumerikView.parseData.jumpKeySeq ||
        (View.sinumerikView.parseData.jumpKeySeq = {});
    const scoped = `${programName}\u0000${base}`;
    seq[scoped] = (seq[scoped] || 0) + 1;

    return seq[scoped] > 1 ? `${base}#${seq[scoped]}` : base;
}

// A fresh jump-tracking record for one control-flow construction, carrying the
// limit the user already agreed to in an earlier parse of the same program.
//
// `prev` is the record being replaced, if any: GOTO and IF-GOTO re-run their
// init block on every pass while the label is unresolved, and reusing its key
// keeps that from eating an occurrence number per pass.
function newJumpEntry(kind, programName, rowText, prev) {
    const key = prev?.key ?? jumpKey(kind, programName, rowText);
    const saved = View.sinumerikView.savedMaxJumps?.[programName]?.[key];

    return {
        jumps: 0,
        maxJumps: saved || DEFAULT_MAX_JUMPS,
        key: key,
    };
}

// The jump limit of one construction is exhausted: ask, and raise it on "yes".
//
// Doubling rather than adding a fixed 1000 — a loop that genuinely needs tens
// of thousands of iterations would otherwise ask again every 1000 of them. The
// question text and the step live here so all five constructions cannot drift
// apart; `IF GOTO` already doubled while the other four added 1000.
//
// The answer is remembered for the rest of the Pulsar session (see jumpKey):
// someone debugging a long loop confirms it once, not on every redraw. A
// refusal is never remembered — that would hide the dialog from a user who
// misclicked, and an accidental refusal must cost no more than one Redraw.
function askMoreJumps(entry, programName, row, label) {
    if (!confirmDialog(`Row ${row + 1}. ${label} exceeded ${entry.maxJumps} jumps. Double the limit?`)) {
        return false;
    }
    entry.maxJumps *= 2;

    if (!View.sinumerikView.savedMaxJumps) {
        View.sinumerikView.savedMaxJumps = {};
    }
    if (!View.sinumerikView.savedMaxJumps[programName]) {
        View.sinumerikView.savedMaxJumps[programName] = {};
    }
    View.sinumerikView.savedMaxJumps[programName][entry.key] = entry.maxJumps;

    return true;
}

// The user answered "stop" to the jump-limit question.
//
// Returning a row number is not enough: for WHILE/FOR it only leaves the
// current loop and for GOTO only the current programText, while `jumps` stays
// above `maxJumps`. The next entry into the same loop — an outer loop around
// it, the subroutine called a second time — then asked again on its very first
// iteration, which is why the question used to come back until the process was
// killed. So: clear the counter, and raise a flag that ends the whole parse
// run (checked in interpretator.js::parseRows and at the subroutine recursion
// in primitives.js).
//
// The flag lives exactly one parse — `parseDataClear` resets it on every
// re-parse — so an accidental refusal costs one Redraw and the dialog comes
// back. Nothing remembers the refusal across parses on purpose.
function stopParsing(entry, programName, row, label) {
    entry.jumps = 0;
    View.sinumerikView.parseData.abortParse = true;
    View.sinumerikView.parseData.errors.push({
        text: `Parsing stopped by user at ${label}. prog ${programName} row ${row + 1}`,
        row: row
    });
}

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
            View.sinumerikView.parseData.jumps[programName].ifElseEndif[row] =
                newJumpEntry('IF', programName, rowText);

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
            if (!askMoreJumps(View.sinumerikView.parseData.jumps[programName].ifElseEndif[row], programName, row, 'IF')) {
                stopParsing(View.sinumerikView.parseData.jumps[programName].ifElseEndif[row], programName, row, 'IF');
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
            View.sinumerikView.parseData.jumps[programName].goto[row] =
                newJumpEntry('GOTO', programName, rowText, View.sinumerikView.parseData.jumps[programName].goto[row]);
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
            if (!askMoreJumps(View.sinumerikView.parseData.jumps[programName].goto[row], programName, row, 'GOTO')) {
                stopParsing(View.sinumerikView.parseData.jumps[programName].goto[row], programName, row, 'GOTO');
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
                View.sinumerikView.parseData.jumps[programName].while[row] =
                    newJumpEntry('WHILE', programName, rowText);
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
                // The loop is done. The counter belongs to ONE entry into it,
                // not to the whole parse: a WHILE nested in an outer loop (or
                // in a subroutine called twice) must get its 1000 iterations
                // again, otherwise the limit question returns on the first
                // iteration of every re-entry.
                View.sinumerikView.parseData.jumps[programName].while[row].jumps = 0
                return View.sinumerikView.parseData.jumps[programName].while[row].endwhile
            }
        }

        if (rowText.match(regEx_While)[0] === 'ENDWHILE') {
            let while_row = View.sinumerikView.parseData.jumps[programName].while.filter(jump => {
                return jump.endwhile === row
            })[0].while
            View.sinumerikView.parseData.jumps[programName].while[while_row].jumps++
            if (View.sinumerikView.parseData.jumps[programName].while[while_row].jumps > View.sinumerikView.parseData.jumps[programName].while[while_row].maxJumps) {
                if (!askMoreJumps(View.sinumerikView.parseData.jumps[programName].while[while_row], programName, while_row, 'WHILE')) {
                    stopParsing(View.sinumerikView.parseData.jumps[programName].while[while_row], programName, while_row, 'WHILE');
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
        // Is this the loop being entered, or the same loop coming round again?
        // The FOR row is evaluated in both cases — ENDFOR jumps back to it to
        // re-test the condition — and only an entry may re-seed the loop
        // variable. The flag is set by ENDFOR and consumed here, so arriving
        // from anywhere else (the first time, after the loop ended, or after a
        // GOTO out of the body) counts as an entry.
        let entering = !View.sinumerikView.parseData.jumps[programName].for[row]?.continuing;
        if (View.sinumerikView.parseData.jumps[programName].for[row]) {
            View.sinumerikView.parseData.jumps[programName].for[row].continuing = false;
        }

        if (!View.sinumerikView.parseData.jumps[programName].for[row]) {
            View.sinumerikView.parseData.jumps[programName].for[row] =
                newJumpEntry('FOR', programName, rowText);
            View.sinumerikView.parseData.jumps[programName].for[row].type = 'FOR';
            View.sinumerikView.parseData.jumps[programName].for[row].for = row;
            // The init block below seeds the variable itself, so the first
            // arrival must not seed it twice.
            entering = false;

            let varString = rowText.trim().substring(4).split('=')[0].trim()
            // Kept as text, not as the number it evaluates to now: a start
            // value may name a variable of the enclosing loop
            // (`FOR _I=_J TO 10`), and re-entering the loop has to evaluate it
            // again.
            const fromExpr = (rowText.split('=')[1] || '').split('TO')[0].trim()
            View.sinumerikView.parseData.jumps[programName].for[row].fromExpr = fromExpr
            if (varString.length > 1) {
                if (varString.match(/R[0-9]+/) &&
                    varString.match(/R[0-9]+/).input === varString) {
                    try {
                        View.sinumerikView.parseData.variables.firstChannelVariables[varString] = {
                            name: varString,
                            type: 'real',
                            value: mathParse(fromExpr, programName, row)
                        }
                        View.sinumerikView.parseData.variablesDirty?.add(varString)
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
                        // The loop variable is a variable like any other: the
                        // panel's history is built from the difference each
                        // element sees (variableLog.js).
                        View.sinumerikView.parseData.variablesDirty?.add(
                            View.sinumerikView.parseData.jumps[programName].for[row].var.ref)
                    }
                    View.sinumerikView.parseData.jumps[programName].for[row].var.set = (value) => {
                        View.sinumerikView.parseData.variables.firstChannelVariables[View.sinumerikView.parseData.jumps[programName].for[row].var.ref].value = value
                        View.sinumerikView.parseData.variablesDirty?.add(
                            View.sinumerikView.parseData.jumps[programName].for[row].var.ref)
                    }
                } else {
                    console.log(varString)
                    if (View.sinumerikView.parseData.variables[programName][varString]) {
                        View.sinumerikView.parseData.variables[programName][varString]
                            .value = mathParse(fromExpr, programName, row)
                        View.sinumerikView.parseData.jumps[programName].for[row].var = {ref: varString}
                        View.sinumerikView.parseData.jumps[programName].for[row].var.val = () => {
                            return View.sinumerikView.parseData.variables[programName]
                                [View.sinumerikView.parseData.jumps[programName].for[row].var.ref].value
                        }
                        View.sinumerikView.parseData.jumps[programName].for[row].var.inc = () => {
                            View.sinumerikView.parseData.variables[programName]
                                [View.sinumerikView.parseData.jumps[programName].for[row].var.ref].value++
                        }
                        View.sinumerikView.parseData.jumps[programName].for[row].var.set = (value) => {
                            View.sinumerikView.parseData.variables[programName]
                                [View.sinumerikView.parseData.jumps[programName].for[row].var.ref].value = value
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
        // A FOR entered a second time — nested in an outer loop, or reached
        // again by a jump — kept the value its variable had when the loop last
        // ended, which is one past the limit. The condition was then false at
        // once and the body never ran after the first pass.
        if (entering && View.sinumerikView.parseData.jumps[programName].for[row].var) {
            try {
                View.sinumerikView.parseData.jumps[programName].for[row].var.set(
                    mathParse(View.sinumerikView.parseData.jumps[programName].for[row].fromExpr, programName, row))
            } catch (e) {
                View.sinumerikView.parseData.errors.push({
                    text: `Error in FOR . prog ${programName} row ${row + 1}`,
                    row: row
                });
            }
        }

        if (checkCondition(View.sinumerikView.parseData.jumps[programName].for[row].var.val() +
            '<=' + View.sinumerikView.parseData.jumps[programName].for[row].toVal, programName)) {
            return row
        } else {
            // Same as WHILE above: one entry into the loop, one budget.
            View.sinumerikView.parseData.jumps[programName].for[row].jumps = 0
            return View.sinumerikView.parseData.jumps[programName].for[row].endfor
        }
    }

    if (rowText.match(regEx_For)[0] === 'ENDFOR') {
        let for_row = View.sinumerikView.parseData.jumps[programName].for.filter(jump => {
            return jump.endfor === row
        })[0].for
        View.sinumerikView.parseData.jumps[programName].for[for_row].jumps++
        if (View.sinumerikView.parseData.jumps[programName].for[for_row].jumps > View.sinumerikView.parseData.jumps[programName].for[for_row].maxJumps) {
            if (!askMoreJumps(View.sinumerikView.parseData.jumps[programName].for[for_row], programName, for_row, 'FOR')) {
                stopParsing(View.sinumerikView.parseData.jumps[programName].for[for_row], programName, for_row, 'FOR');
                return (View.sinumerikView.parseData.jumps[programName].for[for_row].endfor)
            }
        }
        View.sinumerikView.parseData.jumps[programName].for[for_row].var.inc()
        // Tell the FOR row this is the same loop coming round, not an entry.
        View.sinumerikView.parseData.jumps[programName].for[for_row].continuing = true
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
            // The jump was not taken, so this IF-GOTO loop has ended — the
            // counter is for one entry into it, see the WHILE branch. The
            // entry may not exist yet: the init block below runs only once the
            // condition is true for the first time.
            if (View.sinumerikView.parseData.jumps[programName].ifGoto[row]) {
                View.sinumerikView.parseData.jumps[programName].ifGoto[row].jumps = 0;
            }
            return (row + 1)
        }

        if (!View.sinumerikView.parseData.jumps[programName].ifGoto[row] || View.sinumerikView.parseData.jumps[programName].ifGoto[row].destinationRow == -1) {
            View.sinumerikView.parseData.jumps[programName].ifGoto[row] =
                newJumpEntry('IF GOTO', programName, rowText, View.sinumerikView.parseData.jumps[programName].ifGoto[row]);
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
            if (!askMoreJumps(View.sinumerikView.parseData.jumps[programName].ifGoto[row], programName, row, 'IF GOTO')) {
                stopParsing(View.sinumerikView.parseData.jumps[programName].ifGoto[row], programName, row, 'IF GOTO');
                return (programText.length - 1);
            }
        }
        View.sinumerikView.parseData.jumps[programName].ifGoto[row].jumps++;
        return View.sinumerikView.parseData.jumps[programName].ifGoto[row].destinationRow;
    }
    return -1;
}

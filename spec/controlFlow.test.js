jest.mock('../lib/sinumerik', () => ({
    __esModule: true,
    default: {
        sinumerikView: {
            parseData: {
                jumps: {},
                errors: [],
                variables: {firstChannelVariables: {}},
            },
            savedMaxJumps: undefined,
        }
    }
}));

jest.mock('../lib/mathParser', () => ({
    mathParse: jest.fn(),
    checkCondition: jest.fn(),
    calcValue: jest.fn(),
    getExpressionInBrackets: jest.fn(),
}));

jest.mock('../lib/dialog/confirm', () => ({
    confirmDialog: jest.fn(),
}));

const {checkRepeat, checkIfElseEndif, checkGoTo, checkWhile, checkFor, checkIfGoto} = require('../lib/controlFlow');

let View, checkCondition, mathParse, confirmDialog;

beforeEach(() => {
    View = require('../lib/sinumerik').default;
    checkCondition = require('../lib/mathParser').checkCondition;
    mathParse = require('../lib/mathParser').mathParse;
    confirmDialog = require('../lib/dialog/confirm').confirmDialog;

    View.sinumerikView.parseData.jumps = {};
    View.sinumerikView.parseData.errors = [];
    View.sinumerikView.parseData.variables = {firstChannelVariables: {}};
    View.sinumerikView.parseData.jumpKeySeq = {};
    View.sinumerikView.parseData.abortParse = false;
    View.sinumerikView.savedMaxJumps = undefined;

    checkCondition.mockReset();
    mathParse.mockReset();
    confirmDialog.mockReset();
});

// --- checkRepeat ---

describe('checkRepeat', () => {
    test('returns -1 when REPEAT not in row', () => {
        expect(checkRepeat('G1 X10 Y20', 'PROG', [], 0)).toBe(-1);
    });

    test('sets up jump structure and returns destinationRow on first call', () => {
        const programText = ['G1 X0', 'START:', 'G1 X10', 'REPEAT START P3'];
        View.sinumerikView.parseData.jumps['PROG'] = {repeat: []};

        const result = checkRepeat('REPEAT START P3', 'PROG', programText, 3);

        expect(View.sinumerikView.parseData.jumps['PROG'].repeat[3].destinationRow).toBe(1);
        expect(View.sinumerikView.parseData.jumps['PROG'].repeat[3].maxJumps).toBe('3');
        expect(result).toBe(1);
    });

    test('increments jumps counter on each call', () => {
        const programText = ['G1 X0', 'START:', 'G1 X10', 'REPEAT START P5'];
        View.sinumerikView.parseData.jumps['PROG'] = {repeat: []};

        checkRepeat('REPEAT START P5', 'PROG', programText, 3);
        checkRepeat('REPEAT START P5', 'PROG', programText, 3);

        expect(View.sinumerikView.parseData.jumps['PROG'].repeat[3].jumps).toBe(2);
    });

    test('returns row+1 when jumps reaches maxJumps', () => {
        View.sinumerikView.parseData.jumps['PROG'] = {
            repeat: []
        };
        View.sinumerikView.parseData.jumps['PROG'].repeat[2] = {
            jumps: 3,
            maxJumps: 3,
            destinationRow: 0
        };

        expect(checkRepeat('REPEAT START P3', 'PROG', ['G1 X0', 'START:', 'REPEAT START P3'], 2)).toBe(3);
    });

    test('pushes error when label not found and returns row+1', () => {
        const programText = ['G1 X0', 'G1 X10', 'REPEAT MISSING P2'];
        View.sinumerikView.parseData.jumps['PROG'] = {repeat: []};

        const result = checkRepeat('REPEAT MISSING P2', 'PROG', programText, 2);

        expect(result).toBe(3);
        expect(View.sinumerikView.parseData.errors.length).toBeGreaterThan(0);
    });
});

// --- checkGoTo ---

describe('checkGoTo', () => {
    test('returns -1 when GOTO not in row', () => {
        expect(checkGoTo('G1 X10', 'PROG', [], 0)).toBe(-1);
    });

    test('GOTOF finds label forward and returns its row', () => {
        const programText = ['G1 X0', 'GOTOF TARGET', 'G1 X5', 'TARGET:', 'G1 X10'];
        View.sinumerikView.parseData.jumps['PROG'] = {goto: []};

        const result = checkGoTo('GOTOF TARGET', 'PROG', programText, 1);

        expect(result).toBe(3);
    });

    test('GOTOB finds label backward and returns its row', () => {
        const programText = ['G1 X0', 'START:', 'G1 X5', 'GOTOB START'];
        View.sinumerikView.parseData.jumps['PROG'] = {goto: []};

        const result = checkGoTo('GOTOB START', 'PROG', programText, 3);

        expect(result).toBe(1);
    });

    test('GOTO searches whole program and returns label row', () => {
        const programText = ['LABEL:', 'G1 X5', 'GOTO LABEL'];
        View.sinumerikView.parseData.jumps['PROG'] = {goto: []};

        const result = checkGoTo('GOTO LABEL', 'PROG', programText, 2);

        expect(result).toBe(0);
    });

    test('pushes error and returns row+1 when label not found', () => {
        const programText = ['G1 X5', 'GOTO MISSING'];
        View.sinumerikView.parseData.jumps['PROG'] = {goto: []};

        const result = checkGoTo('GOTO MISSING', 'PROG', programText, 1);

        expect(result).toBe(2);
        expect(View.sinumerikView.parseData.errors.length).toBeGreaterThan(0);
    });

    // Reaching the last row ends only this programText — in a subroutine the
    // caller would go on and could call it again. The flag is what actually
    // stops the run (interpretator.js::parseRows, primitives.js recursion).
    test('refusing more jumps at GOTOB aborts the whole parse', () => {
        const programText = ['G1 X0', 'START:', 'G1 X5', 'GOTOB START'];
        View.sinumerikView.parseData.jumps['PROG'] = {goto: []};
        View.sinumerikView.parseData.jumps['PROG'].goto[3] = {
            jumps: 1001, maxJumps: 1000, type: 'GOTO', destinationRow: 1
        };
        View.sinumerikView.parseData.abortParse = false;
        confirmDialog.mockReturnValue(false);

        const result = checkGoTo('GOTOB START', 'PROG', programText, 3);

        expect(result).toBe(programText.length - 1);
        expect(View.sinumerikView.parseData.abortParse).toBe(true);
        expect(View.sinumerikView.parseData.jumps['PROG'].goto[3].jumps).toBe(0);
    });
});

// --- checkIfElseEndif ---

describe('checkIfElseEndif', () => {
    test('returns -1 when no IF/ELSE/ENDIF keyword', () => {
        View.sinumerikView.parseData.jumps['PROG'] = {ifElseEndif: []};
        expect(checkIfElseEndif('G1 X10', 'PROG', ['G1 X10'], 0)).toBe(-1);
    });

    test('IF with true condition returns row+1 (enter if-block)', () => {
        const programText = ['IF X>0', 'G1 X10', 'ELSE', 'G1 X-10', 'ENDIF'];
        View.sinumerikView.parseData.jumps['PROG'] = {ifElseEndif: []};
        checkCondition.mockReturnValue(1);

        const result = checkIfElseEndif('IF X>0', 'PROG', programText, 0);

        expect(result).toBe(1);
    });

    test('IF with false condition returns Else+1 (skip if-block)', () => {
        const programText = ['IF X>0', 'G1 X10', 'ELSE', 'G1 X-10', 'ENDIF'];
        View.sinumerikView.parseData.jumps['PROG'] = {ifElseEndif: []};
        checkCondition.mockReturnValue(0);

        const result = checkIfElseEndif('IF X>0', 'PROG', programText, 0);

        // Else is at row 2, so result = 2+1 = 3
        expect(result).toBe(3);
    });

    test('ELSE returns Endif+1 (skip else-block)', () => {
        const programText = ['IF X>0', 'G1 X10', 'ELSE', 'G1 X-10', 'ENDIF'];
        View.sinumerikView.parseData.jumps['PROG'] = {ifElseEndif: []};
        View.sinumerikView.parseData.jumps['PROG'].ifElseEndif[0] = {
            jumps: 0, maxJumps: 1000, Else: 2, Endif: 4
        };

        const result = checkIfElseEndif('ELSE', 'PROG', programText, 2);

        // Endif is at row 4, so result = 4+1 = 5
        expect(result).toBe(5);
    });

    test('ENDIF returns Endif+1 (continue after block)', () => {
        const programText = ['IF X>0', 'G1 X10', 'ELSE', 'G1 X-10', 'ENDIF'];
        View.sinumerikView.parseData.jumps['PROG'] = {ifElseEndif: []};
        View.sinumerikView.parseData.jumps['PROG'].ifElseEndif[0] = {
            jumps: 0, maxJumps: 1000, Else: 2, Endif: 4
        };

        const result = checkIfElseEndif('ENDIF', 'PROG', programText, 4);

        expect(result).toBe(5);
    });
});

// --- checkWhile ---

describe('checkWhile', () => {
    test('returns -1 when no WHILE/ENDWHILE keyword', () => {
        View.sinumerikView.parseData.jumps['PROG'] = {while: []};
        expect(checkWhile('G1 X10', 'PROG', ['G1 X10'], 0)).toBe(-1);
    });

    test('WHILE with true condition returns current row (continue loop body)', () => {
        const programText = ['WHILE R1<5', 'G1 X10', 'ENDWHILE'];
        View.sinumerikView.parseData.jumps['PROG'] = {while: []};
        checkCondition.mockReturnValue(1);

        const result = checkWhile('WHILE R1<5', 'PROG', programText, 0);

        expect(result).toBe(0);
    });

    test('WHILE with false condition returns endwhile row (exit loop)', () => {
        const programText = ['WHILE R1<5', 'G1 X10', 'ENDWHILE'];
        View.sinumerikView.parseData.jumps['PROG'] = {while: []};
        checkCondition.mockReturnValue(0);

        const result = checkWhile('WHILE R1<5', 'PROG', programText, 0);

        expect(result).toBe(2);
    });

    test('ENDWHILE returns while_row-1 (re-evaluate condition)', () => {
        const programText = ['WHILE R1<5', 'G1 X10', 'ENDWHILE'];
        View.sinumerikView.parseData.jumps['PROG'] = {while: []};
        View.sinumerikView.parseData.jumps['PROG'].while[0] = {
            jumps: 0, maxJumps: 1000, type: 'WHILE', while: 0, endwhile: 2
        };

        const result = checkWhile('ENDWHILE', 'PROG', programText, 2);

        // returns while - 1 = 0 - 1 = -1 (parseRows will do row++ → row 0)
        expect(result).toBe(-1);
    });

    // The counter belongs to one entry into the loop. Left above the limit, it
    // made the limit question come back on the first iteration of every
    // re-entry (an outer loop, a subroutine called twice) until the process was
    // killed.
    test('WHILE with false condition clears the jump counter', () => {
        const programText = ['WHILE R1<5', 'G1 X10', 'ENDWHILE'];
        View.sinumerikView.parseData.jumps['PROG'] = {while: []};
        View.sinumerikView.parseData.jumps['PROG'].while[0] = {
            jumps: 1001, maxJumps: 1000, type: 'WHILE', while: 0, endwhile: 2
        };
        checkCondition.mockReturnValue(0);

        checkWhile('WHILE R1<5', 'PROG', programText, 0);

        expect(View.sinumerikView.parseData.jumps['PROG'].while[0].jumps).toBe(0);
    });

    test('refusing more jumps at ENDWHILE aborts the whole parse', () => {
        const programText = ['WHILE R1<5', 'G1 X10', 'ENDWHILE'];
        View.sinumerikView.parseData.jumps['PROG'] = {while: []};
        View.sinumerikView.parseData.jumps['PROG'].while[0] = {
            jumps: 1000, maxJumps: 1000, type: 'WHILE', while: 0, endwhile: 2
        };
        View.sinumerikView.parseData.abortParse = false;
        confirmDialog.mockReturnValue(false);

        const result = checkWhile('ENDWHILE', 'PROG', programText, 2);

        expect(result).toBe(2);
        expect(View.sinumerikView.parseData.abortParse).toBe(true);
        expect(View.sinumerikView.parseData.jumps['PROG'].while[0].jumps).toBe(0);
        expect(View.sinumerikView.parseData.errors.length).toBeGreaterThan(0);
    });

    // Doubling, not +1000: a loop that needs tens of thousands of iterations
    // would otherwise ask again every 1000 of them. The starting limit is not
    // 1000 here so that doubling and adding give different answers.
    test('accepting more jumps at ENDWHILE doubles the limit and parses on', () => {
        const programText = ['WHILE R1<5', 'G1 X10', 'ENDWHILE'];
        View.sinumerikView.parseData.jumps['PROG'] = {while: []};
        View.sinumerikView.parseData.jumps['PROG'].while[0] = {
            jumps: 1500, maxJumps: 1500, type: 'WHILE', while: 0, endwhile: 2
        };
        View.sinumerikView.parseData.abortParse = false;
        confirmDialog.mockReturnValue(true);

        const result = checkWhile('ENDWHILE', 'PROG', programText, 2);

        expect(result).toBe(-1);
        expect(View.sinumerikView.parseData.jumps['PROG'].while[0].maxJumps).toBe(3000);
        expect(View.sinumerikView.parseData.abortParse).toBe(false);
    });

    test('WHILE pushes error and returns -1 when ENDWHILE not found', () => {
        const programText = ['WHILE R1<5', 'G1 X10'];
        View.sinumerikView.parseData.jumps['PROG'] = {while: []};
        checkCondition.mockReturnValue(1);

        const result = checkWhile('WHILE R1<5', 'PROG', programText, 0);

        expect(result).toBe(-1);
        expect(View.sinumerikView.parseData.errors.length).toBeGreaterThan(0);
    });
});

// --- checkFor ---

describe('checkFor', () => {
    test('returns -1 when no FOR/ENDFOR keyword', () => {
        View.sinumerikView.parseData.jumps['PROG'] = {for: []};
        expect(checkFor('G1 X10', 'PROG', ['G1 X10'], 0)).toBe(-1);
    });

    test('FOR sets up R-variable and returns current row when condition true', () => {
        const programText = ['FOR R1=1 TO 5', 'G1 X10', 'ENDFOR'];
        View.sinumerikView.parseData.jumps['PROG'] = {for: []};
        mathParse.mockReturnValue(1);
        checkCondition.mockReturnValue(1);

        const result = checkFor('FOR R1=1 TO 5', 'PROG', programText, 0);

        expect(View.sinumerikView.parseData.variables.firstChannelVariables['R1'].value).toBe(1);
        expect(result).toBe(0);
    });

    test('FOR returns endfor row when condition is false', () => {
        const programText = ['FOR R1=6 TO 5', 'G1 X10', 'ENDFOR'];
        View.sinumerikView.parseData.jumps['PROG'] = {for: []};
        mathParse.mockReturnValue(6);
        checkCondition.mockReturnValue(0);

        const result = checkFor('FOR R1=6 TO 5', 'PROG', programText, 0);

        expect(result).toBe(2);
    });

    test('ENDFOR increments loop variable and returns for_row-1', () => {
        const programText = ['FOR R1=1 TO 5', 'G1 X10', 'ENDFOR'];
        View.sinumerikView.parseData.variables.firstChannelVariables['R1'] = {name: 'R1', type: 'real', value: 1};
        View.sinumerikView.parseData.jumps['PROG'] = {for: []};
        View.sinumerikView.parseData.jumps['PROG'].for[0] = {
            jumps: 0, maxJumps: 1000, type: 'FOR', for: 0, endfor: 2, toVal: '5',
            var: {
                ref: 'R1',
                val: () => View.sinumerikView.parseData.variables.firstChannelVariables['R1'].value,
                inc: () => { View.sinumerikView.parseData.variables.firstChannelVariables['R1'].value++; }
            }
        };

        const result = checkFor('ENDFOR', 'PROG', programText, 2);

        expect(View.sinumerikView.parseData.variables.firstChannelVariables['R1'].value).toBe(2);
        expect(result).toBe(-1);
    });

    // Re-entering a FOR — nested in an outer loop, or reached again by a jump
    // — used to find its variable holding the value it ended with, one past
    // the limit, so the condition was false at once and the body never ran
    // after the first pass. These drive the real sequence of calls parseRows
    // makes: FOR, ENDFOR, FOR, ...
    describe('re-entry', () => {
        const programText = ['FOR R1=1 TO 2', 'G1 X10', 'ENDFOR'];

        function forRow() {
            return checkFor('FOR R1=1 TO 2', 'PROG', programText, 0);
        }

        function endforRow() {
            return checkFor('ENDFOR', 'PROG', programText, 2);
        }

        beforeEach(() => {
            View.sinumerikView.parseData.jumps['PROG'] = {for: []};
            mathParse.mockReturnValue(1);
            checkCondition.mockReturnValue(1);
        });

        test('the loop variable is seeded again on a second entry', () => {
            forRow();
            endforRow();            // R1 = 2
            endforRow();            // R1 = 3
            checkCondition.mockReturnValue(0);
            forRow();               // the loop ends, R1 stays at 3

            expect(View.sinumerikView.parseData.variables.firstChannelVariables['R1'].value).toBe(3);

            checkCondition.mockReturnValue(1);
            const result = forRow(); // entered again from an outer loop

            expect(View.sinumerikView.parseData.variables.firstChannelVariables['R1'].value).toBe(1);
            expect(result).toBe(0);
        });

        // The counterpart: the FOR row is also where every iteration re-tests
        // the condition, and re-seeding there would make the loop endless.
        test('coming round from ENDFOR does not re-seed', () => {
            forRow();
            endforRow();
            forRow();

            expect(View.sinumerikView.parseData.variables.firstChannelVariables['R1'].value).toBe(2);
            expect(checkCondition).toHaveBeenLastCalledWith('2<=2', 'PROG');
        });

        // `FOR _I=_J TO 10` — the start value is evaluated again, not replayed
        // from the first pass.
        test('the start expression is re-evaluated, not remembered', () => {
            forRow();
            checkCondition.mockReturnValue(0);
            forRow();

            checkCondition.mockReturnValue(1);
            mathParse.mockReturnValue(7);
            forRow();

            expect(View.sinumerikView.parseData.variables.firstChannelVariables['R1'].value).toBe(7);
        });

        // Leaving the body by a jump means the next arrival at the FOR row is
        // an entry: nothing marked it as a continuation.
        test('a jump out of the body leaves the loop re-enterable', () => {
            forRow();
            endforRow();
            forRow();               // iteration 2, R1 = 2
            // ... body jumps out past ENDFOR, so no ENDFOR this time ...
            forRow();               // entered again later

            expect(View.sinumerikView.parseData.variables.firstChannelVariables['R1'].value).toBe(1);
        });
    });
});

// --- checkIfGoto ---

describe('checkIfGoto', () => {
    test('returns -1 when row has no IF...GOTO', () => {
        View.sinumerikView.parseData.jumps['PROG'] = {ifGoto: []};
        expect(checkIfGoto('IF X>0', 'PROG', [], 0)).toBe(-1);
        expect(checkIfGoto('GOTO LABEL', 'PROG', [], 0)).toBe(-1);
        expect(checkIfGoto('G1 X10', 'PROG', [], 0)).toBe(-1);
    });

    test('IF false GOTO: condition not met, returns row+1', () => {
        View.sinumerikView.parseData.jumps['PROG'] = {ifGoto: []};
        checkCondition.mockReturnValue(0);

        const result = checkIfGoto('IF X<0 GOTOF LABEL', 'PROG', ['IF X<0 GOTOF LABEL', 'LABEL:'], 0);

        expect(result).toBe(1);
    });

    test('IF true GOTO: jumps to label row', () => {
        const programText = ['IF X>0 GOTOF TARGET', 'G1 X0', 'TARGET:', 'G1 X10'];
        View.sinumerikView.parseData.jumps['PROG'] = {ifGoto: []};
        checkCondition.mockReturnValue(1);

        const result = checkIfGoto('IF X>0 GOTOF TARGET', 'PROG', programText, 0);

        expect(result).toBe(2);
    });

    test('IF true GOTO: pushes error and returns row+1 when label not found', () => {
        const programText = ['IF X>0 GOTO MISSING', 'G1 X5'];
        View.sinumerikView.parseData.jumps['PROG'] = {ifGoto: []};
        checkCondition.mockReturnValue(1);

        const result = checkIfGoto('IF X>0 GOTO MISSING', 'PROG', programText, 0);

        expect(result).toBe(1);
        expect(View.sinumerikView.parseData.errors.length).toBeGreaterThan(0);
    });
});

// --- saved jump limits ---

// A limit the user agreed to is remembered for the rest of the Pulsar session,
// keyed by what the construction says rather than by the row it sits on
// (controlFlow.js::jumpKey). These tests drive WHILE, whose record is created
// at the WHILE row and whose dialog fires at ENDWHILE.
describe('saved jump limits', () => {
    const programText = ['WHILE R1<5', 'G1 X10', 'ENDWHILE'];

    // One parse of a WHILE: the record is created on the way in.
    function enterWhile(programName, rowText = 'WHILE R1<5', text = programText, row = 0) {
        if (!View.sinumerikView.parseData.jumps[programName]) {
            View.sinumerikView.parseData.jumps[programName] = {while: []};
        }
        checkCondition.mockReturnValue(1);
        checkWhile(rowText, programName, text, row);
        return View.sinumerikView.parseData.jumps[programName].while[row];
    }

    // Everything the next parse of the same text starts from scratch with.
    function nextParse() {
        View.sinumerikView.parseData.jumps = {};
        View.sinumerikView.parseData.jumpKeySeq = {};
    }

    // Exhaust the limit and answer the dialog at ENDWHILE.
    function exhaust(programName, answer, endwhileRow = 2) {
        const entry = View.sinumerikView.parseData.jumps[programName].while[0];
        entry.jumps = entry.maxJumps;
        confirmDialog.mockReturnValue(answer);
        checkWhile('ENDWHILE', programName, programText, endwhileRow);
        return entry;
    }

    test('a new record starts at the default limit', () => {
        expect(enterWhile('PROG').maxJumps).toBe(1000);
    });

    test('an agreed limit is reused by the next parse without asking again', () => {
        enterWhile('PROG');
        exhaust('PROG', true, 2);
        expect(View.sinumerikView.parseData.jumps['PROG'].while[0].maxJumps).toBe(2000);

        nextParse();
        confirmDialog.mockClear();
        const entry = enterWhile('PROG');

        expect(entry.maxJumps).toBe(2000);
        expect(confirmDialog).not.toHaveBeenCalled();
    });

    // The whole point of keying by text: inserting lines above the loop used to
    // hand its limit to whatever ended up on that row.
    test('the limit follows the loop when its row moves', () => {
        enterWhile('PROG');
        exhaust('PROG', true, 2);

        nextParse();
        const moved = ['G1 X0', 'G1 X1', 'WHILE R1<5', 'G1 X10', 'ENDWHILE'];
        const entry = enterWhile('PROG', 'WHILE R1<5', moved, 2);

        expect(entry.maxJumps).toBe(2000);
    });

    test('a changed loop condition gets the default limit back', () => {
        enterWhile('PROG');
        exhaust('PROG', true, 2);

        nextParse();
        const edited = ['WHILE R1<6', 'G1 X10', 'ENDWHILE'];

        expect(enterWhile('PROG', 'WHILE R1<6', edited, 0).maxJumps).toBe(1000);
    });

    // Only the keyword itself is case-sensitive to the parser (the regexes in
    // controlFlow.js are), so the variable's case and the spacing are what a
    // key has to survive.
    test('whitespace and the condition\'s case do not change the key', () => {
        enterWhile('PROG');
        exhaust('PROG', true, 2);

        nextParse();
        const retyped = ['WHILE  r1<5', 'G1 X10', 'ENDWHILE'];

        expect(enterWhile('PROG', 'WHILE  r1<5', retyped, 0).maxJumps).toBe(2000);
    });

    test('another program does not inherit the limit', () => {
        enterWhile('PROG');
        exhaust('PROG', true, 2);

        nextParse();

        expect(enterWhile('OTHER').maxJumps).toBe(1000);
    });

    // Two identical headers share nothing: the second is told apart by an
    // occurrence number counted per text.
    test('identical loop headers in one program get separate limits', () => {
        const twoLoops = ['WHILE R1<5', 'ENDWHILE', 'WHILE R1<5', 'ENDWHILE'];
        enterWhile('PROG', 'WHILE R1<5', twoLoops, 0);
        const second = enterWhile('PROG', 'WHILE R1<5', twoLoops, 2);

        expect(View.sinumerikView.parseData.jumps['PROG'].while[0].key).toBe('WHILE:WHILE R1<5');
        expect(second.key).toBe('WHILE:WHILE R1<5#2');

        exhaust('PROG', true, 1);

        nextParse();
        enterWhile('PROG', 'WHILE R1<5', twoLoops, 0);
        const secondAgain = enterWhile('PROG', 'WHILE R1<5', twoLoops, 2);

        expect(View.sinumerikView.parseData.jumps['PROG'].while[0].maxJumps).toBe(2000);
        expect(secondAgain.maxJumps).toBe(1000);
    });

    // A refusal is deliberately NOT remembered: hiding the dialog from someone
    // who misclicked would be worse than asking again.
    test('a refusal is not remembered and the dialog comes back', () => {
        enterWhile('PROG');
        exhaust('PROG', false, 2);
        expect(View.sinumerikView.parseData.abortParse).toBe(true);

        nextParse();
        View.sinumerikView.parseData.abortParse = false;

        expect(enterWhile('PROG').maxJumps).toBe(1000);
        expect(View.sinumerikView.savedMaxJumps).toBeUndefined();
    });
});

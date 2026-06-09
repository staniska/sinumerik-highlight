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

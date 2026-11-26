jest.mock('../lib/sinumerik', () => ({
    __esModule: true,
    default: {
        sinumerikView: {
            parseData: {
                variables: {firstChannelVariables: {}},
                axesPos: {X: 0, Y: 0, Z: 0},
                auxPos: {},
                frame: {
                    basis: [[1,0,0],[0,1,0],[0,0,1]],
                    trans: {X: 0, Y: 0, Z: 0},
                },
                diamon: 0,
                diam90: 0,
                unitMult: 1,
                activeToolR: 0,
                activeTool: 0,
                errors: [],
            }
        }
    }
}));

jest.mock('../lib/coordinates', () => ({
    __esModule: true,
    getCoordinatesInFrame: jest.fn(() => [0, 0, 0])
}));

const {getCoordinatesInFrame} = require('../lib/coordinates');

const {getExpressionInBrackets, mathParse} = require('../lib/mathParser');

// --- getExpressionInBrackets ---
//
// Extracts the content inside brackets after `matcher` and evaluates it.
// Returns {string, value, error?}.
// `value` is eval of the inner string (not the sqrt result).
// The caller replaces string→value so the outer eval never sees a negative sqrt arg.

describe('getExpressionInBrackets', () => {
    test('simple number: string="25", value=25', () => {
        const r = getExpressionInBrackets('Math.sqrt(25)', 'Math.sqrt');
        expect(r.string).toBe('25');
        expect(r.value).toBe(25);
        expect(r.error).toBeUndefined();
    });

    test('expression: string="3*3", value=9', () => {
        const r = getExpressionInBrackets('Math.sqrt(3*3)', 'Math.sqrt');
        expect(r.string).toBe('3*3');
        expect(r.value).toBe(9);
    });

    test('negative argument: value=0 and error set', () => {
        const r = getExpressionInBrackets('Math.sqrt(-4)', 'Math.sqrt');
        expect(r.value).toBe(0);
        expect(r.error).toMatch(/SQRT arg < 0/);
    });

    test('near-zero value is clamped to 0', () => {
        const r = getExpressionInBrackets('Math.sqrt(1e-15)', 'Math.sqrt');
        expect(r.value).toBe(0);
        expect(r.error).toBeUndefined();
    });

    test('invalid expression: error is set', () => {
        const r = getExpressionInBrackets('Math.sqrt(abc)', 'Math.sqrt');
        expect(r.error).toBeDefined();
    });
});

// --- mathParse ---

describe('mathParse', () => {
    let View;

    beforeEach(() => {
        View = require('../lib/sinumerik').default;
        View.sinumerikView.parseData.variables = {firstChannelVariables: {}};
        View.sinumerikView.parseData.errors = [];
        View.sinumerikView.parseData.auxPos = {};
        View.sinumerikView.parseData.unitMult = 1;
        View.sinumerikView.parseData.activeTool = 0;
        View.sinumerikView.parseData.activeToolR = 0;
        View.sinumerikView.parseData.activeToolDef = null;
        View.sinumerikView.parseData.toolNumbersMissed = false;
        View.sinumerikView.toolGeometry = {};
        getCoordinatesInFrame.mockReturnValue([0, 0, 0]);
    });

    test('addition', () => {
        expect(mathParse('1+2', 'prog', 0)).toBe(3);
    });

    test('multiplication', () => {
        expect(mathParse('2*3', 'prog', 0)).toBe(6);
    });

    test('division', () => {
        expect(mathParse('10/4', 'prog', 0)).toBe(2.5);
    });

    test('$PI constant', () => {
        expect(mathParse('$PI', 'prog', 0)).toBeCloseTo(Math.PI, 5);
    });

    test('SIN(90) = 1 (degrees)', () => {
        expect(mathParse('SIN(90)', 'prog', 0)).toBeCloseTo(1, 5);
    });

    test('COS(0) = 1', () => {
        expect(mathParse('COS(0)', 'prog', 0)).toBeCloseTo(1, 5);
    });

    test('SQRT(25) = 5', () => {
        expect(mathParse('SQRT(25)', 'prog', 0)).toBeCloseTo(5, 5);
    });

    test('ABS of negative', () => {
        expect(mathParse('ABS(-7)', 'prog', 0)).toBe(7);
    });

    test('invalid expression returns null', () => {
        expect(mathParse('abc_not_a_number', 'prog', 0)).toBeNull();
    });

    test('named variable is substituted', () => {
        View.sinumerikView.parseData.variables['prog'] = {
            myVar: {name: 'myVar', value: 42}
        };
        expect(mathParse('myVar+1', 'prog', 0)).toBe(43);
    });

    test('$AA_IW[X] returns the mm axis position as-is in metric mode', () => {
        getCoordinatesInFrame.mockReturnValue([254, 0, 0]);
        View.sinumerikView.parseData.unitMult = 1;
        expect(mathParse('$AA_IW[X]', 'prog', 0)).toBe(254);
    });

    test('$AA_IW[X] divides by unitMult in inch mode (axesPos is always mm)', () => {
        getCoordinatesInFrame.mockReturnValue([254, 0, 0]);
        View.sinumerikView.parseData.unitMult = 25.4;
        expect(mathParse('$AA_IW[X]', 'prog', 0)).toBe(10);
    });

    describe('$AA_IW of an additional axis', () => {
        test('A B C come from where the parse keeps them', () => {
            View.sinumerikView.parseData.auxPos = {A: 90, B: -12.5, C: 180};

            expect(mathParse('$AA_IW[A]', 'prog', 0)).toBe(90);
            expect(mathParse('$AA_IW[B]', 'prog', 0)).toBe(-12.5);
            expect(mathParse('$AA_IW[C]+1', 'prog', 0)).toBe(181);
        });

        // An angle is degrees in any unit, which `isLinearAxis` has always said.
        test('an angle takes no unit, an additional length does', () => {
            View.sinumerikView.parseData.unitMult = 25.4;
            View.sinumerikView.parseData.auxPos = {A: 90, W: 254};

            expect(mathParse('$AA_IW[A]', 'prog', 0)).toBe(90);
            expect(mathParse('$AA_IW[W]', 'prog', 0)).toBe(10);
        });

        // The machine names its spindle axis and it may be anything, so the
        // name is matched rather than listed.
        test('the spindle axis is read under whatever name it has', () => {
            View.sinumerikView.parseData.auxPos = {C1: 45, SP1: 1000};

            expect(mathParse('$AA_IW[C1]', 'prog', 0)).toBe(45);
            expect(mathParse('$AA_IW[SP1]', 'prog', 0)).toBe(1000);
        });

        test('a diameter mode touches X alone', () => {
            View.sinumerikView.parseData.diamon = 1;
            View.sinumerikView.parseData.auxPos = {A: 20};

            expect(mathParse('$AA_IW[A]', 'prog', 0)).toBe(20);
        });

        // A control answers with wherever the axis physically stands; this
        // reads G-code, and a guessed position would enter the geometry
        // silently. Refused by name, as an unassigned R-parameter is.
        test('an axis never programmed is refused and said so', () => {
            View.sinumerikView.parseData.auxPos = {A: 90};

            expect(mathParse('$AA_IW[B]', 'prog', 7)).toBe(null);
            expect(View.sinumerikView.parseData.errors.length).toBe(1);
            expect(View.sinumerikView.parseData.errors[0].text).toMatch('$AA_IW[B]');
            expect(View.sinumerikView.parseData.errors[0].text).toMatch('row 8');
            expect(View.sinumerikView.parseData.errors[0].row).toBe(7);
        });

        // Two of them in one expression, so the loop is exercised rather than
        // just the first replacement.
        test('two axes in one expression', () => {
            View.sinumerikView.parseData.auxPos = {A: 90, C: 10};

            expect(mathParse('$AA_IW[A]-$AA_IW[C]', 'prog', 0)).toBe(80);
        });
    });

    // The active tool's numbers come from the tool FILE when a `;TOOL:` marker
    // named one — `parseData.activeToolDef` says which file, and its
    // `;---VARIABLES` block is cached by path in `toolGeometry`. The legacy
    // `;T10x R..` comment above a `T=` word, which lands in `activeTool` /
    // `activeToolR`, stays the fallback. Reading only the legacy fields was the
    // bug where `;T102 R12.5` in a tool file gave `$P_TOOLR` = 0.
    describe('the active tool\'s numbers', () => {
        const withToolFile = variables => {
            View.sinumerikView.parseData.activeToolDef = {name: 'TURN35', path: '/m/turn35.spf'};
            View.sinumerikView.toolGeometry = {'/m/turn35.spf': {variables}};
        };

        test('$P_TOOLR is the nose radius the tool file declares', () => {
            withToolFile({'$TC_DP2': '2', '$TC_DP6': '12.5'});

            expect(mathParse('$P_TOOLR', 'prog', 0)).toBe(12.5);
            expect(mathParse('$P_TOOLR*2', 'prog', 0)).toBe(25);
        });

        // D-numbers are out of scope, so an index on the key is ignored —
        // the same rule `lookupVariable` applies on the expression side.
        test('an indexed key in the file is the same field', () => {
            withToolFile({'$TC_DP6[1]': '0.8'});

            expect(mathParse('$P_TOOLR', 'prog', 0)).toBe(0.8);
        });

        test('with no tool file the legacy comment value still answers', () => {
            View.sinumerikView.parseData.activeToolR = 0.4;

            expect(mathParse('$P_TOOLR', 'prog', 0)).toBe(0.4);
        });

        // A file that declares no radius must not read as "radius 0": the
        // legacy number is the better answer, and 0 is a tool with no nose.
        test('a file without the field falls back too', () => {
            withToolFile({'$TC_DP10': '80'});
            View.sinumerikView.parseData.activeToolR = 0.4;

            expect(mathParse('$P_TOOLR', 'prog', 0)).toBe(0.4);
        });

        test('an outline not read yet falls back rather than reading 0', () => {
            View.sinumerikView.parseData.activeToolDef = {name: 'TURN35', path: '/m/turn35.spf'};
            View.sinumerikView.parseData.activeToolR = 0.4;

            expect(mathParse('$P_TOOLR', 'prog', 0)).toBe(0.4);
        });

        test('$TC_DP2 is the edge position the tool file declares', () => {
            withToolFile({'$TC_DP2': '3', '$TC_DP6': '0.8'});

            expect(mathParse('$TC_DP2[1,1]', 'prog', 0)).toBe(3);
        });

        test('$TC_DP2 falls back to the legacy T10x number', () => {
            View.sinumerikView.parseData.activeTool = 102;

            expect(mathParse('$TC_DP2[1,1]', 'prog', 0)).toBe(2);
        });

        test('$TC_DP2 is 0 when neither source knows', () => {
            expect(mathParse('$TC_DP2[1,1]', 'prog', 0)).toBe(0);
        });

        // The outline of a named tool arriving only after the parse leaves the
        // trajectory — not just the picture — computed from the fallback, so
        // the parse says so and the preload parses again
        // (`interpretator.js::reparseForToolNumbers`). Without this the right
        // path appeared only when the user pressed Redraw.
        test('a tool whose file is not cached is reported as a missed number', () => {
            View.sinumerikView.parseData.activeToolDef = {name: 'TURN35', path: '/m/turn35.spf'};

            mathParse('$P_TOOLR', 'prog', 0);

            expect(View.sinumerikView.parseData.toolNumbersMissed).toBe(true);
        });

        test('$TC_DP2 reports it too', () => {
            View.sinumerikView.parseData.activeToolDef = {name: 'TURN35', path: '/m/turn35.spf'};

            mathParse('$TC_DP2[1,1]', 'prog', 0);

            expect(View.sinumerikView.parseData.toolNumbersMissed).toBe(true);
        });

        test('a cached tool is not a missed number', () => {
            withToolFile({'$TC_DP2': '2', '$TC_DP6': '12.5'});

            mathParse('$P_TOOLR', 'prog', 0);

            expect(View.sinumerikView.parseData.toolNumbersMissed).toBeFalsy();
        });

        // No tool named at all — the legacy comment, or nothing. There is no
        // file to wait for, so a re-parse would change nothing and must not be
        // asked for.
        test('no active tool is not a missed number', () => {
            View.sinumerikView.parseData.activeToolR = 0.4;

            mathParse('$P_TOOLR', 'prog', 0);

            expect(View.sinumerikView.parseData.toolNumbersMissed).toBeFalsy();
        });

        // A name the machine's list does not hold resolves to a pathless entry
        // and is reported by the parse already; there is nothing to come.
        test('an unresolved tool name is not a missed number', () => {
            View.sinumerikView.parseData.activeToolDef = {name: 'GONE', path: null};

            mathParse('$P_TOOLR', 'prog', 0);

            expect(View.sinumerikView.parseData.toolNumbersMissed).toBeFalsy();
        });
    });
});

test('the configured lathe spindle reads as zero without losing its simulated position', () => {
    const view = require('../lib/sinumerik').default.sinumerikView;
    const {mathParse} = require('../lib/mathParser');
    const original = view.singleLineDebugData;
    view.singleLineDebugData = {machine: {machineType: 'Lathe', firstSpindle: {name: 'C4'}}};
    try {
        view.parseData.auxPos = {B: 12};
        expect(mathParse('$AA_IW[C4]+22', 'prog', 0)).toBe(22);
        view.parseData.auxPos.C4 = 53;
        expect(mathParse('$AA_IW[C4]+$AA_IW[B]', 'prog', 0)).toBe(12);
        expect(view.parseData.auxPos.C4).toBe(53);
    } finally {
        view.singleLineDebugData = original;
    }
});

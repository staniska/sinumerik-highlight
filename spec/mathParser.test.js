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
});

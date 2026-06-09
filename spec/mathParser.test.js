jest.mock('../lib/sinumerik', () => ({
    __esModule: true,
    default: {
        sinumerikView: {
            parseData: {
                variables: {firstChannelVariables: {}},
                axesPos: {X: 0, Y: 0, Z: 0},
                frame: {
                    basis: [[1,0,0],[0,1,0],[0,0,1]],
                    trans: {X: 0, Y: 0, Z: 0},
                },
                diamon: 0,
                diam90: 0,
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
});

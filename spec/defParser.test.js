jest.mock('../lib/sinumerik', () => ({
    __esModule: true,
    default: {
        sinumerikView: {
            parseData: {
                variables: {},
                errors: [],
            }
        }
    }
}));

const {parseDefPart, checkDef} = require('../lib/defParser');

// --- parseDefPart ---
// Pure function: parses a "TYPE name" string into {type, name} or false.

describe('parseDefPart', () => {
    test('REAL type', () => {
        expect(parseDefPart('REAL myVar')).toEqual({type: 'real', name: 'myVar'});
    });

    test('INT type', () => {
        expect(parseDefPart('INT counter')).toEqual({type: 'int', name: 'counter'});
    });

    test('BOOL type', () => {
        expect(parseDefPart('BOOL flag')).toEqual({type: 'bool', name: 'flag'});
    });

    test('CHAR type', () => {
        expect(parseDefPart('CHAR ch')).toEqual({type: 'char', name: 'ch'});
    });

    test('AXIS type', () => {
        expect(parseDefPart('AXIS ax')).toEqual({type: 'axis', name: 'ax'});
    });

    test('STRING[n] type', () => {
        expect(parseDefPart('STRING[32] label')).toEqual({type: 'string[32]', name: 'label'});
    });

    test('CHAN keyword is stripped before parsing', () => {
        expect(parseDefPart('CHAN REAL myVar')).toEqual({type: 'real', name: 'myVar'});
    });

    test('unknown type returns false', () => {
        expect(parseDefPart('FLOAT myVar')).toBe(false);
    });

    test('single token (no type) returns false', () => {
        expect(parseDefPart('myVar')).toBe(false);
    });

    test('name too short (< 2 alpha chars) returns false', () => {
        expect(parseDefPart('REAL x')).toBe(false);
    });
});

// --- checkDef ---
// Reads DEF/PROC lines and populates View.sinumerikView.parseData.variables.

describe('checkDef', () => {
    let View;

    beforeEach(() => {
        View = require('../lib/sinumerik').default;
        View.sinumerikView.parseData.variables = {prog: {}};
        View.sinumerikView.parseData.errors = [];
    });

    test('DEF REAL creates variable with float value', () => {
        checkDef('DEF REAL myVar=3.14', 'prog', [], 0);
        expect(View.sinumerikView.parseData.variables.prog.myVar).toEqual({
            name: 'myVar', type: 'real', value: 3.14
        });
    });

    test('DEF INT creates variable with int value', () => {
        checkDef('DEF INT counter=5', 'prog', [], 0);
        expect(View.sinumerikView.parseData.variables.prog.counter).toEqual({
            name: 'counter', type: 'int', value: 5
        });
    });

    test('DEF without value defaults to 0', () => {
        checkDef('DEF REAL myVar', 'prog', [], 0);
        expect(View.sinumerikView.parseData.variables.prog.myVar.value).toBe(0);
    });

    test('non-DEF/PROC line is ignored', () => {
        checkDef('G1 X10 Y20', 'prog', [], 0);
        expect(View.sinumerikView.parseData.variables.prog).toEqual({});
        expect(View.sinumerikView.parseData.errors).toHaveLength(0);
    });

    test('DEF with inline comment strips comment', () => {
        checkDef('DEF REAL myVar=1.5 ; comment', 'prog', [], 0);
        expect(View.sinumerikView.parseData.variables.prog.myVar.value).toBe(1.5);
    });
});

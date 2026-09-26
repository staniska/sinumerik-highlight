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
const {maskStringSpaces, STRING_SPACE_SENTINEL} = require('../lib/utils');

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

    test('DEF STRING strips surrounding quotes', () => {
        checkDef('DEF STRING[8] pipka="Popa"', 'prog', [], 0);
        expect(View.sinumerikView.parseData.variables.prog.pipka).toEqual({
            name: 'pipka', type: 'string[8]', value: 'Popa'
        });
    });

    test('DEF STRING with spaces in the literal keeps the masked sentinel, not a real space', () => {
        // mirrors how the line actually arrives at checkDef: parseRows runs
        // maskStringSpaces over the whole program before checkDef ever sees it.
        const maskedLine = maskStringSpaces('DEF STRING[8] pipka="Po Pa"');
        checkDef(maskedLine, 'prog', [], 0);
        expect(View.sinumerikView.parseData.variables.prog.pipka.value).toBe(`Po${STRING_SPACE_SENTINEL}Pa`);
    });

    test('DEF STRING without an initial value defaults to 0, not a crash', () => {
        checkDef('DEF STRING[8] pipka', 'prog', [], 0);
        expect(View.sinumerikView.parseData.variables.prog.pipka.value).toBe(0);
    });
});

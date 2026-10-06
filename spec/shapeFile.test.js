// Tests for the pure part of the sectioned shape-file parser
// (lib/shapeFile.js) — splitting into sections and reading the variables
// block, with no global state involved.
//
// The one behaviour that must hold from the very first commit, even before
// anything consumes the variables, is that a ;---VARIABLES block never reaches
// the geometry. A file written with variables today would otherwise turn its
// `; $TC_DP6=0.4` lines into a stray contour edge in section 0 — silently, and
// only visible as a wrong outline on screen.

const {
    splitShapeFile,
    parseVariablesBlock,
    lookupVariable,
    numericVariable,
    describeShapeFileWarnings,
    DEFAULT_SECTION_COLOR,
    DEFAULT_SECTION_ROLE,
} = require('../lib/shapeFile');

const TOOL_FILE = [
    ';NAME:TURN35 COLOR:#3b7dd8',
    ';---VARIABLES',
    '; T103 R0.4',
    '; $TC_DP10=80',
    ';---SECTION COLOR:#d8a13b ROLE:cut',
    'G0 X0 Z0',
    'G1 X-10 Z0',
    ';---SECTION COLOR:#888888 ROLE:body',
    'G0 X-10 Z-5',
    'G1 X-30 Z-5',
];

describe('splitting a sectioned file', () => {
    test('tool file: name, colours, roles and bodies', () => {
        const {name, sections, warnings} = splitShapeFile(TOOL_FILE);

        expect(warnings).toEqual([]);
        expect(name).toBe('TURN35');
        expect(sections).toHaveLength(2);

        expect(sections[0]).toMatchObject({color: '#d8a13b', role: 'cut'});
        expect(sections[0].body).toEqual(['G0 X0 Z0', 'G1 X-10 Z0']);

        expect(sections[1]).toMatchObject({color: '#888888', role: 'body'});
        expect(sections[1].body).toEqual(['G0 X-10 Z-5', 'G1 X-30 Z-5']);
    });

    test('startRow points at the first geometry line of each section', () => {
        const {sections} = splitShapeFile(TOOL_FILE);
        expect(sections.map(s => s.startRow)).toEqual([5, 8]);
        expect(TOOL_FILE[sections[0].startRow]).toBe('G0 X0 Z0');
        expect(TOOL_FILE[sections[1].startRow]).toBe('G0 X-10 Z-5');
    });

    test('equipment file: no VARIABLES, no ROLE, section 0 takes the header colour', () => {
        const {name, sections, variables, warnings} = splitShapeFile([
            ';NAME:LUNET COLOR:#3b7dd8',
            'G0 X0 Z0',
            'G1 X-20 Z0',
            ';---SECTION COLOR:#88aaff',
            'G0 X-20 Z-10',
        ]);

        expect(warnings).toEqual([]);
        expect(name).toBe('LUNET');
        expect(variables).toEqual({});
        expect(sections).toHaveLength(2);

        // Section 0 has no marker of its own, so its colour comes from ;NAME:.
        expect(sections[0]).toMatchObject({color: '#3b7dd8', role: DEFAULT_SECTION_ROLE});
        expect(sections[1]).toMatchObject({color: '#88aaff', role: DEFAULT_SECTION_ROLE});
    });

    test('a section without ROLE: is a collider, not a cutting edge', () => {
        // Fail-safe direction: an unmarked section produces a false collision
        // (visible, fixable) rather than a false all-clear (invisible, unsafe).
        const {sections} = splitShapeFile([
            ';NAME:X',
            ';---SECTION',
            'G1 X1 Z1',
        ]);

        expect(sections[0].role).toBe('body');
    });

    test('missing COLOR: anywhere falls back to the default', () => {
        const {sections} = splitShapeFile([
            ';NAME:X',
            ';---SECTION',
            'G1 X1 Z1',
        ]);

        expect(sections[0].color).toBe(DEFAULT_SECTION_COLOR);
    });

    test('ROLE: and COLOR: are order-independent and case-insensitive', () => {
        const {sections} = splitShapeFile([
            ';NAME:X',
            ';---section role:CUT color:#AABBCC',
            'G1 X1 Z1',
        ]);

        expect(sections[0]).toMatchObject({color: '#AABBCC', role: 'cut'});
    });

    test('CRLF line endings do not leak into names, colours or roles', () => {
        const {name, sections, warnings} = splitShapeFile([
            ';NAME:TURN35 COLOR:#3b7dd8\r',
            ';---SECTION COLOR:#d8a13b ROLE:cut\r',
            'G1 X1 Z1\r',
        ]);

        expect(warnings).toEqual([]);
        expect(name).toBe('TURN35');
        expect(sections[0]).toMatchObject({color: '#d8a13b', role: 'cut'});
    });

    test('a section with no geometry is dropped', () => {
        const {sections} = splitShapeFile([
            ';NAME:X',
            ';---VARIABLES',
            '; $TC_DP6=0.4',
            ';---SECTION ROLE:cut',
            'G1 X1 Z1',
        ]);

        // Nothing precedes ;---VARIABLES, so there is no section 0 to emit.
        expect(sections).toHaveLength(1);
        expect(sections[0].role).toBe('cut');
    });

    test('empty input is not an error', () => {
        expect(splitShapeFile([])).toEqual({name: null, variables: {}, sections: [], warnings: []});
        expect(splitShapeFile(undefined).sections).toEqual([]);
    });
});

describe('the variables block never becomes geometry', () => {
    test('its lines stay out of every section body', () => {
        const {sections} = splitShapeFile(TOOL_FILE);
        const allBodyLines = sections.flatMap(s => s.body);

        expect(allBodyLines.join('\n')).not.toMatch(/TC_DP/);
        expect(allBodyLines.join('\n')).not.toMatch(/T103/);
    });

    test('a VARIABLES block below a geometry section does not join it either', () => {
        const {sections, variables} = splitShapeFile([
            ';NAME:X',
            ';---SECTION ROLE:cut',
            'G0 X0 Z0',
            'G1 X-10 Z0',
            ';---VARIABLES',
            '; $TC_DP6=0.4',
        ]);

        expect(sections).toHaveLength(1);
        expect(sections[0].body).toEqual(['G0 X0 Z0', 'G1 X-10 Z0']);
        expect(variables).toEqual({'$TC_DP6': '0.4'});
    });

    test('an unknown ;--- section is skipped with a warning, not parsed as geometry', () => {
        // Forward compatibility: a newer file must degrade to "section
        // ignored", never to a corrupt outline.
        const {sections, warnings} = splitShapeFile([
            ';NAME:X',
            ';---FUTURETHING',
            'nonsense that is not g-code',
            ';---SECTION ROLE:cut',
            'G1 X1 Z1',
        ]);

        expect(sections).toHaveLength(1);
        expect(sections[0].body).toEqual(['G1 X1 Z1']);
        expect(warnings).toEqual([
            {kind: 'unknownSection', row: 1, text: ';---FUTURETHING'},
        ]);
    });
});

describe('reading variables', () => {
    test('the T10X R.. shorthand expands to the two fields it encodes', () => {
        const {variables, warnings} = parseVariablesBlock(['; T103 R0.4']);

        expect(warnings).toEqual([]);
        // The digit is the cutting-edge position itself ($TC_DP2 = 3), not the
        // 103 the program-side comment carries — mathParser subtracts 100 on
        // that path, this one is already the Schneidenlage.
        expect(variables).toEqual({'$TC_DP2': '3', '$TC_DP6': '0.4'});
    });

    test('the shorthand without a radius still gives the edge position', () => {
        expect(parseVariablesBlock(['; T107']).variables).toEqual({'$TC_DP2': '7'});
    });

    test('values are kept as strings and converted only on request', () => {
        const {variables} = parseVariablesBlock(['; $TC_DP6=0.4']);

        expect(variables['$TC_DP6']).toBe('0.4');
        expect(numericVariable(variables, '$TC_DP6')).toBeCloseTo(0.4, 10);
    });

    test('a non-numeric value does not break loading', () => {
        const {variables, warnings} = parseVariablesBlock([
            '; $TC_DP6=0.4',
            '; NOTE=round insert, left hand',
        ]);

        expect(warnings).toEqual([]);
        expect(variables['NOTE']).toBe('round insert, left hand');
        // The geometry of such a file is still perfectly usable.
        expect(numericVariable(variables, '$TC_DP6')).toBeCloseTo(0.4, 10);
        expect(numericVariable(variables, 'NOTE')).toBeUndefined();
    });

    test('no whitelist: unknown keys are accepted verbatim', () => {
        // The full set of $TC_DP* is not known in advance, so rejecting
        // unrecognised keys would reject future ones.
        const {variables, warnings} = parseVariablesBlock([
            '; $TC_DP1=500',
            '; $TC_DP24=7',
            '; $TC_SOMETHING_NEW=12',
        ]);

        expect(warnings).toEqual([]);
        expect(variables).toEqual({
            '$TC_DP1': '500',
            '$TC_DP24': '7',
            '$TC_SOMETHING_NEW': '12',
        });
    });

    test('blank and bare-comment lines are ignored silently', () => {
        const {variables, warnings} = parseVariablesBlock(['', ';', '   ', '; $TC_DP6=0.4']);

        expect(warnings).toEqual([]);
        expect(variables).toEqual({'$TC_DP6': '0.4'});
    });

    test('an unreadable line is reported, and the rest still loads', () => {
        const {variables, warnings} = parseVariablesBlock([
            '; $TC_DP6=0.4',
            '; this line has no equals sign',
        ]);

        expect(variables).toEqual({'$TC_DP6': '0.4'});
        expect(warnings).toHaveLength(1);
        expect(warnings[0].kind).toBe('badVariableLine');
    });

    test('a file contradicting itself warns, and the later line wins', () => {
        const {variables, warnings} = parseVariablesBlock([
            '; T103 R0.4',
            '; $TC_DP6=0.8',
        ]);

        expect(variables['$TC_DP6']).toBe('0.8');
        expect(warnings).toEqual([
            {kind: 'variableConflict', key: '$TC_DP6', was: '0.4', now: '0.8', row: 1},
        ]);
    });

    test('repeating the same value is not a conflict', () => {
        const {warnings} = parseVariablesBlock(['; $TC_DP6=0.4', '; $TC_DP6=0.4']);
        expect(warnings).toEqual([]);
    });

    test('CRLF does not end up inside a value', () => {
        const {variables} = parseVariablesBlock(['; $TC_DP6=0.4\r']);
        expect(variables['$TC_DP6']).toBe('0.4');
        expect(numericVariable(variables, '$TC_DP6')).toBeCloseTo(0.4, 10);
    });
});

describe('index-insensitive lookup', () => {
    // While D-numbers are out of scope, $TC_DP6[1] and $TC_DP6 are the same
    // field. Only this lookup changes when multiple edges arrive; the file
    // format does not, because keys are opaque.
    test('an indexed key is found by its bare name', () => {
        const {variables} = parseVariablesBlock(['; $TC_DP6[1]=0.4']);

        expect(lookupVariable(variables, '$TC_DP6')).toBe('0.4');
        expect(numericVariable(variables, '$TC_DP6')).toBeCloseTo(0.4, 10);
    });

    test('a bare key is found by an indexed request', () => {
        const {variables} = parseVariablesBlock(['; $TC_DP6=0.4']);

        expect(lookupVariable(variables, '$TC_DP6[1]')).toBe('0.4');
        expect(lookupVariable(variables, '$TC_DP6[1,2]')).toBe('0.4');
    });

    test('an exact match is preferred over an index-stripped one', () => {
        const variables = {'$TC_DP6': '0.4', '$TC_DP6[2]': '0.8'};

        expect(lookupVariable(variables, '$TC_DP6')).toBe('0.4');
        expect(lookupVariable(variables, '$TC_DP6[2]')).toBe('0.8');
    });

    test('a missing variable is undefined, not zero', () => {
        // Substituting a silent 0 for $P_TOOLR would make a program compute
        // with a zero-radius tool and look fine doing it.
        expect(lookupVariable({}, '$TC_DP6')).toBeUndefined();
        expect(numericVariable({}, '$TC_DP6')).toBeUndefined();
        expect(numericVariable(undefined, '$TC_DP6')).toBeUndefined();
    });
});

describe('warning report', () => {
    test('nothing to say about a clean file', () => {
        const {warnings} = splitShapeFile(TOOL_FILE);
        expect(describeShapeFileWarnings(warnings, 'turn35.spf')).toBe('');
    });

    test('each warning kind renders with its cause', () => {
        const {warnings} = splitShapeFile([
            ';NAME:X',
            ';---FUTURETHING',
            'junk',
            ';---VARIABLES',
            '; T103 R0.4',
            '; $TC_DP6=0.8',
            '; broken line',
            ';---SECTION ROLE:cut',
            'G1 X1 Z1',
        ]);

        const message = describeShapeFileWarnings(warnings, 'turn35.spf');
        expect(message).toMatch(/^turn35\.spf: /);
        expect(message).toMatch(/unknown section ";---FUTURETHING" ignored/);
        expect(message).toMatch(/\$TC_DP6 declared twice \(0\.4, then 0\.8\)/);
        expect(message).toMatch(/cannot read variable line "broken line"/);
    });
});

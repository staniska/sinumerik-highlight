const {
    IPS_AXES,
    blankMode,
    normalizeIpsReference,
    ipsIsTransformed,
    describeIpsTransform,
    ipsStatusText,
    uniqueProgramNames,
    placeStockElements,
    ipsUnitMult,
} = require('../lib/ipsReference');

describe('blankMode', () => {
    test('a program with an ips reference is in ips mode', () => {
        expect(blankMode({ips: {name: 'OP10'}})).toBe('ips');
    });

    test('everything else is a blank', () => {
        expect(blankMode({blank: {name: 'BLANK'}})).toBe('blank');
        expect(blankMode({})).toBe('blank');
        expect(blankMode(undefined)).toBe('blank');
    });
});

describe('normalizeIpsReference', () => {
    test('a bare name is a reference', () => {
        expect(normalizeIpsReference('op10')).toEqual({name: 'OP10'});
    });

    test('the name is uppercased and trimmed, CRLF included', () => {
        // Program files read on Windows carry \r; the name is compared against
        // subroutine names, which are uppercase basenames.
        expect(normalizeIpsReference({name: ' op10\r'})).toEqual({name: 'OP10'});
    });

    test('no usable name is no reference', () => {
        expect(normalizeIpsReference(null)).toBeNull();
        expect(normalizeIpsReference({})).toBeNull();
        expect(normalizeIpsReference({name: '   '})).toBeNull();
        expect(normalizeIpsReference({trans: {Z: -120}})).toBeNull();
    });

    test('offset and mirror come through', () => {
        expect(normalizeIpsReference({name: 'OP10', trans: {Z: -120}, mirror: ['Z']}))
            .toEqual({name: 'OP10', trans: {Z: -120}, mirror: ['Z']});
    });

    test('numbers arrive as text from the popup inputs', () => {
        expect(normalizeIpsReference({name: 'OP10', trans: {Z: '-120.5'}}).trans)
            .toEqual({Z: -120.5});
    });

    test('a zero offset is kept — the user can have typed it', () => {
        expect(normalizeIpsReference({name: 'OP10', trans: {Z: 0}}).trans).toEqual({Z: 0});
    });

    test('an empty field is an absence, not a zero', () => {
        expect(normalizeIpsReference({name: 'OP10', trans: {X: '', Y: null, Z: undefined}}).trans)
            .toBeUndefined();
    });

    test('an axis this package cannot frame is dropped, the reference survives', () => {
        // utils.js::isFrameAxis: TRANS/MIRROR work on X/Y/Z only. A rotary axis
        // here would shift the frame by NaN, which reads as a reset.
        const ref = normalizeIpsReference({name: 'OP10', trans: {C: 30, Z: -10}, mirror: ['C', 'z']});
        expect(ref).toEqual({name: 'OP10', trans: {Z: -10}, mirror: ['Z']});
    });

    test('a non-finite offset is dropped', () => {
        expect(normalizeIpsReference({name: 'OP10', trans: {Z: 'abc'}}).trans).toBeUndefined();
    });

    test('mirror keeps the canonical axis order, not the order written', () => {
        expect(normalizeIpsReference({name: 'OP10', mirror: ['Z', 'X']}).mirror).toEqual(['X', 'Z']);
    });

    test('empty offset and mirror leave no keys behind', () => {
        expect(normalizeIpsReference({name: 'OP10', trans: {}, mirror: []}))
            .toEqual({name: 'OP10'});
    });

    test('a recorded piece choice is carried through', () => {
        const piece = {a0min: -2, a0max: 118.5, a1max: 42};
        expect(normalizeIpsReference({name: 'OP10', piece}).piece).toEqual(piece);
    });
});

describe('ipsIsTransformed', () => {
    test('no reference, no transform', () => {
        expect(ipsIsTransformed(null)).toBe(false);
        expect(ipsIsTransformed({name: 'OP10'})).toBe(false);
    });

    test('an all-zero offset is not a transform', () => {
        expect(ipsIsTransformed({name: 'OP10', trans: {X: 0, Z: 0}})).toBe(false);
    });

    test('a shift or a mirror is', () => {
        expect(ipsIsTransformed({name: 'OP10', trans: {Z: -120}})).toBe(true);
        expect(ipsIsTransformed({name: 'OP10', mirror: ['Z']})).toBe(true);
    });
});

describe('describeIpsTransform', () => {
    test('says so when there is nothing to say', () => {
        expect(describeIpsTransform({name: 'OP10'})).toBe('No offset, no mirror');
    });

    test('names the axes, zeros left out', () => {
        expect(describeIpsTransform({name: 'OP10', trans: {X: 0, Z: -120}, mirror: ['Z']}))
            .toBe('Z−120, mirror Z');
    });

    test('a positive shift carries its sign', () => {
        expect(describeIpsTransform({name: 'OP10', trans: {Z: 12.5}})).toBe('Z+12.5');
    });
});

describe('ipsStatusText', () => {
    const ref = {name: 'OP10'};

    test('every refusal names the program and says what to do', () => {
        [
            'notFound', 'cycle', 'tooDeep', 'noMachine', 'readError', 'noBlank',
            'noTools', 'toolsNotReady', 'nothingLeft', 'manyPieces', 'noProgram',
            'chainBroken', 'chainNoName', 'failed', 'notComputed', 'stale',
        ].forEach(status => {
            const text = ipsStatusText(status, ref);
            expect(text).toContain('OP10');
            expect(text.length).toBeGreaterThan(20);
        });
    });

    test('the two that are not about a named program do not pretend to be', () => {
        expect(ipsStatusText('noName', ref)).not.toContain('OP10');
        expect(ipsStatusText('notLathe', ref)).not.toContain('OP10');
    });

    test('an unknown status still says something, with the code in it', () => {
        expect(ipsStatusText('weird', ref)).toContain('weird');
        expect(ipsStatusText('weird', ref)).toContain('OP10');
    });

    test('a nameless reference does not print "undefined"', () => {
        expect(ipsStatusText('notFound', null)).not.toContain('undefined');
    });
});

describe('uniqueProgramNames', () => {
    const entries = (...names) => names.map(name => ({name, path: `/p/${name}.MPF`}));

    test('sorted, without duplicates', () => {
        // The same name can sit in the program's folder and in a machine
        // subroutine folder; the field takes a name, so it is offered once.
        expect(uniqueProgramNames(entries('OP20', 'BLANK', 'OP20', 'CONTOUR')))
            .toEqual(['BLANK', 'CONTOUR', 'OP20']);
    });

    test('the program itself is never offered', () => {
        // It cannot be its own blank, contour or stock source.
        expect(uniqueProgramNames(entries('OP10', 'OP20', 'BLANK'), 'OP20'))
            .toEqual(['BLANK', 'OP10']);
    });

    test('the exclusion is case-insensitive', () => {
        expect(uniqueProgramNames(entries('OP20', 'BLANK'), 'op20')).toEqual(['BLANK']);
    });

    test('nothing to offer is an empty list, not a throw', () => {
        expect(uniqueProgramNames([])).toEqual([]);
        expect(uniqueProgramNames(undefined)).toEqual([]);
        expect(uniqueProgramNames([null, {}, {name: ''}])).toEqual([]);
    });
});


// Placing a borrowed stock in the datum of the program that borrows it.
describe('placeStockElements', () => {
    // A bar from Z0 to Z-100, radius 50. X is a radius throughout.
    const bar = () => [
        {type: 'G0', X_start: 0, Y_start: 0, Z_start: 0, X: 0, Y: 0, Z: 0},
        {type: 'G1', X_start: 0, Y_start: 0, Z_start: 0, X: 50, Y: 0, Z: 0},
        {type: 'G1', X_start: 50, Y_start: 0, Z_start: 0, X: 50, Y: 0, Z: -100},
    ];

    test('no offset and no mirror hands back the very same array', () => {
        // The placement runs on every resolve, including every cache hit.
        const elements = bar();
        expect(placeStockElements(elements, {name: 'OP10'})).toBe(elements);
        expect(placeStockElements(elements, {name: 'OP10', trans: {}, mirror: []})).toBe(elements);
    });

    test('an offset moves both ends of every element', () => {
        const placed = placeStockElements(bar(), {name: 'OP10', trans: {Z: -120}});
        expect(placed[2].Z_start).toBe(-120);
        expect(placed[2].Z).toBe(-220);
        expect(placed[2].X).toBe(50);
    });

    test('a mirror negates the axis it names and nothing else', () => {
        const placed = placeStockElements(bar(), {name: 'OP10', mirror: ['Z']});
        // Adding the (zero) offset afterwards is also what keeps a mirrored
        // zero from coming back as -0.
        expect(placed[2].Z_start).toBe(0);
        expect(placed[2].Z).toBe(100);
        expect(placed[2].X).toBe(50);
    });

    test('a flip is a mirror and then the offset, in that order', () => {
        // The offset always means a move in THIS program's datum, whatever the
        // mirror does — the other order would make a mirror flip the meaning of
        // a number already typed.
        const placed = placeStockElements(bar(), {name: 'OP10', mirror: ['Z'], trans: {Z: -100}});
        expect(placed[2].Z_start).toBe(-100);
        expect(placed[2].Z).toBe(0);
    });

    test('X is not doubled — the offset acts on the side, as on the machine', () => {
        const placed = placeStockElements(bar(), {name: 'OP10', trans: {X: 5}});
        expect(placed[2].X).toBe(55);
        expect(placed[1].X).toBe(55);
    });

    test('an inch offset reaches the geometry in millimetres', () => {
        const placed = placeStockElements(bar(), {name: 'OP10', trans: {Z: -1}}, 25.4);
        expect(placed[2].Z_start).toBeCloseTo(-25.4, 9);
        expect(placed[2].Z).toBeCloseTo(-125.4, 9);
    });

    test('the mirror is never scaled by the units', () => {
        const placed = placeStockElements(bar(), {name: 'OP10', mirror: ['Z']}, 25.4);
        expect(placed[2].Z).toBe(100);
    });

    test('the type and the keys of an element survive, in order', () => {
        const placed = placeStockElements(bar(), {name: 'OP10', trans: {Z: 1}});
        expect(placed[0].type).toBe('G0');
        // Several places in this package read axes back with
        // `Object.keys(el).filter(...)`, which depends on insertion order.
        expect(Object.keys(placed[2])).toEqual(Object.keys(bar()[2]));
    });

    test('an axis the element does not carry is not invented', () => {
        const placed = placeStockElements([{type: 'G1', Z_start: 0, Z: -10}],
            {name: 'OP10', trans: {X: 5, Z: 1}});
        expect(placed[0].X).toBeUndefined();
        expect(placed[0].Z).toBe(-9);
    });

    test('nothing to place is not a failure', () => {
        expect(placeStockElements([], {name: 'OP10', trans: {Z: 1}})).toEqual([]);
        expect(placeStockElements(undefined, {name: 'OP10'})).toEqual([]);
    });
});

describe('ipsUnitMult', () => {
    test('the machine decides, not the program', () => {
        // Written in the machine's own units, so a G70 in the code cannot
        // change what a number in the auto-comment means.
        expect(ipsUnitMult({units: 'inch'})).toBe(25.4);
        expect(ipsUnitMult({units: 'metric'})).toBe(1);
        expect(ipsUnitMult({})).toBe(1);
        expect(ipsUnitMult(undefined)).toBe(1);
    });
});

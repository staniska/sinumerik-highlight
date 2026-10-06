// Tests for borrowing the global parse state around a shape-file mini-parse
// (lib/shapeParseState.js).
//
// `parseRows` writes only into the one global `parseData`, so loading a tool
// outline means pointing that object at a scratch canvas and putting it back
// afterwards. A field missed on the way out does not crash anything — it
// quietly corrupts the trajectory of the program being debugged: a TRANS that
// came from the tool file, a fillet carried over by `prevMove`, a plane left in
// G17 on a lathe. These tests are the reason the borrow lives in a module with
// no `View` import: the round-trip can then be checked field by field.

const {
    freshFrame,
    borrowParseState,
    returnParseState,
    isShapeGeometry,
    hasLeadingRapid,
    BORROWED_FIELDS,
    INHERITED_FIELDS,
} = require('../lib/shapeParseState');

// A parseData stand-in carrying every borrowed field with a recognisable
// value, plus the `plane` accessor that coordinates.js::clearAxesPos installs.
function makeParseData() {
    const pd = {
        canvas: ['program canvas'],
        frame: {
            trans:       {X: 11, Y: 22, Z: 33},
            mirror:      {X: -1, Y: 1, Z: 1},
            rot:         {X: 0, Y: 0, Z: 90},
            basis:       [[0, 1, 0], [1, 0, 0], [0, 0, 1]],
            invertBasis: [[0, 1, 0], [1, 0, 0], [0, 0, 1]],
        },
        axesPos: {X: 150, Y: 0, Z: -42},
        pole: {X: 1, Y: 2, Z: 3, AP: 4, RP: 5},
        prevMove: [{type: 'G1', RND: 2.5}],
        diamon: 1,
        diam90: 0,
        unitMult: 25.4,
        rndm: 1.5,
        transformation: {kind: 'mirror'},
        moveBeforeTransform: {type: 'G1'},
        moveGroup: 'G1',
        primitives: ['program primitive'],
        errors: [{text: 'pre-existing program error'}],
        elementIdCounter: 77,
        calledSubroutines: new Set(['SUB1']),
        currentBucket: 'MAIN_MPF',
        activeTool: 103,
        activeToolR: 0.4,
        toolRadiusCompensation: 'G41',
        offn: 0.2,
        spindleSpeed: {type: 'G96', value: 200, limit: 3000},
        feed: {type: 'G95', value: 0.25},

        variables: {MAIN_MPF: {R1: 5}},
        jumps: {MAIN_MPF: {goto: []}},
        mcall: {MAIN_MPF: undefined},
        contourElements: {CONTOUR_MPF: [{type: 'line'}]},
    };

    // Mirror of coordinates.js:16 — assigning `plane` must re-derive the three
    // dependent fields, which is why the restore does a plain re-assignment.
    Object.defineProperty(pd, 'plane', {
        configurable: true,
        set(plane) {
            const circleCenterAxes = {X: 'I', Y: 'J', Z: 'K'};
            this.planeStore = plane;
            this.planeAxes = ['X', 'Y', 'Z'];
            if (plane === 'G18') this.planeAxes = ['Z', 'X', 'Y'];
            if (plane === 'G19') this.planeAxes = ['Y', 'Z', 'X'];
            this.planeFirstAxes = [this.planeAxes[0], this.planeAxes[1]];
            this.planeCircleAxes = [circleCenterAxes[this.planeAxes[0]], circleCenterAxes[this.planeAxes[1]]];
        },
        get() {
            return this.planeStore;
        },
    });
    pd.plane = 'G18';

    return pd;
}

// Snapshot the whole object by value, so a later comparison catches a restore
// that handed back a mutated object instead of the original.
//
// Deliberately driven by the object's own keys rather than by BORROWED_FIELDS:
// snapshotting the list under test would make this blind to the one mistake it
// exists to catch — dropping a field from the list stops it being restored
// *and* stops it being checked. (Found by mutation: removing 'frame' from the
// list left this test green while the restore was genuinely broken.)
function snapshot(pd) {
    const keys = new Set([
        ...Object.keys(pd),
        'plane', 'planeAxes', 'planeFirstAxes', 'planeCircleAxes',
    ]);

    const out = {};
    keys.forEach(key => {
        out[key] = pd[key] instanceof Set
            ? new Set(pd[key])
            : JSON.parse(JSON.stringify(pd[key] ?? null));
    });
    return out;
}

const createCanvas = () => [];

// What a hostile section's G-code could do to every borrowed field.
function trashEverything(pd) {
    pd.canvas.push({type: 'G1', X: 1});
    pd.frame.trans = {X: 999, Y: 999, Z: 999};
    pd.frame.mirror = {X: -1, Y: -1, Z: -1};
    pd.axesPos = {X: 1, Y: 1, Z: 1};
    pd.pole = {X: 9, Y: 9, Z: 9, AP: 9, RP: 9};
    pd.prevMove = [{type: 'G2', CHR: 9}];
    pd.plane = 'G17';
    pd.diamon = 0;
    pd.diam90 = 1;
    pd.unitMult = 1;
    pd.rndm = 0;
    pd.transformation = {kind: 'scale'};
    pd.moveBeforeTransform = {type: 'G0'};
    pd.moveGroup = 'G0';
    pd.primitives.push('tool primitive');
    pd.errors.push({text: 'error from the tool file'});
    pd.elementIdCounter = 500;
    pd.calledSubroutines.add('TOOLSUB');
    pd.currentBucket = 'SHAPEFILE_1_0';
    pd.activeTool = 0;
    pd.activeToolR = 0;
    pd.toolRadiusCompensation = 'G42';
    pd.offn = 7;
    pd.spindleSpeed = {type: 'G97', value: 1, limit: 20000};
    pd.feed = {type: 'G94', value: 100};

    pd.variables.SHAPEFILE_1_0 = {R1: 1};
    pd.jumps.SHAPEFILE_1_0 = {goto: []};
    pd.mcall.SHAPEFILE_1_0 = undefined;
    pd.contourElements.SHAPEFILE_1_0 = [{type: 'line'}];
}

describe('the borrow is invisible to the program', () => {
    test('every borrowed field comes back as it was', () => {
        const pd = makeParseData();
        const before = snapshot(pd);

        const backup = borrowParseState(pd, createCanvas);
        trashEverything(pd);
        returnParseState(pd, backup, 'SHAPEFILE_1_0');

        expect(snapshot(pd)).toEqual(before);
    });

    test('objects come back by identity, not as copies', () => {
        // The program's canvas, errors and primitives arrays are held by
        // reference elsewhere (renderers, error display). Handing back an
        // equal-but-different array would silently detach them.
        const pd = makeParseData();
        const canvas = pd.canvas;
        const errors = pd.errors;
        const primitives = pd.primitives;
        const frame = pd.frame;

        const backup = borrowParseState(pd, createCanvas);
        trashEverything(pd);
        returnParseState(pd, backup, 'SHAPEFILE_1_0');

        expect(pd.canvas).toBe(canvas);
        expect(pd.errors).toBe(errors);
        expect(pd.primitives).toBe(primitives);
        expect(pd.frame).toBe(frame);
    });

    test('restoring plane re-derives the axes it governs', () => {
        const pd = makeParseData();

        const backup = borrowParseState(pd, createCanvas);
        pd.plane = 'G17';
        expect(pd.planeAxes).toEqual(['X', 'Y', 'Z']);   // the mini-parse moved it
        returnParseState(pd, backup, 'SHAPEFILE_1_0');

        expect(pd.plane).toBe('G18');
        expect(pd.planeAxes).toEqual(['Z', 'X', 'Y']);
        expect(pd.planeFirstAxes).toEqual(['Z', 'X']);
        expect(pd.planeCircleAxes).toEqual(['K', 'I']);
    });

    test('buckets the mini-parse created are dropped', () => {
        const pd = makeParseData();

        const backup = borrowParseState(pd, createCanvas);
        trashEverything(pd);
        returnParseState(pd, backup, 'SHAPEFILE_1_0');

        expect(pd.variables).not.toHaveProperty('SHAPEFILE_1_0');
        expect(pd.jumps).not.toHaveProperty('SHAPEFILE_1_0');
        expect(pd.mcall).not.toHaveProperty('SHAPEFILE_1_0');
        expect(pd.contourElements).not.toHaveProperty('SHAPEFILE_1_0');

        // ...and the program's own buckets are untouched.
        expect(pd.variables.MAIN_MPF).toEqual({R1: 5});
        expect(pd.contourElements.CONTOUR_MPF).toEqual([{type: 'line'}]);
    });

    test('BORROWED_FIELDS covers every field the seeding writes', () => {
        // Guards the one mistake this design cannot otherwise catch: seeding a
        // field without listing it, so it is set but never restored.
        const pd = makeParseData();
        const seeded = new Set();
        const watched = new Proxy(pd, {
            set(target, key, value) {
                seeded.add(key);
                target[key] = value;
                return true;
            },
        });

        borrowParseState(watched, createCanvas);

        const derived = new Set(['planeStore', 'planeAxes', 'planeFirstAxes', 'planeCircleAxes']);
        const unlisted = [...seeded].filter(k => !BORROWED_FIELDS.includes(k) && !derived.has(k));
        expect(unlisted).toEqual([]);
    });
});

describe('what the mini-parse starts from', () => {
    test('a scratch canvas, so the program keeps its own', () => {
        const pd = makeParseData();
        const canvas = pd.canvas;

        borrowParseState(pd, createCanvas);

        expect(pd.canvas).not.toBe(canvas);
        expect(pd.canvas).toEqual([]);
    });

    test('an identity frame: the file does not inherit TRANS or MIRROR', () => {
        // Zero in a tool file is the reference point P of the compensation
        // system. If the program had a TRANS active, inheriting it would move
        // the whole outline away from the path it rides on.
        const pd = makeParseData();

        borrowParseState(pd, createCanvas);

        expect(pd.frame).toEqual(freshFrame());
        expect(pd.axesPos).toEqual({X: 0, Y: 0, Z: 0});
    });

    test('no active compensation: a G41 in the program does not bend the outline', () => {
        const pd = makeParseData();
        expect(pd.toolRadiusCompensation).toBe('G41');

        borrowParseState(pd, createCanvas);

        expect(pd.toolRadiusCompensation).toBe('G40');
        expect(pd.offn).toBe(0);
    });

    test('no carried-over fillet state', () => {
        // A modal RND left in prevMove would round the first corner of the
        // tool outline against a move from the program.
        const pd = makeParseData();

        borrowParseState(pd, createCanvas);

        expect(pd.prevMove).toEqual([]);
    });

    test('own error list, so a bad file does not pollute the program', () => {
        const pd = makeParseData();

        borrowParseState(pd, createCanvas);

        expect(pd.errors).toEqual([]);
    });

    test('the caller can override an inherited field', () => {
        // A tool outline has no diametral meaning: its zero is the tip and its
        // dimensions are local, so inheriting `diamon` would make a 0.4 mm
        // nose radius have to be written X0.8. A fixture drawn in machine
        // coordinates wants the opposite, hence the per-call choice.
        const pd = makeParseData();
        expect(pd.diamon).toBe(1);

        const backup = borrowParseState(pd, createCanvas, {diamon: 0});

        expect(pd.diamon).toBe(0);
        expect(pd.plane).toBe('G18');     // untouched fields still inherit

        returnParseState(pd, backup, 'SHAPEFILE_1_0');
        expect(pd.diamon).toBe(1);        // and the program gets its mode back
    });

    test('an override of a non-inherited field is ignored', () => {
        // The reset fields are reset for a reason; `overrides` is not a back
        // door into them.
        const pd = makeParseData();

        borrowParseState(pd, createCanvas, {toolRadiusCompensation: 'G41', offn: 5});

        expect(pd.toolRadiusCompensation).toBe('G40');
        expect(pd.offn).toBe(0);
    });

    test('plane and diameter mode are inherited on purpose', () => {
        // This is what makes a lathe outline (G18, diametral X) line up with
        // the trajectory; resetting it to G17 would draw the tool flat in the
        // wrong plane.
        const pd = makeParseData();

        borrowParseState(pd, createCanvas);

        expect(pd.plane).toBe('G18');
        expect(pd.diamon).toBe(1);
        expect(pd.unitMult).toBe(25.4);
        INHERITED_FIELDS.forEach(key => expect(pd[key]).toBe(makeParseData()[key]));
    });
});

describe('selecting drawable geometry', () => {
    test('G0 and G1 are kept, everything else dropped', () => {
        expect(isShapeGeometry({type: 'G0'})).toBe(true);
        expect(isShapeGeometry({type: 'G1'})).toBe(true);

        // `transform` would render as a stray black edge across the outline.
        expect(isShapeGeometry({type: 'transform'})).toBe(false);
        expect(isShapeGeometry({type: 'msg'})).toBe(false);
        expect(isShapeGeometry({type: 'pause'})).toBe(false);
        expect(isShapeGeometry({type: 'G2'})).toBe(false);
        expect(isShapeGeometry(undefined)).toBe(false);
        expect(isShapeGeometry({})).toBe(false);
    });
});

describe('detecting the leading rapid', () => {
    test('a section opening with a rapid is recognised', () => {
        expect(hasLeadingRapid([{type: 'G0'}, {type: 'G1'}, {type: 'G1'}])).toBe(true);
    });

    test('a section opening with G1 is not', () => {
        // The caller drops nothing in this case. An unconditional .slice(1)
        // would thin such an outline by one edge.
        expect(hasLeadingRapid([{type: 'G1', id: 1}, {type: 'G1', id: 2}])).toBe(false);
    });

    test('only the first element is consulted', () => {
        // A rapid in the middle of a section stays: it is part of the drawing,
        // not an approach to it.
        expect(hasLeadingRapid([{type: 'G1'}, {type: 'G0'}])).toBe(false);
    });

    test('an empty section is not an error', () => {
        expect(hasLeadingRapid([])).toBe(false);
    });
});

const { frameSnapshot, recordFrameState, sameFrameState } = require('../lib/frameTable');

const identity = () => [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

// A frame as coordinates.js keeps it: one object, edited in place.
function makeFrame(trans = {X: 0, Y: 0, Z: 0}) {
    return {
        trans:       {...trans},
        mirror:      {X: 1, Y: 1, Z: 1},
        rot:         {X: 0, Y: 0, Z: 0},
        basis:       identity(),
        invertBasis: identity(),
    };
}

// Enough of parseData for the table: what the parse edits in place, and the
// table itself as parseDataClear leaves it.
function makeParseData(frame = makeFrame()) {
    return {
        frame,
        diamon: 1,
        diam90: 0,
        unitMult: 1,
        frames: [],
        frameId: 0,
        frameDirty: true,
    };
}

describe('frameSnapshot', () => {
    test('keeps the frame shape, so it can be passed to getCoordinatesInFrame', () => {
        const snap = frameSnapshot(makeFrame({X: 11, Y: 22, Z: 33}), 1, 0, 25.4);

        expect(snap.trans).toEqual({X: 11, Y: 22, Z: 33});
        expect(snap.basis).toEqual(identity());
        expect(snap.invertBasis).toEqual(identity());
        expect(snap.mirror).toEqual({X: 1, Y: 1, Z: 1});
    });

    test('carries the modal state the display of a coordinate depends on', () => {
        const snap = frameSnapshot(makeFrame(), 1, 1, 25.4);

        expect(snap.diamon).toBe(1);
        expect(snap.diam90).toBe(1);
        expect(snap.unitMult).toBe(25.4);
    });

    // The whole point of a snapshot: generateFrame edits the frame in place, so
    // an entry holding it by reference would silently follow the parse to the
    // end of the program and every rewound position would read the last frame.
    test('is detached from the frame it was taken of', () => {
        const frame = makeFrame({X: 11, Y: 0, Z: 0});
        const snap = frameSnapshot(frame, 0, 0, 1);

        frame.trans.X = 999;
        frame.mirror.X = -1;
        frame.basis[0][1] = 7;
        frame.invertBasis[2][2] = 7;

        expect(snap.trans.X).toBe(11);
        expect(snap.mirror.X).toBe(1);
        expect(snap.basis).toEqual(identity());
        expect(snap.invertBasis).toEqual(identity());
    });
});

describe('recordFrameState', () => {
    test('the first element gets an entry even though nothing is dirty', () => {
        const pd = makeParseData();
        pd.frameDirty = false;

        expect(recordFrameState(pd)).toBe(0);
        expect(pd.frames.length).toBe(1);
    });

    test('elements under one frame share its entry', () => {
        const pd = makeParseData();

        expect(recordFrameState(pd)).toBe(0);
        expect(recordFrameState(pd)).toBe(0);
        expect(recordFrameState(pd)).toBe(0);
        expect(pd.frames.length).toBe(1);
    });

    test('a frame change gives the elements after it a new entry', () => {
        const pd = makeParseData();
        recordFrameState(pd);

        // What generateFrame does: edit in place, then mark.
        pd.frame.trans.X = 100;
        pd.frameDirty = true;

        expect(recordFrameState(pd)).toBe(1);
        expect(recordFrameState(pd)).toBe(1);
        expect(pd.frames.length).toBe(2);
        expect(pd.frames[0].trans.X).toBe(0);
        expect(pd.frames[1].trans.X).toBe(100);
    });

    test('a diameter or unit change gives a new entry on its own', () => {
        const pd = makeParseData();
        recordFrameState(pd);

        pd.diamon = 0;
        pd.frameDirty = true;
        expect(recordFrameState(pd)).toBe(1);

        pd.unitMult = 25.4;
        pd.frameDirty = true;
        expect(recordFrameState(pd)).toBe(2);

        expect(pd.frames.map(f => [f.diamon, f.unitMult]))
            .toEqual([[1, 1], [0, 1], [0, 25.4]]);
    });

    // A DIAMON is modal and legal to restate in every block; the flag is what
    // keeps that from filling the table with thousands of identical entries.
    test('restating the state without marking it adds nothing', () => {
        const pd = makeParseData();
        for (let i = 0; i < 50; i++) {
            pd.diamon = 1;
            recordFrameState(pd);
        }
        expect(pd.frames.length).toBe(1);
    });

    // clearAxesPos marks the table after each shape is read, having just set
    // the diameter mode and the unit back to the machine's own — which usually
    // is what they already were. Taken at face value that left the table with
    // consecutive identical entries, seen on a real program: three entries, of
    // which the last two read a coordinate exactly alike.
    test('a mark that changed nothing does not add an entry', () => {
        const pd = makeParseData();
        recordFrameState(pd);

        pd.frameDirty = true;
        expect(recordFrameState(pd)).toBe(0);

        pd.frameDirty = true;
        expect(recordFrameState(pd)).toBe(0);

        expect(pd.frames.length).toBe(1);
    });

    // Only consecutive duplicates collapse: the table is a timeline, and coming
    // back to a frame the program used earlier is a change like any other.
    test('returning to an earlier state is its own entry', () => {
        const pd = makeParseData();
        recordFrameState(pd);

        pd.frame.trans.Z = -2;
        pd.frameDirty = true;
        expect(recordFrameState(pd)).toBe(1);

        pd.frame.trans.Z = 0;
        pd.frameDirty = true;
        expect(recordFrameState(pd)).toBe(2);

        expect(pd.frames.map(f => f.trans.Z)).toEqual([0, -2, 0]);
    });

    test('a frame set and replaced before anything is cut costs one entry', () => {
        const pd = makeParseData();

        pd.frame.trans.X = 50;
        pd.frameDirty = true;
        pd.frame.trans.X = 100;
        pd.frameDirty = true;

        expect(recordFrameState(pd)).toBe(0);
        expect(pd.frames.length).toBe(1);
        expect(pd.frames[0].trans.X).toBe(100);
    });
});

describe('sameFrameState', () => {
    const state = (over = {}) => ({
        trans: {X: 0, Y: 0, Z: 0}, mirror: {X: 1, Y: 1, Z: 1}, rot: {X: 0, Y: 0, Z: 0},
        basis: identity(), invertBasis: identity(),
        diamon: 1, diam90: 0, unitMult: 1, ...over,
    });

    test('two untouched states read a coordinate alike', () => {
        expect(sameFrameState(state(), state())).toBe(true);
    });

    test('every part of the state is looked at', () => {
        const differs = [
            {trans: {X: 0, Y: 0, Z: -2}},
            {mirror: {X: -1, Y: 1, Z: 1}},
            {rot: {X: 0, Y: 0, Z: 90}},
            {basis: [[0, 1, 0], [1, 0, 0], [0, 0, 1]]},
            {invertBasis: [[0, 1, 0], [1, 0, 0], [0, 0, 1]]},
            {diamon: 0},
            {diam90: 1},
            {unitMult: 25.4},
        ];
        differs.forEach(over => expect(sameFrameState(state(), state(over))).toBe(false));
    });
});

// Frame words and the active mirror.
//
// Two rules live here, and both were wrong in the same place — the tokenizer
// multiplied every frame word's value by the live mirror, per axis, whatever
// `additive` said:
//
//   * a non-additive word replaces the frame, so the mirror it is about to
//     discard must not touch its value;
//   * an additive rotation flips with the mirrors of the PLANE it turns in, not
//     with the mirror of the axis it turns about.
//
// The whole path is exercised — `generatePrimitives` tokenizing a real block,
// then the real `generateFrame` and `generateBasis` — because the bug was in the
// split of work between the two, which neither of them shows on its own.

jest.mock('../lib/sinumerik', () => ({
    __esModule: true,
    default: {
        sinumerikView: {
            parseData: {},
            singleLineDebugData: {machine: {firstSpindle: {name: 'C'}}},
            singleLineDebugHelpDiv: {C_As_Rot: {input: {checked: false}}},
            programmData: {'/test/test.mpf': {machine: {machineType: 'Lathe', machineName: 'test'}, contour: {name: ''}}},
            singleLineDebugContourDiv: {contourDuplicate: {checked: false}},
            singleLineDebugBlankDiv: {blankDuplicate: {checked: false}},
        }
    }
}));

// Enough of a `mathParse` for the `=` forms; `null` on anything it cannot read,
// as the real one does.
jest.mock('../lib/mathParser', () => ({
    mathParse: jest.fn((str) => {
        const value = parseFloat(str);
        return Number.isNaN(value) ? null : value;
    }),
    checkCondition: jest.fn(),
    calcValue: jest.fn(),
    getExpressionInBrackets: jest.fn(),
}));

jest.mock('../lib/stringParse', () => ({__esModule: true, default: jest.fn((str) => str)}));

jest.mock('../lib/element-insert', () => ({
    insertChr: jest.fn(), insertRnd: jest.fn(), insertRndArcArc: jest.fn(),
}));

global.atom = {
    workspace: {getActiveTextEditor: () => ({getTitle: () => 'test.mpf', getPath: () => '/test/test.mpf'})}
};

const {generatePrimitives} = require('../lib/primitives');

let View;

const block = async (...rows) => {
    for (const row of rows) {
        await generatePrimitives(row, 'PROG', 0, [], jest.fn());
    }
};

const frame = () => View.sinumerikView.parseData.frame;

const DEG = Math.PI / 180;
const rotZ = (a) => [[Math.cos(a * DEG), -Math.sin(a * DEG), 0], [Math.sin(a * DEG), Math.cos(a * DEG), 0], [0, 0, 1]];
const rotY = (a) => [[Math.cos(a * DEG), 0, Math.sin(a * DEG)], [0, 1, 0], [-Math.sin(a * DEG), 0, Math.cos(a * DEG)]];
const rotX = (a) => [[1, 0, 0], [0, Math.cos(a * DEG), -Math.sin(a * DEG)], [0, Math.sin(a * DEG), Math.cos(a * DEG)]];
const IDENTITY = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

const expectMatrix = (actual, expected) => {
    actual.forEach((row, i) => row.forEach((v, j) => expect(v).toBeCloseTo(expected[i][j], 9)));
};

beforeEach(() => {
    View = require('../lib/sinumerik').default;
    View.sinumerikView.parseData = {
        filename: '/test/test.mpf',
        errors: [],
        variables: {firstChannelVariables: {}, PROG: {}},
        subroutines: [],
        diamon: 0, diam90: 0, unitMult: 1,
        transformation: null, mcall: {}, auxAxes: [],
        frame: {
            mirror: {X: 1, Y: 1, Z: 1},
            trans: {X: 0, Y: 0, Z: 0},
            rot: {X: 0, Y: 0, Z: 0},
            basis: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
            invertBasis: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
        },
        // A lathe, so G18: the plane the rotation that matters turns in.
        planeAxes: ['Z', 'X', 'Y'], planeFirstAxes: ['Z', 'X'], planeCircleAxes: ['K', 'I'],
        axesPos: {X: 0, Y: 0, Z: 0}, pole: {X: 0, Y: 0, Z: 0, AP: 0, RP: 0},
        prevMove: [], canvas: [], elementIdCounter: 0,
        contourElements: {PROG: []}, currentBucket: 'PROG',
        moveGroup: '', rndm: 0, frames: [], frameId: 0,
    };
});

describe('a non-additive frame word ignores the mirror it replaces', () => {
    // The reported case: a program mirrors in Z and calls a subroutine that
    // translates in Z. The subroutine's `TRANS` clears the mirror — that part is
    // the control's own behaviour — but the offset is its own number, and used
    // to come out negated, i.e. as the frame of `TRANS Z-60`.
    test('MIRROR Z0 then TRANS Z60 translates by +60', async () => {
        await block('MIRROR Z0', 'TRANS Z60');
        expect(frame().trans).toEqual({X: 0, Y: 0, Z: 60});
        expect(frame().mirror).toEqual({X: 1, Y: 1, Z: 1});
    });

    test('the inch machine gets the same offset, not the same error times 25.4', async () => {
        View.sinumerikView.parseData.unitMult = 25.4;
        await block('MIRROR Z0', 'TRANS Z60');
        expect(frame().trans.Z).toBeCloseTo(1524, 9);
    });

    test('MIRROR Z0 then ROT Z90 turns the way it says', async () => {
        await block('MIRROR Z0', 'ROT Z90');
        expectMatrix(frame().invertBasis, rotZ(90));
        expect(frame().mirror).toEqual({X: 1, Y: 1, Z: 1});
    });

    // Order-dependence was what hid the bug: a `ROT` between the two cleared the
    // mirror, and the very same `TRANS` then came out right.
    test('a ROT in between never mattered, and still does not', async () => {
        await block('MIRROR Z0', 'ROT Z90', 'TRANS Z60');
        expect(frame().trans.Z).toBeCloseTo(60, 9);
    });
});

describe('an additive frame word is read in the mirrored axes', () => {
    test('MIRROR Z0 then ATRANS Z60 translates by -60 and keeps the mirror', async () => {
        await block('MIRROR Z0', 'ATRANS Z60');
        expect(frame().trans.Z).toBeCloseTo(-60, 9);
        expect(frame().mirror).toEqual({X: 1, Y: 1, Z: -1});
    });

    // The offset a chained translation lands on is F_old applied to its own
    // vector, and F_old here is MIRROR X followed by AROT Z90 — on the control,
    // M . Rz(90), which takes (10, 0, 0) to (0, 10, 0).
    //
    // The parser gets there by a different route, because it keeps the mirror
    // out of the basis: the delta is mirrored componentwise to (-10, 0, 0) and
    // then turned by what the basis holds, which the plane rule above makes
    // Rz(-90) — and arrives at the same (0, 10, 0). The two agreeing is the
    // check: the rotation's sign and the translation's mirror have to compose
    // into the control's own chaining, or one of them is wrong.
    test('the mirror and the rotation compose the way the control chains them', async () => {
        await block('MIRROR X0', 'AROT Z90', 'ATRANS X10');
        expect(frame().trans.X).toBeCloseTo(0, 9);
        expect(frame().trans.Y).toBeCloseTo(10, 9);
    });
});

describe('a rotation flips with the plane it turns in, not with its own axis', () => {
    test('MIRROR Z0 then AROT Z90 does not flip: Z is not in the XY plane', async () => {
        await block('MIRROR Z0', 'AROT Z90');
        expectMatrix(frame().invertBasis, rotZ(90));
    });

    test('MIRROR X0 then AROT Z90 flips: X is one of the two XY axes', async () => {
        await block('MIRROR X0', 'AROT Z90');
        expectMatrix(frame().invertBasis, rotZ(-90));
    });

    // The one that matters on a lathe: G18 is the ZX plane, and a mirror along
    // the spindle is the ordinary way to turn the part round.
    test('MIRROR Z0 then AROT Y90 flips: Z is one of the two ZX axes', async () => {
        await block('MIRROR Z0', 'AROT Y90');
        expectMatrix(frame().invertBasis, rotY(-90));
    });

    test('MIRROR X0 then AROT X90 does not flip', async () => {
        await block('MIRROR X0', 'AROT X90');
        expectMatrix(frame().invertBasis, rotX(90));
    });

    test('two mirrors in the plane cancel each other', async () => {
        await block('MIRROR X0', 'AMIRROR Y0', 'AROT Z90');
        expect(frame().mirror).toEqual({X: -1, Y: -1, Z: 1});
        expectMatrix(frame().invertBasis, rotZ(90));
    });

    test('a mirror in the plane and one outside it flips once', async () => {
        await block('MIRROR X0', 'AMIRROR Z0', 'AROT Z90');
        expectMatrix(frame().invertBasis, rotZ(-90));
    });
});

describe('what the frame words did right before, and still do', () => {
    test('ATRANS accumulates', async () => {
        await block('TRANS Z60', 'ATRANS Z10');
        expect(frame().trans.Z).toBeCloseTo(70, 9);
    });

    test('an additive translation under a rotation is rotated into the base', async () => {
        await block('ROT Z90', 'ATRANS X10');
        expect(frame().trans.X).toBeCloseTo(0, 9);
        expect(frame().trans.Y).toBeCloseTo(10, 9);
    });

    test('a non-additive word clears every component of the frame', async () => {
        await block('MIRROR Z0', 'ROT Z90', 'ATRANS X10', 'TRANS Z5');
        expect(frame().trans).toEqual({X: 0, Y: 0, Z: 5});
        expect(frame().mirror).toEqual({X: 1, Y: 1, Z: 1});
        expectMatrix(frame().invertBasis, IDENTITY);
    });

    test('a bare TRANS deactivates the frame', async () => {
        await block('MIRROR Z0', 'ATRANS Z60', 'TRANS');
        expect(frame().trans).toEqual({X: 0, Y: 0, Z: 0});
        expect(frame().mirror).toEqual({X: 1, Y: 1, Z: 1});
    });

    test('AMIRROR twice is no mirror', async () => {
        await block('AMIRROR Z0', 'AMIRROR Z0');
        expect(frame().mirror).toEqual({X: 1, Y: 1, Z: 1});
    });

    test('the rotation order is Z, then Y, then X', async () => {
        await block('ROT X90 Y90 Z90');
        const {matrixProduct} = new (require('../lib/degreesMath').default)();
        expectMatrix(frame().invertBasis,
            matrixProduct(rotX(90), matrixProduct(rotY(90), rotZ(90))));
    });

    // `ROT Z0` arrives from the tokenizer as the string '0', and only the
    // multiplication that used to happen there made a number of it. A string
    // '0' is truthy, so without the `parseFloat` now in `generateFrame` the
    // zero would have built a rotation matrix out of a string.
    test('ROT Z0 is no rotation', async () => {
        await block('ROT Z0');
        expectMatrix(frame().invertBasis, IDENTITY);
        expect(frame().trans).toEqual({X: 0, Y: 0, Z: 0});
    });

    test('a frame axis the frame cannot carry is still an error', async () => {
        await block('TRANS U10');
        expect(View.sinumerikView.parseData.errors.map(e => e.text))
            .toEqual([expect.stringContaining('Error in TRANS')]);
        expect(frame().trans).toEqual({X: 0, Y: 0, Z: 0});
    });
});

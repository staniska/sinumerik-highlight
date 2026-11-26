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

describe('indexed and transformed lathe motion', () => {
    const {generateCanvasPrimitives} = require('../lib/primitives');
    const {getCoordinatesInFrame} = require('../lib/coordinates');
    const {updateTransmitAngle} = require('../lib/rotaryAxes');
    const {recordFrameState} = require('../lib/frameTable');

    beforeEach(() => {
        const view = View.sinumerikView;
        const pd = view.parseData;
        view.singleLineDebugHelpDiv.C_As_Rot.input.checked = true;
        view.programmData[pd.filename].machine.firstSpindle = {name: 'C4', num: '4'};
        Object.assign(pd, {auxPos: {}, rotaryAngles: {}, moveGroup: 'G0', frameDirty: true});
        pd.canvas.push = element => {
            element.frameId = recordFrameState(pd);
            updateTransmitAngle(pd, view.programmData[pd.filename].machine, element);
            return Array.prototype.push.call(pd.canvas, element);
        };
    });

    afterEach(() => {
        View.sinumerikView.singleLineDebugHelpDiv.C_As_Rot.input.checked = false;
        delete View.sinumerikView.programmData['/test/test.mpf'].machine.firstSpindle;
    });

    async function run(...rows) {
        for (const row of rows) {
            const primitive = await generatePrimitives(row, 'PROG', 0, rows, jest.fn());
            generateCanvasPrimitives(primitive, 'PROG', 0);
        }
    }

    const state = () => View.sinumerikView.parseData;
    const end = () => state().canvas.at(-1);
    const xy = (p, x, y) => {
        expect(p.X).toBeCloseTo(x, 5);
        expect(p.Y).toBeCloseTo(y, 5);
    };

    test('the drilling centre survives TRANS and stays fixed under AROT', async () => {
        await run('G0 X0 Y0 Z10', 'G0 C4=22', 'SETMS(1)', 'G0 X60 Y0');
        const centre = [60 * Math.cos(22 * DEG), 60 * Math.sin(22 * DEG)];
        xy(end(), ...centre);
        await run('TRANS X60 Y0', 'AROT Z18', 'G1 X10 Y0');
        xy(end(), centre[0] + 10 * Math.cos(40 * DEG), centre[1] + 10 * Math.sin(40 * DEG));
        await run('G1 X0 Y0');
        const local = end();
        xy(local, ...centre);
        await run('TRANS', 'G1 X60 Y0');
        xy(end(), ...centre);
        expect(getCoordinatesInFrame(local, state().frames[local.frameId])[0]).toBeCloseTo(0);
        expect(getCoordinatesInFrame(end(), state().frames[end().frameId])[0]).toBeCloseTo(60);
    });

    test('an indexed axis preserves omitted Y and explicit X, and reads IC in degrees', async () => {
        await run('G0 X40 Y7', 'G0 C4=22', 'G0 C4=IC(5) X30');
        expect(state().auxPos.C4).toBe(27);
        const point = getCoordinatesInFrame(end());
        expect(point[0]).toBeCloseTo(30);
        expect(point[1]).toBeCloseTo(7);
        await run('G0 C4=AC(17)');
        expect(state().auxPos.C4).toBe(17);
    });

    test('chooses the explicit or master spindle and preserves the program frame on reset', async () => {
        await run('G0 C4=22', 'SETMS(1)', 'SPCON(4)', 'SPCOF', 'TRANS X60');
        expect(state().masterSpindleNum).toBe(1);
        expect(state().auxPos.C4).toBe(22);
        const length = state().canvas.length;
        await run('N10 SPCOF(1, 4)');
        expect(state().auxPos.C4).toBe(0);
        expect(frame().trans.X).toBe(60);
        expect(state().canvas).toHaveLength(length);
        await run('G0 C4=22', 'SETMS');
        expect(state().masterSpindleNum).toBe(4);
        expect(state().auxPos.C4).toBe(0);
    });

    test('an invalid spindle list has no partial effect', async () => {
        await run('G0 C4=22', 'SETMS(1)', 'SPCOF(4, WRONG)');
        expect(state().auxPos.C4).toBe(22);
        expect(state().masterSpindleNum).toBe(1);
        expect(state().errors).toEqual(expect.arrayContaining([expect.objectContaining({text: expect.stringContaining('Invalid SPCOF')})]));
    });

    test('TRAFOOF keeps the point, the physical C4 and the motion group', async () => {
        await run('G0 X0 Y0', 'G0 C4=22', 'TRANSMIT', 'TRANS X30', 'G1 X0 Y40');
        const point = end();
        xy(point, 30, 40);
        expect(point.C4).toBeCloseTo(53.130102, 5);
        const length = state().canvas.length;
        await run('TRAFOOF');
        expect(state().canvas).toHaveLength(length);
        xy(state().axesPos, 30, 40);
        expect(state().moveGroup).toBe('G1');
        await run('TRANS', 'Z1');
        xy(end(), 30, 40);
        expect(getCoordinatesInFrame(end())[0]).toBeCloseTo(50);
        expect(getCoordinatesInFrame(end())[1]).toBeCloseTo(0);
    });

    test('full TRANSMIT circle tracks physical C across the wrap', async () => {
        Object.assign(state(), {plane: 'G17', planeAxes: ['X', 'Y', 'Z'], planeFirstAxes: ['X', 'Y'], planeCircleAxes: ['I', 'J']});
        await run('G0 X10 Y0', 'TRANSMIT', 'G3 I-10 J0');
        xy(end(), 10, 0);
        expect(end().C4).toBeCloseTo(360);
    });

    test('a circle about an off-axis pole oscillates rather than turning C a full revolution', async () => {
        Object.assign(state(), {plane: 'G17', planeAxes: ['X', 'Y', 'Z'], planeFirstAxes: ['X', 'Y'], planeCircleAxes: ['I', 'J']});
        await run('G0 X70 Y0', 'TRANSMIT', 'G3 I-10 J0 TURN=5');
        xy(end(), 70, 0);
        expect(end().C4).toBeCloseTo(0);
        for (const element of state().canvas.filter(el => el.transmitAxis)) {
            expect(Math.abs(element.C4)).toBeLessThan(10);
        }
    });

    test('TRANSMIT uses radial X under DIAMON and retains the angle at the centre', async () => {
        state().diamon = 1;
        await run('G0 X0 Y0', 'TRANSMIT', 'G1 X60 Y40', 'G1 X0 Y0', 'TRAFOOF');
        expect(state().auxPos.C4).toBeCloseTo(53.130102, 5);
        xy(state().axesPos, 0, 0);
    });

    test('indexing after an arc creates no cutting segment and keeps the modal motion', async () => {
        Object.assign(state(), {plane: 'G17', planeAxes: ['X', 'Y', 'Z'], planeFirstAxes: ['X', 'Y'], planeCircleAxes: ['I', 'J']});
        await run('G0 X10 Y0', 'G3 I-10 J0', 'C4=90');
        expect(state().moveGroup).toBe('G3');
        expect(end().type).toBe('transform');
        xy(end(), 0, 10);
    });

    test.each([0, 90, 180, 270])('ANG/RND in indexed G18 at C=%i stays in the offset machining plane', async angle => {
        const {insertRnd} = require('../lib/element-insert');
        insertRnd.mockImplementation(jest.requireActual('../lib/element-insert').insertRnd);
        Object.assign(state(), {plane: 'G18', diamon: 1});
        try {
            await run('G0 C4=' + angle, 'G0 X136 Y1.6 Z-20');
            const first = state().canvas.length;
            await run('G1 X136.6 ANG=173 RND=10', 'G1 Z-127.85', 'G3 I-10 K0 AR=45', 'G1 Z-140 ANG=-135');
            const path = state().canvas.slice(first);
            expect(path.length).toBeGreaterThan(30);
            let previous = state().canvas[first - 1];
            for (const el of path) {
                for (const axis of ['X', 'Y', 'Z']) expect(el[axis + '_start']).toBeCloseTo(previous[axis], 6);
                expect(getCoordinatesInFrame(el)[1]).toBeCloseTo(1.6, 6);
                previous = el;
            }
            expect(state().errors).toEqual([]);
        } finally {
            insertRnd.mockReset();
        }
    });

    test('G64 in the setup block allows G17 polar moves and the later G19 switch', async () => {
        const pd = state();
        require('../lib/coordinates').clearAxesPos(pd.filename);
        pd.plane = 'G18';
        pd.diamon = 0;
        await run('TRANSMIT', 'G54 G90 G64 SOFT G17', 'ROT Z359.33', 'G111 X0 Y0',
            'G0 AP=-30 RP=55 Z100');
        expect(pd.plane).toBe('G17');
        const azimuth = (359.33 - 30) * DEG;
        xy(end(), 55 * Math.cos(azimuth), 55 * Math.sin(azimuth));
        expect(end().Z).toBe(100);
        await run('Z-2.7', 'G1 AP=-18.5', 'RP=42.75', 'G2 AP=-71.5');
        expect(Math.hypot(end().X, end().Y)).toBeCloseTo(42.75);
        expect(end().Z).toBeCloseTo(-2.7);
        await run('TRAFOOF', 'G54 G90 G64 SOFT G19');
        expect(pd.planeFirstAxes).toEqual(['Y', 'Z']);
    });

    test('combined A and B follow the A-then-B convention', async () => {
        await run('G0 A90 B90', 'G1 X0 Y1 Z0');
        expect(end().X).toBeCloseTo(1);
        expect(end().Y).toBeCloseTo(0);
        expect(end().Z).toBeCloseTo(0);
    });

    test('linear interpolation with simultaneous C motion preserves the radius', async () => {
        await run('G0 X10 Y0 Z0', 'G1 Z10 C4=90');
        const middle = state().canvas.find(el => Math.abs(el.Z - 5) < 0.12);
        expect(Math.hypot(middle.X, middle.Y)).toBeCloseTo(10);
        expect(Math.abs(middle.C4 - 45)).toBeLessThanOrEqual(1);
        xy(end(), 0, 10);
    });
});

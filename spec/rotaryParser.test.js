jest.mock('../lib/sinumerik', () => ({__esModule: true, default: {sinumerikView: {}}}));
jest.mock('../lib/3d_view/view', () => ({select2DView: jest.fn()}));

const View = require('../lib/sinumerik').default;
const {runBoundingContourParse} = require('../lib/interpretator');
const {freshFrame} = require('../lib/shapeParseState');
const {rotaryMatrix} = require('../lib/rotaryAxes');

afterEach(() => { delete globalThis.atom; });

test('the real row parser preserves the indexed drilling centre and restores the caller after a contour parse', async () => {
    const filename = '/test/turn.mpf';
    const source = '/test/face.spf';
    const machine = {machineType: 'Lathe', firstSpindle: {name: 'C4', num: '4'}};
    const rows = [
        'DIAMOF', 'G0 X0 Y0 Z10', 'R1=$AA_IW[C4]+22', 'G0 C4=R1', 'SETMS(1)',
        'G0 X60 Y0', 'TRANS X60 Y0', 'AROT Z18', 'G1 X10 Y0', 'G1 X0 Y0',
        'TRANS', 'G1 X60 Y0', 'SPCOF', 'TRANSMIT', 'G1 X30 Y40', 'TRAFOOF', 'G1 Z20'
    ];
    const text = [';BOUNDING_CONTOUR_BEGIN', ...rows.map(row => ';' + row), ';BOUNDING_CONTOUR_END'].join('\n');
    globalThis.atom = {workspace: {getTextEditors: () => [{getPath: () => source, getText: () => text}]}};
    const callerFrame = {...freshFrame(), rotary: rotaryMatrix({C: 10})};
    const pd = {
        filename, frame: callerFrame, frames: [], frameId: 0, frameDirty: true, canvas: [],
        rotaryAngles: {C: 10}, masterSpindleNum: 4, auxAxes: ['C4'], auxPos: {C4: 10},
        plane: 'G17', planeAxes: ['X', 'Y', 'Z'], planeFirstAxes: ['X', 'Y'], planeCircleAxes: ['I', 'J'],
        axesPos: {X: 0, Y: 0, Z: 0}, prevMove: [], moveGroup: '', transformation: null,
        diamon: 0, diam90: 0, unitMult: 1, elementIdCounter: 0, contourElements: {}, subroutines: [],
        variables: {firstChannelVariables: {}}, jumps: {}, primitives: [], errors: [], mcall: {},
    };
    View.sinumerikView = {
        parseData: pd, programmData: {[filename]: {machine}}, singleLineDebugData: {machine},
        singleLineDebugHelpDiv: {C_As_Rot: {input: {checked: true}}},
    };
    const bucket = await runBoundingContourParse({
        subName: 'FACE', subPath: source, callRow: 0,
        snapshot: {
            axesPos: {X: 0, Y: 0, Z: 0}, variables: {},
            rotaryState: {frame: freshFrame(), rotaryAngles: {}, auxAxes: [], auxPos: {}, masterSpindleNum: 4},
        },
    });
    expect(pd.errors).toEqual([]);
    const ends = pd.contourElements[bucket].map(element => element.end);
    const radii = ends.filter(([x, y]) => Math.abs(Math.hypot(x, y) - 60) < 1e-4);
    expect(radii).toHaveLength(3);
    for (const [x, y] of radii) {
        expect(x).toBeCloseTo(55.631031, 5);
        expect(y).toBeCloseTo(22.476396, 5);
    }
    const [x, y, z] = ends.at(-1);
    expect(x).toBeCloseTo(30);
    expect(y).toBeCloseTo(40);
    expect(z).toBeCloseTo(20);
    expect(pd.frame).toBe(callerFrame);
    expect(pd.auxPos).toEqual({C4: 10});
    expect(pd.masterSpindleNum).toBe(4);
});

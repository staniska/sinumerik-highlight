// Regression test for the infinite recursion in clarifyElementsChangePoint
// (turning.js) that overflowed the JS stack on a valid self-overlapping lathe
// contour. See the JOPA.MPF contour: a rectilinear profile (id0..id4) capped by
// a diagonal (id5) whose ends hang outside the machining region.

const FRAME = {
    x: 'Z',
    y: 'X',
    plane: {abscissa: {name: 'X', reverse: false}, ordinate: {name: 'Z', reverse: false}},
    diamonAx: 'X',
}

jest.mock('../lib/sinumerik', () => ({
    __esModule: true,
    default: {sinumerikView: {contourEditData: {points: {}}}},
}));

jest.mock('../lib/contourEdit/canvas', () => ({
    getFrame: jest.fn(() => FRAME),
    isNumber: (...args) => args.every(v => Number.isFinite(v)),
    updateArcProperties: jest.fn(),
    draw: jest.fn(),
}));

jest.mock('../lib/contourEdit/contourEditMain', () => ({
    getDistance: (p1, p2) => Math.sqrt((p1.Z - p2.Z) ** 2 + (p1.X - p2.X) ** 2),
}));

jest.mock('../lib/contourEdit/tools/canvasArea', () => ({
    createRoundedPointsObj: jest.fn(),
}));

jest.mock('../lib/dialog/confirm', () => ({confirmDialog: jest.fn(() => false)}), {virtual: true});
jest.mock('../lib/createElement', () => ({create_element: jest.fn(() => ({}))}), {virtual: true});

const {detectProcessingPoints, getContourRange} = require('../lib/contourEdit/tools/turning');

// Exact burnedContour from the console log that caused the crash.
const contour = [
    {"id":0,"type":"line","start":{"Z":1624,"X":239},"end":{"Z":1624,"X":313}},
    {"id":1,"type":"line","start":{"Z":1624,"X":313},"end":{"Z":1585,"X":313}},
    {"id":2,"type":"line","start":{"Z":1585,"X":313},"end":{"Z":1585,"X":387}},
    {"id":3,"type":"line","start":{"Z":1585,"X":387},"end":{"Z":1520,"X":387}},
    {"id":4,"type":"line","start":{"Z":1520,"X":387},"end":{"Z":1520,"X":276.852904363685}},
    {"id":5,"start":{"Z":1520,"X":276.852904363685},"end":{"Z":1624,"X":239},"type":"line","ang":-0.3490658503988657},
]

describe('turning detectProcessingPoints on self-overlapping contour', () => {
    const cRange = getContourRange(contour)

    // The exact combination from the crash report: ax=X, direction=-1 (vertical).
    // Exercise all four combinations — the crash must not reproduce on any.
    for (const ax of ['Z', 'X']) {
        for (const dirVal of [1, -1]) {
            const axis = ax === 'Z' ? 'horizontal' : 'vertical'
            // direction.direction is a string in the real event handler (event.target.value).
            const direction = {axis, direction: String(dirVal)}
            test(`ax=${ax} direction=${dirVal} does not overflow`, () => {
                const View = require('../lib/sinumerik').default
                View.sinumerikView.contourEditData.points = {}
                expect(() =>
                    detectProcessingPoints(cRange, direction, ax, contour)
                ).not.toThrow()
            })
        }
    }
})

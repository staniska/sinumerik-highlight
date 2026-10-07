// Wiring RND between two arcs into the canvas (lib/element-insert.js
// insertRndArcArc). The geometry itself is proved in spec/arcFilletMath.test.js;
// what is checked here is everything around it — which coordinate system each
// value is in, what the canvas ends up holding, and that a joint the fillet
// cannot take leaves the old behaviour alone.

jest.mock('../lib/sinumerik', () => ({
    __esModule: true,
    default: {
        sinumerikView: {
            parseData: {
                errors: [],
                plane: 'G17',
                canvas: [],
                currentBucket: null,
                contourElements: {},
                axesPos: {X: 0, Y: 0, Z: 0},
            },
        },
    },
}));

// Identity frames: BASE and FRAME coincide, so a value in the wrong one shows up
// as a discontinuity rather than hiding behind a transform. The G18 case below
// checks the axis slots, which is the other half of the same worry.
jest.mock('../lib/coordinates', () => ({
    getCoordinatesInFrame: jest.fn((pos) => [pos.X || 0, pos.Y || 0, pos.Z || 0]),
    getCoordinatesInBase: jest.fn((pos) => [pos.X || 0, pos.Y || 0, pos.Z || 0]),
}));

const {insertRndArcArc} = require('../lib/element-insert');
const {solveArcArcFillet} = require('../lib/arcFilletMath');

let View;

beforeEach(() => {
    View = require('../lib/sinumerik').default;
    View.sinumerikView.parseData.errors = [];
    View.sinumerikView.parseData.plane = 'G17';
    View.sinumerikView.parseData.canvas = [];
    View.sinumerikView.parseData.currentBucket = null;
    View.sinumerikView.parseData.contourElements = {};
    View.sinumerikView.parseData.axesPos = {X: 0, Y: 0, Z: 0};
});

// Two arcs of radius 10 meeting at the origin with a right-angled corner: the
// first comes in from the left about a centre above the joint, the second leaves
// upwards about a centre to its left. Both run anticlockwise, so the corner turns
// towards the inside of both — the fillet rolls inside each.
//
// G17 plane: axes ['X','Y','Z'], centres in I and J.
const arcIn = (extra = {}) => ({
    type: 'G3',
    row: 4,
    elementId: 7,
    sourceFile: 'test.mpf',
    X_start: -10, Y_start: 10, Z_start: 0,
    X: 0, Y: 0, Z: 0,
    I: 0, J: 10,
    ...extra,
});

const arcOut = (extra = {}) => ({
    type: 'G3',
    row: 5,
    elementId: 8,
    sourceFile: 'test.mpf',
    X_start: 0, Y_start: 0, Z_start: 0,    // BASE, and never read: the joint is arc 1's end
    X: -10, Y: 10, Z: 0,
    I: -10, J: 0,
    ...extra,
});

const canvas = () => View.sinumerikView.parseData.canvas;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

describe('a fillet between two arcs, on the canvas', () => {
    test('every segment starts where the one before it ended', () => {
        // The single check that catches most wiring and coordinate mistakes.
        const first = arcIn({RND: 2});
        expect(insertRndArcArc(first, arcOut(), 'test.mpf')).toBe(true);

        expect(canvas().length).toBeGreaterThan(2);
        canvas().slice(1).forEach((segment, i) => {
            const before = canvas()[i];
            expect(segment.X_start).toBeCloseTo(before.X, 6);
            expect(segment.Y_start).toBeCloseTo(before.Y, 6);
            expect(segment.Z_start).toBeCloseTo(before.Z, 6);
        });
    });

    test('it runs from the start of the first arc to the start of the second', () => {
        const first = arcIn({RND: 2});
        const second = arcOut();
        insertRndArcArc(first, second, 'test.mpf');

        const begin = canvas()[0];
        expect(begin.X_start).toBeCloseTo(-10, 6);
        expect(begin.Y_start).toBeCloseTo(10, 6);

        const end = canvas()[canvas().length - 1];
        expect(end.X).toBeCloseTo(second.X_start, 6);
        expect(end.Y).toBeCloseTo(second.Y_start, 6);
    });

    test('and leaves the axes there, in BASE, for whatever draws next', () => {
        const second = arcOut();
        insertRndArcArc(arcIn({RND: 2}), second, 'test.mpf');

        expect(View.sinumerikView.parseData.axesPos.X).toBeCloseTo(second.X_start, 6);
        expect(View.sinumerikView.parseData.axesPos.Y).toBeCloseTo(second.Y_start, 6);
    });

    test('both arcs are shortened to where the fillet touches them', () => {
        const first = arcIn({RND: 2});
        const second = arcOut();
        insertRndArcArc(first, second, 'test.mpf');

        const solved = solveArcArcFillet({
            c1: [0, 10], r1: 10, ccw1: true,
            c2: [-10, 0], r2: 10, ccw2: true,
            junction: [0, 0], rnd: 2,
        });

        expect(first.X).toBeCloseTo(solved.t1[0], 6);
        expect(first.Y).toBeCloseTo(solved.t1[1], 6);
        expect(second.X_start).toBeCloseTo(solved.t2[0], 6);
        expect(second.Y_start).toBeCloseTo(solved.t2[1], 6);

        // Neither end moved off its own circle.
        expect(dist([first.X, first.Y], [0, 10])).toBeCloseTo(10, 6);
        expect(dist([second.X_start, second.Y_start], [-10, 0])).toBeCloseTo(10, 6);
    });

    test('every point drawn lies on one circle or the other', () => {
        const first = arcIn({RND: 2});
        insertRndArcArc(first, arcOut(), 'test.mpf');

        const solved = solveArcArcFillet({
            c1: [0, 10], r1: 10, ccw1: true,
            c2: [-10, 0], r2: 10, ccw2: true,
            junction: [0, 0], rnd: 2,
        });

        canvas().forEach(segment => {
            const p = [segment.X, segment.Y];
            const onArc = Math.abs(dist(p, [0, 10]) - 10);
            const onFillet = Math.abs(dist(p, solved.center) - 2);
            expect(Math.min(onArc, onFillet)).toBeLessThan(1e-6);
        });

        // And nothing on the first arc runs past where the fillet takes over:
        // drawing it to its programmed end and then jumping to the fillet would
        // still chain up segment by segment, and still land on the two circles.
        const sweepTo = (p) => {
            const from = Math.atan2(10 - 10, -10 - 0);          // its start, about (0, 10)
            let d = (Math.atan2(p[1] - 10, p[0]) - from) % (2 * Math.PI);
            if (d < 0) d += 2 * Math.PI;
            return d;
        };
        const kept = sweepTo(solved.t1);
        canvas().forEach(segment => {
            const p = [segment.X, segment.Y];
            if (Math.abs(dist(p, [0, 10]) - 10) > 1e-6) return;  // not on the first arc
            expect(sweepTo(p)).toBeLessThanOrEqual(kept + 1e-9);
        });
    });

    test('the segments belong to the block the RND was written on', () => {
        // Which is what keeps the arc and its rounding one element to click on.
        insertRndArcArc(arcIn({RND: 2}), arcOut(), 'test.mpf');

        canvas().forEach(segment => {
            expect(segment.elementId).toBe(7);
            expect(segment.row).toBe(4);
            expect(segment.sourceFile).toBe('test.mpf');
            expect(segment.type).toBe('G1');
        });
    });
});

describe('joints that are left as they were', () => {
    test('two arcs running smoothly into each other are not rounded', () => {
        // Same circle, same direction: there is no corner to round, and saying
        // so is not an error.
        const first = arcIn({RND: 2});
        const smooth = arcOut({I: 0, J: 10, X: 10, Y: 10});

        expect(insertRndArcArc(first, smooth, 'test.mpf')).toBe(false);
        expect(canvas()).toEqual([]);
        expect(View.sinumerikView.parseData.errors).toEqual([]);
        expect(first.X).toBe(0);           // untouched
    });

    test('a joint that doubles back is refused, with a reason', () => {
        const first = arcIn({RND: 2});
        const back = arcOut({type: 'G2', I: 0, J: 10, X: -10, Y: 10});

        expect(insertRndArcArc(first, back, 'test.mpf')).toBe(false);
        expect(canvas()).toEqual([]);
        expect(View.sinumerikView.parseData.errors.length).toBe(1);
        expect(View.sinumerikView.parseData.errors[0].text).toMatch(/RND between arcs is impossible/);
        expect(View.sinumerikView.parseData.errors[0].row).toBe(4);
    });

    test('a block with no numbers in it is refused without throwing', () => {
        const broken = arcIn({RND: 2, I: undefined});
        expect(insertRndArcArc(broken, arcOut(), 'test.mpf')).toBe(false);
        expect(canvas()).toEqual([]);
    });
});

describe('a radius too large for the corner', () => {
    test('is reduced, warned about, and still drawn', () => {
        const first = arcIn({RND: 50});
        const second = arcOut();

        expect(insertRndArcArc(first, second, 'test.mpf')).toBe(true);

        const warnings = View.sinumerikView.parseData.errors;
        expect(warnings.length).toBe(1);
        expect(warnings[0].text).toMatch(/RND value too large/);
        expect(warnings[0].text).toMatch(/row 5/);

        // Drawn with the radius that fits, not the one asked for.
        const fillet = dist([second.X_start, second.Y_start], [first.X, first.Y]);
        expect(fillet).toBeGreaterThan(0);
        expect(fillet).toBeLessThan(2 * 50);

        canvas().slice(1).forEach((segment, i) => {
            expect(segment.X_start).toBeCloseTo(canvas()[i].X, 6);
            expect(segment.Y_start).toBeCloseTo(canvas()[i].Y, 6);
        });
    });
});

describe('contourEdit gets the two arcs whole', () => {
    test('the shortened arc and the fillet, in the bucket', () => {
        View.sinumerikView.parseData.currentBucket = 'MAIN_MPF';
        View.sinumerikView.parseData.contourElements = {MAIN_MPF: []};

        const first = arcIn({RND: 2});
        const second = arcOut();
        insertRndArcArc(first, second, 'test.mpf');

        const pushed = View.sinumerikView.parseData.contourElements.MAIN_MPF;
        expect(pushed.length).toBe(2);
        pushed.forEach(el => {
            expect(el.type).toBe('arc');
            expect(el.source).toBe('RND arc-arc');
            expect(el.planeAxes).toEqual(['X', 'Y']);
            expect(el.start.length).toBe(3);
        });

        expect(pushed[0].radius).toBeCloseTo(10, 6);
        expect(pushed[0].end).toEqual(pushed[1].start);
        expect(pushed[1].radius).toBeCloseTo(2, 6);
        expect(pushed[1].end[0]).toBeCloseTo(second.X_start, 6);
        expect(pushed[1].end[1]).toBeCloseTo(second.Y_start, 6);
    });

    test('with no bucket open, nothing is pushed', () => {
        insertRndArcArc(arcIn({RND: 2}), arcOut(), 'test.mpf');
        expect(View.sinumerikView.parseData.contourElements).toEqual({});
    });
});

describe('in the turning plane', () => {
    test('G18 puts the coordinates in the right slots', () => {
        // The trap from CLAUDE.md: in G18 the axes are ['Z','X','Y'] and the
        // centres are K and I, so anything that assumes X-then-Y lands askew.
        View.sinumerikView.parseData.plane = 'G18';

        const first = {
            type: 'G3', row: 4, elementId: 7, sourceFile: 't.mpf',
            Z_start: -10, X_start: 10, Y_start: 0,
            Z: 0, X: 0, Y: 0,
            K: 0, I: 10,
            RND: 2,
        };
        const second = {
            type: 'G3', row: 5, elementId: 8, sourceFile: 't.mpf',
            Z_start: 0, X_start: 0, Y_start: 0,
            Z: -10, X: 10, Y: 0,
            K: -10, I: 0,
        };

        expect(insertRndArcArc(first, second, 't.mpf')).toBe(true);

        // Y is the axis out of the plane and must not have moved.
        expect(first.Y).toBe(0);
        expect(second.Y_start).toBe(0);
        canvas().forEach(segment => expect(segment.Y).toBe(0));

        // And the geometry landed in Z/X, about the K/I centre.
        expect(Math.hypot(first.Z - 0, first.X - 10)).toBeCloseTo(10, 6);
        expect(Math.hypot(second.Z_start + 10, second.X_start - 0)).toBeCloseTo(10, 6);
    });

    test('a helical pair keeps the third axis continuous', () => {
        const first = arcIn({RND: 2, Z_start: 0, Z: 4});
        const second = arcOut({Z_start: 4, Z: 9});

        insertRndArcArc(first, second, 'test.mpf');

        expect(canvas()[0].Z_start).toBeCloseTo(0, 6);
        // The joint's own height is where the second arc now begins.
        expect(canvas()[canvas().length - 1].Z).toBeCloseTo(4, 6);
        expect(second.Z_start).toBeCloseTo(4, 6);

        canvas().slice(1).forEach((segment, i) => {
            expect(segment.Z_start).toBeCloseTo(canvas()[i].Z, 6);
        });
    });
});

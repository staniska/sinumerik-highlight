// Trimming tests for the area burn (canvasArea.js::burnForest).
//
// burnForest walks the 1 mm raster around the area the cursor is in and then
// trims every element it walked to the two crossings that bound it. That trimmed
// path is what the whole processing chain downstream treats as the contour — the
// turning cycle generator never sees the drawn elements, only these parts — so a
// part that goes missing here is invisible further on: the profile detection
// reads the same trimmed contour, agrees with itself, and the generated cycle
// machines a shape the user never drew.

const FRAME = {x: 'X', y: 'Y'};

jest.mock('../lib/sinumerik', () => ({
    __esModule: true,
    default: {sinumerikView: {contourEditData: {}}},
}));

jest.mock('../lib/contourEdit/canvas', () => ({
    getFrame: jest.fn(() => FRAME),
    draw: jest.fn(),
    DEBUG_DRAW_POINTS: false,
    isNumber: (...args) => args.every(v => Number.isFinite(v)),
    updateArcProperties: jest.fn(),
}));

jest.mock('../lib/contourEdit/contourEditMain', () => ({
    getDistance: (p1, p2) => Math.sqrt((p1.X - p2.X) ** 2 + (p1.Y - p2.Y) ** 2),
}));

const View = require('../lib/sinumerik').default;
const {
    burnForest,
    createRoundedPointsObj,
    describeBurnWarnings,
} = require('../lib/contourEdit/tools/canvasArea');
const {updateIntersections} = require('../lib/contourEdit/intersections');

const line = (x1, y1, x2, y2, id) => ({id, type: 'line', start: {X: x1, Y: y1}, end: {X: x2, Y: y2}});

const burn = (contour, cursor) => {
    View.sinumerikView.contourEditData = {
        editContour: contour,
        burnedContour: [],
        burnedContourWarnings: [],
        doubleTraversalElementId: null,
        checkAreaDelay: 0,
        points: {
            rounded: [], roundedObj: {}, intersection: [], burned: [],
            processingStart: [], processingEnd: [],
        },
    };
    updateIntersections();
    burnForest(cursor, createRoundedPointsObj());

    const data = View.sinumerikView.contourEditData;
    return {
        parts: data.burnedContour.map(el => ({
            id: el.id,
            from: [el.start.X, el.start.Y],
            to: [el.end.X, el.end.Y],
        })),
        walked: Array.from(new Set(data.points.burned.map(p => p.parentId))),
        warnings: data.burnedContourWarnings,
        doubleTraversal: data.doubleTraversalElementId,
    };
};

const RECTANGLE = [
    line(0, 0, 20, 0, 0),
    line(20, 0, 20, 10, 1),
    line(20, 10, 0, 10, 2),
    line(0, 10, 0, 0, 3),
];

describe('a boundary the burn can read', () => {
    test('rectangle: every edge trimmed to its corners', () => {
        const {parts, warnings} = burn(RECTANGLE, {X: 10, Y: 5});

        expect(warnings).toEqual([]);
        expect(parts.map(p => p.id).sort()).toEqual([0, 1, 2, 3]);
        expect(parts.find(p => p.id === 0)).toMatchObject({from: [0, 0], to: [20, 0]});
        expect(parts.find(p => p.id === 2)).toMatchObject({from: [20, 10], to: [0, 10]});
    });

    test('concave L-shape: all six edges survive', () => {
        const lShape = [
            line(0, 0, 20, 0, 0), line(20, 0, 20, 6, 1), line(20, 6, 10, 6, 2),
            line(10, 6, 10, 14, 3), line(10, 14, 0, 14, 4), line(0, 14, 0, 0, 5),
        ];

        const {parts, warnings} = burn(lShape, {X: 5, Y: 5});

        expect(warnings).toEqual([]);
        expect(parts.map(p => p.id).sort()).toEqual([0, 1, 2, 3, 4, 5]);
    });

    test('a tail hanging off the rectangle is left out, and nothing else is', () => {
        const withTail = [...RECTANGLE, line(10, 10, 10, 18, 4)];

        const {parts, walked, warnings} = burn(withTail, {X: 10, Y: 5});

        expect(warnings).toEqual([]);
        expect(walked).not.toContain(4);
        expect(parts.map(p => p.id).sort()).toEqual([0, 1, 2, 3]);
    });
});

describe('a boundary the burn cannot read', () => {
    // An element shorter than the 1 mm raster pitch collects no burned point of
    // its own, so the walk steps straight from one of its neighbours to the
    // other. Crossings are collected per transition between consecutive walked
    // elements, and those two neighbours do not intersect each other — the
    // skipped element is between them — so neither gets a crossing there, both
    // are left with one, and both are dropped. Before this was refused, a
    // 0.7 mm chamfer turned a five-element contour into two parts that still
    // looked like a valid selection, and the turning cycle was generated from
    // those two.
    const withChamfer = [
        line(0, 0, 19.5, 0, 0),
        line(19.5, 0, 20, 0.5, 1),
        line(20, 0.5, 20, 10, 2),
        line(20, 10, 0, 10, 3),
        line(0, 10, 0, 0, 4),
    ];

    test('a sub-pitch chamfer costs its neighbours, so the selection is refused', () => {
        const {parts, walked, warnings} = burn(withChamfer, {X: 10, Y: 5});

        // Refused, like the module's other unreadable-area paths: no parts and
        // no burn path left behind, so the turning button stays disabled.
        expect(parts).toEqual([]);
        expect(walked).toEqual([]);

        // The report names the two edges the walk did use and would have lost:
        // the bottom edge (19 burned points) and the right edge (9). The chamfer
        // itself is not among them — it was never walked at all, being shorter
        // than the raster pitch, and that is precisely why its neighbours lost
        // their crossings.
        expect(warnings.map(w => w.kind)).toEqual(['dropped', 'dropped']);
        expect(warnings.map(w => w.elementId).sort()).toEqual([0, 2]);
        expect(warnings.map(w => w.burnedPoints).sort((a, b) => a - b)).toEqual([9, 19]);
        expect(warnings.some(w => w.elementId === 1)).toBe(false);
    });

    test('the reason is reported in one place for the click handler to show', () => {
        burn(withChamfer, {X: 10, Y: 5});

        const message = describeBurnWarnings();
        expect(message).toMatch(/incomplete, selection discarded/);
        expect(message).toMatch(/element 0 bounds the area but could not be trimmed/);
        expect(message).toMatch(/element 2 bounds the area but could not be trimmed/);
    });

    test('nothing to report on a boundary that reads cleanly', () => {
        burn(RECTANGLE, {X: 10, Y: 5});
        expect(describeBurnWarnings()).toBe('');
    });

    test('an edge the area needs twice is caught before trimming', () => {
        // id0 runs the full width and bounds the area in two separate spans, on
        // either side of the notch standing on it. The double-traversal guard
        // stops the walk, so the trimming never gets the chance to keep one span
        // and silently discard the other.
        const notched = [
            line(0, 0, 30, 0, 0),
            line(0, 0, 0, 10, 1), line(0, 10, 30, 10, 2), line(30, 10, 30, 0, 3),
            line(10, 0, 10, 5, 4), line(10, 5, 20, 5, 5), line(20, 5, 20, 0, 6),
        ];

        const {parts, warnings, doubleTraversal} = burn(notched, {X: 5, Y: 2});

        expect(doubleTraversal).toBe(0);
        expect(parts).toEqual([]);
        expect(warnings).toEqual([]);
    });
});

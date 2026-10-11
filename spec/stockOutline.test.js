// Turning the material grid back into a contour (lib/stockOutline.js).
//
// The module is pure, so these run on grids built by hand with no mocks.
//
// The guard that matters is not the element count — a fitter can always be
// talked into the number you expected — but the distance between what it
// returns and what the grid actually holds. Every case below checks that the
// contour follows the stored boundary within the tolerance, and the element
// counts are only there to say the fitting did its job rather than returning the
// staircase verbatim.

const {createGrid, setSpans} = require('../lib/materialTrace');
const {stockOutline, fitPrimitives} = require('../lib/stockOutline');

const TOL = 0.3;

// A grid whose columns are filled by a function of the axial position: `spans(z)`
// returns the radial intervals of material at that column's centre.
const gridFrom = (min, max, pitch, spans) => {
    const grid = createGrid({min, max, pitch});
    for (let i = 0; i < grid.columns; i++) {
        const z = min + (i + 0.5) * pitch;
        const intervals = spans(z);
        if (intervals.length) setSpans(grid, i, intervals);
    }
    return grid;
};

// Distance from a point to one emitted element.
const distanceTo = (element, p) => {
    if (element.type === 'arc') {
        const d = Math.hypot(p[0] - element.center[0], p[1] - element.center[1]);
        return Math.abs(d - element.radius);
    }
    const [a, b] = [element.start, element.end];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (len * len)));
    return Math.hypot(p[0] - (a[0] + dx * t), p[1] - (a[1] + dy * t));
};

// The promise of the module: no corner of the stored region is further from the
// contour than the tolerance allows.
const expectFollows = (piece, tolerance = TOL) => {
    piece.points.forEach(p => {
        const nearest = Math.min(...piece.elements.map(el => distanceTo(el, p)));
        expect(nearest).toBeLessThanOrEqual(tolerance + 1e-9);
    });
};

// A contour is closed when each element begins where the last one ended.
const expectClosed = (piece) => {
    piece.elements.forEach((el, i) => {
        const prev = piece.elements[(i - 1 + piece.elements.length) % piece.elements.length];
        expect(el.start[0]).toBeCloseTo(prev.end[0], 9);
        expect(el.start[1]).toBeCloseTo(prev.end[1], 9);
    });
};

describe('a plain bar', () => {
    const grid = gridFrom(0, 40, 0.2, () => [[0, 25]]);

    test('comes back as one piece, four straight sides', () => {
        const pieces = stockOutline(grid);

        expect(pieces).toHaveLength(1);
        expect(pieces[0].elements).toHaveLength(4);
        pieces[0].elements.forEach(el => expect(el.type).toBe('line'));
        expectClosed(pieces[0]);
    });

    test('with the right size, and the axis as one of its sides', () => {
        const [piece] = stockOutline(grid);

        expect(piece.bounds).toEqual({a0min: 0, a0max: 40, a1min: 0, a1max: 25});
        expect(piece.area).toBeCloseTo(40 * 25, 6);
    });
});

describe('a step', () => {
    // 25 up to Z 20, then 15 — the shape a single roughing pass leaves.
    const grid = gridFrom(0, 40, 0.2, (z) => [[0, z < 20 ? 25 : 15]]);

    test('six sides, none of them the staircase', () => {
        const [piece] = stockOutline(grid);

        expect(piece.elements).toHaveLength(6);
        piece.elements.forEach(el => expect(el.type).toBe('line'));
        expectFollows(piece);
        expectClosed(piece);
    });

    test('the step is where the grid put it, within a column', () => {
        const [piece] = stockOutline(grid);
        // The face of the step: the vertical element that is not one of the two
        // ends of the bar.
        const face = piece.elements.find(el =>
            Math.abs(el.start[0] - el.end[0]) < 1e-9 &&
            Math.abs(el.start[1] - el.end[1]) > 1 &&
            el.start[0] > 1 && el.start[0] < 39);

        expect(face.start[0]).toBeCloseTo(20, 1);
        expect(Math.abs(face.start[1] - face.end[1])).toBeCloseTo(10, 1);
    });
});

describe('a turned radius', () => {
    // A quarter round of radius 8 blending a 25 cylinder into a 17 one.
    const R = 8;
    const grid = gridFrom(0, 40, 0.2, (z) => {
        if (z < 10) return [[0, 25]];
        if (z > 18) return [[0, 17]];
        return [[0, 17 + Math.sqrt(Math.max(0, R * R - (z - 10) ** 2))]];
    });

    test('comes back as an arc of that radius, not as a fan of chords', () => {
        const [piece] = stockOutline(grid);
        const arcs = piece.elements.filter(el => el.type === 'arc');

        expect(arcs).toHaveLength(1);
        // Not the exact radius: a least-squares circle over a run that reaches a
        // little way into the straight parts either side drifts, and inside a
        // 0.3 mm tolerance it is entitled to. What it may not do is come back a
        // different kind of thing — a chord fan, or a radius off by half the
        // feature.
        expect(Math.abs(arcs[0].radius - R)).toBeLessThan(1);
        expect(arcs[0].center[0]).toBeCloseTo(10, 0);
        expect(arcs[0].center[1]).toBeCloseTo(17, 0);
    });

    test('and the whole contour still follows the stock', () => {
        const [piece] = stockOutline(grid);
        expectFollows(piece);
        expectClosed(piece);
        expect(piece.elements.length).toBeLessThan(10);
    });
});

describe('a bore', () => {
    // Material from radius 8 to 25 all the way along: the inner wall is as real
    // a part of the boundary as the outer one.
    const grid = gridFrom(0, 40, 0.2, () => [[8, 25]]);

    test('one loop, carrying both walls', () => {
        const pieces = stockOutline(grid);

        expect(pieces).toHaveLength(1);
        expect(pieces[0].bounds.a1min).toBeCloseTo(8, 9);
        expect(pieces[0].bounds.a1max).toBeCloseTo(25, 9);
        expect(pieces[0].area).toBeCloseTo(40 * 17, 6);
        expectClosed(pieces[0]);
    });
});

describe('stock that has been parted', () => {
    // A cut right through at Z 20: two pieces, and the larger one first.
    const grid = gridFrom(0, 40, 0.2, (z) => (z > 19.9 && z < 22 ? [] : [[0, 25]]));

    test('comes back as two pieces, largest first', () => {
        const pieces = stockOutline(grid);

        expect(pieces).toHaveLength(2);
        expect(pieces[0].area).toBeGreaterThan(pieces[1].area);
        // Whatever the column edges made of the cut, the two pieces account for
        // all of the metal that is left and none of the gap.
        const metal = pieces[0].area + pieces[1].area;
        expect(metal).toBeGreaterThan(37 * 25);
        expect(metal).toBeLessThan(38.1 * 25);
        pieces.forEach(piece => {
            expectFollows(piece);
            expectClosed(piece);
        });
    });

    test('and they do not overlap along the axis', () => {
        const [big, small] = stockOutline(grid);
        expect(big.bounds.a0min >= small.bounds.a0max || small.bounds.a0min >= big.bounds.a0max).toBe(true);
    });
});

describe('a groove', () => {
    // Narrow and not through: one piece, with a notch in its outline.
    const grid = gridFrom(0, 40, 0.2, (z) => (z > 18 && z < 22 ? [[0, 12]] : [[0, 25]]));

    test('stays one piece and keeps the notch', () => {
        const pieces = stockOutline(grid);

        expect(pieces).toHaveLength(1);
        expect(pieces[0].bounds.a1max).toBeCloseTo(25, 9);
        expectFollows(pieces[0]);
        expectClosed(pieces[0]);

        // Down to the groove floor and back up: two walls and a floor beyond the
        // four sides of the bar.
        expect(pieces[0].elements.length).toBeGreaterThanOrEqual(8);
    });
});

describe('the tolerance is a promise, not a hint', () => {
    // A taper, which a staircase can only approximate: every corner of it has to
    // stay inside the tolerance of the emitted line.
    const grid = gridFrom(0, 40, 0.2, (z) => [[0, 25 - z * 0.25]]);

    test('a taper is one line, not a fan of four hundred', () => {
        const [piece] = stockOutline(grid);

        // Four sides and nothing else: the bar's two ends, its underside, and
        // the taper — which the grid holds as four hundred steps.
        expect(piece.points.length).toBeGreaterThan(300);
        expect(piece.elements).toHaveLength(4);
        piece.elements.forEach(el => expect(el.type).toBe('line'));

        const taper = piece.elements.find(el =>
            el.start[1] > 10 && el.end[1] > 10 && Math.abs(el.end[0] - el.start[0]) > 30);
        expect(taper).toBeDefined();
        expectFollows(piece);
    });

    test('a tighter tolerance is also kept', () => {
        const [piece] = stockOutline(grid, {tolerance: 0.05});
        expectFollows(piece, 0.05);
    });

    test('a tolerance so tight it cannot smooth the steps returns the steps', () => {
        // Half a column is 0.1; below that the staircase is the only answer, and
        // the module gives it rather than quietly exceeding the tolerance.
        const [piece] = stockOutline(grid, {tolerance: 0.001});
        expectFollows(piece, 0.001);
        expect(piece.elements.length).toBeGreaterThan(50);
    });
});

describe('nothing to outline', () => {
    test('an empty grid has no pieces', () => {
        expect(stockOutline(createGrid({min: 0, max: 10, pitch: 0.2}))).toEqual([]);
    });

    test('a degenerate run of points yields no elements', () => {
        expect(fitPrimitives([], TOL)).toEqual([]);
        expect(fitPrimitives([[0, 0]], TOL)).toEqual([]);
    });
});

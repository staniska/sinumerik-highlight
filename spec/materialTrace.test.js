// Tests for the material-trace core (lib/materialTrace.js).
//
// This module has no View and no parseData, which is the only reason these
// tests can exist — and they are the point of that separation. A sign error or
// an off-by-one here does not crash: it paints a picture that looks entirely
// plausible and is wrong by a millimetre.
//
// Axes are neutral: a0 is the axial (stepping) axis, a1 the radial one. On a
// lathe the caller maps them to Z and X, in radii.

const {
    createGrid,
    columnIndex,
    columnCenter,
    getSpans,
    setSpans,
    union,
    subtractSpan,
    overlapLength,
    totalArea,
    polygonSpansAt,
    polygonAxialRange,
    seedFromPolygon,
    sweptComponents,
    componentsSpansAt,
    componentsAxialRange,
    sweepSegment,
    referencePointSegment,
    pickPitch,
    bytesPerColumn,
    BYTES_PER_INTERVAL,
    DEFAULT_MAX_INTERVALS,
    MIN_PITCH,
} = require('../lib/materialTrace');

// A closed rectangle in (a0, a1).
const rect = (a0lo, a0hi, a1lo, a1hi) => [
    [a0lo, a1lo], [a0hi, a1lo], [a0hi, a1hi], [a0lo, a1hi],
];

// Inscribed polygon approximating a circle, fine enough that its area is
// within ~1e-5 of the true one.
const circle = (c0, c1, r, n = 360) => {
    const pts = [];
    for (let i = 0; i < n; i++) {
        const a = (2 * Math.PI * i) / n;
        pts.push([c0 + r * Math.cos(a), c1 + r * Math.sin(a)]);
    }
    return pts;
};

const subtractAll = grid => (i, spans) => spans.forEach(([lo, hi]) => subtractSpan(grid, i, lo, hi));

describe('the grid', () => {
    test('snaps its extent up to a whole number of columns', () => {
        const grid = createGrid({min: 0, max: 10, pitch: 0.4});
        expect(grid.columns).toBe(25);
        expect(grid.max).toBeCloseTo(10, 10);

        // A range that does not divide evenly grows rather than truncating:
        // losing the last partial column would lose real material.
        const ragged = createGrid({min: 0, max: 10.1, pitch: 0.4});
        expect(ragged.columns).toBe(26);
        expect(ragged.max).toBeCloseTo(10.4, 10);
    });

    test('rejects a degenerate definition instead of producing an empty grid', () => {
        expect(() => createGrid({min: 0, max: 10, pitch: 0})).toThrow(/pitch/);
        expect(() => createGrid({min: 10, max: 10, pitch: 1})).toThrow(/max/);
    });

    test('columns map back and forth', () => {
        const grid = createGrid({min: -5, max: 5, pitch: 1});

        expect(columnIndex(grid, -5)).toBe(0);
        expect(columnIndex(grid, -4.5)).toBe(0);
        expect(columnIndex(grid, -4)).toBe(1);
        expect(columnIndex(grid, 4.999)).toBe(9);
        expect(columnCenter(grid, 0)).toBeCloseTo(-4.5, 10);

        // Outside is -1, not a clamped edge column: silently attributing a cut
        // to the nearest column would smear material at the grid boundary.
        expect(columnIndex(grid, -5.001)).toBe(-1);
        expect(columnIndex(grid, 5)).toBe(-1);
    });
});

describe('a seeded blank', () => {
    test('a rectangular bar fills every column with one span', () => {
        const grid = createGrid({min: 0, max: 20, pitch: 0.5});
        seedFromPolygon(grid, rect(0, 20, 0, 12));

        for (let i = 0; i < grid.columns; i++) {
            expect(getSpans(grid, i)).toEqual([[0, 12]]);
        }
        expect(totalArea(grid)).toBeCloseTo(20 * 12, 6);
    });

    test('a tube keeps its bore: one span that does not start at zero', () => {
        const grid = createGrid({min: 0, max: 10, pitch: 0.5});
        // Outer wall and bore as one even-odd polygon pair is not needed — the
        // section of a tube at any Z is simply [bore, outer].
        seedFromPolygon(grid, rect(0, 10, 15, 40));

        expect(getSpans(grid, 0)).toEqual([[15, 40]]);
        expect(totalArea(grid)).toBeCloseTo(10 * 25, 6);
    });

    test('a stepped shaft gives a different radius per column', () => {
        const grid = createGrid({min: 0, max: 10, pitch: 1});
        // Radius 20 for the first half, 12 for the second.
        seedFromPolygon(grid, [[0, 0], [10, 0], [10, 12], [5, 12], [5, 20], [0, 20]]);

        expect(getSpans(grid, 0)).toEqual([[0, 20]]);   // centre at a0 = 0.5
        expect(getSpans(grid, 9)).toEqual([[0, 12]]);   // centre at a0 = 9.5
    });

    test('columns outside the profile stay empty', () => {
        const grid = createGrid({min: -10, max: 10, pitch: 1});
        seedFromPolygon(grid, rect(0, 10, 0, 5));

        expect(getSpans(grid, 0)).toEqual([]);
        expect(getSpans(grid, 15)).toEqual([[0, 5]]);
    });
});

describe('scan conversion', () => {
    test('a vertex on the scan line yields one crossing, not two', () => {
        // The half-open rule in polygonSpansAt exists for exactly this: a
        // triangle apex sampled dead-on would otherwise give a doubled or
        // vanishing crossing and flip the inside/outside parity for the rest
        // of the line.
        const triangle = [[0, 0], [10, 0], [5, 10]];
        expect(polygonSpansAt(triangle, 5)).toEqual([[0, 10]]);

        // Sampled exactly on the left vertex both crossings land on the same
        // point, so the span has zero width and is dropped rather than being
        // reported as a sliver of material.
        expect(polygonSpansAt(triangle, 0)).toEqual([]);
    });

    test('a scan line through two opposite vertices gives one span, not none', () => {
        // The half-open rule decides this. Counted closed, BOTH edges meeting
        // at each vertex would register, so the crossings come back doubled:
        // [-5,-5,5,5] pairs into two zero-width spans and the column reads as
        // empty — material silently gone, right through the middle of a shape.
        //
        // A triangle apex is not a probe for this: there the duplicates land at
        // the end of the list and the odd count discards them, so the answer
        // comes out right for the wrong reason.
        const diamond = [[0, 0], [5, -5], [10, 0], [5, 5]];
        expect(polygonSpansAt(diamond, 5)).toEqual([[-5, 5]]);
    });

    test('a step riser sitting exactly on the scan line reads correctly', () => {
        // The riser at a0 = 5 has zero extent along the scan direction, so
        // interpolating along it would be 0/0. Asserted as behaviour rather
        // than as a guard: a NaN crossing happens to sort out of the way here,
        // so this does not discriminate the inclusion rule — the diamond above
        // is what does.
        const stepped = [[0, 0], [10, 0], [10, 10], [5, 10], [5, 4], [0, 4]];
        expect(polygonSpansAt(stepped, 5)).toEqual([[0, 10]]);
        expect(polygonSpansAt(stepped, 2)).toEqual([[0, 4]]);
    });

    test('edges parallel to the scan line do not divide by zero', () => {
        const spans = polygonSpansAt(rect(0, 10, 2, 5), 0);
        expect(spans).toEqual([[2, 5]]);
        expect(spans.every(s => Number.isFinite(s[0]) && Number.isFinite(s[1]))).toBe(true);
    });

    test('a concave outline gives two spans where it straddles a gap', () => {
        // A C opening towards +a0: two bars joined by a wall at low a0. A scan
        // line past the wall crosses four edges and must come back as two
        // separate radial spans — the shape a bore makes, and the case a single
        // interval per column could not represent.
        const c = [
            [0, 0], [10, 0], [10, 2], [2, 2], [2, 8], [10, 8], [10, 10], [0, 10],
        ];
        expect(polygonSpansAt(c, 5)).toEqual([[0, 2], [8, 10]]);
        expect(polygonSpansAt(c, 1)).toEqual([[0, 10]]);   // through the wall
    });

    test('outside the outline there is nothing', () => {
        expect(polygonSpansAt(rect(0, 10, 0, 5), -1)).toEqual([]);
        expect(polygonSpansAt(rect(0, 10, 0, 5), 10)).toEqual([]);
    });

    test('a degenerate outline is not an error', () => {
        expect(polygonSpansAt([], 0)).toEqual([]);
        expect(polygonSpansAt([[0, 0], [1, 1]], 0.5)).toEqual([]);
    });

    test('axial range', () => {
        expect(polygonAxialRange(rect(2, 7, 0, 1))).toEqual([2, 7]);
    });
});

describe('subtracting material', () => {
    const fresh = () => {
        const grid = createGrid({min: 0, max: 10, pitch: 1});
        seedFromPolygon(grid, rect(0, 10, 0, 20));
        return grid;
    };

    test('a cut reaching the outside shortens the span', () => {
        const grid = fresh();
        expect(subtractSpan(grid, 0, 15, 25)).toBeCloseTo(5, 10);
        expect(getSpans(grid, 0)).toEqual([[0, 15]]);
    });

    test('a cut strictly inside splits the column in two', () => {
        // This is the transient case the plan predicts: a bore seen in one
        // column while its neighbours still reach the outer boundary.
        const grid = fresh();
        expect(subtractSpan(grid, 0, 5, 8)).toBeCloseTo(3, 10);
        expect(getSpans(grid, 0)).toEqual([[0, 5], [8, 20]]);
    });

    test('a cut covering everything empties the column', () => {
        const grid = fresh();
        expect(subtractSpan(grid, 0, -5, 25)).toBeCloseTo(20, 10);
        expect(getSpans(grid, 0)).toEqual([]);
    });

    test('repeating a cut removes nothing the second time', () => {
        const grid = fresh();
        const first = subtractSpan(grid, 0, 15, 25);
        const second = subtractSpan(grid, 0, 15, 25);

        expect(first).toBeCloseTo(5, 10);
        expect(second).toBe(0);
        expect(getSpans(grid, 0)).toEqual([[0, 15]]);
    });

    test('a cut in thin air removes nothing', () => {
        const grid = fresh();
        expect(subtractSpan(grid, 0, 25, 30)).toBe(0);
        expect(getSpans(grid, 0)).toEqual([[0, 20]]);
    });

    test('an inverted or empty cut is ignored', () => {
        const grid = fresh();
        expect(subtractSpan(grid, 0, 10, 10)).toBe(0);
        expect(subtractSpan(grid, 0, 10, 5)).toBe(0);
        expect(getSpans(grid, 0)).toEqual([[0, 20]]);
    });

    test('a cut outside the grid is ignored', () => {
        const grid = fresh();
        expect(subtractSpan(grid, -1, 0, 5)).toBe(0);
        expect(subtractSpan(grid, grid.columns, 0, 5)).toBe(0);
    });

    test('removed length is what the area bookkeeping says', () => {
        const grid = fresh();
        const before = totalArea(grid);
        const removed = subtractSpan(grid, 3, 12, 20);
        expect(before - totalArea(grid)).toBeCloseTo(removed * grid.pitch, 10);
    });
});

describe('when a column runs out of intervals', () => {
    test('the smallest gaps are closed, keeping material rather than losing it', () => {
        // Being wrong towards "stock still there" is visible and fixable;
        // being wrong towards "cleared" hides remaining metal, which is the
        // unsafe direction.
        const grid = createGrid({min: 0, max: 1, pitch: 1, maxIntervals: 2});
        setSpans(grid, 0, [[0, 1], [1.1, 2], [10, 11]]);

        expect(grid.overflows).toBe(1);
        // The 0.1 gap went, the 8-wide one stayed.
        expect(getSpans(grid, 0)).toEqual([[0, 2], [10, 11]]);
    });

    test('no overflow is reported when everything fits', () => {
        const grid = createGrid({min: 0, max: 1, pitch: 1, maxIntervals: 4});
        setSpans(grid, 0, [[0, 1], [2, 3]]);
        expect(grid.overflows).toBe(0);
    });
});

describe('measuring an intrusion', () => {
    test('overlap is a length, so a collision can be reported in millimetres', () => {
        const grid = createGrid({min: 0, max: 1, pitch: 1});
        setSpans(grid, 0, [[0, 10]]);

        expect(overlapLength(grid, 0, 8, 12)).toBeCloseTo(2, 10);
        expect(overlapLength(grid, 0, -5, 15)).toBeCloseTo(10, 10);
        expect(overlapLength(grid, 0, 11, 12)).toBe(0);
    });

    test('overlap sums across the spans of a split column', () => {
        const grid = createGrid({min: 0, max: 1, pitch: 1});
        setSpans(grid, 0, [[0, 2], [8, 10]]);
        expect(overlapLength(grid, 0, 1, 9)).toBeCloseTo(2, 10);
    });

    test('an already cleared path is not a collision', () => {
        // The holder legitimately travels through material the tool has
        // already removed — the whole reason the collision check has to be
        // sequential.
        const grid = createGrid({min: 0, max: 1, pitch: 1});
        setSpans(grid, 0, [[0, 10]]);
        subtractSpan(grid, 0, 5, 10);

        expect(overlapLength(grid, 0, 6, 9)).toBe(0);
    });
});

describe('union of intervals', () => {
    test('sorts, merges touching and overlapping, drops empty', () => {
        expect(union([[5, 8], [0, 2], [2, 3], [7, 9], [4, 4]]))
            .toEqual([[0, 3], [4, 4], [5, 9]].filter(s => s[1] > s[0]));
    });

    test('an empty list stays empty', () => {
        expect(union([])).toEqual([]);
    });
});

describe('pitch for a memory budget', () => {
    test('a working zone gets the finest pitch worth having', () => {
        // 30 MB over a 1000 mm zone affords sub-micron columns, so the floor
        // decides, not the budget: memory is simply not the constraint at the
        // sizes these programs work at.
        expect(pickPitch(1000, 30e6)).toBeCloseTo(MIN_PITCH, 10);
    });

    test('a 20 m part is where the budget starts to bind', () => {
        const pitch = pickPitch(20000, 30e6);
        expect(pitch).toBeGreaterThan(MIN_PITCH);

        // And the grid it implies really does fit the budget.
        const columns = Math.ceil(20000 / pitch);
        expect(columns * bytesPerColumn()).toBeLessThanOrEqual(30e6 * 1.001);
    });

    test('the pitch never goes below the floor, however large the budget', () => {
        expect(pickPitch(20000, 1e12)).toBeCloseTo(MIN_PITCH, 10);
    });

    test('a nonsensical budget or extent falls back to the floor', () => {
        expect(pickPitch(0, 30e6)).toBe(MIN_PITCH);
        expect(pickPitch(1000, 0)).toBe(MIN_PITCH);
    });

    test('memory does not depend on the radial extent at all', () => {
        // The reason a 4000 x 20000 mm part is possible here and impossible as
        // a raster: the radial axis is stored as interval bounds, not pixels.
        expect(bytesPerColumn(1)).toBe(BYTES_PER_INTERVAL + 1);
        expect(bytesPerColumn(DEFAULT_MAX_INTERVALS))
            .toBe(DEFAULT_MAX_INTERVALS * BYTES_PER_INTERVAL + 1);
    });
});

// ─── Stage 2: the reference-point path ───────────────────────────────────────

describe('the reference-point path', () => {
    // Nose of the fixture tool: cutting-edge position 3, so the nose centre
    // sits at P + (r, r) and the arc radius is 0.4.
    const NOSE = {center: [0.4, 0.4], radius: 0.4};

    test('under G40 it is the programmed path itself', () => {
        // The case that matters most: when the compensation was worked out by
        // hand, the drawn line legitimately runs inside the part. The painted
        // boundary comes from the outline placed at this point, never from the
        // line — so no correction belongs here.
        const seg = referencePointSegment([0, 10], [-50, 10], {compensation: 'none', nose: NOSE});
        expect(seg.from).toEqual([0, 10]);
        expect(seg.to).toEqual([-50, 10]);
    });

    test('with no nose known it is the programmed path, even under G41', () => {
        // A theoretically sharp tool: radius 0 and the centre at the origin
        // make the formula degenerate to the programmed path, which is right.
        const seg = referencePointSegment([0, 10], [-50, 10], {compensation: 'G41'});
        expect(seg.from).toEqual([0, 10]);
        expect(seg.to).toEqual([-50, 10]);
    });

    test('G41 and G42 offset to opposite sides by the same amount', () => {
        const left = referencePointSegment([0, 10], [-50, 10], {compensation: 'G41', nose: NOSE});
        const right = referencePointSegment([0, 10], [-50, 10], {compensation: 'G42', nose: NOSE});

        // Both carry the same centre-to-reference-point shift, so it cancels
        // when the two are compared: what is left is 2·r across the path.
        const d0 = left.from[0] - right.from[0];
        const d1 = left.from[1] - right.from[1];
        expect(Math.hypot(d0, d1)).toBeCloseTo(2 * NOSE.radius, 10);
    });

    test('the offset is perpendicular to the direction of travel', () => {
        const from = [0, 10];
        const to = [-30, 40];
        const seg = referencePointSegment(from, to, {compensation: 'G41', nose: NOSE});

        // Undo the fixed centre shift to isolate the r·n part.
        const n = [
            seg.from[0] - from[0] + NOSE.center[0],
            seg.from[1] - from[1] + NOSE.center[1],
        ];
        const d = [to[0] - from[0], to[1] - from[1]];

        expect(n[0] * d[0] + n[1] * d[1]).toBeCloseTo(0, 10);
        expect(Math.hypot(n[0], n[1])).toBeCloseTo(NOSE.radius, 10);
    });

    test('G41 is +90 degrees from the direction of travel, as offn.js already does', () => {
        // Matching the convention shipped in offn.js:44 rather than deriving a
        // fresh one: the painted side then agrees with the OFFN offsetting the
        // user already sees, instead of disagreeing with it by a quadrant.
        const seg = referencePointSegment([0, 0], [10, 0], {compensation: 'G41', nose: {center: [0, 0], radius: 1}});
        // Travelling along +a0, +90° points towards +a1.
        expect(seg.from).toEqual([0, 1]);
    });

    test('a move along the radial axis gets an axial offset', () => {
        // Facing cuts are pure-X blocks and are routine on a lathe; the normal
        // must not degenerate there.
        const seg = referencePointSegment([0, 0], [0, 20], {compensation: 'G41', nose: {center: [0, 0], radius: 1}});
        expect(seg.from[0]).toBeCloseTo(-1, 10);
        expect(seg.from[1]).toBeCloseTo(0, 10);
    });

    test('both ends shift by the same vector on a fully compensated block', () => {
        const seg = referencePointSegment([0, 10], [-50, 10], {compensation: 'G41', nose: NOSE});
        expect(seg.to[0] - seg.from[0]).toBeCloseTo(-50, 10);
        expect(seg.to[1] - seg.from[1]).toBeCloseTo(0, 10);
    });

    test('an approach block ramps the correction in, a departure ramps it out', () => {
        const from = [0, 10];
        const to = [-50, 10];
        const full = referencePointSegment(from, to, {compensation: 'G41', nose: NOSE});

        const approach = referencePointSegment(from, to, {compensation: 'G41', nose: NOSE, ramp: 'in'});
        expect(approach.from).toEqual(from);          // no correction yet
        expect(approach.to).toEqual(full.to);         // fully applied by the end

        const departure = referencePointSegment(from, to, {compensation: 'G41', nose: NOSE, ramp: 'out'});
        expect(departure.from).toEqual(full.from);
        expect(departure.to).toEqual(to);
    });

    test('a block with no movement is left alone', () => {
        // No direction means no normal to take, and it sweeps nothing anyway.
        const seg = referencePointSegment([5, 5], [5, 5], {compensation: 'G41', nose: NOSE});
        expect(seg.from).toEqual([5, 5]);
        expect(seg.to).toEqual([5, 5]);
    });

    test('the nose centre offset is what puts the file zero on the reference point', () => {
        // With the centre at the origin (a round insert, position 9) only r·n
        // remains; with it at (r, r) the extra shift is the corner geometry the
        // cutting-edge position implies.
        const round = referencePointSegment([0, 0], [10, 0], {compensation: 'G41', nose: {center: [0, 0], radius: 0.4}});
        const corner = referencePointSegment([0, 0], [10, 0], {compensation: 'G41', nose: NOSE});

        expect(round.from).toEqual([0, 0.4]);
        expect(corner.from[0]).toBeCloseTo(-0.4, 10);
        expect(corner.from[1]).toBeCloseTo(0, 10);
    });
});

// ─── Stage 3: sweeping an outline along a segment ────────────────────────────

describe('sweeping an outline', () => {
    const SQUARE = rect(0, 2, 0, 2);

    test('a square swept along the axial axis leaves a band of constant width', () => {
        const comps = sweptComponents(SQUARE, [0, 0], [10, 0]);

        [1, 5, 9, 11].forEach(at => {
            expect(componentsSpansAt(comps, at)).toEqual([[0, 2]]);
        });
        expect(componentsAxialRange(comps)).toEqual([0, 12]);
    });

    test('a round insert sweeps a band exactly two radii wide', () => {
        const r = 0.4;
        const comps = sweptComponents(circle(0, 0, r), [0, 0], [10, 0]);
        const spans = componentsSpansAt(comps, 5);

        expect(spans).toHaveLength(1);
        expect(spans[0][1] - spans[0][0]).toBeCloseTo(2 * r, 3);
    });

    test('a diagonal move carries the outline with it', () => {
        const comps = sweptComponents(SQUARE, [0, 0], [10, 10]);

        // Near the start the band sits low, near the end high; the outline
        // itself is 2 wide and the path adds its own rise.
        const low = componentsSpansAt(comps, 1);
        const high = componentsSpansAt(comps, 11);
        expect(low[0][0]).toBeCloseTo(0, 10);
        expect(high[0][1]).toBeCloseTo(12, 10);
    });

    test('a move shorter than the pitch still reaches a column', () => {
        // Otherwise a fine finishing pass made of sub-pitch steps would remove
        // nothing at all.
        const grid = createGrid({min: -5, max: 25, pitch: 1});
        seedFromPolygon(grid, rect(-5, 25, 0, 20));

        const visited = sweepSegment(grid, SQUARE, [10, 0], [10.1, 0], subtractAll(grid));
        expect(visited).toBeGreaterThanOrEqual(1);
    });

    test('a zero-length move still stamps the outline where it stands', () => {
        const grid = createGrid({min: -5, max: 25, pitch: 0.5});
        seedFromPolygon(grid, rect(-5, 25, 0, 20));
        const before = totalArea(grid);

        sweepSegment(grid, SQUARE, [10, 0], [10, 0], subtractAll(grid));
        expect(before - totalArea(grid)).toBeCloseTo(2 * 2, 1);
    });

    test('a concave outline removes two spans in the column it straddles', () => {
        const c = [
            [0, 0], [10, 0], [10, 2], [2, 2], [2, 8], [10, 8], [10, 10], [0, 10],
        ];
        const comps = sweptComponents(c, [0, 0], [0, 0]);
        expect(componentsSpansAt(comps, 5)).toEqual([[0, 2], [8, 10]]);
    });

    test('the swept area is the Minkowski area, not an approximation of it', () => {
        // A w-by-w square dragged L along the axial axis covers w·(L + w).
        const w = 2;
        const L = 10;
        const grid = createGrid({min: -5, max: 25, pitch: 0.01});
        seedFromPolygon(grid, rect(-5, 25, 0, 20));

        const before = totalArea(grid);
        sweepSegment(grid, rect(0, w, 0, w), [0, 0], [L, 0], subtractAll(grid));
        const removed = before - totalArea(grid);

        // The only error is the axial discretisation: at most one pitch of
        // width at each end.
        expect(removed).toBeCloseTo(w * (L + w), 1);
    });

    test('one long move equals the same move taken in twenty steps', () => {
        // The decomposition claims to be exact — P ∪ (boundary dragged into
        // parallelograms) — rather than a sampling of positions along the path.
        // If it were sampling, splitting the move would change the result.
        const section = rect(0, 1.3, 0, 2.1);
        const from = [0, 0];
        const to = [7, 4];

        const makeGrid = () => {
            const g = createGrid({min: -5, max: 20, pitch: 0.05});
            seedFromPolygon(g, rect(-5, 20, -5, 20));
            return g;
        };

        const oneShot = makeGrid();
        sweepSegment(oneShot, section, from, to, subtractAll(oneShot));

        const stepped = makeGrid();
        const steps = 20;
        for (let k = 0; k < steps; k++) {
            const a = [from[0] + ((to[0] - from[0]) * k) / steps, from[1] + ((to[1] - from[1]) * k) / steps];
            const b = [from[0] + ((to[0] - from[0]) * (k + 1)) / steps, from[1] + ((to[1] - from[1]) * (k + 1)) / steps];
            sweepSegment(stepped, section, a, b, subtractAll(stepped));
        }

        expect(totalArea(oneShot)).toBeCloseTo(totalArea(stepped), 6);
        for (let i = 0; i < oneShot.columns; i++) {
            const a = getSpans(oneShot, i);
            const b = getSpans(stepped, i);
            expect(a).toHaveLength(b.length);
            a.forEach((span, k) => {
                expect(span[0]).toBeCloseTo(b[k][0], 6);
                expect(span[1]).toBeCloseTo(b[k][1], 6);
            });
        }
    });

    test('a sweep clear of the material removes nothing', () => {
        const grid = createGrid({min: 0, max: 20, pitch: 0.5});
        seedFromPolygon(grid, rect(0, 20, 0, 5));
        const before = totalArea(grid);

        sweepSegment(grid, rect(0, 2, 10, 12), [0, 0], [10, 0], subtractAll(grid));
        expect(totalArea(grid)).toBeCloseTo(before, 10);
    });

    test('a sweep running past both ends of the grid is clipped, not an error', () => {
        const grid = createGrid({min: 0, max: 10, pitch: 1});
        seedFromPolygon(grid, rect(0, 10, 0, 5));

        expect(() => sweepSegment(grid, SQUARE, [-100, 0], [100, 0], subtractAll(grid))).not.toThrow();

        // Every column was reached, and each lost exactly as much as the
        // outline is tall — a 2-high tool cannot take material above 2, which
        // is the leftover a real undersized tool would leave.
        expect(getSpans(grid, 0)).toEqual([[2, 5]]);
        expect(getSpans(grid, grid.columns - 1)).toEqual([[2, 5]]);
        expect(totalArea(grid)).toBeCloseTo(10 * 3, 10);
    });

    test('the holder check can run before the cut of the same step', () => {
        // The ordering the plan insists on: a holder travelling through metal
        // the tool has not removed yet is a collision, and asking afterwards
        // would always find clear space.
        const grid = createGrid({min: 0, max: 10, pitch: 1});
        seedFromPolygon(grid, rect(0, 10, 0, 20));

        let worst = 0;
        const body = rect(0, 1, 0, 6);
        sweepSegment(grid, body, [4, 0], [5, 0], (i, spans) => {
            spans.forEach(([lo, hi]) => { worst = Math.max(worst, overlapLength(grid, i, lo, hi)); });
        });
        expect(worst).toBeCloseTo(6, 10);

        sweepSegment(grid, body, [4, 0], [5, 0], subtractAll(grid));

        let after = 0;
        sweepSegment(grid, body, [4, 0], [5, 0], (i, spans) => {
            spans.forEach(([lo, hi]) => { after = Math.max(after, overlapLength(grid, i, lo, hi)); });
        });
        expect(after).toBe(0);
    });

    test('a degenerate outline sweeps nothing', () => {
        const grid = createGrid({min: 0, max: 10, pitch: 1});
        seedFromPolygon(grid, rect(0, 10, 0, 5));
        const before = totalArea(grid);

        expect(sweepSegment(grid, [[0, 0], [1, 1]], [0, 0], [5, 0], subtractAll(grid))).toBe(0);
        expect(totalArea(grid)).toBeCloseTo(before, 10);
    });
});

describe('intersecting intervals', () => {
    const {intersectSpans, spansLength} = require('../lib/materialTrace');

    test('overlapping parts only', () => {
        expect(intersectSpans([[0, 10]], [[4, 20]])).toEqual([[4, 10]]);
        expect(intersectSpans([[0, 10]], [[0, 10]])).toEqual([[0, 10]]);
    });

    test('one interval against several', () => {
        expect(intersectSpans([[0, 10]], [[1, 2], [5, 6], [9, 20]])).toEqual([[1, 2], [5, 6], [9, 10]]);
    });

    test('several against several, walked in one pass', () => {
        expect(intersectSpans([[0, 3], [6, 9]], [[2, 7], [8, 12]])).toEqual([[2, 3], [6, 7], [8, 9]]);
    });

    test('touching at a point is not an overlap', () => {
        expect(intersectSpans([[0, 5]], [[5, 10]])).toEqual([]);
    });

    test('disjoint or empty gives nothing', () => {
        expect(intersectSpans([[0, 2]], [[5, 7]])).toEqual([]);
        expect(intersectSpans([], [[0, 10]])).toEqual([]);
        expect(intersectSpans([[0, 10]], [])).toEqual([]);
    });

    test('total length', () => {
        expect(spansLength([[0, 2], [5, 9]])).toBeCloseTo(6, 10);
        expect(spansLength([])).toBe(0);
    });
});

describe('skipping columns before converting them', () => {
    const {sweepSegment, createGrid, seedFromPolygon, getSpans, subtractSpan, maxRadiusIn, sweptBounds} =
        require('../lib/materialTrace');

    const rect2 = (a0lo, a0hi, a1lo, a1hi) => [
        [a0lo, a1lo], [a0hi, a1lo], [a0hi, a1hi], [a0lo, a1hi],
    ];

    test('a rejected column is never handed to the caller', () => {
        const grid = createGrid({min: 0, max: 20, pitch: 1});
        seedFromPolygon(grid, rect2(0, 20, 0, 10));

        const seen = [];
        sweepSegment(grid, rect2(0, 2, 0, 2), [0, 0], [10, 0], i => seen.push(i), i => i % 2 === 0);

        expect(seen.length).toBeGreaterThan(0);
        expect(seen.every(i => i % 2 === 0)).toBe(true);
    });

    test('without a predicate every covered column is visited', () => {
        const grid = createGrid({min: 0, max: 20, pitch: 1});
        seedFromPolygon(grid, rect2(0, 20, 0, 10));

        const all = [];
        sweepSegment(grid, rect2(0, 2, 0, 2), [0, 0], [10, 0], i => all.push(i));
        expect(all.length).toBe(12);
    });

    test('the max radius per column is what makes such a test cheap', () => {
        // It is maintained on every write, so asking "could this shape reach any
        // material here?" costs a comparison instead of a scan conversion.
        const grid = createGrid({min: 0, max: 10, pitch: 1});
        seedFromPolygon(grid, rect2(0, 10, 0, 8));
        expect(maxRadiusIn(grid, 0, 9)).toBeCloseTo(8, 10);

        subtractSpan(grid, 3, 5, 20);
        expect(grid.maxRadius[3]).toBeCloseTo(5, 10);
        expect(maxRadiusIn(grid, 3, 3)).toBeCloseTo(5, 10);

        subtractSpan(grid, 3, -5, 20);
        expect(grid.maxRadius[3]).toBe(-Infinity);
        expect(maxRadiusIn(grid, 3, 3)).toBe(-Infinity);

        // Out-of-range bounds are clamped rather than read past the end.
        expect(maxRadiusIn(grid, -50, 500)).toBeCloseTo(8, 10);
    });

    test('swept bounds cover the outline at both ends of the move', () => {
        const bounds = sweptBounds(rect2(0, 2, 1, 3), [10, 5], [40, 5]);
        expect(bounds).toEqual({a0min: 10, a0max: 42, a1min: 6, a1max: 8});
    });
});

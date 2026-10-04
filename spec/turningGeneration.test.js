// Generation tests for the lathe roughing cycle (turning.js).
//
// Fixture: the JOPA.MPF contour — a descending staircase (R505 / R521 / R606)
// closed by a taper, machined by radial passes stepping along Z. It is the
// contour that exposed the step-anchor bug: every approach branch came out with
// the diameter of the NEXT, deeper zone, so each pass fed through 16..85 mm of
// air before touching metal, and the two deepest branches collapsed into the
// same move. The guard here is numeric rather than textual: for every pass the
// emitted approach has to clear the real profile by exactly the safety
// distance, and the emitted cut target has to land on the profile.

const FRAME = {
    x: 'Z',
    y: 'X',
    plane: {abscissa: {name: 'Z', reverse: false}, ordinate: {name: 'X', reverse: false}},
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

const {
    detectProcessingPoints,
    equationGeometry,
    evaluateGeometry,
    generateProgramText,
    getContourRange,
    validateZones,
} = require('../lib/contourEdit/tools/turning');

const View = require('../lib/sinumerik').default;

const SAFETY = 1;   // R4 in the generated cycle
const DEPTH = 2;    // R3, the generator's default

// burnedContour as burnForest hands it over: every element trimmed to the two
// points where it crosses the enclosed area's boundary, so elements meet at
// their endpoints. X is a radius; the generated program emits diameters.
const JOPA = [
    {id: 0, type: 'line', start: {Z: 49, X: 496}, end: {Z: 8, X: 496}},
    {id: 1, type: 'line', start: {Z: 8, X: 496}, end: {Z: 0, X: 505}},
    {id: 2, type: 'line', start: {Z: 0, X: 505}, end: {Z: 0, X: 606}},
    {id: 3, type: 'line', start: {Z: 0, X: 606}, end: {Z: 8, X: 606}},
    {id: 4, type: 'line', start: {Z: 8, X: 606}, end: {Z: 8, X: 521}},
    {id: 5, type: 'line', start: {Z: 8, X: 521}, end: {Z: 19, X: 521}},
    {id: 6, type: 'line', start: {Z: 19, X: 521}, end: {Z: 19, X: 505}},
    {id: 7, type: 'line', start: {Z: 19, X: 505}, end: {Z: 49, X: 505}},
    {id: 8, type: 'line', start: {Z: 49, X: 505}, end: {Z: 49, X: 496}},
];

// The same contour as the editContour holds it, i.e. NOT trimmed: id7 overshoots
// to Z=50 and id8 to X=506, so the closed path is formed by their intersection
// at (49, 505) rather than by matching endpoints, and id8's tip pokes 1 mm above
// the profile. The generator is fed the trimmed contour in production; this
// fixture pins down that it degrades gracefully (redundant branches at worst)
// instead of anchoring on the overshooting tip.
const JOPA_UNTRIMMED = [
    ...JOPA.slice(0, 7),
    {id: 7, type: 'line', start: {Z: 19, X: 505}, end: {Z: 50, X: 505}},
    {id: 8, type: 'line', start: {Z: 49, X: 496}, end: {Z: 49, X: 506}},
];

// The same contour with the long outer edge drawn as two collinear segments,
// which is what splitting an element in the editor leaves behind. The detection
// reports a change of element at the split, so the chain would carry two
// branches moving to exactly the same place.
const JOPA_SPLIT_EDGE = [
    ...JOPA.slice(0, 7),
    {id: 7, type: 'line', start: {Z: 19, X: 505}, end: {Z: 34, X: 505}},
    {id: 9, type: 'line', start: {Z: 34, X: 505}, end: {Z: 49, X: 505}},
    JOPA[8],
];

// Outer profile: what a pass has to clear on its way in. Inner profile: where
// the pass has to stop. The staircase grows monotonically towards Z=0, i.e.
// towards the direction of machining, so the value at the pass plane is also the
// maximum over the whole slice the pass removes.
const outerRadius = (Z) => Z > 19 ? 505 : Z > 8 ? 521 : 606;
const innerRadius = (Z) => Z >= 8 ? 496 : 505 - 1.125 * Z;   // taper (0,505)->(8,496)

const generate = (contour, startPoint, problems) => {
    const cRange = getContourRange(contour);
    // Radial passes stepping along Z: ax = X (the cut axis), ax2 = Z.
    // direction.direction is a string in the real event handler.
    const direction = {axis: 'vertical', direction: '-1'};

    View.sinumerikView.contourEditData = {
        points: {},
        burnedContour: contour,
        units: 'metric',
        processingData: {startPoint, direction},
    };
    View.sinumerikView.contourEditRightContainer = {
        querySelector: () => ({value: ''}),
    };

    detectProcessingPoints(cRange, direction, 'X', contour);
    return generateProgramText(direction, 'X', cRange, contour, 'Z', 'X', 'JOPA', false, problems);
};

const samples = (side) => View.sinumerikView.contourEditData.points[side];
const element = (contour, id) => contour.find(el => el.id === id);
const geometryOf = (contour, id) => equationGeometry(element(contour, id), 'X', 'Z');

const section = (lines, fromLabel, toLabel) => {
    const from = lines.indexOf(fromLabel);
    const to = lines.indexOf(toLabel);
    return lines.slice(from + 1, to);
};

// `IF R1>19 / G0 Z=R1 X=... / ENDIF` chains plus the unconditional fall-through,
// in the order the control reads them. cond === null marks the fall-through.
const branches = (lines) => {
    const out = [];
    let cond = null;
    lines.forEach(line => {
        const text = line.trim();
        const conditional = text.match(/^IF R1>([\d.]+)$/);
        if (conditional) {
            cond = Number(conditional[1]);
            return;
        }
        const move = text.match(/^G[01] (?:Z=R1 )?(X=.+)$/);
        if (move) {
            out.push({cond, expr: move[1]});
            cond = null;
        }
    });
    return out;
};

const label = (branch) => `${branch.cond}|${branch.expr}`;

// Evaluates an emitted X expression at a given pass plane. Test-only: the point
// is to read the generated text exactly as the control would.
const evaluate = (expr, R1) => {
    const js = expr
        .replace(/^X=/, '')
        .replace(/\bR1\b/g, `(${R1})`)
        .replace(/\bR4\b/g, `(${SAFETY})`)
        .replace(/TAN\(([-\d.]+)\)/g, (_, deg) => `Math.tan(${deg} * Math.PI / 180)`);
    return eval(js);
};

// The pass planes the emitted control flow actually visits: R1 is pre-decremented
// once, then the loop repeats while R1 >= R2.
const passPlanes = (start, end) => {
    const step = Math.abs(start - end) / (Math.trunc(Math.abs(start - end) / (DEPTH * 1.03)) + 1) - 1 / 10000;
    const planes = [];
    for (let r1 = start - step; r1 >= end; r1 -= step) {
        planes.push(r1);
    }
    return planes;
};

const pick = (chain, R1) => chain.find(b => b.cond !== null && R1 > b.cond) || chain.find(b => b.cond === null);

describe('turning cycle generation on the JOPA staircase', () => {
    const lines = generate(JOPA, {Z: 64, X: 628});
    const approach = branches(section(lines, 'JOPA:', 'JOPA_START:'));
    const cut = branches(section(lines, 'JOPA_START:', 'JOPA_END:'));

    test('one approach branch per step, each carrying its own zone diameter', () => {
        expect(approach.map(label)).toEqual([
            '19|X=1010+R4*2',    // zone Z 19..49, R505
            '8|X=1042+R4*2',     // zone Z 8..19,  R521
            'null|X=1212+R4*2',  // zone Z 0..8,   R606
        ]);
    });

    test('cut targets follow the wall and then the taper', () => {
        expect(cut.map(label)).toEqual([
            '8|X=992',
            'null|X=992+(R1-8)*TAN(-48.366)*2',
        ]);
    });

    test('thresholds land exactly on the steps', () => {
        expect(approach.map(b => b.cond)).toEqual([19, 8, null]);
        // Approach and cut sides must agree on where the step is, otherwise the
        // passes in between take their approach from one zone and their target
        // from another.
        expect(cut[0].cond).toBe(8);
    });

    test('no two branches emit the same move', () => {
        expect(new Set(approach.map(b => b.expr)).size).toBe(approach.length);
        expect(new Set(cut.map(b => b.expr)).size).toBe(cut.length);
    });

    test('every pass clears the metal by exactly the safety distance', () => {
        const planes = passPlanes(49, 0);
        expect(planes.length).toBe(24);
        planes.forEach(Z => {
            const diameter = evaluate(pick(approach, Z).expr, Z);
            expect(diameter).toBeCloseTo(2 * (outerRadius(Z) + SAFETY), 6);
        });
    });

    test('every pass stops on the profile', () => {
        passPlanes(49, 0).forEach(Z => {
            const diameter = evaluate(pick(cut, Z).expr, Z);
            // On the taper branch the emitted angle is rounded to three decimals
            // (toFixed(3)), which is worth up to ~3e-4 mm over the 8 mm taper —
            // the control reads the same rounded text, so that is the real
            // accuracy of the generated cycle, not an artefact of the test.
            expect(Math.abs(diameter - 2 * innerRadius(Z))).toBeLessThan(1e-3);
        });
    });
});

describe('turning cycle generation on an untrimmed contour', () => {
    const lines = generate(JOPA_UNTRIMMED, {Z: 64, X: 628});
    const approach = branches(section(lines, 'JOPA:', 'JOPA_START:'));
    const cut = branches(section(lines, 'JOPA_START:', 'JOPA_END:'));

    test('never anchors on the overshooting tip', () => {
        // R506 would show up as X=1012: the tip of id8, which touches the
        // profile at a single Z and is not a zone boundary.
        approach.concat(cut).forEach(b => expect(b.expr).not.toMatch(/1012/));
    });

    test('never emits a tangent of a right angle', () => {
        // An element that is vertical in ax2 cannot drive X as a function of Z;
        // filterProgramText only strips the `/TAN(90)` spelling, so TAN(±90)
        // surviving here would reach the control as an arithmetic error.
        approach.concat(cut).forEach(b => expect(b.expr).not.toMatch(/TAN\(-?90/));
    });

    test('every pass still clears the metal by exactly the safety distance', () => {
        passPlanes(50, 0).forEach(Z => {
            const diameter = evaluate(pick(approach, Z).expr, Z);
            expect(diameter).toBeCloseTo(2 * (outerRadius(Z) + SAFETY), 6);
        });
    });

    test('every pass still stops on the profile', () => {
        passPlanes(50, 0).forEach(Z => {
            const diameter = evaluate(pick(cut, Z).expr, Z);
            // On the taper branch the emitted angle is rounded to three decimals
            // (toFixed(3)), which is worth up to ~3e-4 mm over the 8 mm taper —
            // the control reads the same rounded text, so that is the real
            // accuracy of the generated cycle, not an artefact of the test.
            expect(Math.abs(diameter - 2 * innerRadius(Z))).toBeLessThan(1e-3);
        });
    });
});

describe('generated cycle self-check', () => {
    test('passes on the contour it was generated from', () => {
        const problems = [];
        generate(JOPA, {Z: 64, X: 628}, problems);
        expect(problems).toEqual([]);
    });

    test('flags the probes an untrimmed contour makes degenerate', () => {
        const problems = [];
        generate(JOPA_UNTRIMMED, {Z: 64, X: 628}, problems);

        // All three sit exactly on a vertex, where the scan ray is collinear
        // with the radial element there and the detection returns a neighbour's
        // value instead of the wall: Z=49 is id8's tip at R506 with id7 running
        // past it to Z=50, Z=19 is id6. No pass plane lands on either — the
        // numeric tests above confirm the cycle itself is right — so this is the
        // self-check being deliberately conservative: a degenerate contour gets
        // a question rather than a silent insert. Two of the three only became
        // visible once the duplicate branches were merged away, because a probe
        // sitting on a branch threshold is skipped as uninformative.
        expect(problems).toHaveLength(3);
        expect(problems.map(p => [p.side, p.at])).toEqual([
            ['approach', 49],
            ['cut', 19],
            ['cut', 49],
        ]);
        expect(Math.min(...problems.map(p => p.delta))).toBeCloseTo(-9, 9);
    });

    test('catches a chain whose zones are shifted one step deeper', () => {
        generate(JOPA, {Z: 64, X: 628});
        // Exactly the bug this file exists for: each zone paired with the next,
        // deeper step's element. The fall-through stays correct, which is why the
        // broken cycle still looked plausible.
        const shifted = [
            {threshold: 19, geometry: geometryOf(JOPA, 5), elementId: 5},
            {threshold: 8, geometry: geometryOf(JOPA, 3), elementId: 3},
            {threshold: null, geometry: geometryOf(JOPA, 3), elementId: 3},
        ];

        const problems = validateZones(shifted, samples('processingStart'), 'approach', 'X', 'Z', true);

        expect(problems.length).toBeGreaterThan(500);
        expect(problems.every(p => p.side === 'approach')).toBe(true);
        // Nothing below the last step: there the chain happens to be right.
        expect(problems.every(p => p.at > 8)).toBe(true);
        // R521 instead of R505 above the first step, R606 instead of R521 between
        // the steps.
        const worst = problems.reduce((a, b) => (Math.abs(b.delta) > Math.abs(a.delta) ? b : a));
        expect(worst.delta).toBeCloseTo(85, 6);
        expect(Math.min(...problems.map(p => Math.abs(p.delta)))).toBeCloseTo(16, 6);
    });

    test('reports a zone left without an element', () => {
        generate(JOPA, {Z: 64, X: 628});
        const problems = validateZones(
            [{threshold: null, geometry: null}], samples('processingStart'), 'approach', 'X', 'Z', true);

        expect(problems.length).toBe(samples('processingStart').length);
        expect(problems[0].elementId).toBeNull();
        expect(Number.isFinite(problems[0].delta)).toBe(false);
    });

    test('catches a zone anchored off the profile', () => {
        generate(JOPA, {Z: 64, X: 628});
        // The class of bug the shared geometry is meant to make unrepresentable:
        // the right element, the right angle, an anchor displaced along the cut
        // axis. The check has to see it, because it reads the same geometry the
        // program text is formatted from.
        const correct = geometryOf(JOPA, 7);
        const displaced = [{
            threshold: null,
            geometry: {...correct, anchor: {...correct.anchor, X: correct.anchor.X + 16}},
            elementId: 7,
        }];

        const problems = validateZones(displaced, samples('processingStart'), 'approach', 'X', 'Z', true);

        expect(problems.length).toBeGreaterThan(0);
        expect(Math.abs(problems[0].delta)).toBeGreaterThan(1);
    });

    test('evaluateGeometry mirrors the emitted equation', () => {
        // The taper, the one branch of the JOPA cycle that is not a constant:
        // (8, 496) -> (0, 505), i.e. 505 - 1.125 * Z.
        expect(evaluateGeometry(geometryOf(JOPA, 1), 'X', 'Z', 0)).toBeCloseTo(505, 9);
        expect(evaluateGeometry(geometryOf(JOPA, 1), 'X', 'Z', 8)).toBeCloseTo(496, 9);
        expect(evaluateGeometry(geometryOf(JOPA, 1), 'X', 'Z', 4)).toBeCloseTo(500.5, 9);
        // A constant-X element holds its value anywhere along Z.
        expect(evaluateGeometry(geometryOf(JOPA, 7), 'X', 'Z', 33)).toBeCloseTo(505, 9);
        expect(evaluateGeometry(equationGeometry(undefined, 'X', 'Z'), 'X', 'Z', 0)).toBeNaN();
    });
});

describe('redundant branches', () => {
    const chains = (contour) => {
        const lines = generate(contour, {Z: 64, X: 628});
        return {
            approach: branches(section(lines, 'JOPA:', 'JOPA_START:')).map(label),
            cut: branches(section(lines, 'JOPA_START:', 'JOPA_END:')).map(label),
        };
    };

    test('an edge drawn as two collinear segments gets one branch', () => {
        // Without the merge this chain carries `IF R1>34` and `IF R1>19` moving
        // to the same X=1010, one of them dead weight.
        expect(chains(JOPA_SPLIT_EDGE)).toEqual(chains(JOPA));
    });

    test('an untrimmed contour stops emitting the overshoot as its own branch', () => {
        // id7 overshooting to Z=50 past id8's tip adds a change point at Z=49,
        // and the zone above it is the same edge as the zone below.
        expect(chains(JOPA_UNTRIMMED)).toEqual(chains(JOPA));
    });

    test('branches that differ are all kept', () => {
        const {approach, cut} = chains(JOPA);
        expect(approach).toHaveLength(3);
        expect(cut).toHaveLength(2);
    });
});

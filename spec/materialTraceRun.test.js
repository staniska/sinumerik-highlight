// Tests for driving the material trace over canvas elements
// (lib/materialTraceRun.js).
//
// The geometry itself is covered in spec/materialTrace.test.js. What is tested
// here is the translation: reading a blank and a tool outline out of canvas
// elements, recovering the compensation side that `offn()` overwrites, and
// advancing the material without ever having to undo a subtraction.

jest.mock('../lib/sinumerik', () => ({
    __esModule: true,
    default: {sinumerikView: {}},
}));

const View = require('../lib/sinumerik').default;
const {
    resetMaterialTrace,
    materialTraceState,
    advanceMaterialTrace,
    materialTraceRects,
    materialTraceGougeRects,
    worstGouge,
    materialTraceCollisionRects,
    worstCollision,
    elementsToPolygon,
    sectionToPolygon,
    noseFromSections,
    resolveCompensation,
    subtractSpansFrom,
    MATERIAL_TRACE_PITCH,
    SNAPSHOT_BUDGET_BYTES,
    MAX_SNAPSHOTS,
    UNDO_BUDGET_ENTRIES,
    COLLISION_GIVEUP,
    collisionCheckStopped,
} = require('../lib/materialTraceRun');
const {getSpans, totalArea} = require('../lib/materialTrace');

const TOOL_PATH = '/t/turn35.mpf';

// A canvas element the way CanvasElementsArray.push stamps it.
const g1 = (zs, xs, z, x, extra = {}) => ({
    type: 'G1',
    Z_start: zs, X_start: xs, Y_start: 0,
    Z: z, X: x, Y: 0,
    workPlane: 'G18',
    toolRadiusCompensation: 'G40',
    toolDef: {name: 'TURN35', path: TOOL_PATH},
    ...extra,
});

// Rectangular bar from z0 to z1, radius 0 to r, as a closed canvas path.
const bar = (z0, z1, r) => [
    g1(z0, 0, z1, 0), g1(z1, 0, z1, r), g1(z1, r, z0, r), g1(z0, r, z0, 0),
];

// A square cutting section w x w with its corner at the file zero, plus a nose
// arc so the compensation has a radius to work with.
const toolGeometry = (w = 2, noseRadius = 0.4) => ({
    name: 'TURN35',
    variables: {},
    warnings: [],
    errors: [],
    sections: [{
        color: '#d8a13b',
        role: 'cut',
        shapes: [
            g1(0, 0, w, 0), g1(w, 0, w, w), g1(w, w, 0, w), g1(0, w, 0, 0),
        ],
        elements: [{type: 'arc', radius: noseRadius, center: [noseRadius, 0, noseRadius]}],
    }],
});

const setup = (options = {}) => {
    View.sinumerikView = {
        parseData: {
            filename: '/p/main.mpf',
            blank: options.blank ?? bar(0, 20, 10),
        },
        programmData: {'/p/main.mpf': {machine: {machineType: options.machineType ?? 'Lathe'}}},
        toolGeometry: options.toolGeometry === null ? {} : {[TOOL_PATH]: options.toolGeometry ?? toolGeometry()},
    };
    resetMaterialTrace();
};

describe('reading geometry out of canvas elements', () => {
    beforeEach(() => setup());

    test('a path becomes a closed outline: first start, then every end', () => {
        // Same construction the WebGL blank fill uses, so the painted material
        // lines up with the drawn blank instead of being a pixel off.
        expect(elementsToPolygon([g1(0, 0, 5, 0), g1(5, 0, 5, 3)], 'Z', 'X'))
            .toEqual([[0, 0], [5, 0], [5, 3]]);
    });

    test('non-geometry entries are dropped', () => {
        const withNoise = [{type: 'msg'}, g1(0, 0, 5, 0), {type: 'pause'}];
        expect(elementsToPolygon(withNoise, 'Z', 'X')).toEqual([[0, 0], [5, 0]]);
    });

    test('an empty path is not an outline', () => {
        expect(elementsToPolygon([], 'Z', 'X')).toEqual([]);
        expect(elementsToPolygon(undefined, 'Z', 'X')).toEqual([]);
        expect(sectionToPolygon(undefined, 'Z', 'X')).toEqual([]);
    });
});

describe('the nose circle', () => {
    test('comes from the smallest arc of the cutting section', () => {
        const sections = [{
            role: 'cut',
            elements: [
                {type: 'arc', radius: 12, center: [1, 0, 2]},
                {type: 'arc', radius: 0.4, center: [0.4, 0, 0.4]},
                {type: 'line'},
            ],
        }];
        // Axis order follows the request: a0 = Z is index 2, a1 = X is index 0.
        expect(noseFromSections(sections, 'Z', 'X')).toEqual({center: [0.4, 0.4], radius: 0.4});
    });

    test('arcs outside the cutting section are ignored', () => {
        const sections = [
            {role: 'cut', elements: [{type: 'arc', radius: 0.8, center: [0.8, 0, 0.8]}]},
            {role: 'body', elements: [{type: 'arc', radius: 0.05, center: [0, 0, 0]}]},
        ];
        expect(noseFromSections(sections, 'Z', 'X').radius).toBeCloseTo(0.8, 10);
    });

    test('a tool drawn with straight lines only has no nose', () => {
        // Theoretically sharp: the compensation then degenerates to the
        // programmed path, which is what a zero-radius tool does.
        expect(noseFromSections([{role: 'cut', elements: [{type: 'line'}]}], 'Z', 'X')).toBeNull();
        expect(noseFromSections([], 'Z', 'X')).toBeNull();
        expect(noseFromSections(undefined, 'Z', 'X')).toBeNull();
    });

    test('degenerate arcs are not candidates', () => {
        const sections = [{role: 'cut', elements: [
            {type: 'arc', radius: 0, center: [0, 0, 0]},
            {type: 'arc', radius: NaN, center: [0, 0, 0]},
            {type: 'arc', radius: 0.4},
            {type: 'arc', radius: 0.6, center: [0.6, 0, 0.6]},
        ]}];
        expect(noseFromSections(sections, 'Z', 'X').radius).toBeCloseTo(0.6, 10);
    });
});

describe('recovering the compensation side offn() overwrote', () => {
    // offn() replaces G41/G42 with 'Approach'/'Departure' on the transition
    // blocks and with 'AutoInsert'/'offn_loop' on the ones it synthesises. The
    // side is gone in all four cases, and without recovering it a compensated
    // finishing pass would be swept as uncompensated — the outline a nose
    // radius away from where the tool really was.
    const chain = labels => labels.map(l => ({toolRadiusCompensation: l}));

    test('an explicit side is taken as it stands', () => {
        expect(resolveCompensation(chain(['G41']), 0)).toEqual({compensation: 'G41', ramp: null});
        expect(resolveCompensation(chain(['G42']), 0)).toEqual({compensation: 'G42', ramp: null});
    });

    test('an approach takes the side of the block it ramps into', () => {
        const els = chain(['G40', 'Approach', 'G41', 'G41']);
        expect(resolveCompensation(els, 1)).toEqual({compensation: 'G41', ramp: 'in'});
    });

    test('a departure takes the side of the block it ramps out of', () => {
        const els = chain(['G42', 'G42', 'Departure', 'G40']);
        expect(resolveCompensation(els, 2)).toEqual({compensation: 'G42', ramp: 'out'});
    });

    test('offn synthetic blocks inherit the side, with no ramp', () => {
        const els = chain(['G41', 'AutoInsert', 'offn_loop']);
        expect(resolveCompensation(els, 1)).toEqual({compensation: 'G41', ramp: null});
        expect(resolveCompensation(els, 2)).toEqual({compensation: 'G41', ramp: null});
    });

    test('the search stops at G40 rather than reaching across it', () => {
        // A transition block with uncompensated code on both sides has no side
        // to inherit; guessing one would offset a block that was never
        // compensated.
        const els = chain(['G41', 'G40', 'AutoInsert']);
        expect(resolveCompensation(els, 2)).toEqual({compensation: 'none', ramp: null});
    });

    test('with no side anywhere there is no compensation', () => {
        expect(resolveCompensation(chain(['Approach']), 0)).toEqual({compensation: 'none', ramp: null});
        expect(resolveCompensation(chain(['G40']), 0)).toEqual({compensation: 'none', ramp: null});
        expect(resolveCompensation([{}], 0)).toEqual({compensation: 'none', ramp: null});
    });
});

describe('what the tool removed', () => {
    test('spans present in the blank and gone from the material', () => {
        expect(subtractSpansFrom([[0, 10]], [[0, 6]])).toEqual([[6, 10]]);
        expect(subtractSpansFrom([[0, 10]], [[0, 3], [7, 10]])).toEqual([[3, 7]]);
        expect(subtractSpansFrom([[0, 10]], [])).toEqual([[0, 10]]);
        expect(subtractSpansFrom([[0, 10]], [[0, 10]])).toEqual([]);
        expect(subtractSpansFrom([], [[0, 10]])).toEqual([]);
    });
});

describe('advancing the material', () => {
    beforeEach(() => setup());

    const pass = () => [g1(18, 8, 2, 8)];   // straight cut along Z at radius 8

    test('refuses to run on a mill, and says so', () => {
        // Columns need a privileged axis. Reported rather than silently empty:
        // a feature whose job is showing what was cut must not read as
        // "nothing was cut".
        setup({machineType: 'Mill'});
        expect(advanceMaterialTrace(pass(), 1).status).toBe('notLathe');
    });

    test('refuses to run without a blank, and says so', () => {
        setup({blank: []});
        expect(advanceMaterialTrace(pass(), 1).status).toBe('noBlank');
    });

    test('seeds from the blank and removes along the pass', () => {
        const elements = pass();
        const st = advanceMaterialTrace(elements, 0);

        expect(st.status).toBe('ok');
        const seeded = totalArea(st.grid);
        expect(seeded).toBeGreaterThan(0);

        advanceMaterialTrace(elements, 1);
        expect(totalArea(st.grid)).toBeLessThan(seeded);
        expect(st.removed).toBeGreaterThan(0);
    });

    test('advancing is incremental, not a recomputation', () => {
        const elements = [g1(18, 8, 10, 8), g1(10, 8, 2, 8)];

        advanceMaterialTrace(elements, 1);
        const afterFirst = totalArea(materialTraceState().grid);
        expect(materialTraceState().appliedUpTo).toBe(1);

        advanceMaterialTrace(elements, 2);
        expect(materialTraceState().appliedUpTo).toBe(2);
        expect(totalArea(materialTraceState().grid)).toBeLessThan(afterFirst);
    });

    test('asking for the same limit twice changes nothing', () => {
        const elements = pass();
        advanceMaterialTrace(elements, 1);
        const once = totalArea(materialTraceState().grid);

        advanceMaterialTrace(elements, 1);
        expect(totalArea(materialTraceState().grid)).toBeCloseTo(once, 10);
    });

    test('a limit moving backwards rebuilds from the blank', () => {
        // Advancing subtracts, and a subtraction cannot be undone — so a
        // restarted animation has to start from the blank again.
        const elements = pass();
        advanceMaterialTrace(elements, 1);
        const cut = totalArea(materialTraceState().grid);

        advanceMaterialTrace(elements, 0);
        expect(materialTraceState().appliedUpTo).toBe(0);
        expect(totalArea(materialTraceState().grid)).toBeGreaterThan(cut);
    });

    test('a new element array rebuilds, so a re-parse does not keep an old trace', () => {
        advanceMaterialTrace(pass(), 1);
        const first = materialTraceState().grid;

        advanceMaterialTrace(pass(), 0);
        expect(materialTraceState().grid).not.toBe(first);
        expect(materialTraceState().appliedUpTo).toBe(0);
    });

    test('an element with no tool geometry is counted, not silently ignored', () => {
        // This is the "not computed" case: without an outline there is nothing
        // to sweep, and it must be distinguishable from "nothing was removed".
        setup({toolGeometry: null});
        const st = advanceMaterialTrace(pass(), 1);

        expect(st.skippedTool).toBe(1);
        expect(st.removed).toBe(0);
    });

    test('an element made in another plane is counted too', () => {
        const elements = [g1(18, 8, 2, 8, {workPlane: 'G17'})];
        const st = advanceMaterialTrace(elements, 1);

        expect(st.skippedPlane).toBe(1);
        expect(st.removed).toBe(0);
    });

    test('a body section does not remove material', () => {
        // Only ROLE:cut cuts. A holder that removed stock would quietly erase
        // the very collisions it is supposed to reveal.
        setup({toolGeometry: {
            sections: [{role: 'body', shapes: toolGeometry().sections[0].shapes, elements: []}],
        }});
        const st = advanceMaterialTrace(pass(), 1);

        expect(st.status).toBe('ok');
        expect(st.removed).toBe(0);
    });

    test('the grid reaches beyond the path by the tool outline it carries', () => {
        // The holder extends behind the tip; a grid cut to the trajectory
        // would clip it.
        const st = advanceMaterialTrace(pass(), 1);
        expect(st.grid.min).toBeLessThan(0);
        expect(st.grid.max).toBeGreaterThan(20);
    });

    test('an empty element list produces nothing', () => {
        expect(advanceMaterialTrace([], 0)).toBeNull();
        expect(advanceMaterialTrace(undefined, 0)).toBeNull();
    });
});

describe('rectangles for the renderer', () => {
    beforeEach(() => setup());

    test('nothing removed, nothing to draw', () => {
        advanceMaterialTrace([g1(18, 8, 2, 8)], 0);
        expect(materialTraceRects()).toEqual([]);
    });

    test('a straight pass merges into few rectangles, not one per column', () => {
        // At a 0.01 mm pitch a 16 mm cut is 1600 columns. Emitting a quad each
        // would be 1600 per frame for a single cut; run-length merging makes a
        // plain cylindrical pass a handful.
        const elements = [g1(18, 8, 2, 8)];
        advanceMaterialTrace(elements, 1);

        const rects = materialTraceRects();
        expect(rects.length).toBeGreaterThan(0);
        expect(rects.length).toBeLessThan(20);
    });

    test('the rectangles cover what the pass removed', () => {
        const elements = [g1(18, 8, 2, 8)];
        const st = advanceMaterialTrace(elements, 1);

        const area = materialTraceRects()
            .reduce((sum, r) => sum + (r.a0hi - r.a0lo) * (r.a1hi - r.a1lo), 0);
        expect(area).toBeCloseTo(st.removed * st.grid.pitch, 6);
    });

    test('rectangles stay inside the blank', () => {
        const elements = [g1(18, 8, 2, 8)];
        advanceMaterialTrace(elements, 1);

        materialTraceRects().forEach(r => {
            expect(r.a1lo).toBeGreaterThanOrEqual(0);
            expect(r.a1hi).toBeLessThanOrEqual(10 + 1e-9);
            expect(r.a0hi).toBeGreaterThan(r.a0lo);
            expect(r.a1hi).toBeGreaterThan(r.a1lo);
        });
    });

    test('no state, no rectangles', () => {
        resetMaterialTrace();
        expect(materialTraceRects()).toEqual([]);
    });
});

describe('cost of drawing the trace', () => {
    beforeEach(() => setup());

    test('only the columns the sweep reached are scanned', () => {
        // The grid spans the whole blank, which on a long part is millions of
        // columns; removed material can only live where the tool has been.
        const st = advanceMaterialTrace([g1(18, 8, 12, 8)], 1);

        expect(st.touchedMin).toBeGreaterThan(0);
        expect(st.touchedMax).toBeLessThan(st.grid.columns - 1);
        expect(st.touchedMax).toBeGreaterThanOrEqual(st.touchedMin);
    });

    test('nothing cut, nothing touched', () => {
        setup({toolGeometry: null});
        const st = advanceMaterialTrace([g1(18, 8, 12, 8)], 1);
        expect(st.touchedMin).toBe(Infinity);
        expect(materialTraceRects()).toEqual([]);
    });

    test('a redraw that cuts nothing reuses the rectangles it already built', () => {
        // Pan and zoom go through the same rebuild, and recomputing the whole
        // trace for a camera move would make them pay for it.
        const elements = [g1(18, 8, 12, 8)];
        advanceMaterialTrace(elements, 1);

        const first = materialTraceRects();
        expect(materialTraceRects()).toBe(first);
    });

    test('cutting more invalidates the cache', () => {
        const elements = [g1(18, 8, 12, 8), g1(12, 8, 4, 8)];
        advanceMaterialTrace(elements, 1);
        const first = materialTraceRects();

        advanceMaterialTrace(elements, 2);
        const second = materialTraceRects();
        expect(second).not.toBe(first);
        expect(second.length).toBeGreaterThan(0);
    });
});

describe('scrubbing the progress bar', () => {
    beforeEach(() => setup());

    // Clicking the bar or holding ArrowLeft is a first-class interaction
    // (lib/progressBar.js), and advancing is subtractive, so going back means
    // restoring an earlier state. Keyframes are what keep that from replaying
    // the whole program on every keypress — measured at 15 s before they
    // existed, against single-digit milliseconds with them.
    const manyPasses = () => {
        const els = [];
        for (let p = 0; p < 8; p++) {
            const r = 9 - p;
            for (let k = 0; k < 10; k++) els.push(g1(18 - (k * 16) / 10, r, 18 - ((k + 1) * 16) / 10, r));
        }
        return els;
    };

    test('keyframes are laid down while advancing', () => {
        const els = manyPasses();
        const st = advanceMaterialTrace(els, els.length);

        expect(st.snapshots.length).toBeGreaterThan(1);
        // One at the blank itself, so any rewind has a floor to land on.
        expect(st.snapshots[0].at).toBe(0);
        expect(st.snapshotEvery).toBeGreaterThanOrEqual(1);
    });

    test('going back lands on a keyframe instead of rebuilding from the blank', () => {
        const els = manyPasses();
        advanceMaterialTrace(els, els.length);
        const grid = materialTraceState().grid;

        advanceMaterialTrace(els, els.length - 1);

        // Same grid object: the state was restored in place, not rebuilt.
        expect(materialTraceState().grid).toBe(grid);
        expect(materialTraceState().appliedUpTo).toBe(els.length - 1);
    });

    test('a jump forward also uses a keyframe rather than replaying from here', () => {
        const els = manyPasses();
        advanceMaterialTrace(els, els.length);
        const atEnd = totalArea(materialTraceState().grid);

        advanceMaterialTrace(els, 0);
        expect(materialTraceState().appliedUpTo).toBe(0);

        advanceMaterialTrace(els, els.length);
        expect(totalArea(materialTraceState().grid)).toBeCloseTo(atEnd, 9);
    });

    test('scrubbing back and forth gives the same material as going straight there', () => {
        // The property the keyframes rely on: the material after N elements
        // depends only on the first N, not on the route taken.
        const els = manyPasses();
        const target = 37;

        advanceMaterialTrace(els, target);
        const direct = totalArea(materialTraceState().grid);
        const directRects = materialTraceRects().length;

        resetMaterialTrace();
        advanceMaterialTrace(els, els.length);
        advanceMaterialTrace(els, 5);
        advanceMaterialTrace(els, els.length - 2);
        advanceMaterialTrace(els, target);

        expect(totalArea(materialTraceState().grid)).toBeCloseTo(direct, 9);
        expect(materialTraceRects().length).toBe(directRects);
    });

    test('keyframe memory stays within its budget', () => {
        const els = manyPasses();
        const st = advanceMaterialTrace(els, els.length);

        const bytes = st.snapshots.length
            * (st.grid.starts.byteLength + st.grid.ends.byteLength + st.grid.counts.byteLength);
        expect(st.snapshots.length).toBeLessThanOrEqual(MAX_SNAPSHOTS);
        expect(bytes).toBeLessThanOrEqual(SNAPSHOT_BUDGET_BYTES);
    });

    test('the working pitch is coarse enough to keep up, and exact radially regardless', () => {
        // 7.8 ms per element at 0.01 mm froze the UI; 0.46 ms at 0.2 mm does
        // not. Cost is linear in 1/pitch, and only the axial direction is
        // discretised.
        const st = advanceMaterialTrace(manyPasses(), 1);
        expect(st.grid.pitch).toBeCloseTo(MATERIAL_TRACE_PITCH, 10);
        expect(MATERIAL_TRACE_PITCH).toBeGreaterThanOrEqual(0.1);
    });
});

describe('keyframes earn their keep', () => {
    beforeEach(() => setup());

    const passes = n => {
        const els = [];
        for (let p = 0; p < n; p++) {
            const r = 9 - (p % 8);
            for (let k = 0; k < 8; k++) els.push(g1(18 - (k * 16) / 8, r, 18 - ((k + 1) * 16) / 8, r));
        }
        return els;
    };

    test('a jump forward sweeps a fraction of the program, not all of it again', () => {
        // Without the forward shortcut the result would be identical and only
        // the cost would differ — which is why this counts work instead of
        // comparing material.
        const els = passes(8);
        advanceMaterialTrace(els, els.length);
        advanceMaterialTrace(els, 0);

        const before = materialTraceState().swept;
        advanceMaterialTrace(els, els.length);
        const done = materialTraceState().swept - before;

        expect(done).toBeLessThanOrEqual(materialTraceState().snapshotEvery);
        expect(done).toBeLessThan(els.length);
    });

    test('a step back sweeps almost nothing', () => {
        const els = passes(8);
        advanceMaterialTrace(els, els.length);

        const before = materialTraceState().swept;
        advanceMaterialTrace(els, els.length - 1);
        const done = materialTraceState().swept - before;

        // At worst a replay from the nearest keyframe to one element short of
        // where we were — bounded by the keyframe spacing, never by the
        // program length. Before keyframes existed this was the whole program,
        // measured at 15 s.
        expect(done).toBeLessThanOrEqual(materialTraceState().snapshotEvery);
    });

    test('past the cap the spacing doubles instead of the memory growing', () => {
        // 64 elements with a small grid asks for one keyframe per element, which
        // overruns the cap and must thin out rather than keep allocating.
        const els = passes(8);
        expect(els.length).toBe(64);

        const st = advanceMaterialTrace(els, els.length);
        expect(st.snapshots.length).toBeLessThanOrEqual(MAX_SNAPSHOTS);
        expect(st.snapshotEvery).toBeGreaterThan(1);
    });
});

describe('stepping back one element at a time', () => {
    beforeEach(() => setup());

    // ArrowLeft is pressed repeatedly, and with keyframes alone each press
    // restored the nearest one and replayed up to `snapshotEvery` elements —
    // paying that cost again on every press. The undo log makes a step cost
    // what the element cost: ten presses measured at 15 ms against ~130 ms.
    const passes = () => {
        const els = [];
        for (let p = 0; p < 6; p++) {
            const r = 9 - p;
            for (let k = 0; k < 10; k++) els.push(g1(18 - (k * 16) / 10, r, 18 - ((k + 1) * 16) / 10, r));
        }
        return els;
    };

    test('a record is kept for every element that cut something', () => {
        const els = passes();
        const st = advanceMaterialTrace(els, els.length);

        expect(st.undo.length).toBe(els.length);
        expect(st.undoEntries).toBeGreaterThan(0);
        expect(st.undo[st.undo.length - 1].at).toBe(els.length - 1);
    });

    test('an element that cut nothing leaves no record', () => {
        setup({toolGeometry: null});
        const st = advanceMaterialTrace(passes(), 5);
        expect(st.undo.length).toBe(0);
    });

    test('a step back is undone, not replayed', () => {
        const els = passes();
        advanceMaterialTrace(els, els.length);

        const before = materialTraceState().swept;
        advanceMaterialTrace(els, els.length - 1);

        // Nothing was swept again: the previous spans were simply put back.
        expect(materialTraceState().swept).toBe(before - 1);
        expect(materialTraceState().undo.length).toBe(els.length - 1);
    });

    test('ten steps back do not sweep anything at all', () => {
        const els = passes();
        advanceMaterialTrace(els, els.length);
        const before = materialTraceState().swept;

        for (let k = 1; k <= 10; k++) advanceMaterialTrace(els, els.length - k);

        expect(materialTraceState().swept).toBe(before - 10);
        expect(materialTraceState().appliedUpTo).toBe(els.length - 10);
    });

    test('undoing restores exactly the material that was there', () => {
        // The property the whole log rests on: an undone element leaves the
        // grid byte-for-byte as it was before it ran.
        const els = passes();
        advanceMaterialTrace(els, 40);
        const at40 = totalArea(materialTraceState().grid);
        const rectsAt40 = materialTraceRects().length;

        advanceMaterialTrace(els, 55);
        advanceMaterialTrace(els, 40);

        expect(totalArea(materialTraceState().grid)).toBeCloseTo(at40, 9);
        expect(materialTraceRects().length).toBe(rectsAt40);
        expect(materialTraceState().removed).toBeGreaterThan(0);
    });

    test('removed length is unwound along with the material', () => {
        const els = passes();
        advanceMaterialTrace(els, 20);
        const removedAt20 = materialTraceState().removed;

        advanceMaterialTrace(els, 30);
        advanceMaterialTrace(els, 20);

        expect(materialTraceState().removed).toBeCloseTo(removedAt20, 9);
    });

    test('restoring a keyframe drops the log, since it no longer ends where we are', () => {
        const els = passes();
        advanceMaterialTrace(els, els.length);

        // Rewinding past the log forces the keyframe path.
        materialTraceState().undo = materialTraceState().undo.slice(-2);
        materialTraceState().undoEntries = 2;
        advanceMaterialTrace(els, 5);

        const st = materialTraceState();
        expect(st.appliedUpTo).toBe(5);
        // Whatever is in the log now was recorded while replaying forward from
        // the keyframe, so it still ends exactly where we are.
        if (st.undo.length) expect(st.undo[st.undo.length - 1].at).toBe(4);
    });

    test('the log stays within its entry budget', () => {
        const st = advanceMaterialTrace(passes(), 60);
        expect(st.undoEntries).toBeLessThanOrEqual(UNDO_BUDGET_ENTRIES);
    });
});

describe('undoing an element that cut a column more than once', () => {
    // Only the FIRST touch of a column may be recorded. Recording every touch
    // captures the state left by the element's own earlier cuts, so undoing
    // restores a half-cut column and quietly loses material. One cutting
    // section with one span per column never exercises that — two overlapping
    // sections do.
    const twoSections = () => ({
        sections: [
            {role: 'cut', shapes: [g1(0, 0, 2, 0), g1(2, 0, 2, 3), g1(2, 3, 0, 3), g1(0, 3, 0, 0)], elements: []},
            {role: 'cut', shapes: [g1(0, 2, 2, 2), g1(2, 2, 2, 6), g1(2, 6, 0, 6), g1(0, 6, 0, 2)], elements: []},
        ],
    });

    test('undoing restores the column completely, not just the last cut', () => {
        setup({toolGeometry: twoSections()});
        const elements = [g1(14, 4, 6, 4)];

        advanceMaterialTrace(elements, 0);
        const seeded = totalArea(materialTraceState().grid);

        advanceMaterialTrace(elements, 1);
        expect(totalArea(materialTraceState().grid)).toBeLessThan(seeded);

        advanceMaterialTrace(elements, 0);
        expect(totalArea(materialTraceState().grid)).toBeCloseTo(seeded, 9);
        expect(materialTraceRects()).toEqual([]);
    });
});

describe('gouges into the finished part', () => {
    // The part is a shaft of radius 5 inside a blank of radius 10, so anything
    // the tool takes below radius 5 is a gouge.
    const part = () => bar(0, 20, 5);

    const cutTo = radius => [g1(18, radius, 2, radius)];

    const setupWithPart = (options = {}) => {
        setup(options);
        View.sinumerikView.parseData.contour = options.contour === null ? [] : (options.contour ?? part());
        resetMaterialTrace();
    };

    test('a cut that stops above the part is not a gouge', () => {
        setupWithPart();
        // The tool square is 2 tall sitting at radius 6, so it reaches down to 6.
        const st = advanceMaterialTrace(cutTo(6), 1);

        expect(st.removed).toBeGreaterThan(0);
        expect(st.gouges).toEqual([]);
        expect(materialTraceGougeRects()).toEqual([]);
        expect(worstGouge()).toBeNull();
    });

    test('a cut reaching into the part is a gouge, with a depth in millimetres', () => {
        setupWithPart();
        // Sitting at radius 3 the outline spans 3..5, so it eats 2 mm of part.
        const st = advanceMaterialTrace(cutTo(3), 1);

        expect(st.gouges).toHaveLength(1);
        const worst = worstGouge();
        expect(worst.depth).toBeCloseTo(2, 6);
        expect(materialTraceGougeRects().length).toBeGreaterThan(0);
    });

    test('the report says which line did it', () => {
        setupWithPart();
        const elements = [{...cutTo(3)[0], row: 42, sourceFile: 'MAIN_MPF'}];
        advanceMaterialTrace(elements, 1);

        const worst = worstGouge();
        expect(worst.row).toBe(42);
        expect(worst.sourceFile).toBe('MAIN_MPF');
        // And where to look: axial position and the radius reached.
        expect(worst.Z).toBeGreaterThan(0);
        expect(worst.X).toBeCloseTo(3, 6);
    });

    test('the gouged area is the removed material inside the part, and no more', () => {
        setupWithPart();
        // The outline is 2 mm tall and the reference point rides at radius 4, so
        // it spans 4..6 and straddles the part boundary at 5: half of what it
        // takes is legitimate stock, half is the part.
        advanceMaterialTrace(cutTo(4), 1);

        const gougeArea = materialTraceGougeRects()
            .reduce((sum, r) => sum + (r.a0hi - r.a0lo) * (r.a1hi - r.a1lo), 0);
        const removedArea = materialTraceRects()
            .reduce((sum, r) => sum + (r.a0hi - r.a0lo) * (r.a1hi - r.a1lo), 0);

        expect(gougeArea).toBeGreaterThan(0);
        expect(gougeArea).toBeLessThan(removedArea);
        expect(gougeArea / removedArea).toBeCloseTo(0.5, 2);
        expect(worstGouge().depth).toBeCloseTo(1, 6);
    });

    test('a trajectory inside the part is not by itself a gouge', () => {
        // The case the plan singles out: with the compensation worked out by
        // hand the programmed line runs inside the part on every finishing
        // block. Judging by the path would light up the whole program; only the
        // swept material counts.
        setupWithPart();

        // The line runs at radius 4 — inside the part — while the outline sits
        // above it and takes nothing below 5.
        const alongInside = [{...g1(18, 4, 2, 4), toolDef: {name: 'T', path: TOOL_PATH}}];
        setup({toolGeometry: {sections: [{
            role: 'cut',
            // Outline from +1 to +3 above the reference point: the tool body is
            // entirely outside the part while its zero rides inside it.
            shapes: [g1(0, 1, 2, 1), g1(2, 1, 2, 3), g1(2, 3, 0, 3), g1(0, 3, 0, 1)],
            elements: [],
        }]}});
        View.sinumerikView.parseData.contour = part();
        resetMaterialTrace();

        const st = advanceMaterialTrace(alongInside, 1);
        expect(st.removed).toBeGreaterThan(0);
        expect(st.gouges).toEqual([]);
    });

    test('with no contour the question cannot be answered, and that is recorded', () => {
        // Not the same as "no gouges": without a finished part there is nothing
        // to compare against, and stage 7 has to be able to say so.
        setupWithPart({contour: null});
        const st = advanceMaterialTrace(cutTo(3), 1);

        expect(st.partKnown).toBe(false);
        expect(st.gouges).toEqual([]);
        expect(materialTraceGougeRects()).toEqual([]);
    });

    test('rewinding unwinds the gouges with the material', () => {
        setupWithPart();
        const elements = [g1(18, 6, 10, 6), g1(10, 3, 2, 3)];

        advanceMaterialTrace(elements, 1);
        expect(materialTraceState().gouges).toEqual([]);

        advanceMaterialTrace(elements, 2);
        expect(materialTraceState().gouges).toHaveLength(1);
        expect(materialTraceGougeRects().length).toBeGreaterThan(0);

        advanceMaterialTrace(elements, 1);
        expect(materialTraceState().gouges).toEqual([]);
        expect(materialTraceGougeRects()).toEqual([]);
    });

    test('re-cutting air already gouged does not report it twice', () => {
        // Only material actually taken counts, so a second pass through the
        // same space has nothing left to remove.
        setupWithPart();
        const elements = [g1(18, 3, 2, 3), g1(2, 3, 18, 3)];

        advanceMaterialTrace(elements, 2);
        expect(materialTraceState().gouges).toHaveLength(1);
    });

    test('a keyframe carries the gouges, so rewinding past the log clears them', () => {
        // The undo path covers short steps; a long rewind lands on a keyframe
        // instead. If the keyframe did not carry the gouge list, a gouge would
        // survive a rewind to before the element that caused it — reported
        // against material that is back in place.
        setupWithPart();
        const elements = [];
        for (let k = 0; k < 40; k++) elements.push(g1(18 - k * 0.4, 7, 17.6 - k * 0.4, 7));
        elements.push(g1(10, 3, 2, 3));          // the gouging block, last

        advanceMaterialTrace(elements, elements.length);
        expect(materialTraceState().gouges).toHaveLength(1);

        // Force the keyframe path rather than the undo log.
        materialTraceState().undo = [];
        materialTraceState().undoEntries = 0;
        advanceMaterialTrace(elements, 10);

        expect(materialTraceState().appliedUpTo).toBe(10);
        expect(materialTraceState().gouges).toEqual([]);
        expect(materialTraceGougeRects()).toEqual([]);
    });

    test('the deepest gouge is the one reported', () => {
        setupWithPart();
        const elements = [g1(18, 4, 10, 4), g1(10, 1, 2, 1)];
        advanceMaterialTrace(elements, 2);

        expect(materialTraceState().gouges.length).toBeGreaterThan(1);
        const depths = materialTraceState().gouges.map(g => g.depth);
        expect(worstGouge().depth).toBeCloseTo(Math.max(...depths), 10);
    });
});

describe('holder collisions', () => {
    // A tool built the way a real one is: an insert at the reference point and a
    // shank trailing it along +a0.
    //
    // `a1` grows AWAY from the spindle axis, so a shank above the tip is in air
    // and can never be the dangerous one. The holder that bites is the one
    // reaching BELOW the tip, towards the axis — a negative `shankLo`, which is
    // the real failure: a holder not set back far enough.
    const withShank = (shankLo = 0, shankHi = 6) => ({
        sections: [
            {role: 'cut', shapes: [g1(0, 0, 2, 0), g1(2, 0, 2, 2), g1(2, 2, 0, 2), g1(0, 2, 0, 0)], elements: []},
            {role: 'body', shapes: [
                g1(2, shankLo, 12, shankLo), g1(12, shankLo, 12, shankHi),
                g1(12, shankHi, 2, shankHi), g1(2, shankHi, 2, shankLo),
            ], elements: []},
        ],
    });

    const longBlank = () => bar(0, 60, 10);

    test('an ordinary pass is clean, though the shank follows through the same block', () => {
        // The trap this check is built around. The shank trails the insert, so
        // within one block it travels through stock the insert cleared moments
        // earlier — in that very block. Judged against the material as it stood
        // before the block, every normal cut would report a collision.
        //
        // The pass starts at a0 58 so the shank (which sits +2..+12 behind the
        // reference point) begins clear of the 60 mm blank. Starting further in
        // would bury it in stock before the tool even moves, which is a genuine
        // collision and a different test.
        setup({toolGeometry: withShank(), blank: longBlank()});
        const st = advanceMaterialTrace([g1(58, 8, 10, 8)], 1);

        expect(st.removed).toBeGreaterThan(0);
        expect(st.collisions).toEqual([]);
        expect(worstCollision()).toBeNull();
        expect(materialTraceCollisionRects()).toEqual([]);
    });

    test('a shank reaching below the tip ploughs through stock', () => {
        // Riding at radius 8 the insert cuts 8..10; a shank hanging 2 mm below
        // the tip spans 6..14, and 6..8 is metal the edge never touches.
        setup({toolGeometry: withShank(-2), blank: longBlank()});
        const st = advanceMaterialTrace([g1(58, 8, 10, 8)], 1);

        expect(st.collisions.length).toBeGreaterThan(0);
        expect(worstCollision().depth).toBeGreaterThan(0);
        expect(materialTraceCollisionRects().length).toBeGreaterThan(0);
    });

    test('the report says which line did it and where', () => {
        setup({toolGeometry: withShank(-2), blank: longBlank()});
        const elements = [{...g1(58, 8, 10, 8), row: 77, sourceFile: 'SUB_SPF'}];
        advanceMaterialTrace(elements, 1);

        const worst = worstCollision();
        expect(worst.row).toBe(77);
        expect(worst.sourceFile).toBe('SUB_SPF');
        expect(worst.Z).toBeGreaterThan(0);
        expect(Number.isFinite(worst.X)).toBe(true);
    });

    test('a shank leading into untouched stock does collide', () => {
        // Travelling the other way the shank runs ahead of the edge, and the
        // stretch beyond the edge's own sweep is material nothing has cleared.
        setup({toolGeometry: withShank(), blank: longBlank()});
        const st = advanceMaterialTrace([g1(10, 8, 30, 8)], 1);

        expect(st.collisions.length).toBeGreaterThan(0);
    });

    test('a shank leading into stock an earlier block cleared does not', () => {
        // The reason the check has to be sequential: a holder is allowed
        // anywhere the tool has already been. Same move as above, after a pass
        // that cleared the ground it runs onto.
        setup({toolGeometry: withShank(), blank: longBlank()});
        const elements = [g1(58, 8, 5, 8), g1(10, 8, 30, 8)];

        advanceMaterialTrace(elements, 1);
        expect(materialTraceState().collisions).toEqual([]);

        advanceMaterialTrace(elements, 2);
        expect(materialTraceState().collisions).toEqual([]);
    });

    test('an ignored section never collides, even hanging below the tip', () => {
        // Shaped exactly like the shank that does collide, so the test turns on
        // the role and nothing else. An ignore section sitting in clear air
        // above the tip would pass whether the role were honoured or not.
        setup({toolGeometry: {sections: [
            {role: 'cut', shapes: [g1(0, 0, 2, 0), g1(2, 0, 2, 2), g1(2, 2, 0, 2), g1(0, 2, 0, 0)], elements: []},
            {role: 'ignore', shapes: [g1(2, -2, 12, -2), g1(12, -2, 12, 6), g1(12, 6, 2, 6), g1(2, 6, 2, -2)], elements: []},
        ]}, blank: longBlank()});
        const st = advanceMaterialTrace([g1(58, 8, 10, 8)], 1);

        expect(st.collisions).toEqual([]);

        // ...whereas the same shape as a holder does collide.
        setup({toolGeometry: withShank(-2), blank: longBlank()});
        expect(advanceMaterialTrace([g1(58, 8, 10, 8)], 1).collisions.length).toBeGreaterThan(0);
    });

    test('a section with no ROLE: collides, because the default is body', () => {
        // Fail-safe: a forgotten role shows a false collision, which is visible
        // and fixable, rather than a false all-clear in a feature whose purpose
        // is catching crashes.
        setup({toolGeometry: {sections: [
            {role: 'body', shapes: [g1(0, 0, 10, 0), g1(10, 0, 10, 8), g1(10, 8, 0, 8), g1(0, 8, 0, 0)], elements: []},
        ]}, blank: longBlank()});
        const st = advanceMaterialTrace([g1(40, 2, 20, 2)], 1);

        expect(st.removed).toBe(0);                 // nothing is marked as cutting
        expect(st.collisions.length).toBeGreaterThan(0);
    });

    test('a tool with no holder skips the extra sweep entirely', () => {
        setup();                                     // the default fixture is cut-only
        const st = advanceMaterialTrace([g1(18, 8, 2, 8)], 1);

        expect(st.hasBody).toBe(false);
        expect(st.collisions).toEqual([]);
    });

    test('rewinding unwinds collisions with the material', () => {
        setup({toolGeometry: withShank(-2), blank: longBlank()});
        const elements = [g1(55, 9, 50, 9), g1(50, 8, 20, 8)];

        advanceMaterialTrace(elements, 1);
        const quiet = materialTraceState().collisions.length;

        advanceMaterialTrace(elements, 2);
        expect(materialTraceState().collisions.length).toBeGreaterThan(quiet);

        advanceMaterialTrace(elements, 1);
        expect(materialTraceState().collisions.length).toBe(quiet);
    });

    test('a keyframe carries the collisions', () => {
        setup({toolGeometry: withShank(-2), blank: longBlank()});
        // The priming blocks run at radius 12, clear of the 10 mm blank, so the
        // only collision in the program is the plunge at the end.
        const elements = [];
        for (let k = 0; k < 40; k++) elements.push(g1(58 - k * 0.1, 12, 57.9 - k * 0.1, 12));
        elements.push(g1(50, 8, 20, 8));

        advanceMaterialTrace(elements, elements.length);
        expect(materialTraceState().collisions.length).toBeGreaterThan(0);

        materialTraceState().undo = [];
        materialTraceState().undoEntries = 0;
        advanceMaterialTrace(elements, 10);

        expect(materialTraceState().appliedUpTo).toBe(10);
        expect(materialTraceState().collisions).toEqual([]);
    });

    test('collided columns beyond the cut range are still painted', () => {
        // A holder can hit stock the tool never touched — that is the point — so
        // the rectangles cannot be limited to the columns that were cut. Here the
        // insert sweeps to about a0 42 while the shank reaches 52.
        setup({toolGeometry: withShank(), blank: longBlank()});
        advanceMaterialTrace([g1(40, 8, 30, 8)], 1);

        const st = materialTraceState();
        const cutEdge = st.grid.min + (st.touchedMax + 1) * st.grid.pitch;
        const rects = materialTraceCollisionRects();

        expect(rects.length).toBeGreaterThan(0);
        expect(rects.some(r => r.a0hi > cutEdge)).toBe(true);
    });
});

describe('a holder that collides everywhere', () => {
    // A ROLE:body section drawn below the cutting tip strikes on every block. The
    // report says so hundreds of times over, and carrying on costs ten times the
    // rest of the trace — 4.8 ms per element against 0.5 for a sound tool. So the
    // check stops, and records that it did.
    const belowTip = () => ({
        sections: [
            {role: 'cut', shapes: [g1(0, 0, 2, 0), g1(2, 0, 2, 2), g1(2, 2, 0, 2), g1(0, 2, 0, 0)], elements: []},
            {role: 'body', shapes: [g1(2, -2, 12, -2), g1(12, -2, 12, 6), g1(12, 6, 2, 6), g1(2, 6, 2, -2)], elements: []},
        ],
    });

    test('the check stops after enough strikes, and says so', () => {
        setup({toolGeometry: belowTip(), blank: bar(0, 600, 10)});
        const elements = [];
        for (let k = 0; k < COLLISION_GIVEUP + 50; k++) elements.push(g1(590 - k, 8, 589 - k, 8));

        const st = advanceMaterialTrace(elements, elements.length);

        expect(collisionCheckStopped()).toBe(true);
        expect(st.collisions.length).toBeLessThan(elements.length);
        expect(st.collisions.length).toBeGreaterThanOrEqual(COLLISION_GIVEUP);
    });

    test('a sound tool never trips it', () => {
        setup({blank: bar(0, 600, 10)});
        const elements = [];
        for (let k = 0; k < COLLISION_GIVEUP + 50; k++) elements.push(g1(590 - k, 8, 589 - k, 8));

        advanceMaterialTrace(elements, elements.length);
        expect(collisionCheckStopped()).toBe(false);
    });

    test('rewinding past the point it stopped resumes checking', () => {
        setup({toolGeometry: belowTip(), blank: bar(0, 600, 10)});
        const elements = [];
        for (let k = 0; k < COLLISION_GIVEUP + 50; k++) elements.push(g1(590 - k, 8, 589 - k, 8));

        advanceMaterialTrace(elements, elements.length);
        expect(collisionCheckStopped()).toBe(true);

        // Derived from the collision list, so unwinding the list unwinds this
        // with no flag to remember to reset.
        advanceMaterialTrace(elements, 5);
        expect(collisionCheckStopped()).toBe(false);
    });
});

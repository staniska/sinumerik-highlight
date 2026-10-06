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
    elementsToPolygon,
    sectionToPolygon,
    noseFromSections,
    resolveCompensation,
    subtractSpansFrom,
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

jest.mock('../lib/sinumerik', () => ({__esModule: true, default: {sinumerikView: {}}}));

const View = require('../lib/sinumerik').default;
const {planMaterialGrid} = require('../lib/materialGridPlan');
const {createGrid, columnIndex, columnCenter, columnEdge, columnWidth, columnRange,
    setSpans, seedFromPolygon, sweepSegment, subtractSpan, totalArea, getSpans} = require('../lib/materialTrace');
const {advanceMaterialTrace, resetMaterialTrace, materialTraceState, materialTraceRects,
    materialTraceGougeRects, worstGouge, setPartialFrame, materialTracePartialRects,
    materialTraceThreadRects, worstCollision, describeMaterialTrace,
    MATERIAL_TRACE_BUDGET_BYTES, ADAPTIVE_MATERIAL_TRACE_BUDGET_BYTES} = require('../lib/materialTraceRun');
const {stockOutline} = require('../lib/stockOutline');
const {buildStockGrid} = require('../lib/inProcessStock');

const rect = (lo, hi, bottom = 0, top = 10) => [[lo, bottom], [hi, bottom], [hi, top], [lo, top]];
const toolPath = '/tools/groove.mpf';
const line = (z0, x0, z, x, extra = {}) => ({type: 'G1', workPlane: 'G18',
    Z_start: z0, X_start: x0, Y_start: 0, Z: z, X: x, Y: 0,
    toolRadiusCompensation: 'G40', toolDef: {path: toolPath}, ...extra});
const shapes = poly => poly.map((p, i) => {
    const q = poly[(i + 1) % poly.length];
    return line(p[0], p[1], q[0], q[1]);
});
function setup({blank = rect(0, 100), part = rect(0, 100, 0, 4),
    tool = rect(0, 10, 0, 2), body = null} = {}) {
    View.sinumerikView = {
        parseData: {filename: 'main.mpf', blank: shapes(blank), contour: shapes(part)},
        programmData: {'main.mpf': {machine: {machineType: 'Lathe'}}},
        toolGeometry: {[toolPath]: {variables: {}, sections: [
            {role: 'cut', shapes: shapes(tool), elements: []},
            ...(body ? [{role: 'body', shapes: shapes(body), elements: []}] : []),
        ]}},
    };
    resetMaterialTrace();
}
const adaptive = (program, limit = program.length) => advanceMaterialTrace(program, limit, {adaptive: true});
const widthAt = (grid, z) => columnWidth(grid, columnIndex(grid, z));
const areaOfRects = rects => rects.reduce((area, r) => area + (r.a0hi - r.a0lo) * (r.a1hi - r.a1lo), 0);

describe('nonuniform column coordinates', () => {
    test('searches half-open cells, clips ranges, and samples their physical centres', () => {
        const edges = new Float64Array([-1, -0.5, -0.48, 0, 0.02, 0.5]);
        const grid = createGrid({min: -1, max: 0.5, pitch: 0.5, edges});
        expect(grid.edges).toBe(edges);
        expect(columnIndex(grid, -0.5)).toBe(1);
        expect(columnIndex(grid, -0.49)).toBe(1);
        expect(columnIndex(grid, 0.5)).toBe(-1);
        expect(columnIndex(grid, -2)).toBe(-1);
        expect(columnCenter(grid, 1)).toBeCloseTo(-0.49, 12);
        expect(columnEdge(grid, 3)).toBe(0);
        expect(columnRange(grid, -2, 2)).toEqual([0, 4]);
        expect(columnRange(grid, 0.6, 1)).toEqual([0, -1]);
        expect(() => createGrid({min: 0, max: 1, pitch: 0.5,
            edges: new Float64Array([0, 0.5, 0.5, 1])})).toThrow(/edges/);
    });

    test('removes the analytic area across cells of very different widths', () => {
        const grid = createGrid({min: 0, max: 2, pitch: 0.5,
            edges: new Float64Array([0, 0.5, 0.52, 0.54, 1, 1.5, 2])});
        seedFromPolygon(grid, rect(0, 2));
        sweepSegment(grid, rect(0.5, 1.5, 3, 7), [0, 0], [0, 0],
            (i, spans) => spans.forEach(([lo, hi]) => subtractSpan(grid, i, lo, hi)));
        expect(totalArea(grid)).toBeCloseTo(16, 10);
        expect(getSpans(grid, 1)).toEqual([[0, 3], [7, 10]]);
    });

    test('stock outlines follow actual edges rather than an assumed pitch', () => {
        const grid = createGrid({min: 0, max: 2, pitch: 0.5,
            edges: new Float64Array([0, 0.02, 0.04, 0.54, 1.04, 1.54, 2])});
        for (let i = 0; i < grid.columns; i++) setSpans(grid, i, [[0, i < 2 ? 5 : 10]]);
        const result = stockOutline(grid, {tolerance: 0.001});
        expect(result).toHaveLength(1);
        expect(result[0].area).toBeCloseTo(19.8, 10);
        expect(result[0].points).toContainEqual([0.04, 5]);
        expect(result[0].points).toContainEqual([0.04, 10]);
    });
});

describe('planning before the cut', () => {
    test.each([[0, 10], [-10, 0], [-5, 5]])('covers both edges of a 10 mm tool [%s, %s]', (lo, hi) => {
        const plan = planMaterialGrid({min: -50, max: 50, placements: [
            {polygon: rect(lo, hi, 0, 2), from: [-20, 12], to: [-20, 0]},
        ]});
        const grid = createGrid({min: -50, max: 50, pitch: 0.5, edges: plan.edges});
        for (let z = -20 + lo; z < -20 + hi; z += 0.13) expect(widthAt(grid, z)).toBeLessThanOrEqual(0.020000001);
        expect(widthAt(grid, 20)).toBeCloseTo(0.5, 10);
        expect(plan.fineColumns).toBeGreaterThan(0);
        expect(plan.coarseColumns).toBeGreaterThan(0);
    });

    test('refines endpoints but keeps the constant middle of a long horizontal pass coarse', () => {
        const plan = planMaterialGrid({min: -5, max: 110,
            profiles: [rect(0, 100)], placements: [
                {polygon: rect(0, 2, 0, 2), from: [5, 8], to: [95, 8]},
            ]});
        const grid = createGrid({min: -5, max: 110, pitch: 0.5, edges: plan.edges});
        expect(widthAt(grid, 50)).toBeCloseTo(0.5, 10);
        for (const z of [0, 5, 6.9, 95, 96.9, 100]) expect(widthAt(grid, z)).toBeLessThanOrEqual(0.020000001);
        expect(grid.columns).toBeLessThan(115 / 0.02 / 3);
    });

    test('a taper with no toolpath and a nearly horizontal move still require refinement', () => {
        const plan = planMaterialGrid({min: 0, max: 100,
            profiles: [[[0, 0], [100, 0], [100, 10], [0, 5]]], placements: [
                {polygon: rect(0, 1), from: [0, 8], to: [90, 8 + 1e-10]},
            ]});
        expect(plan.coarseColumns).toBe(0);
    });

    test('a wide holder refines both footprints beyond the cutting edge', () => {
        const plan = planMaterialGrid({min: -20, max: 120, placements: [
            {polygon: rect(-15, 30), from: [20, 12], to: [70, 12]},
        ]});
        const grid = createGrid({min: -20, max: 120, pitch: 0.5, edges: plan.edges});
        for (const z of [5, 20, 50, 99]) expect(widthAt(grid, z)).toBeLessThanOrEqual(0.020000001);
        expect(widthAt(grid, 52.5)).toBeCloseTo(0.5, 10);
    });

    test('does not silently coarsen when the budget cannot hold the fine zones', () => {
        expect(() => planMaterialGrid({min: 0, max: 100, maxColumns: 10,
            profiles: [rect(0, 100)]})).toThrow(/memory budget/);
    });
});

describe('adaptive material integration', () => {
    beforeEach(() => setup());

    test('shares the immutable layout and preserves the analytic removed area', () => {
        const program = [line(5, 8, 85, 8)];
        const st = adaptive(program);
        expect(st.status).toBe('ok');
        expect(st.grid.edges).toBe(st.seed.edges);
        expect(st.grid.edges).toBe(st.part.edges);
        expect(st.meshPlan.coarseColumns).toBeGreaterThan(0);
        expect(st.removedArea).toBeCloseTo(180, 8);
        expect(totalArea(st.seed) - totalArea(st.grid)).toBeCloseTo(st.removedArea, 8);
        expect(areaOfRects(materialTraceRects())).toBeCloseTo(st.removedArea, 8);
    });

    test('places the 10 mm fine band using the actual offset tool, including a second section', () => {
        setup({tool: rect(-10, 0, 0, 2)});
        View.sinumerikView.toolGeometry[toolPath].sections.push({role: 'cut',
            shapes: shapes(rect(4, 6, 0, 2)), elements: []});
        const st = adaptive([line(40, 12, 40, 0)]);
        for (const z of [30, 35, 39.9, 44, 45.9]) expect(widthAt(st.grid, z)).toBeLessThanOrEqual(0.020000001);
    });

    test('plans the compensated reference point rather than the programmed line', () => {
        setup({tool: rect(-5, 5, 0, 2)});
        View.sinumerikView.toolGeometry[toolPath].variables = {'$TC_DP2': 9, '$TC_DP6': 2};
        const st = adaptive([line(40, 12, 40, 0, {toolRadiusCompensation: 'G41'})]);
        // Downward X travel under G41 moves the circular tool centre +2 in Z.
        for (const z of [37, 42, 46.9]) expect(widthAt(st.grid, z)).toBeLessThanOrEqual(0.020000001);
        expect(widthAt(st.grid, 34)).toBeGreaterThan(0.02);
    });

    test('long horizontal cuts with a holder agree with a fine uniform run', () => {
        setup({tool: rect(0, 2, 0, 1), body: rect(-5, 2, 1, 15)});
        const program = [line(10, 8, 80, 8), line(30, 6, 70, 6),
            line(20, 5, 65, 5), line(68, 12, 68, 3)];
        const st = adaptive(program);
        const collisionDepths = st.collisions.map(hit => hit.depth);
        const area = st.removedArea;
        const gougeDepths = st.gouges.map(hit => hit.depth);
        expect(st.meshPlan.coarseColumns).toBeGreaterThan(0);
        resetMaterialTrace();
        const uniform = advanceMaterialTrace(program, program.length, {minPitch: 0.02});
        expect(uniform.collisions.map(hit => hit.depth)).toEqual(collisionDepths);
        expect(uniform.gouges.map(hit => hit.depth)).toEqual(gougeDepths);
        expect(uniform.removedArea).toBeCloseTo(area, 8);
    });

    test('slopes and compensated corner sweeps agree with the fine reference', () => {
        const circle = Array.from({length: 48}, (_, i) => [2 * Math.cos(i * Math.PI / 24), 2 * Math.sin(i * Math.PI / 24)]);
        setup({tool: circle});
        View.sinumerikView.toolGeometry[toolPath].variables = {'$TC_DP2': 9, '$TC_DP6': 2};
        const program = [line(10, 8, 70, 8, {toolRadiusCompensation: 'G41'}),
            line(70, 8, 70, 5, {toolRadiusCompensation: 'G41'}), line(70, 5, 20, 7)];
        const st = adaptive(program);
        const area = st.removedArea;
        const depths = st.gouges.map(g => g.depth);
        resetMaterialTrace();
        const uniform = advanceMaterialTrace(program, program.length, {minPitch: 0.02});
        expect(Math.abs(uniform.removedArea - area)).toBeLessThan(0.1);
        expect(uniform.gouges.length).toBe(depths.length);
        uniform.gouges.forEach((g, i) => expect(g.depth).toBeCloseTo(depths[i], 1));
    });

    test('finds a small genuine axial gouge and reports physical rather than index length', () => {
        setup({blank: rect(0, 20), part: rect(0, 10.125), tool: rect(0, 2, 0, 20)});
        const st = adaptive([line(10.075, 12, 10.075, 0)]);
        expect(st.gouges).toHaveLength(1);
        expect(worstGouge().axis).toBe('axial');
        expect(worstGouge().depth).toBeCloseTo(0.05, 8);
        expect(materialTraceGougeRects().length).toBeGreaterThan(0);
    });

    test('a correct facing cut neither gouges nor paints past the exact face event', () => {
        setup({blank: rect(0, 20), part: rect(0, 10.125), tool: rect(0, 2, 0, 20)});
        const st = adaptive([line(10.125, 12, 10.125, 0)]);
        expect(st.gouges).toEqual([]);
        expect(Math.min(...materialTraceRects().map(r => r.a0lo))).toBeCloseTo(10.125, 10);
    });

    test('undo and replay preserve the layout, intervals, and weighted area', () => {
        const program = [line(5, 8, 85, 8), line(15, 6, 75, 6), line(25, 4, 65, 4)];
        const st = adaptive(program);
        const edges = st.grid.edges;
        const result = materialTraceRects();
        const area = st.removedArea;
        adaptive(program, 1);
        expect(st.removedArea).toBeCloseTo(180, 8);
        expect(st.grid.edges).toBe(edges);
        adaptive(program);
        expect(materialTraceRects()).toEqual(result);
        expect(st.removedArea).toBeCloseTo(area, 8);
        adaptive(program, 0);
        expect(totalArea(st.grid)).toBeCloseTo(totalArea(st.seed), 8);
        expect(st.removedArea).toBeCloseTo(0, 8);
    });

    test('snapshot restore agrees with a fresh adaptive run', () => {
        const program = Array.from({length: 40}, (_, i) => line(5, 9 - i * 0.1, 85, 9 - i * 0.1));
        const st = adaptive(program);
        expect(st.snapshots.length).toBeGreaterThan(1);
        st.undo = [];
        st.undoEntries = 0;
        adaptive(program, 20);
        const area = st.removedArea;
        const rects = materialTraceRects();
        resetMaterialTrace();
        const fresh = adaptive(program, 20);
        expect(fresh.removedArea).toBeCloseTo(area, 8);
        expect(materialTraceRects()).toEqual(rects);
    });

    test('replans when a previously missing tool outline becomes available', () => {
        const geometry = View.sinumerikView.toolGeometry[toolPath];
        delete View.sinumerikView.toolGeometry[toolPath];
        const program = [line(40, 12, 40, 0)];
        const missing = adaptive(program);
        expect(missing.skippedTool).toBe(1);
        View.sinumerikView.toolGeometry[toolPath] = geometry;
        const loaded = adaptive(program);
        expect(loaded).not.toBe(missing);
        expect(loaded.skippedTool).toBe(0);
        expect(widthAt(loaded.grid, 45)).toBeLessThanOrEqual(0.020000001);
    });

    test('replans a refused layout when a replacement tool fits the memory budget', () => {
        setup({blank: rect(0, 1000), part: rect(0, 1000, 0, 4), tool: rect(-5000, 5000, 0, 2)});
        const program = [line(10, 8, 980, 8)];
        expect(adaptive(program).status).toBe('gridBudget');
        View.sinumerikView.toolGeometry[toolPath] = {variables: {}, sections: [
            {role: 'cut', shapes: shapes(rect(0, 1, 0, 2)), elements: []},
        ]};
        const rebuilt = adaptive(program);
        expect(rebuilt.status).toBe('ok');
        expect(rebuilt.removedArea).toBeCloseTo(1942, 8);
        expect(rebuilt.meshPlan.coarseColumns).toBeGreaterThan(0);
    });

    test('a narrow thread blade is excused by its own channel on an adaptive grid', () => {
        setup({tool: rect(0, 1, 0, 1), body: rect(0, 1, 1, 21)});
        const program = [line(10, 8, 80, 8, {type: 'G33', thread: {kind: 'G33', axis: 'Z',
            pitch: 2, turns: 35, marks: [0, 0.4, 0.8]}})];
        const st = adaptive(program);
        expect(st.collisions).toEqual([]);
    });

    test('mode changes rebuild at the requested block and preserve partial-frame display', () => {
        const program = [line(5, 8, 85, 8), line(15, 6, 75, 6)];
        const normal = advanceMaterialTrace(program, 1);
        setPartialFrame({index: 1, fraction: 0.5});
        const fine = adaptive(program, 1);
        expect(fine).not.toBe(normal);
        expect(fine.appliedUpTo).toBe(1);
        expect(materialTracePartialRects().length).toBeGreaterThan(0);
        const back = advanceMaterialTrace(program, 1);
        expect(back.grid.edges).toBeNull();
        expect(materialTraceRects().length).toBeGreaterThan(0);
    });

    test('isolates IPS and refuses to reuse the adaptive animation grid', async () => {
        const program = [line(5, 8, 85, 8)];
        const shown = adaptive(program);
        const result = await buildStockGrid(program);
        expect(result.status).toBe('ok');
        expect(result.reused).toBe(false);
        expect(result.grid.edges).toBeNull();
        expect(result.grid.pitch).toBeCloseTo(0.05, 10);
        expect(result.removedArea).toBeCloseTo(180, 8);
        expect(materialTraceState()).toBe(shown);
    });

    test('a fine layout above 30 MB fits the separate 100 MB adaptive budget', () => {
        setup({blank: rect(0, 6000), part: rect(0, 6000, 0, 4), tool: rect(0, 1, 0, 2)});
        const st = adaptive([line(0, 8, 6000, 7)], 0);
        expect(st.status).toBe('ok');
        const bytes = [st.grid, st.seed, st.part].reduce((sum, grid) => sum
            + grid.starts.byteLength + grid.ends.byteLength + grid.counts.byteLength
            + grid.maxRadius.byteLength, 0)
            + st.grid.edges.byteLength + st.touchStamp.byteLength
            + st.thread.lo.byteLength + st.thread.hi.byteLength + st.thread.fl.byteLength;
        expect(bytes).toBeGreaterThan(MATERIAL_TRACE_BUDGET_BYTES);
        expect(bytes).toBeLessThanOrEqual(ADAPTIVE_MATERIAL_TRACE_BUDGET_BYTES);
        expect(widthAt(st.grid, 3000)).toBeLessThanOrEqual(0.020000001);
    });

    test('a memory refusal is visible and switching back recovers', () => {
        setup({blank: rect(0, 100000), part: rect(0, 100000), tool: rect(0, 1)});
        const program = [line(0, 8, 100000, 7)];
        expect(adaptive(program).status).toBe('gridBudget');
        expect(describeMaterialTrace()[0]).toMatch(/memory budget/);
        expect(advanceMaterialTrace(program, 0).status).toBe('ok');
    });

    test('holder collisions outside the narrow cutting footprint are still checked', () => {
        setup({tool: rect(0, 1, 0, 2), body: rect(-12, -5, -3, -1)});
        const st = adaptive([line(50, 12, 50, 6)]);
        expect(st.collisions.length).toBeGreaterThan(0);
        expect(worstCollision().depth).toBeGreaterThan(0);
        expect(widthAt(st.grid, 38)).toBeLessThanOrEqual(0.020000001);
    });

    test('thread marks retain a separate uniform 0.05 mm grid', () => {
        const program = [line(10, 8, 80, 8, {type: 'G33', thread: {kind: 'G33', axis: 'Z',
            pitch: 2, turns: 35, marks: Array.from({length: 36}, (_, i) => i / 35)}})];
        const st = adaptive(program);
        expect(st.thread.pitch).toBeCloseTo(0.05, 10);
        expect(st.threaded).toBe(1);
        expect(materialTraceThreadRects().length).toBeGreaterThan(0);
        expect(st.removedArea).toBe(0);
    });
});

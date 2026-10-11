// Computing the stock a program leaves, with slow debug switched off
// (lib/inProcessStock.js).
//
// The thing worth testing here is not the arithmetic — that is the trace's, and
// it has its own suite — but the isolation. The trace keeps its state in one
// module-level slot and the renderer paints whatever it finds there, so a
// background run that borrowed that slot would put removed material on a canvas
// nobody asked it to.

jest.mock('../lib/sinumerik', () => ({
    __esModule: true,
    default: {sinumerikView: {}},
}));

const View = require('../lib/sinumerik').default;
const {
    advanceMaterialTrace,
    resetMaterialTrace,
    materialTraceState,
} = require('../lib/materialTraceRun');
const {
    buildStockGrid,
    cancelStockRun,
    stockRunInFlight,
    outlineTolerance,
} = require('../lib/inProcessStock');
const {totalArea} = require('../lib/materialTrace');

const TOOL_PATH = '/t/turn35.mpf';

const g1 = (zs, xs, z, x, extra = {}) => ({
    type: 'G1',
    Z_start: zs, X_start: xs, Y_start: 0,
    Z: z, X: x, Y: 0,
    workPlane: 'G18',
    toolRadiusCompensation: 'G40',
    toolDef: {name: 'TURN35', path: TOOL_PATH},
    ...extra,
});

const bar = (z0, z1, r) => [
    g1(z0, 0, z1, 0), g1(z1, 0, z1, r), g1(z1, r, z0, r), g1(z0, r, z0, 0),
];

const toolGeometry = (w = 2) => ({
    name: 'TURN35', variables: {}, warnings: [], errors: [],
    sections: [{
        color: '#d8a13b', role: 'cut',
        shapes: [g1(0, 0, w, 0), g1(w, 0, w, w), g1(w, w, 0, w), g1(0, w, 0, 0)],
        elements: [{type: 'arc', radius: 0.4, center: [0.4, 0, 0.4]}],
    }],
});

const setup = (options = {}) => {
    View.sinumerikView = {
        parseData: {filename: '/p/main.mpf', blank: options.blank ?? bar(0, 20, 10)},
        programmData: {'/p/main.mpf': {machine: {machineType: options.machineType ?? 'Lathe'}}},
        toolGeometry: options.toolGeometry === null ? {} : {[TOOL_PATH]: options.toolGeometry ?? toolGeometry()},
    };
    resetMaterialTrace();
    cancelStockRun();
};

// Three descending passes, so the program leaves a stepped bar.
const program = () => [
    g1(18, 9, 2, 9),
    g1(18, 7, 2, 7),
    g1(18, 5, 2, 5),
];

describe('building the stock a program leaves', () => {
    beforeEach(() => setup());

    test('it runs with nothing on the screen, and leaves nothing there', async () => {
        const result = await buildStockGrid(program());

        expect(result.status).toBe('ok');
        expect(result.removed).toBeGreaterThan(0);
        // The slot the renderer reads is as empty as it was.
        expect(materialTraceState()).toBeNull();
    });

    test('and the grid it returns is the one the trace would have ended with', async () => {
        const elements = program();
        const background = await buildStockGrid(elements);
        const area = totalArea(background.grid);

        resetMaterialTrace();
        // Same pitch on both sides. `removed` is a sum of radial lengths over
        // columns, not an area, so it scales with the number of columns and
        // comparing it across two pitches says nothing.
        const direct = advanceMaterialTrace(elements, elements.length, {minPitch: 0.05});

        expect(area).toBeCloseTo(totalArea(direct.grid), 9);
        expect(background.removed).toBeCloseTo(direct.removed, 9);
    });

    test('a trace already on the screen is neither read into nor disturbed', async () => {
        const elements = program();
        // The user has stepped one block into the program.
        const shown = advanceMaterialTrace(elements, 1);
        const shownArea = totalArea(shown.grid);

        const result = await buildStockGrid(elements);

        expect(result.status).toBe('ok');
        expect(materialTraceState()).toBe(shown);
        expect(shown.appliedUpTo).toBe(1);
        expect(totalArea(shown.grid)).toBeCloseTo(shownArea, 9);
        // And the background answer really is the whole program, not one block.
        expect(result.removed).toBeGreaterThan(shown.removed);
    });

    test('a finished trace on the screen is used as it stands — if it is fine enough', async () => {
        const elements = program();
        const shown = advanceMaterialTrace(elements, elements.length, {minPitch: 0.05});

        const result = await buildStockGrid(elements);

        expect(result.reused).toBe(true);
        expect(result.grid).toBe(shown.grid);
        expect(materialTraceState()).toBe(shown);
    });

    test('a finished trace at the animation pitch is recomputed, not reused', async () => {
        // The shortcut is about work already done, not about any grid that
        // happens to be lying around: the animation's grid is coarser than this
        // run asks for, and handing it back would answer at the animation's
        // accuracy without saying so.
        const elements = program();
        const shown = advanceMaterialTrace(elements, elements.length);

        const result = await buildStockGrid(elements);

        expect(shown.grid.pitch).toBeGreaterThan(result.grid.pitch);
        expect(result.reused).toBe(false);
        expect(result.grid).not.toBe(shown.grid);
    });

    test('the run asks for a finer grid than the animation uses', async () => {
        const result = await buildStockGrid(program());

        expect(result.status).toBe('ok');
        expect(result.grid.pitch).toBeCloseTo(0.05, 9);
    });

    test('a trace standing at the end of a DIFFERENT program is not', async () => {
        // As long as this program, so that the only thing telling them apart is
        // which program the state belongs to.
        const other = [g1(18, 4, 2, 4), g1(18, 3, 2, 3), g1(18, 2, 2, 2)];
        const stale = advanceMaterialTrace(other, other.length);

        const result = await buildStockGrid(program());

        expect(result.reused).toBe(false);
        expect(result.status).toBe('ok');
        expect(result.grid).not.toBe(stale.grid);
    });
});

describe('taken in slices', () => {
    beforeEach(() => setup());

    test('a budget too small to finish in one go still finishes', async () => {
        const elements = [];
        for (let p = 0; p < 60; p++) elements.push(g1(18, 9.5 - p * 0.1, 2, 9.5 - p * 0.1));

        const sliced = await buildStockGrid(elements, {msBudget: 1e-6});
        resetMaterialTrace();
        const whole = await buildStockGrid(elements, {msBudget: 10000});

        expect(sliced.status).toBe('ok');
        expect(sliced.removed).toBeCloseTo(whole.removed, 9);
        expect(stockRunInFlight()).toBe(false);
    });

    test('a newer request takes over from the one in flight', async () => {
        const elements = [];
        for (let p = 0; p < 60; p++) elements.push(g1(18, 9.5 - p * 0.1, 2, 9.5 - p * 0.1));

        const abandoned = buildStockGrid(elements, {msBudget: 1e-6});
        const winner = buildStockGrid(elements, {msBudget: 10000});

        expect((await abandoned).status).toBe('cancelled');
        expect((await winner).status).toBe('ok');
    });

    test('cancelling outright gives up and says so', async () => {
        const elements = [];
        for (let p = 0; p < 60; p++) elements.push(g1(18, 9.5 - p * 0.1, 2, 9.5 - p * 0.1));

        const run = buildStockGrid(elements, {msBudget: 1e-6});
        cancelStockRun();

        expect((await run).status).toBe('cancelled');
        expect(materialTraceState()).toBeNull();
    });
});

describe('when there is no answer to give', () => {
    test('a program with no tool anywhere is refused, not answered', async () => {
        // The grid would come back untouched, which reads as "this program
        // removes nothing" — a different statement from "this program was not
        // understood".
        setup();
        const result = await buildStockGrid(program().map(el => ({...el, toolDef: null})));

        expect(result.status).toBe('noTools');
        expect(result.swept).toBe(0);
        expect(result.skippedTool).toBeGreaterThan(0);
    });

    test('outlines not read from disk yet is a different refusal from no tool', async () => {
        // The run cannot tell them apart — both skip every block — but the user
        // can act on them differently: one is "wait", the other "declare a
        // tool". Reporting the second for the first is what made the IPS button
        // claim the program had no tool until slow debug had run once.
        setup({toolGeometry: null});
        const result = await buildStockGrid(program());

        expect(result.status).toBe('toolsNotReady');
        expect(result.swept).toBe(0);
    });

    test('a milling machine has no axis for the columns to run along', async () => {
        setup({machineType: 'Mill'});
        expect((await buildStockGrid(program())).status).toBe('notLathe');
    });

    test('without a blank there is nothing to take stock of', async () => {
        setup({blank: []});
        expect((await buildStockGrid(program())).status).toBe('noBlank');
    });

    test('an empty program is not a run at all', async () => {
        setup();
        expect((await buildStockGrid([])).status).toBe('noProgram');
        expect(stockRunInFlight()).toBe(false);
    });

    test('blocks that passed without a tool are reported alongside the answer', async () => {
        setup();
        const elements = [...program(), {...g1(18, 3, 2, 3), toolDef: null}];
        const result = await buildStockGrid(elements);

        expect(result.status).toBe('ok');
        expect(result.skippedTool).toBe(1);
    });
});

describe('writing the stock out as a contour', () => {
    const {stockProgramText} = require('../lib/inProcessStock');

    const piece = (elements) => ({elements});
    const square = piece([
        {type: 'line', start: [0, 10], end: [40, 10]},
        {type: 'line', start: [40, 10], end: [40, 0]},
        {type: 'line', start: [40, 0], end: [0, 0]},
        {type: 'line', start: [0, 0], end: [0, 10]},
    ]);

    beforeEach(() => setup());

    test('a closed path: rapid to the start, feed round, M30', () => {
        const text = stockProgramText(square);

        expect(text[0]).toMatch(/^;/);
        expect(text[1]).toBe('G0 Z0 X10');
        expect(text.slice(2, -1)).toEqual(['G1 Z40 X10', 'G1 Z40 X0', 'G1 Z0 X0', 'G1 Z0 X10']);
        expect(text.at(-1)).toBe('M30');
    });

    test('in diameters when the program works in diameters', () => {
        View.sinumerikView.parseData.diamon = 1;
        const text = stockProgramText(square);

        // Z is a length and stays; X is a radius and is doubled.
        expect(text[1]).toBe('G0 Z0 X20');
        expect(text[2]).toBe('G1 Z40 X20');
    });

    test('an arc keeps its direction and its radius', () => {
        const text = stockProgramText(piece([
            {type: 'arc', start: [0, 0], end: [8, 8], center: [0, 8], radius: 8, ccw: false},
            {type: 'arc', start: [8, 8], end: [0, 0], center: [0, 8], radius: 8, ccw: true},
        ]));

        expect(text[2]).toBe('G2 Z8 X8 CR=8');
        expect(text[3]).toBe('G3 Z0 X0 CR=8');
    });

    test('coordinates are written to four decimals, not to seventeen', () => {
        const text = stockProgramText(piece([
            {type: 'line', start: [0, 0], end: [1 / 3, 2 / 3]},
        ]));
        expect(text[2]).toBe('G1 Z0.3333 X0.6667');
    });
});

describe('the tolerance the contour is fitted to', () => {
    test('is the asked-for one on a grid that can hold it', () => {
        expect(outlineTolerance(0.05)).toBeCloseTo(0.1, 9);
        expect(outlineTolerance(0.02)).toBeCloseTo(0.1, 9);
    });

    test('and opens up with the staircase when the grid had to be coarsened', () => {
        // A part too long to hold at the working pitch gets a coarser grid from
        // `pickPitch`. Holding the fitter to 0.1 mm over a 0.4 mm staircase
        // cannot be done, and what comes back then is the staircase itself —
        // thousands of chords instead of the shape.
        expect(outlineTolerance(0.2)).toBeCloseTo(0.3, 9);
        expect(outlineTolerance(0.4)).toBeCloseTo(0.6, 9);
    });
});

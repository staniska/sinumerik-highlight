// The tool preview (lib/toolPreview.js).
//
// The module is pure — no `View`, no `parseData`, and the two impure inputs
// (the machine's axis arrangement, the drawn nose) are arguments — so all of
// it can be exercised here. What is worth testing is the framing: the
// reference point has to stay in the picture, both nose circles have to fit
// inside it, and a mirrored machine has to come out mirrored.

const {
    DEFAULT_PREVIEW_AXES,
    declaredNose,
    describeToolGeometry,
    drawToolPreview,
    orderedSections,
    previewTransform,
    toolPreviewBounds,
} = require('../lib/toolPreview');

const {TOOL_GRID_AXES} = require('../lib/tipPosition');

// One square millimetre of outline, offset from the reference point.
const seg = (zs, xs, z, x) => ({type: 'G1', Z_start: zs, X_start: xs, Z: z, X: x});

const square = (z0, x0, side) => [
    seg(z0, x0, z0 + side, x0),
    seg(z0 + side, x0, z0 + side, x0 + side),
    seg(z0 + side, x0 + side, z0, x0 + side),
    seg(z0, x0 + side, z0, x0),
];

const geometryOf = (shapes, variables = {}, role = 'cut') => ({
    name: 'T1',
    variables,
    sections: [{color: '#3b7dd8', role, shapes, elements: []}],
    warnings: [],
    errors: [],
});

describe('toolPreviewBounds', () => {
    test('always contains the reference point, even with the outline off to one side', () => {
        const bounds = toolPreviewBounds(geometryOf(square(10, 10, 5)).sections);
        expect(bounds).toEqual({Z: {min: 0, max: 15}, X: {min: 0, max: 15}});
    });

    test('measures the outline on both sides of the origin', () => {
        const bounds = toolPreviewBounds(geometryOf(square(-4, -6, 2)).sections);
        expect(bounds).toEqual({Z: {min: -4, max: 0}, X: {min: -6, max: 0}});
    });

    test('a nose circle extends the box by its radius, so the dashed one cannot fall off the edge', () => {
        const bounds = toolPreviewBounds(geometryOf(square(0, 0, 1)).sections, [{Z: 2, X: 0, radius: 0.5}]);
        expect(bounds.Z).toEqual({min: 0, max: 2.5});
        expect(bounds.X).toEqual({min: -0.5, max: 1});
    });

    test('ROLE:ignore is not measured, because it is not drawn', () => {
        const sections = [
            {role: 'ignore', shapes: square(50, 50, 10)},
            {role: 'cut', shapes: square(0, 0, 2)},
        ];
        expect(toolPreviewBounds(sections)).toEqual({Z: {min: 0, max: 2}, X: {min: 0, max: 2}});
    });

    test('no sections at all still gives the origin', () => {
        expect(toolPreviewBounds([])).toEqual({Z: {min: 0, max: 0}, X: {min: 0, max: 0}});
    });
});

describe('orderedSections', () => {
    test('the cutting edge is drawn last, over the body; ignore is dropped', () => {
        const cut = {role: 'cut', shapes: square(0, 0, 1)};
        const body = {role: 'body', shapes: square(0, 0, 2)};
        const ignored = {role: 'ignore', shapes: square(0, 0, 3)};
        expect(orderedSections([cut, body, ignored])).toEqual([body, cut]);
    });

    test('an empty section is not drawn', () => {
        expect(orderedSections([{role: 'cut', shapes: []}])).toEqual([]);
    });
});

describe('previewTransform', () => {
    const bounds = {Z: {min: 0, max: 10}, X: {min: 0, max: 5}};

    test('one scale for both axes, so a nose radius stays round', () => {
        const {scale, map} = previewTransform(bounds, 200, 200, DEFAULT_PREVIEW_AXES);
        const [x0, y0] = map({Z: 0, X: 0});
        const [x1, y1] = map({Z: 1, X: 1});
        expect(Math.abs(x1 - x0)).toBeCloseTo(scale, 6);
        expect(Math.abs(y1 - y0)).toBeCloseTo(scale, 6);
    });

    test('the whole box lands inside the canvas', () => {
        const {map} = previewTransform(bounds, 200, 120, DEFAULT_PREVIEW_AXES);
        [[0, 0], [10, 0], [0, 5], [10, 5]].forEach(([Z, X]) => {
            const [px, py] = map({Z, X});
            expect(px).toBeGreaterThanOrEqual(0);
            expect(px).toBeLessThanOrEqual(200);
            expect(py).toBeGreaterThanOrEqual(0);
            expect(py).toBeLessThanOrEqual(120);
        });
    });

    test('a front carriage sees X growing downwards, a rear one upwards', () => {
        const front = previewTransform(bounds, 200, 200, TOOL_GRID_AXES['Horizontal/Front']);
        const rear = previewTransform(bounds, 200, 200, TOOL_GRID_AXES['Horizontal/Rear']);

        expect(front.map({Z: 0, X: 5})[1]).toBeGreaterThan(front.map({Z: 0, X: 0})[1]);
        expect(rear.map({Z: 0, X: 5})[1]).toBeLessThan(rear.map({Z: 0, X: 0})[1]);

        // Z runs the same way on both, so the mirroring is in X alone.
        expect(front.map({Z: 10, X: 0})[0]).toBeGreaterThan(front.map({Z: 0, X: 0})[0]);
        expect(rear.map({Z: 10, X: 0})[0]).toBeGreaterThan(rear.map({Z: 0, X: 0})[0]);
    });

    test('a vertical lathe turns the picture: Z runs down the canvas', () => {
        const {map} = previewTransform(bounds, 200, 200, TOOL_GRID_AXES['Vertical/Front']);
        expect(map({Z: 10, X: 0})[1]).toBeLessThan(map({Z: 0, X: 0})[1]);
        expect(map({Z: 0, X: 5})[0]).toBeGreaterThan(map({Z: 0, X: 0})[0]);
    });

    test('a degenerate extent does not collapse the scale to zero', () => {
        const flat = {Z: {min: 0, max: 4}, X: {min: 0, max: 0}};
        const {scale} = previewTransform(flat, 200, 100, DEFAULT_PREVIEW_AXES);
        expect(scale).toBeGreaterThan(0);
        expect(Number.isFinite(scale)).toBe(true);
    });

    test('a single point still gives a usable transform', () => {
        const point = {Z: {min: 0, max: 0}, X: {min: 0, max: 0}};
        const {scale, map} = previewTransform(point, 200, 100, DEFAULT_PREVIEW_AXES);
        expect(scale).toBe(1);
        expect(map({Z: 0, X: 0})).toEqual([100, 50]);
    });
});

describe('declaredNose', () => {
    test('the ;T103 R0.4 shorthand puts the centre up and to the right of the tip', () => {
        expect(declaredNose({$TC_DP2: '3', $TC_DP6: '0.4'}))
            .toEqual({Z: 0.4, X: 0.4, radius: 0.4, position: 3});
    });

    test('a round insert (position 9) has its centre on the reference point', () => {
        expect(declaredNose({$TC_DP2: '9', $TC_DP6: '2.4'}))
            .toEqual({Z: 0, X: 0, radius: 2.4, position: 9});
    });

    test('nothing declared, nothing drawn', () => {
        expect(declaredNose({})).toBeNull();
        expect(declaredNose({$TC_DP6: '0.4'})).toBeNull();
        expect(declaredNose({$TC_DP2: '3'})).toBeNull();
        expect(declaredNose({$TC_DP2: '3', $TC_DP6: '0'})).toBeNull();
    });
});

describe('describeToolGeometry', () => {
    test('says so when the declared radius and the drawn one disagree', () => {
        const geometry = geometryOf(square(0, 0, 2), {$TC_DP2: '3', $TC_DP6: '0.8'});
        const lines = describeToolGeometry(geometry, {Z: 0.4, X: 0.4, radius: 0.4});
        expect(lines.some(l => l.includes('differ'))).toBe(true);
    });

    test('agreement is silent', () => {
        const geometry = geometryOf(square(0, 0, 2), {$TC_DP2: '3', $TC_DP6: '0.4'});
        const lines = describeToolGeometry(geometry, {Z: 0.4, X: 0.4, radius: 0.4});
        expect(lines.some(l => l.includes('differ'))).toBe(false);
        expect(lines.some(l => l.includes('R0.4'))).toBe(true);
    });

    test('a sharp outline and an undeclared nose are both reported, not hidden', () => {
        const lines = describeToolGeometry(geometryOf(square(0, 0, 2)), null);
        expect(lines.some(l => l.includes('none (sharp outline)'))).toBe(true);
        expect(lines.some(l => l.includes('not in ;---VARIABLES'))).toBe(true);
    });

    test('no geometry at all', () => {
        expect(describeToolGeometry(null, null)).toEqual(['No geometry loaded']);
        expect(describeToolGeometry({sections: []}, null)).toEqual(['No geometry loaded']);
    });
});

describe('drawToolPreview', () => {
    const fakeCtx = () => ({
        canvas: {},
        save: jest.fn(), restore: jest.fn(),
        beginPath: jest.fn(), moveTo: jest.fn(), lineTo: jest.fn(), arc: jest.fn(),
        fill: jest.fn(), stroke: jest.fn(), fillRect: jest.fn(), clearRect: jest.fn(),
        fillText: jest.fn(), setLineDash: jest.fn(),
    });

    const colors = {bg: 'black', axis: 'grey', text: 'white', warn: 'orange', nose: 'blue'};

    test('nothing to draw is reported, and the message goes on the canvas', () => {
        const ctx = fakeCtx();
        const drawn = drawToolPreview(ctx, null, {width: 200, height: 100, colors, message: 'Geometry not loaded'});
        expect(drawn).toBe(false);
        expect(ctx.fillText).toHaveBeenCalledWith('Geometry not loaded', 100, 50);
    });

    test('an outline is stroked and filled, and both nose circles are drawn', () => {
        const ctx = fakeCtx();
        const geometry = geometryOf(square(0, 0, 2), {$TC_DP2: '3', $TC_DP6: '0.4'});
        const drawn = drawToolPreview(ctx, geometry, {
            width: 200, height: 200, colors, drawnNose: {Z: 0.4, X: 0.4, radius: 0.4},
        });

        expect(drawn).toBe(true);
        expect(ctx.fill).toHaveBeenCalled();
        expect(ctx.stroke).toHaveBeenCalled();
        // Two nose circles and their two centre dots.
        expect(ctx.arc).toHaveBeenCalledTimes(4);
        expect(ctx.setLineDash).toHaveBeenCalledWith([4, 3]);
        // The reference point is labelled.
        expect(ctx.fillText.mock.calls.some(call => call[0] === 'P')).toBe(true);
    });

    test('the axis letters are the machine\'s own', () => {
        const ctx = fakeCtx();
        drawToolPreview(ctx, geometryOf(square(0, 0, 2)), {
            width: 200, height: 200, colors, axes: TOOL_GRID_AXES['Vertical/Front'],
        });
        const labels = ctx.fillText.mock.calls.map(call => call[0]);
        expect(labels).toContain('X');
        expect(labels).toContain('Z');
    });
});

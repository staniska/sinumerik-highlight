jest.mock('../lib/sinumerik', () => ({
    __esModule: true,
    default: { sinumerikView: {} }
}));

const { pushSnapshot, UNDO_DEPTH } = require('../lib/contourEdit/undo');

describe('pushSnapshot', () => {
    const line = (x) => ({ type: 'line', start: { X: 0, Y: 0 }, end: { X: x, Y: 0 } });

    it('stores a snapshot of the element array', () => {
        const stack = [];
        pushSnapshot(stack, [line(10)]);
        expect(stack).toHaveLength(1);
        expect(stack[0]).toEqual([line(10)]);
    });

    it('detaches the snapshot from the live elements', () => {
        const elements = [line(10)];
        const stack = [];
        pushSnapshot(stack, elements);
        elements[0].end.X = 99;
        expect(stack[0][0].end.X).toBe(10);
    });

    it('accepts an array-like that is not a plain Array', () => {
        class Contour extends Array {}
        const contour = new Contour();
        Array.prototype.push.call(contour, line(5));
        const stack = [];
        pushSnapshot(stack, contour);
        expect(stack[0]).toEqual([line(5)]);
    });

    it('drops the oldest snapshot once the depth is reached', () => {
        const stack = [];
        for (let i = 0; i < UNDO_DEPTH + 3; i++) {
            pushSnapshot(stack, [line(i)]);
        }
        expect(stack).toHaveLength(UNDO_DEPTH);
        // The three oldest are gone, the newest is last.
        expect(stack[0][0].end.X).toBe(3);
        expect(stack[stack.length - 1][0].end.X).toBe(UNDO_DEPTH + 2);
    });

    it('honours an explicit depth', () => {
        const stack = [];
        pushSnapshot(stack, [line(1)], 2);
        pushSnapshot(stack, [line(2)], 2);
        pushSnapshot(stack, [line(3)], 2);
        expect(stack.map(s => s[0].end.X)).toEqual([2, 3]);
    });
});

const { findSameElement, isSameElement } = require('../lib/contourEdit/sameElement');

// G18, the lathe plane: abscissa Z, ordinate X.
const same = (a, b) => isSameElement(a, b, 'Z', 'X');

const line = (z1, x1, z2, x2) => ({
    type: 'line',
    start: { Z: z1, X: x1 },
    end: { Z: z2, X: x2 },
});

const arc = (z1, x1, z2, x2, cz, cx, ccw) => ({
    type: 'arc',
    start: { Z: z1, X: x1 },
    end: { Z: z2, X: x2 },
    center: { Z: cz, X: cx },
    ccw,
});

describe('isSameElement: lines', () => {
    it('finds a line drawn again', () => {
        expect(same(line(0, 0, 10, 5), line(0, 0, 10, 5))).toBe(true);
    });

    it('finds a line drawn back along itself', () => {
        expect(same(line(0, 0, 10, 5), line(10, 5, 0, 0))).toBe(true);
    });

    it('keeps a line that only shares an endpoint', () => {
        expect(same(line(0, 0, 10, 5), line(10, 5, 20, 9))).toBe(false);
    });

    it('tells apart lines a hundredth of a millimetre different', () => {
        expect(same(line(0, 0, 10, 5), line(0, 0, 10, 5.01))).toBe(false);
    });

    it('allows for the dirt of a round trip through a file', () => {
        expect(same(line(0, 0, 10, 5), line(0, 0, 10, 5.00001))).toBe(true);
    });

    it('does not take a line for an arc', () => {
        expect(same(line(0, 0, 10, 5), { ...arc(0, 0, 10, 5, 0, 5, true), type: 'arc' })).toBe(false);
    });
});

describe('isSameElement: arcs', () => {
    const a = arc(0, 0, 10, 10, 0, 10, false);

    it('finds the same arc', () => {
        expect(same(a, arc(0, 0, 10, 10, 0, 10, false))).toBe(true);
    });

    it('finds the same arc traversed the other way', () => {
        // Endpoints swapped and the direction flipped — the same metal.
        expect(same(a, arc(10, 10, 0, 0, 0, 10, true))).toBe(true);
    });

    it('keeps the rest of the circle', () => {
        // Same centre and same two endpoints, the other way round the middle:
        // a different arc, and deleting it would take real geometry away.
        expect(same(a, arc(0, 0, 10, 10, 0, 10, true))).toBe(false);
        expect(same(a, arc(10, 10, 0, 0, 0, 10, false))).toBe(false);
    });

    it('keeps an arc of another radius through the same points', () => {
        expect(same(a, arc(0, 0, 10, 10, 10, 0, false))).toBe(false);
    });
});

describe('findSameElement', () => {
    const contour = [line(0, 0, 10, 0), line(10, 0, 10, 5), arc(10, 5, 15, 10, 10, 10, false)];

    it('reports which element it is', () => {
        expect(findSameElement(contour, line(10, 5, 10, 0), 'Z', 'X')).toBe(1);
    });

    it('reports -1 when the element is new', () => {
        expect(findSameElement(contour, line(0, 0, 0, 5), 'Z', 'X')).toBe(-1);
    });

    it('does not find an element already in the contour as its own duplicate', () => {
        expect(findSameElement(contour, contour[1], 'Z', 'X')).toBe(-1);
    });
});

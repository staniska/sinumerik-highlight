jest.mock('../lib/sinumerik', () => ({
    __esModule: true,
    default: {
        sinumerikView: {
            parseData: {
                errors: [],
                plane: 'G17',
                canvas: [],
                currentBucket: null,
                contourElements: {},
            }
        }
    }
}));

jest.mock('../lib/coordinates', () => ({
    getCoordinatesInFrame: jest.fn((pos) => [pos.X || 0, pos.Y || 0, pos.Z || 0]),
    getCoordinatesInBase: jest.fn((pos) => [pos.X || 0, pos.Y || 0, pos.Z || 0]),
}));

// degreesMath is used for real here (not mocked) — CHF's correctness is a
// trig relationship, so the test wants genuine cos/deg-to-rad behaviour.

const {insertChr} = require('../lib/element-insert');

let View;

beforeEach(() => {
    View = require('../lib/sinumerik').default;
    View.sinumerikView.parseData.errors = [];
    View.sinumerikView.parseData.plane = 'G17';
    View.sinumerikView.parseData.canvas = [];
    View.sinumerikView.parseData.currentBucket = null;
});

// G17 plane => axes = ['X', 'Y', 'Z']; Z left at 0 throughout, so these are
// plain 2D corners.
const g1 = (x1, y1, x2, y2, extra = {}) => ({
    type: 'G1',
    row: 0,
    elementId: 0,
    sourceFile: 'test.mpf',
    X_start: x1, Y_start: y1, Z_start: 0,
    X: x2, Y: y2, Z: 0,
    ...extra,
});

// --- insertChr — CHF (chamfer diagonal length) ---
//
// CHF specifies the length of the chamfer segment itself (the diagonal),
// unlike CHR which is the trim distance along each edge. insertChr converts
// CHF to an equivalent CHR right before the shared trim math, using the
// angle between the two edges meeting at the corner — see the comment above
// that conversion in element-insert.js for the derivation.

describe('insertChr — CHF (chamfer diagonal length)', () => {
    test('90° corner: CHF converts to the classic CHR = CHF/√2 trim', () => {
        const element_1 = g1(0, 0, 10, 0, {CHF: Math.sqrt(2)});
        const element_2 = g1(10, 0, 10, 10);

        insertChr(element_1, element_2, 'test.mpf');

        expect(element_1.CHR).toBeCloseTo(1, 10);
        expect(element_1.X).toBeCloseTo(9, 10);
        expect(element_1.Y).toBeCloseTo(0, 10);
        expect(element_2.X_start).toBeCloseTo(10, 10);
        expect(element_2.Y_start).toBeCloseTo(1, 10);
        expect(View.sinumerikView.parseData.errors).toHaveLength(0);
    });

    test('60° turn: CHF still converts to the correct CHR via the general formula', () => {
        // turnAngle = 60°, so CHR = CHF / (2*cos(30°))
        const element_1 = g1(0, 0, 10, 0, {CHF: 2});
        const element_2 = g1(10, 0, 10 + 10 * Math.cos(Math.PI / 3), 10 * Math.sin(Math.PI / 3));

        insertChr(element_1, element_2, 'test.mpf');

        const expectedChr = 2 / (2 * Math.cos(Math.PI / 6));
        expect(element_1.CHR).toBeCloseTo(expectedChr, 10);
    });

    test('explicit CHR on the element is not overridden by CHF', () => {
        const element_1 = g1(0, 0, 10, 0, {CHF: 100, CHR: 2});
        const element_2 = g1(10, 0, 10, 10);

        insertChr(element_1, element_2, 'test.mpf');

        expect(element_1.CHR).toBe(2);
    });

    test('reversing corner (180° turn) reports an error instead of dividing by zero', () => {
        const element_1 = g1(0, 0, 10, 0, {CHF: 5});
        const element_2 = g1(10, 0, 0, 0); // straight back the way we came

        const result = insertChr(element_1, element_2, 'test.mpf');

        expect(View.sinumerikView.parseData.errors).toHaveLength(1);
        expect(View.sinumerikView.parseData.errors[0].text).toMatch(/CHF not possible/);
        expect(result).toEqual([element_1, element_2]);
    });

    test('CHF value too large for both edges is clamped like CHR (existing maxChr guard)', () => {
        // 90° corner, both edges length 1; CHF=100 would derive CHR≈70.7,
        // which the existing clamp caps at maxChr = max(length_1, length_2) = 1.
        const element_1 = g1(0, 0, 1, 0, {CHF: 100});
        const element_2 = g1(1, 0, 1, 1);

        insertChr(element_1, element_2, 'test.mpf');

        expect(element_1.CHR).toBe(1);
    });
});

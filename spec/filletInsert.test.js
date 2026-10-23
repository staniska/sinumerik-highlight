jest.mock('../lib/sinumerik', () => ({
    __esModule: true,
    default: { sinumerikView: {} }
}));

const View = require('../lib/sinumerik').default;
const { errorMessage, pointOf, thirdAxisOf } = require('../lib/contourEdit/filletInsert');

// G18 is the lathe plane the editor is used in most: abscissa Z, ordinate X,
// with Y the axis the contour does not lie in.
describe('pointOf', () => {
    it('writes the plane axes under their own names', () => {
        expect(pointOf([12, 34], 'Z', 'X', null)).toEqual({ Z: 12, X: 34 });
    });

    it('leaves out the third axis when the source lines have none', () => {
        // Elements drawn by clicking carry two axes only, and a point grown to
        // three keys would show a coordinate the user never entered.
        expect(Object.keys(pointOf([1, 2], 'Z', 'X', null))).toEqual(['Z', 'X']);
    });

    it('puts the third axis last', () => {
        // changeLinePoint picks "the first key that is not the edited one" as
        // the other plane axis, so a point led by its third axis would be
        // dragged along Y instead of X.
        const point = pointOf([5, 6], 'Z', 'X', { key: 'Y', value: 7 });
        expect(Object.keys(point)).toEqual(['Z', 'X', 'Y']);
        expect(point).toEqual({ Z: 5, X: 6, Y: 7 });
    });
});

describe('thirdAxisOf', () => {
    it('finds the axis the contour does not lie in', () => {
        const el = { start: { X: 1, Y: 2, Z: 3 } };
        expect(thirdAxisOf(el, 'Z', 'X')).toEqual({ key: 'Y', value: 2 });
    });

    it('reports none for a point of two axes', () => {
        expect(thirdAxisOf({ start: { Z: 1, X: 2 } }, 'Z', 'X')).toBeNull();
    });

    it('keeps the value as stored, including zero', () => {
        expect(thirdAxisOf({ start: { X: 1, Y: 0, Z: 3 } }, 'Z', 'X')).toEqual({ key: 'Y', value: 0 });
    });
});

describe('errorMessage', () => {
    const units = (u) => { View.sinumerikView.contourEditData = { units: u }; };

    it('states the admissible range in millimetres', () => {
        units('metric');
        expect(errorMessage('radius-too-small', [[10, 30]]))
            .toBe('The radius is too small to reach both lines. Allowed: 10.00…30.00 mm.');
    });

    it('states it in inches, a digit finer, when the machine works in inches', () => {
        units('inch');
        // 10 mm is 0.3937", 30 mm is 1.1811".
        expect(errorMessage('radius-too-large', [[10, 30]]))
            .toBe('The radius is too large to stay on both lines. Allowed: 0.394…1.181".');
    });

    it('rounds the low bound up and the high one down', () => {
        // Both bounds have to be values the corner really accepts: rounding to
        // nearest would offer 2.44 and 7.21, each a hundredth outside the
        // range, and the next attempt would be refused again.
        units('metric');
        expect(errorMessage('radius-too-small', [[2.4449, 7.2051]]))
            .toBe('The radius is too small to reach both lines. Allowed: 2.45…7.20 mm.');
    });

    it('gives one value for a range thinner than the step', () => {
        units('metric');
        expect(errorMessage('radius-too-small', [[5.002, 5.004]]))
            .toBe('The radius is too small to reach both lines. Allowed: ≈5.00 mm.');
    });

    it('lists every range of a corner that has two', () => {
        units('metric');
        expect(errorMessage('radius-does-not-fit', [[1.34, 2.14], [18.66, 29.86]]))
            .toBe('This radius does not fit the corner. Allowed: 1.34…2.14 or 18.66…29.86 mm.');
    });

    it('says nothing about ranges when there are none', () => {
        units('metric');
        expect(errorMessage('radius-does-not-fit', undefined))
            .toBe('No radius can touch both of these lines.');
        expect(errorMessage('lines-parallel'))
            .toBe('These two lines are parallel — there is no corner between them.');
    });

    it('speaks of a chamfer in chamfer mode', () => {
        units('metric');
        expect(errorMessage('size-too-small', [[10, 30]]))
            .toBe('The chamfer is too small to reach both lines. Allowed: 10.00…30.00 mm.');
    });
});

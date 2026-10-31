const { displayCoordinate, decimalsFor, positionAt, storedValue, blockIndexAt } = require('../lib/axisDisplay');

const move = (over = {}) => ({type: 'G1', X_start: 0, Y_start: 0, Z_start: 0, X: 1, Y: 2, Z: 3, ...over});
const msg = () => ({type: 'msg', value: 'HELLO'});
const pause = () => ({type: 'pause', value: 'M0'});

describe('displayCoordinate', () => {
    test('metric and radial is the stored number', () => {
        expect(displayCoordinate(42.5, {axis: 'X'})).toBe(42.5);
    });

    // X is stored as a radius; a lathe shows a diameter.
    test('a diameter mode doubles X and nothing else', () => {
        expect(displayCoordinate(20, {axis: 'X', diamon: 1})).toBe(40);
        expect(displayCoordinate(20, {axis: 'Y', diamon: 1})).toBe(20);
        expect(displayCoordinate(20, {axis: 'Z', diamon: 1})).toBe(20);
        expect(displayCoordinate(20, {axis: 'U', diamon: 1})).toBe(20);
    });

    // Everything is stored in millimetres, whatever unit the program is in.
    test('a length takes the unit, an angle does not', () => {
        expect(displayCoordinate(254, {axis: 'X', unitMult: 25.4})).toBe(10);
        expect(displayCoordinate(254, {axis: 'W', unitMult: 25.4})).toBe(10);
        expect(displayCoordinate(90, {axis: 'A', unitMult: 25.4})).toBe(90);
        expect(displayCoordinate(90, {axis: 'C1', unitMult: 25.4})).toBe(90);
    });

    test('the diameter is taken before the unit, as the control does it', () => {
        expect(displayCoordinate(127, {axis: 'X', diamon: 1, unitMult: 25.4})).toBe(10);
    });

    // Absence is how "never programmed" is stored. NaN and null are the shapes
    // it took in earlier versions of the data and must read the same.
    test('anything that is not a number has nothing to show', () => {
        [undefined, null, NaN, Infinity, 'X'].forEach(value => {
            expect(displayCoordinate(value, {axis: 'A'})).toBe(null);
        });
    });

    test('zero is a position like any other', () => {
        expect(displayCoordinate(0, {axis: 'X', diamon: 1})).toBe(0);
    });
});

describe('decimalsFor', () => {
    test('a thousandth of a millimetre, a ten-thousandth of an inch', () => {
        expect(decimalsFor(1)).toBe(3);
        expect(decimalsFor(25.4)).toBe(4);
    });
});

describe('positionAt', () => {
    test('the tool stands at the end of the last drawn piece', () => {
        const elements = [move({Z: 1}), move({Z: 2}), move({Z: 3})];
        const at = positionAt(elements, 2);

        expect(at.element).toBe(elements[1]);
        expect(at.atStart).toBe(false);
    });

    // Nothing drawn means nothing has moved yet, so the readout is where the
    // first piece begins.
    test('with nothing drawn it is the start of the first piece', () => {
        const elements = [move({Z_start: 7})];
        const at = positionAt(elements, 0);

        expect(at.element).toBe(elements[0]);
        expect(at.atStart).toBe(true);
    });

    // A message is a piece too, passed through whole and carrying no
    // coordinate. The position did not change at it.
    test('a message or a pause is stepped over, backwards', () => {
        const elements = [move({Z: 1}), msg(), pause()];
        const at = positionAt(elements, 3);

        expect(at.element).toBe(elements[0]);
        expect(at.atStart).toBe(false);
    });

    test('and forwards, when nothing has been drawn', () => {
        const elements = [msg(), move({Z_start: 5})];
        const at = positionAt(elements, 0);

        expect(at.element).toBe(elements[1]);
        expect(at.atStart).toBe(true);
    });

    test('a count past the end is the end', () => {
        const elements = [move({Z: 1}), move({Z: 2})];
        expect(positionAt(elements, 999).element).toBe(elements[1]);
    });

    test('nothing to stand on', () => {
        expect(positionAt([], 3)).toBe(null);
        expect(positionAt(undefined, 3)).toBe(null);
        expect(positionAt([msg(), pause()], 2)).toBe(null);
        expect(positionAt([msg()], 0)).toBe(null);
    });
});

describe('positionAt — which piece', () => {
    test('the index of the piece is reported with it', () => {
        const elements = [move(), msg(), move(), pause()];

        expect(positionAt(elements, 4).index).toBe(2);
        expect(positionAt(elements, 2).index).toBe(0);
        expect(positionAt(elements, 0).index).toBe(0);
    });

    test('and skips a message when counting', () => {
        const elements = [msg(), move()];
        expect(positionAt(elements, 0).index).toBe(1);
    });
});

describe('blockIndexAt', () => {
    const elements = [move(), move(), move()];
    // Three pieces cut from two blocks, as buildAnimationPieces would leave it.
    const elementFrames = [0, 0, 1];

    test('the block the piece was cut from', () => {
        expect(blockIndexAt(positionAt(elements, 1), elementFrames, 1, 3)).toBe(0);
        expect(blockIndexAt(positionAt(elements, 2), elementFrames, 2, 3)).toBe(0);
    });

    // With slow debug off there are no pieces: the list IS the blocks.
    test('without a map, a piece is its own block', () => {
        expect(blockIndexAt(positionAt(elements, 2), null, 2, 3)).toBe(1);
        expect(blockIndexAt(positionAt(elements, 2), undefined, 2, 3)).toBe(1);
    });

    // An assignment after the last move has no element behind which to be seen,
    // so a value set on the program's last line would never show.
    test('everything drawn is the final state', () => {
        expect(blockIndexAt(positionAt(elements, 3), elementFrames, 3, 3)).toBe(Infinity);
        expect(blockIndexAt(positionAt(elements, 9), elementFrames, 9, 3)).toBe(Infinity);
    });

    test('nothing drawn is the first block, not the final state', () => {
        expect(blockIndexAt(positionAt(elements, 0), elementFrames, 0, 3)).toBe(0);
    });

    test('nowhere to stand', () => {
        expect(blockIndexAt(null, elementFrames, 1, 3)).toBe(null);
    });
});

describe('storedValue', () => {
    test('the end of the piece, or its start when nothing is drawn', () => {
        const elements = [move({Z_start: 5, Z: 9})];

        expect(storedValue(positionAt(elements, 1), 'Z')).toBe(9);
        expect(storedValue(positionAt(elements, 0), 'Z')).toBe(5);
    });

    // The piece a program names an axis on carries an end and no start, which
    // is the one place the two ends differ in what they know.
    test('an axis the piece says nothing about has no value', () => {
        const elements = [move({A: 90})];

        expect(storedValue(positionAt(elements, 1), 'A')).toBe(90);
        expect(storedValue(positionAt(elements, 0), 'A')).toBe(null);
        expect(storedValue(positionAt(elements, 1), 'B')).toBe(null);
    });

    test('nowhere to read from', () => {
        expect(storedValue(null, 'X')).toBe(null);
    });
});

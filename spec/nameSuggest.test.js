jest.mock('../lib/sinumerik', () => ({
    __esModule: true,
    default: { sinumerikView: {} }
}));

const { suggestionsFor } = require('../lib/nameSuggest');

// The ordering rule, without a DOM. The list itself is ours rather than a
// native `datalist`: that one sends keyboard events without a `key`, and
// Pulsar's keymap reads `event.key.length` before anything else.
describe('suggestionsFor', () => {
    const names = ['BLANK', 'CONTOUR', 'OP10', 'OP10_BLANK', 'ZAGOT_OP10'];

    test('an empty field offers everything', () => {
        expect(suggestionsFor(names, '')).toEqual(names);
        expect(suggestionsFor(names, '   ')).toEqual(names);
    });

    test('names that start with what is typed come first', () => {
        // A name is typed from the front, so a prefix match is the one meant —
        // but a middle match is still worth offering.
        expect(suggestionsFor(names, 'OP10')).toEqual(['OP10', 'OP10_BLANK', 'ZAGOT_OP10']);
    });

    test('matching is case-insensitive on what is typed', () => {
        expect(suggestionsFor(names, 'op1')).toEqual(['OP10', 'OP10_BLANK', 'ZAGOT_OP10']);
    });

    test('no match is an empty list', () => {
        expect(suggestionsFor(names, 'XYZ')).toEqual([]);
    });

    test('tolerates nothing to work with', () => {
        expect(suggestionsFor(undefined, 'A')).toEqual([]);
        expect(suggestionsFor(names, undefined).length).toBe(names.length);
    });
});

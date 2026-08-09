jest.mock('../lib/sinumerik', () => ({
    __esModule: true,
    default: { sinumerikView: {} }
}));

const { extractBoundingContourBlock, normalizeFileName, maskStringSpaces, unmaskStringSpaces, STRING_SPACE_SENTINEL } = require('../lib/utils');

describe('maskStringSpaces / unmaskStringSpaces', () => {
    const S = STRING_SPACE_SENTINEL;

    it('masks spaces inside a double-quoted literal', () => {
        expect(maskStringSpaces('MSG("HELLO WORLD")')).toBe(`MSG("HELLO${S}WORLD")`);
    });

    it('leaves spaces outside quotes untouched', () => {
        expect(maskStringSpaces('G1 X10 Y20')).toBe('G1 X10 Y20');
    });

    it('does not touch structural spaces around << between two literals', () => {
        // greedy ".+" would wrongly mask the space around <<; per-literal must not
        expect(maskStringSpaces('"A B" << "C D"')).toBe(`"A${S}B" << "C${S}D"`);
    });

    it('leaves single-quoted binary/hex constants alone', () => {
        expect(maskStringSpaces("R1='B10' R2='H1F'")).toBe("R1='B10' R2='H1F'");
    });

    it('leaves an unterminated quote unchanged', () => {
        expect(maskStringSpaces('MSG("oops')).toBe('MSG("oops');
    });

    it('round-trips: unmask undoes mask', () => {
        const line = 'MSG("Value is here")';
        expect(unmaskStringSpaces(maskStringSpaces(line))).toBe(line);
    });

    it('unmask is a no-op on strings without the sentinel', () => {
        expect(unmaskStringSpaces('plain text')).toBe('plain text');
    });

    it('handles non-string input gracefully', () => {
        expect(maskStringSpaces(undefined)).toBe(undefined);
        expect(unmaskStringSpaces(null)).toBe(null);
    });

    it('preserves character offsets (single-char sentinel)', () => {
        const masked = maskStringSpaces('MSG("A B")');
        expect(masked.length).toBe('MSG("A B")'.length);
        expect(masked.indexOf('(')).toBe('MSG("A B")'.indexOf('('));
    });
});

describe('normalizeFileName', () => {
    test('replaces all dots with underscores and uppercases', () => {
        expect(normalizeFileName('contour.mpf')).toBe('CONTOUR_MPF');
    });

    test('handles already-uppercase input', () => {
        expect(normalizeFileName('CONTOUR.MPF')).toBe('CONTOUR_MPF');
    });

    test('preserves existing underscores in basename', () => {
        expect(normalizeFileName('CONTOUR_MIRR.MPF')).toBe('CONTOUR_MIRR_MPF');
    });

    test('replaces every dot, not just the first', () => {
        expect(normalizeFileName('foo.bar.baz')).toBe('FOO_BAR_BAZ');
    });

    test('handles input with no dots', () => {
        expect(normalizeFileName('contour')).toBe('CONTOUR');
    });

    test('handles empty string', () => {
        expect(normalizeFileName('')).toBe('');
    });
});

// The bucket-key derivation in primitives.js / interpretator.js extracts
// basename via name.split(/[\\/]/).pop() so the same key is produced on
// Linux ('/foo/bar/CONTOUR.MPF') and Windows ('C:\\foo\\bar\\CONTOUR.MPF').
// These tests freeze that contract.
describe('cross-platform basename + normalizeFileName', () => {
    const basename = (p) => p.split(/[\\/]/).pop();

    test('Linux absolute path', () => {
        expect(normalizeFileName(basename('/home/user/CONTOUR.MPF'))).toBe('CONTOUR_MPF');
    });

    test('Windows absolute path with backslashes', () => {
        expect(normalizeFileName(basename('C:\\Users\\user\\CONTOUR.MPF'))).toBe('CONTOUR_MPF');
    });

    test('Windows path with forward slashes (Node normalised)', () => {
        expect(normalizeFileName(basename('C:/Users/user/CONTOUR_MIRR.MPF'))).toBe('CONTOUR_MIRR_MPF');
    });

    test('relative path', () => {
        expect(normalizeFileName(basename('./subdir/BLANK.SPF'))).toBe('BLANK_SPF');
    });

    test('bare filename', () => {
        expect(normalizeFileName(basename('YAMA.SPF'))).toBe('YAMA_SPF');
    });
});


describe('extractBoundingContourBlock', () => {
    let warnSpy;

    beforeEach(() => {
        warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        warnSpy.mockRestore();
    });

    test('returns null for source with no markers', () => {
        const lines = [
            'PROC FOO(REAL A)',
            'G1 X=A',
            'M17',
        ];
        expect(extractBoundingContourBlock(lines)).toBeNull();
        expect(warnSpy).not.toHaveBeenCalled();
    });

    test('extracts a valid block with leading-semicolon stripped', () => {
        const lines = [
            'PROC YAMA(REAL X_START)',
            ';BOUNDING_CONTOUR_BEGIN',
            ';G0 X=$AA_IW[X]',
            ';G1 X=X_START',
            ';BOUNDING_CONTOUR_END',
            'M17',
        ];
        const result = extractBoundingContourBlock(lines);
        expect(result).not.toBeNull();
        expect(result.body).toEqual([
            'G0 X=$AA_IW[X]',
            'G1 X=X_START',
        ]);
        expect(result.beginRow).toBe(1);
        expect(result.endRow).toBe(4);
    });

    test('accepts space after semicolon and indent', () => {
        const lines = [
            '  ;BOUNDING_CONTOUR_BEGIN',
            '  ;  G1 X=10',
            '; G1 Z=20',
            ';BOUNDING_CONTOUR_END',
        ];
        const result = extractBoundingContourBlock(lines);
        expect(result.body).toEqual(['G1 X=10', 'G1 Z=20']);
    });

    test('skips empty comment lines inside the block', () => {
        const lines = [
            ';BOUNDING_CONTOUR_BEGIN',
            ';G1 X=10',
            ';',
            ';',
            ';G1 Z=20',
            ';BOUNDING_CONTOUR_END',
        ];
        expect(extractBoundingContourBlock(lines).body).toEqual(['G1 X=10', 'G1 Z=20']);
    });

    test('returns null and warns on duplicate BEGIN', () => {
        const lines = [
            ';BOUNDING_CONTOUR_BEGIN',
            ';G1 X=10',
            ';BOUNDING_CONTOUR_BEGIN',
            ';BOUNDING_CONTOUR_END',
        ];
        expect(extractBoundingContourBlock(lines)).toBeNull();
        expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/duplicate BEGIN/));
    });

    test('returns null and warns on END without BEGIN', () => {
        const lines = [
            'PROC FOO()',
            ';BOUNDING_CONTOUR_END',
        ];
        expect(extractBoundingContourBlock(lines)).toBeNull();
        expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/END without BEGIN/));
    });

    test('returns null and warns on BEGIN without END', () => {
        const lines = [
            ';BOUNDING_CONTOUR_BEGIN',
            ';G1 X=10',
            'M17',
        ];
        expect(extractBoundingContourBlock(lines)).toBeNull();
        expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/BEGIN without matching END/));
    });

    test('warns and skips non-comment lines inside the block', () => {
        const lines = [
            ';BOUNDING_CONTOUR_BEGIN',
            ';G1 X=10',
            'G1 Z=5',
            ';G1 Z=20',
            ';BOUNDING_CONTOUR_END',
        ];
        const result = extractBoundingContourBlock(lines);
        expect(result.body).toEqual(['G1 X=10', 'G1 Z=20']);
        expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/non-comment line/));
    });

    test('does not treat BOUNDING_CONTOUR_BEGINNING as the marker', () => {
        const lines = [
            ';BOUNDING_CONTOUR_BEGINNING',
            ';G1 X=10',
        ];
        expect(extractBoundingContourBlock(lines)).toBeNull();
    });
});

jest.mock('../lib/sinumerik', () => ({
    __esModule: true,
    default: { sinumerikView: {} }
}));

const { extractBoundingContourBlock, normalizeFileName, maskStringSpaces, unmaskStringSpaces, STRING_SPACE_SENTINEL, buildAnimationPieces, subdivideElement, traceFrameTarget } = require('../lib/utils');

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

describe('buildAnimationPieces', () => {
    const move = (zs, z) => ({type: 'G1', X_start: 0, Y_start: 0, Z_start: zs, X: 0, Y: 0, Z: z});

    test('every piece says which program block it came from', () => {
        const canvas = [move(0, 100), move(100, 101), move(101, 300)];
        const {elements, frameOf, endFracOf} = buildAnimationPieces(canvas);

        expect(elements.length).toBe(canvas.reduce((n, el) => n + subdivideElement(el).length, 0));
        expect(frameOf.length).toBe(elements.length);
        expect(endFracOf.length).toBe(elements.length);

        // Monotone, starts at the first block, ends at the last, and covers all.
        expect(frameOf[0]).toBe(0);
        expect(frameOf[frameOf.length - 1]).toBe(canvas.length - 1);
        frameOf.forEach((f, i) => expect(f).toBeGreaterThanOrEqual(i ? frameOf[i - 1] : 0));
        expect(new Set(frameOf).size).toBe(canvas.length);
    });

    test('the last piece of a block ends at the end of it', () => {
        const canvas = [move(0, 100), move(100, 300)];
        const {frameOf, endFracOf} = buildAnimationPieces(canvas);

        frameOf.forEach((f, i) => {
            const last = i === frameOf.length - 1 || frameOf[i + 1] !== f;
            if (last) expect(endFracOf[i]).toBeCloseTo(1, 12);
            else expect(endFracOf[i]).toBeLessThan(1);
        });
    });

    test('a fraction grows evenly across a block', () => {
        const {endFracOf, frameOf} = buildAnimationPieces([move(0, 100)]);
        const n = frameOf.length;
        endFracOf.forEach((f, i) => expect(f).toBeCloseTo((i + 1) / n, 12));
    });

    test('msg and pause blocks stay whole', () => {
        const canvas = [{type: 'msg', value: 'hi'}, move(0, 100), {type: 'pause', value: 'M0'}];
        const {elements, frameOf, endFracOf} = buildAnimationPieces(canvas);

        expect(elements[0]).toBe(canvas[0]);
        expect(frameOf[0]).toBe(0);
        expect(endFracOf[0]).toBe(1);
        expect(elements[elements.length - 1]).toBe(canvas[2]);
        expect(endFracOf[endFracOf.length - 1]).toBe(1);
    });

    test('a short move is one piece, and an empty program is empty', () => {
        expect(buildAnimationPieces([move(0, 0.5)]).elements.length).toBe(1);
        expect(buildAnimationPieces([]).elements).toEqual([]);
        expect(buildAnimationPieces(undefined).frameOf).toEqual([]);
    });
});

describe('traceFrameTarget', () => {
    // Two blocks: the first cut into 3 pieces, the second into 2.
    const frameOf    = [0, 0, 0, 1, 1];
    const endFracOf  = [1 / 3, 2 / 3, 1, 0.5, 1];
    const target = (pieceLimit) => traceFrameTarget(frameOf, endFracOf, pieceLimit, 2);

    test('nothing drawn, nothing owed and nothing shown', () => {
        expect(target(0)).toEqual({limit: 0, partial: null});
    });

    test('a block part way through is shown, not applied', () => {
        expect(target(1)).toEqual({limit: 0, partial: {index: 0, fraction: 1 / 3}});
        expect(target(2)).toEqual({limit: 0, partial: {index: 0, fraction: 2 / 3}});
    });

    test('its last piece applies it, and nothing is left to show', () => {
        expect(target(3)).toEqual({limit: 1, partial: null});
    });

    test('the last block of the program applies on its last piece too', () => {
        expect(target(4)).toEqual({limit: 1, partial: {index: 1, fraction: 0.5}});
        expect(target(5)).toEqual({limit: 2, partial: null});
    });

    test('without the mapping, pieces are blocks', () => {
        expect(traceFrameTarget(null, null, 2, 7)).toEqual({limit: 2, partial: null});
        expect(traceFrameTarget(null, null, 9, 7)).toEqual({limit: 7, partial: null});
        // A stale mapping is no mapping: lengths that disagree are not trusted.
        expect(traceFrameTarget([0, 0], [1], 1, 2)).toEqual({limit: 1, partial: null});
    });
});

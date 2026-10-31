jest.mock('../lib/sinumerik', () => ({
    __esModule: true,
    default: { sinumerikView: {} }
}));

const { extractBoundingContourBlock, normalizeFileName, maskStringSpaces, unmaskStringSpaces, STRING_SPACE_SENTINEL, buildAnimationPieces, subdivideElement, traceFrameTarget, toolMarkerOf, normalizeFeedValue, stickyMsgAt, wheelIsMouse, isLinearAxis, isFrameAxis, fillAuxAxes } = require('../lib/utils');

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

describe('subdivideElement', () => {
    const move = (zs, z, extra = {}) =>
        ({type: 'G1', X_start: 0, Y_start: 0, Z_start: zs, X: 0, Y: 0, Z: z, ...extra});

    test('a block shorter than the step is passed through whole', () => {
        const el = move(0, 0.5);
        expect(subdivideElement(el)).toEqual([el]);
        expect(subdivideElement(el)[0]).toBe(el);
    });

    test('the pieces cover the block end to end, in order', () => {
        const pieces = subdivideElement(move(0, -100));
        expect(pieces.length).toBeGreaterThan(1);
        expect(pieces[0].Z_start).toBeCloseTo(0);
        expect(pieces[pieces.length - 1].Z).toBeCloseTo(-100);
        pieces.forEach((p, i) => {
            if (i) expect(p.Z_start).toBeCloseTo(pieces[i - 1].Z);
        });
    });

    // The copy must not be lossy. A deep copy through JSON turns NaN into null,
    // which `Number.isNaN` does not catch and arithmetic reads as zero — and
    // "never programmed" is exactly what the extra axes A/B/C/U/V/W will carry
    // on a block before their first appearance.
    test('a value that is not a number survives the copy as itself', () => {
        const pieces = subdivideElement(move(0, -100, {A_start: NaN, A: 90}));

        expect(pieces.length).toBeGreaterThan(1);
        pieces.forEach(p => {
            expect(Number.isNaN(p.A_start)).toBe(true);
            expect(p.A).toBe(90);
        });
    });

    describe('the additional axes are divided too', () => {
        test('a block that moves an axis divides it alongside X Y Z', () => {
            const pieces = subdivideElement(move(0, -100, {A_start: 0, A: 90}), ['A']);

            expect(pieces.length).toBeGreaterThan(1);
            expect(pieces[0].A_start).toBeCloseTo(0);
            expect(pieces[pieces.length - 1].A).toBeCloseTo(90);
            pieces.forEach((p, i) => {
                if (i) expect(p.A_start).toBeCloseTo(pieces[i - 1].A);
            });
        });

        test('a block that does not move it repeats the one value', () => {
            const pieces = subdivideElement(move(0, -100, {A_start: 90, A: 90}), ['A']);

            pieces.forEach(p => {
                expect(p.A_start).toBe(90);
                expect(p.A).toBe(90);
            });
        });

        // Nothing to divide from: the axis arrives at the end of the block, and
        // until then the pieces say nothing about it — which is what the panel
        // reads as "not programmed yet".
        test('the block that names an axis first gives it only to the last piece', () => {
            const pieces = subdivideElement(move(0, -100, {A: 90}), ['A']);

            expect(pieces.length).toBeGreaterThan(1);
            pieces.slice(0, -1).forEach(p => {
                expect('A' in p).toBe(false);
                expect('A_start' in p).toBe(false);
            });

            const lastPiece = pieces[pieces.length - 1];
            expect(lastPiece.A_start).toBe(90);
            expect(lastPiece.A).toBe(90);
        });

        test('an axis the block says nothing about is not invented', () => {
            const pieces = subdivideElement(move(0, -100), ['A', 'W']);

            pieces.forEach(p => {
                expect('A' in p).toBe(false);
                expect('W' in p).toBe(false);
            });
        });

        test('several axes are divided independently', () => {
            const pieces = subdivideElement(
                move(0, -100, {A_start: 0, A: 90, W_start: 10, W: 20, C1: 45}),
                ['A', 'W', 'C1']);

            const mid = pieces[Math.floor(pieces.length / 2)];
            expect(mid.A).toBeGreaterThan(0);
            expect(mid.A).toBeLessThan(90);
            expect(mid.W).toBeGreaterThan(10);
            expect(mid.W).toBeLessThan(20);
            expect('C1' in mid).toBe(false);

            expect(pieces[pieces.length - 1].C1).toBe(45);
        });

        // A block short enough to stay whole keeps whatever it carries: the
        // first-appearance rule has nothing to say when there is one piece, and
        // that piece IS the last one.
        test('a block too short to divide is passed through untouched', () => {
            const el = move(0, 0.5, {A: 90});
            expect(subdivideElement(el, ['A'])[0]).toBe(el);
        });

        test('without the list, the axes are left exactly as they were', () => {
            const pieces = subdivideElement(move(0, -100, {A_start: 0, A: 90}));

            pieces.forEach(p => {
                expect(p.A_start).toBe(0);
                expect(p.A).toBe(90);
            });
        });
    });

    test('the modal state of the block reaches every piece', () => {
        const feed = {value: 120, type: 'G95'};
        const pieces = subdivideElement(move(0, -100, {feed, workPlane: 'G18', row: 7}));

        pieces.forEach(p => {
            expect(p.feed.value).toBe(120);
            expect(p.workPlane).toBe('G18');
            expect(p.row).toBe(7);
        });
    });
});

describe('buildAnimationPieces', () => {
    const move = (zs, z) => ({type: 'G1', X_start: 0, Y_start: 0, Z_start: zs, X: 0, Y: 0, Z: z});

    test('the additional axes reach subdivideElement through it', () => {
        const canvas = [{type: 'G1', X_start: 0, Y_start: 0, Z_start: 0,
                         X: 0, Y: 0, Z: -100, A_start: 0, A: 90}];
        const {elements} = buildAnimationPieces(canvas, ['A']);

        expect(elements.length).toBeGreaterThan(1);
        expect(elements[0].A).toBeLessThan(90);
        expect(elements[elements.length - 1].A).toBeCloseTo(90);
    });

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

// The `;TOOL:NAME` marker. Read by the parser and rewritten in place by the
// Tools panel, so the span matters as much as the name: it is what lets the
// name be replaced without touching the rest of the line.
describe('toolMarkerOf', () => {
    test('the name and the span it occupies', () => {
        expect(toolMarkerOf(';TOOL:TURN35')).toEqual({name: 'TURN35', start: 6, end: 12});
        const line = ';TOOL:TURN35';
        const {start, end} = toolMarkerOf(line);
        expect(line.slice(start, end)).toBe('TURN35');
    });

    test('the spellings the parser accepts: leading space, a space after the semicolon, any case', () => {
        expect(toolMarkerOf('  ; tool:  groove').name).toBe('groove');
        expect(toolMarkerOf('   ;TOOL:A')).toEqual({name: 'A', start: 9, end: 10});
    });

    test('what follows the name is not part of it', () => {
        expect(toolMarkerOf(';TOOL:A ; roughing')).toEqual({name: 'A', start: 6, end: 7});
    });

    test('a marker not at the start of the line is inside a comment already begun, and is not read', () => {
        expect(toolMarkerOf('G1 X10 ;TOOL:A')).toBeNull();
        expect(toolMarkerOf(';comment ;TOOL:A')).toBeNull();
    });

    test('CRLF does not become part of the name', () => {
        expect(toolMarkerOf(';TOOL:A\r').name).toBe('A');
    });

    test('nothing to read', () => {
        expect(toolMarkerOf('')).toBeNull();
        expect(toolMarkerOf(';TOOL:')).toBeNull();
        expect(toolMarkerOf(null)).toBeNull();
        expect(toolMarkerOf(undefined)).toBeNull();
    });
});

// normalizeFeedValue — the gate between `calcValue` and `feed.value`.
//
// `calcValue` returns a string for a literal, a number for an expression and
// null when the expression could not be evaluated. Only a positive finite
// number is a feed.
describe('normalizeFeedValue', () => {
    test('a literal comes back as a number, not a string', () => {
        expect(normalizeFeedValue('100')).toEqual({value: 100});
    });

    test('a computed expression passes through', () => {
        expect(normalizeFeedValue(1200)).toEqual({value: 1200});
        expect(normalizeFeedValue(0.25)).toEqual({value: 0.25});
    });

    test('null from an expression that could not be evaluated is rejected', () => {
        expect(normalizeFeedValue(null)).toEqual({error: 'nan'});
    });

    test('something that is not a number at all is rejected', () => {
        expect(normalizeFeedValue(undefined)).toEqual({error: 'nan'});
        expect(normalizeFeedValue('')).toEqual({error: 'nan'});
        expect(normalizeFeedValue('abc')).toEqual({error: 'nan'});
        expect(normalizeFeedValue(NaN)).toEqual({error: 'nan'});
        expect(normalizeFeedValue(Infinity)).toEqual({error: 'nan'});
    });

    test('zero and negative are rejected separately — the control rejects FB=0 too', () => {
        expect(normalizeFeedValue(0)).toEqual({error: 'nonpositive'});
        expect(normalizeFeedValue('0')).toEqual({error: 'nonpositive'});
        expect(normalizeFeedValue(-100)).toEqual({error: 'nonpositive'});
    });
});

// stickyMsgAt — the hanging MSG as a function of the position.
//
// This is what makes a rewind restore the message: nothing remembers it, it is
// read back from the element list every time the position moves.
describe('stickyMsgAt', () => {
    const msg = (value) => ({type: 'msg', value});
    const move = () => ({type: 'G1'});

    test('the last message before the position wins', () => {
        const elements = [msg('FIRST'), move(), msg('SECOND'), move()];
        expect(stickyMsgAt(elements, 4)).toBe('SECOND');
    });

    test('a message further along the program is not shown yet', () => {
        const elements = [msg('FIRST'), move(), msg('SECOND'), move()];
        expect(stickyMsgAt(elements, 2)).toBe('FIRST');
    });

    test('a message standing exactly at the position has not been reached', () => {
        const elements = [msg('FIRST'), move(), msg('SECOND')];
        expect(stickyMsgAt(elements, 2)).toBe('FIRST');
    });

    test('nothing drawn yet, nothing to show', () => {
        expect(stickyMsgAt([msg('FIRST'), move()], 0)).toBe('');
    });

    test('an empty MSG takes the message down', () => {
        const elements = [msg('FIRST'), move(), msg(''), move()];
        expect(stickyMsgAt(elements, 4)).toBe('');
    });

    test('a program with no message at all', () => {
        expect(stickyMsgAt([move(), move()], 2)).toBe('');
    });

    test('a position past the end of the list is the end of the list', () => {
        expect(stickyMsgAt([msg('FIRST'), move()], 999)).toBe('FIRST');
    });

    test('nothing to walk', () => {
        expect(stickyMsgAt([], 5)).toBe('');
        expect(stickyMsgAt(undefined, 5)).toBe('');
    });

    test('a message with no value at all reads as empty', () => {
        expect(stickyMsgAt([{type: 'msg'}], 1)).toBe('');
    });
});

describe('wheelIsMouse', () => {
    const wheel = (deltaY, deltaMode = 0) => ({deltaY, deltaMode});

    test('a whole detent is a mouse, either direction', () => {
        expect(wheelIsMouse(wheel(120))).toBe(true);
        expect(wheelIsMouse(wheel(-120))).toBe(true);
        expect(wheelIsMouse(wheel(100))).toBe(true);
        expect(wheelIsMouse(wheel(-300))).toBe(true);
    });

    test('lines or pages come from nothing but a wheel', () => {
        expect(wheelIsMouse(wheel(3, 1))).toBe(true);
        expect(wheelIsMouse(wheel(1, 2))).toBe(true);
    });

    test('the small, arbitrary deltas of a swipe are a trackpad', () => {
        [4, -12.5, 37, 99.9, -64].forEach(d => expect(wheelIsMouse(wheel(d))).toBe(false));
    });

    test('a long swipe is still a trackpad while it is not a whole detent', () => {
        expect(wheelIsMouse(wheel(143))).toBe(false);
        expect(wheelIsMouse(wheel(-250.5))).toBe(false);
    });

    // The one case the numbers cannot separate: a swipe that happens to land on
    // a detent reads as a mouse. It costs one step too many, which is the side
    // the doubt is deliberately resolved to.
    test('a swipe landing exactly on a detent is taken for a mouse', () => {
        expect(wheelIsMouse(wheel(120))).toBe(true);
    });
});

describe('isLinearAxis / isFrameAxis', () => {
    test('a length takes the unit, an angle does not', () => {
        ['X', 'Y', 'Z', 'U', 'V', 'W'].forEach(ax => expect(isLinearAxis(ax)).toBe(true));
        ['A', 'B', 'C'].forEach(ax => expect(isLinearAxis(ax)).toBe(false));
    });

    // A frame is built on three axes. The additional ones are read and shown
    // and nothing more, and `frame.mirror` holds no entry for them.
    test('a frame is built on X Y Z alone', () => {
        ['X', 'Y', 'Z'].forEach(ax => expect(isFrameAxis(ax)).toBe(true));
        ['A', 'B', 'C', 'U', 'V', 'W'].forEach(ax => expect(isFrameAxis(ax)).toBe(false));
    });

    // The machine names its spindle axis, and it can be anything.
    test('a multi-letter axis name is neither', () => {
        ['C2', 'SP1', ''].forEach(name => {
            expect(isLinearAxis(name)).toBe(false);
            expect(isFrameAxis(name)).toBe(false);
        });
    });
});

describe('fillAuxAxes', () => {
    test('an element with no block of its own gets both ends alike', () => {
        const corner = {type: 'G1', X_start: 0, X: 5};
        fillAuxAxes(corner, ['A'], {A: 90});

        expect(corner.A).toBe(90);
        expect(corner.A_start).toBe(90);
    });

    // An element born of a block carries its own pair, with a start that may
    // differ from the end. Overwriting it would flatten the very interpolation
    // the block is there to express.
    test('an element that carries the axis already is left alone', () => {
        const block = {type: 'G1', A_start: 0, A: 90};
        fillAuxAxes(block, ['A'], {A: 180});

        expect(block.A_start).toBe(0);
        expect(block.A).toBe(90);
    });

    test('an axis not named anywhere yet leaves no key', () => {
        const corner = {type: 'G1'};
        fillAuxAxes(corner, ['A', 'W'], {A: 90});

        expect(corner.A).toBe(90);
        expect('W' in corner).toBe(false);
        expect('W_start' in corner).toBe(false);
    });

    test('a zero is a value like any other', () => {
        const corner = {type: 'G1'};
        fillAuxAxes(corner, ['A'], {A: 0});

        expect(corner.A).toBe(0);
        expect(corner.A_start).toBe(0);
    });

    test('nothing to fill in is not an error', () => {
        const corner = {type: 'G1'};
        expect(() => fillAuxAxes(corner, [], {})).not.toThrow();
        expect(() => fillAuxAxes(corner, undefined, undefined)).not.toThrow();
        expect(Object.keys(corner)).toEqual(['type']);
    });
});

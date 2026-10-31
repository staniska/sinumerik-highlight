jest.mock('../lib/sinumerik', () => ({
    __esModule: true,
    default: { sinumerikView: { programmData: {} } }
}));

const { parseAutoComment, loadDataFromComment, commentPayload, declaredFields } = require('../lib/inner-comment');
const View = require('../lib/sinumerik').default;

describe('parseAutoComment', () => {
    let logSpy;

    beforeEach(() => {
        logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        logSpy.mockRestore();
    });

    const BEGIN = ';This comment is automatically created by sinumerik-highlight package';
    const END = ';End of comment created by sinumerik-highlight package';

    test('returns {} for empty text', () => {
        expect(parseAutoComment('')).toEqual({});
    });

    test('returns {} for non-string input', () => {
        expect(parseAutoComment(null)).toEqual({});
        expect(parseAutoComment(undefined)).toEqual({});
    });

    test('returns {} when no marker pair is present', () => {
        const text = [
            'PROC YAMA(REAL X_START)',
            'G1 X=X_START',
            'M17',
        ].join('\n');
        expect(parseAutoComment(text)).toEqual({});
    });

    // The original loadDataFromComment uses indexOf > 0, so the BEGIN
    // marker is only recognised if something precedes it. Real auto-comments
    // produced by generateComment are inserted into existing program text,
    // so this matches actual usage. Tests always include a leading line.

    test('extracts a single contour block', () => {
        const text = [
            'N1 G0 X0',
            BEGIN,
            ';{"contour":{"name":"CONTOUR_MIRR"}}',
            END,
            'M17',
        ].join('\n');
        const result = parseAutoComment(text);
        expect(result.contour).toEqual({ name: 'CONTOUR_MIRR' });
    });

    test('extracts blank, contour and machine across multiple chunks', () => {
        const text = [
            'N1 G0 X0',
            BEGIN,
            ';{"blank":{"name":"BLANK_MIRR"}}',
            ';{"contour":{"name":"CONTOUR_MIRR"}}',
            ';{"machine":{"machineName":"M1","machineType":"Lathe","cnc":"Sinumerik"}}',
            END,
        ].join('\n');
        const result = parseAutoComment(text);
        expect(result.blank).toEqual({ name: 'BLANK_MIRR' });
        expect(result.contour).toEqual({ name: 'CONTOUR_MIRR' });
        expect(result.machine).toEqual({ machineName: 'M1', machineType: 'Lathe', cnc: 'Sinumerik' });
    });

    test('handles multi-line pretty-printed JSON inside the block', () => {
        const text = [
            'N10 ; some code',
            BEGIN,
            ';{',
            ';  "contour": {',
            ';    "name": "CONTOUR"',
            ';  }',
            ';}',
            END,
            'N20 ; more code',
        ].join('\n');
        expect(parseAutoComment(text).contour).toEqual({ name: 'CONTOUR' });
    });

    test('parses several BEGIN/END marker pairs', () => {
        const text = [
            'N1 G0 X0',
            BEGIN,
            ';{"blank":{"name":"BLANK_A"}}',
            END,
            'PROC FOO()',
            BEGIN,
            ';{"contour":{"name":"CONTOUR_B"}}',
            END,
        ].join('\n');
        const result = parseAutoComment(text);
        expect(result.blank).toEqual({ name: 'BLANK_A' });
        expect(result.contour).toEqual({ name: 'CONTOUR_B' });
    });

    test('an ips reference comes through', () => {
        // It used to be dropped: the parser copied three named fields, so a
        // program borrowing a previous one's stock came back looking as though
        // it had no reference at all.
        const text = [
            'N1 G0 X0',
            BEGIN,
            ';{"ips":{"name":"OP10","trans":{"Z":-120},"mirror":["Z"]}}',
            END,
        ].join('\n');
        expect(parseAutoComment(text).ips)
            .toEqual({ name: 'OP10', trans: { Z: -120 }, mirror: ['Z'] });
    });

    test('a field this package does not know is kept, not dropped', () => {
        // `declaredFields` reads these keys, and a save carries an unknown one
        // through rather than deleting what it does not understand.
        const text = ['N1 G0 X0', BEGIN, ';{"somethingNew":{"a":1}}', END].join('\n');
        expect(parseAutoComment(text).somethingNew).toEqual({ a: 1 });
    });

    test('logs and continues when one JSON chunk is broken', () => {
        const text = [
            'N1 G0 X0',
            BEGIN,
            ';{"blank":{"name":"BLANK_OK"}}',
            ';{"contour":{"name":}}',
            END,
        ].join('\n');
        const result = parseAutoComment(text);
        expect(result.blank).toEqual({ name: 'BLANK_OK' });
        expect(result.contour).toBeUndefined();
        expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/ERROR Auto comment/));
    });

    test('bails out when END marker is missing', () => {
        const text = [
            'N1 G0 X0',
            BEGIN,
            ';{"contour":{"name":"CONTOUR"}}',
            'PROC FOO()',
        ].join('\n');
        const result = parseAutoComment(text);
        expect(result).toEqual({});
        expect(logSpy).toHaveBeenCalledWith('Broken comment');
    });
});

// --- loadDataFromComment: machine.units back-compat (G70/G71 inch/metric plan) ---

describe('loadDataFromComment units back-compat', () => {
    const BEGIN = ';This comment is automatically created by sinumerik-highlight package';
    const END = ';End of comment created by sinumerik-highlight package';

    const setEditor = (path, text) => {
        global.atom = {
            workspace: {
                getActiveTextEditor: () => ({
                    getPath: () => path,
                    getText: () => text,
                }),
            },
        };
    };

    beforeEach(() => {
        View.sinumerikView.programmData = {};
    });

    test('machine without a units field defaults to metric', () => {
        const text = [
            'N1 G0 X0',
            BEGIN,
            ';{"machine":{"machineName":"OLD_LATHE","machineType":"Lathe"}}',
            END,
        ].join('\n');
        setEditor('/test/old.mpf', text);

        loadDataFromComment();

        expect(View.sinumerikView.programmData['/test/old.mpf'].machine.units).toBe('metric');
    });

    test('an ips reference is loaded and takes the blank default with it', () => {
        const text = [
            'N1 G0 X0',
            BEGIN,
            ';{"ips":{"name":"OP10"}}',
            END,
        ].join('\n');
        setEditor('/test/op20.mpf', text);

        loadDataFromComment();

        const data = View.sinumerikView.programmData['/test/op20.mpf'];
        expect(data.ips).toEqual({ name: 'OP10' });
        // Mutually exclusive from the moment the file is read: a program that
        // borrows a previous one's stock has no blank of its own.
        expect(data.blank).toBeUndefined();
        expect(data.contour).toEqual({ name: 'CONTOUR' });
    });

    test('machine with an explicit units field is left untouched', () => {
        const text = [
            'N1 G0 X0',
            BEGIN,
            ';{"machine":{"machineName":"INCH_LATHE","machineType":"Lathe","units":"inch"}}',
            END,
        ].join('\n');
        setEditor('/test/inch.mpf', text);

        loadDataFromComment();

        expect(View.sinumerikView.programmData['/test/inch.mpf'].machine.units).toBe('inch');
    });
});


// --- commentPayload: only what the file itself declares (granular auto-comment) ---
//
// `loadDataFromComment` seeds blank/contour defaults whether the file named them
// or not, so the rule that decides what reaches the program text is the one
// worth pinning: it is what kept `Attach` from writing a BLANK nobody asked for.

describe('commentPayload', () => {
    const data = {
        machine: { machineName: 'M1', machineType: 'Lathe', units: 'metric' },
        blank: { name: 'BLANK' },
        contour: { name: 'DETAL' },
    };

    test('keeps only the declared keys', () => {
        expect(commentPayload(data, new Set(['contour']))).toEqual({ contour: { name: 'DETAL' } });
    });

    test('an undeclared default never reaches the file', () => {
        const payload = commentPayload(data, new Set(['machine', 'contour']));
        expect(payload.blank).toBeUndefined();
        expect(Object.keys(payload).sort()).toEqual(['contour', 'machine']);
    });

    test('declaring everything reproduces the old whole-object behaviour', () => {
        expect(commentPayload(data, new Set(['machine', 'blank', 'contour']))).toEqual(data);
    });

    test('accepts an array as well as a Set', () => {
        expect(commentPayload(data, ['blank'])).toEqual({ blank: { name: 'BLANK' } });
    });

    test('nothing declared yields an empty payload', () => {
        expect(commentPayload(data, new Set())).toEqual({});
        expect(commentPayload(data, undefined)).toEqual({});
    });

    test('tolerates missing data', () => {
        expect(commentPayload(undefined, new Set(['machine']))).toEqual({});
        expect(commentPayload(null, new Set(['machine']))).toEqual({});
    });

    test('machine is written verbatim — sinumerik-to-nc reads its structure', () => {
        const withEmpty = { machine: { machineName: 'M1', firstCarriage: {} } };
        expect(commentPayload(withEmpty, new Set(['machine'])).machine)
            .toEqual({ machineName: 'M1', firstCarriage: {} });
    });

    test('an empty offset and an empty mirror are left out of ips', () => {
        const withIps = { ips: { name: 'OP10', trans: {}, mirror: [] } };
        expect(commentPayload(withIps, new Set(['ips'])).ips).toEqual({ name: 'OP10' });
    });

    test('a named offset axis survives pruning', () => {
        const withIps = { ips: { name: 'OP10', trans: { Z: -120 }, mirror: ['Z'] } };
        expect(commentPayload(withIps, new Set(['ips'])).ips)
            .toEqual({ name: 'OP10', trans: { Z: -120 }, mirror: ['Z'] });
    });

    test('a zero offset is a value, not an absence', () => {
        const withIps = { ips: { name: 'OP10', trans: { Z: 0 } } };
        expect(commentPayload(withIps, new Set(['ips'])).ips)
            .toEqual({ name: 'OP10', trans: { Z: 0 } });
    });

    test('a key whose whole value is empty is dropped', () => {
        expect(commentPayload({ ips: {} }, new Set(['ips']))).toEqual({});
    });
});


// --- declaredFields: the text is the source of truth ---
//
// An in-memory record of this went stale the moment the comment was edited by
// hand: deleting the whole comment and then saving the blank put the contour
// back, because memory still remembered it.

describe('declaredFields', () => {
    const BEGIN = ';This comment is automatically created by sinumerik-highlight package';
    const END = ';End of comment created by sinumerik-highlight package';
    const wrap = (...lines) => ['N1 G0 X0', BEGIN, ...lines, END].join('\n');

    test('a file that names only its machine declares only machine', () => {
        expect(Array.from(declaredFields(wrap(';{"machine":{"machineName":"M1"}}'))))
            .toEqual(['machine']);
    });

    test('a file with no auto-comment declares nothing', () => {
        expect(Array.from(declaredFields('N1 G0 X0\nM30'))).toEqual([]);
        expect(Array.from(declaredFields(''))).toEqual([]);
    });

    test('an old file with all three keys declares all three', () => {
        const text = wrap(';{"machine":{"machineName":"M1"},"blank":{"name":"ZAGOT"},"contour":{"name":"DETAL"}}');
        expect(Array.from(declaredFields(text)).sort()).toEqual(['blank', 'contour', 'machine']);
    });

    test('a deleted comment declares nothing, whatever was saved before', () => {
        expect(Array.from(declaredFields(wrap(';{"contour":{"name":"DETAL"}}')))).toEqual(['contour']);
        expect(Array.from(declaredFields('N1 G0 X0'))).toEqual([]);
    });
});


describe('commentPayload base and saving', () => {
    test('a field only the file knows about is carried through', () => {
        // Memory never read this file's machine; saving the contour must not
        // drop it.
        const payload = commentPayload(
            { contour: { name: 'DETAL' } },
            new Set(['machine', 'contour']),
            { base: { machine: { machineName: 'M1' } }, saving: ['contour'] },
        );
        expect(payload).toEqual({ machine: { machineName: 'M1' }, contour: { name: 'DETAL' } });
    });

    test('memory wins over the file for a field both know', () => {
        const payload = commentPayload(
            { contour: { name: 'NEW' } },
            new Set(['contour']),
            { base: { contour: { name: 'OLD' } }, saving: ['contour'] },
        );
        expect(payload.contour).toEqual({ name: 'NEW' });
    });

    test('saving the blank row drops the ips the file had', () => {
        const payload = commentPayload(
            { blank: { name: 'ZAGOT' } },
            new Set(['ips', 'blank']),
            { base: { ips: { name: 'OP10' } }, saving: ['blank'] },
        );
        expect(payload).toEqual({ blank: { name: 'ZAGOT' } });
    });

    test('saving the ips row drops the blank the file had', () => {
        const payload = commentPayload(
            { ips: { name: 'OP10' } },
            new Set(['blank', 'ips']),
            { base: { blank: { name: 'ZAGOT' } }, saving: ['ips'] },
        );
        expect(payload).toEqual({ ips: { name: 'OP10' } });
    });

    test('saving the contour leaves the blank row alone, both ways', () => {
        // Saving one thing at a time is the whole point: a contour press has no
        // business resolving a pair it was not asked about.
        const withIps = commentPayload(
            { contour: { name: 'DETAL' }, blank: { name: 'BLANK' } },
            new Set(['ips', 'contour']),
            { base: { ips: { name: 'OP10' } }, saving: ['contour'] },
        );
        expect(withIps).toEqual({ ips: { name: 'OP10' }, contour: { name: 'DETAL' } });
    });

    test('with no base it is the plain declared filter', () => {
        const data = { machine: { machineName: 'M1' }, blank: { name: 'BLANK' } };
        expect(commentPayload(data, new Set(['machine']))).toEqual({ machine: { machineName: 'M1' } });
    });
});

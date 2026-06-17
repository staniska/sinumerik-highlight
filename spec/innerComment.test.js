jest.mock('../lib/sinumerik', () => ({
    __esModule: true,
    default: { sinumerikView: { programmData: {} } }
}));

const { parseAutoComment } = require('../lib/inner-comment');

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

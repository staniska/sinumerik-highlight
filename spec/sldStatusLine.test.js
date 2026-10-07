// The one-line status under the SLD canvas (lib/sldStatusLine.js).
//
// It has two sources arriving at different times — the parse once per redraw,
// material-trace damage frame by frame — so the point of the module, and of
// these tests, is that neither quietly overwrites the other's news.

jest.mock('../lib/sinumerik', () => ({
    __esModule: true,
    default: {sinumerikView: {}},
}));

jest.mock('../lib/materialTraceRun', () => ({
    materialTraceReport: jest.fn(() => ({status: 'noTrace'})),
}));

const View = require('../lib/sinumerik').default;
const {materialTraceReport} = require('../lib/materialTraceRun');
const {updateSldStatusLine} = require('../lib/sldStatusLine');

let stringDiv;

const setup = (errors = []) => {
    const classes = new Set();
    stringDiv = {
        innerText: '',
        classList: {
            toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)),
            has: name => classes.has(name),
        },
    };
    View.sinumerikView = {
        singleLineDebugParseStringDiv: {stringDiv},
        parseData: {errors},
    };
};

const clean = () => ({status: 'ok', gouges: {count: 0}, collisions: {count: 0}, offContour: {count: 0}});
const gouged = (count, depth, row) => ({
    status: 'ok',
    gouges: {count, worst: {depth, row}},
    collisions: {count: 0},
    offContour: {count: 0},
});
const struck = (count, depth, row) => ({
    status: 'ok',
    gouges: {count: 1, worst: {depth: 0.1, row: 1}},
    collisions: {count, worst: {depth, row}},
    offContour: {count: 0},
});
const offCourse = (count, deviation, row) => ({
    status: 'ok',
    gouges: {count: 1, worst: {depth: 0.9, row: 2}},
    collisions: {count: 1, worst: {depth: 0.9, row: 3}},
    offContour: {count, worst: {deviation, row}},
});

beforeEach(() => {
    setup();
    materialTraceReport.mockReturnValue({status: 'noTrace'});
});

describe('with nothing wrong', () => {
    test('says the parse is fine', () => {
        updateSldStatusLine();
        expect(stringDiv.innerText).toBe('PARSE OK');
        expect(stringDiv.classList.has('sinumerikSLDStringDiv--ok')).toBe(true);
        expect(stringDiv.classList.has('sinumerikSLDStringDiv--error')).toBe(false);
    });

    test('a trace that found nothing leaves the parse text alone', () => {
        materialTraceReport.mockReturnValue(clean());
        updateSldStatusLine();
        expect(stringDiv.innerText).toBe('PARSE OK');
    });
});

describe('parse errors', () => {
    test('are counted, with the last one quoted', () => {
        setup([{text: 'first'}, {text: 'Line too short "X"'}]);
        updateSldStatusLine();

        expect(stringDiv.innerText).toBe('ERR (2).  Last: Line too short "X"');
        expect(stringDiv.classList.has('sinumerikSLDStringDiv--error')).toBe(true);
    });
});

describe('damage', () => {
    test('a gouge replaces the parse text and reads as an error', () => {
        materialTraceReport.mockReturnValue(gouged(1, 0.412, 127));
        updateSldStatusLine();

        expect(stringDiv.innerText).toBe('CUT INTO THE PART 0.412 mm at row 128');
        expect(stringDiv.classList.has('sinumerikSLDStringDiv--error')).toBe(true);
    });

    test('a holder strike outranks a gouge', () => {
        // A gouge spoils the part; a strike breaks the machine.
        materialTraceReport.mockReturnValue(struck(1, 1.25, 76));
        updateSldStatusLine();

        expect(stringDiv.innerText).toMatch(/^HOLDER HIT STOCK 1\.250 mm at row 77/);
        expect(stringDiv.innerText).not.toMatch(/CUT INTO THE PART/);
    });

    test('more than one of a kind is counted, not listed', () => {
        materialTraceReport.mockReturnValue(gouged(4, 0.5, 9));
        updateSldStatusLine();
        expect(stringDiv.innerText).toBe('CUT INTO THE PART 0.500 mm at row 10 (+3 more)');
    });

    test('parse errors are carried alongside, never hidden by damage', () => {
        // Damage wins the headline because it is the worse news, but a parse
        // error means a line could not be read at all and must not vanish.
        setup([{text: 'boom'}, {text: 'bang'}]);
        materialTraceReport.mockReturnValue(gouged(1, 0.2, 4));
        updateSldStatusLine();

        expect(stringDiv.innerText).toBe('CUT INTO THE PART 0.200 mm at row 5  ·  ERR (2)');
    });

    test('a block with no row still reports its depth', () => {
        materialTraceReport.mockReturnValue({
            status: 'ok', gouges: {count: 1, worst: {depth: 0.3}}, collisions: {count: 0},
            offContour: {count: 0},
        });
        updateSldStatusLine();
        expect(stringDiv.innerText).toBe('CUT INTO THE PART 0.300 mm');
    });
});

describe('a miscalibrated trace', () => {
    test('outranks both, because it makes their numbers wrong', () => {
        // A boundary in the wrong place means every depth measured from it is
        // out by the same amount — so reporting a gouge first would be quoting
        // a number this very line says cannot be trusted.
        materialTraceReport.mockReturnValue(offCourse(7, 0.566, 40));
        updateSldStatusLine();

        expect(stringDiv.innerText).toBe("TRACE IS OFF 0.566 mm at row 41 — check the tool file's zero");
        expect(stringDiv.innerText).not.toMatch(/CUT INTO THE PART|HOLDER HIT/);
        expect(stringDiv.classList.has('sinumerikSLDStringDiv--error')).toBe(true);
    });

    test('a report without the field is survivable', () => {
        // The report shape is a contract between modules; a stale shape should
        // degrade, not throw.
        materialTraceReport.mockReturnValue({status: 'ok', gouges: {count: 0}, collisions: {count: 0}});
        expect(() => updateSldStatusLine()).not.toThrow();
        expect(stringDiv.innerText).toBe('PARSE OK');
    });
});

describe('robustness', () => {
    test('no status line in the DOM is not an error', () => {
        View.sinumerikView = {};
        expect(() => updateSldStatusLine()).not.toThrow();
    });

    test('no parse data is not an error', () => {
        View.sinumerikView = {singleLineDebugParseStringDiv: {stringDiv}};
        expect(() => updateSldStatusLine()).not.toThrow();
        expect(stringDiv.innerText).toBe('PARSE OK');
    });
});

// Data-access tests for the Tools panel (lib/tools.js).
//
// Scope is narrow on purpose. There is no harness for the panel's DOM, and
// `lib/interpretator.js` cannot be required under jest at all: it pulls in
// `3d_view/view.js` → `sld_view/renderer2d.js` → three.js, which ships as an
// ES module that a CommonJS require cannot load. That is why no test in this
// suite imports the interpreter, and why it is mocked here rather than
// exercised — the real import graph loads only inside Pulsar, so these tests
// cannot vouch for it.
//
// What they do cover is the one piece of logic in the module that has a wrong
// answer available: reading a machine's tool list from data saved before the
// feature existed.

jest.mock('../lib/sinumerik', () => ({
    __esModule: true,
    default: {sinumerikView: {}},
}));

jest.mock('../lib/interpretator', () => ({
    runShapeFileParse: jest.fn(async () => ({
        name: null, variables: {}, sections: [], warnings: [], errors: [],
    })),
    // The panel asks whether a parse is in flight (the Tool list openers go
    // dead while one is) and subscribes to both edges of it at module load.
    isParseBusy: jest.fn(() => false),
    onParseBusyChange: jest.fn(),
}));

const View = require('../lib/sinumerik').default;
const {machineTools} = require('../lib/tools');

const withState = state => {
    View.sinumerikView = state;
};

// `atom` is a global inside Pulsar. Tests that care about the active editor set
// one up; the rest run with none, which is the state jest starts in.
const withOpenProgram = path => {
    globalThis.atom = {workspace: {getActiveTextEditor: () => (path ? {getPath: () => path} : null)}};
};

afterEach(() => {
    delete globalThis.atom;
});

describe('reading a machine tool list', () => {
    test('tools of the selected machine', () => {
        withState({
            machineManagerData: {selectedMachine: 'LATHE1'},
            machineData: {tools: {LATHE1: [{name: 'TURN35', path: '/t/turn35.spf'}]}},
        });

        expect(machineTools()).toEqual([{name: 'TURN35', path: '/t/turn35.spf'}]);
    });

    test('an explicitly named machine overrides the selection', () => {
        withState({
            machineManagerData: {selectedMachine: 'LATHE1'},
            machineData: {tools: {LATHE1: [{name: 'A'}], LATHE2: [{name: 'B'}]}},
        });

        expect(machineTools('LATHE2')).toEqual([{name: 'B'}]);
    });

    test('a machine saved before the feature has no tools key, and that is not an error', () => {
        // Back-compat: `machineData` predates `tools` entirely. Returning an
        // array rather than undefined is what keeps every caller from
        // repeating the same guard — and from throwing on .forEach.
        withState({
            machineManagerData: {selectedMachine: 'OLD'},
            machineData: {subroutines: {OLD: []}},
        });

        expect(machineTools()).toEqual([]);
    });

    test('a machine with no tools of its own', () => {
        withState({
            machineManagerData: {selectedMachine: 'LATHE2'},
            machineData: {tools: {LATHE1: [{name: 'A'}]}},
        });

        expect(machineTools()).toEqual([]);
    });

    test('no machine selected', () => {
        // The panel edits whichever machine machineManager has selected, so
        // before anything is selected there is nothing to list.
        withState({machineManagerData: {}, machineData: {tools: {LATHE1: [{name: 'A'}]}}});
        expect(machineTools()).toEqual([]);

        withState({machineData: {tools: {LATHE1: [{name: 'A'}]}}});
        expect(machineTools()).toEqual([]);
    });

    test('no machine data at all', () => {
        withState({machineManagerData: {selectedMachine: 'LATHE1'}});
        expect(machineTools()).toEqual([]);
    });
});

describe('whose tools the panel is about', () => {
    test('with nothing selected, the machine the open program names', () => {
        // What makes the opener usable from the SLDebug tab: the program in
        // front of the user already says which machine it runs on.
        withState({
            machineManagerData: {},
            programmData: {'/p/main.mpf': {machine: {machineName: 'LATHE2'}}},
            machineData: {machines: {LATHE2: {}}, tools: {LATHE2: [{name: 'B'}]}},
        });
        withOpenProgram('/p/main.mpf');

        expect(machineTools()).toEqual([{name: 'B'}]);
    });

    test('a machine picked in machineManager still wins', () => {
        withState({
            machineManagerData: {selectedMachine: 'LATHE1'},
            programmData: {'/p/main.mpf': {machine: {machineName: 'LATHE2'}}},
            machineData: {machines: {LATHE1: {}, LATHE2: {}}, tools: {LATHE1: [{name: 'A'}], LATHE2: [{name: 'B'}]}},
        });
        withOpenProgram('/p/main.mpf');

        expect(machineTools()).toEqual([{name: 'A'}]);
    });

    test('a machine the program names but the config does not have is refused', () => {
        // A stale or hand-edited comment must not open a panel offering to add
        // tools to a machine that does not exist.
        withState({
            machineManagerData: {},
            programmData: {'/p/main.mpf': {machine: {machineName: 'GONE'}}},
            machineData: {machines: {LATHE1: {}}, tools: {GONE: [{name: 'B'}]}},
        });
        withOpenProgram('/p/main.mpf');

        expect(machineTools()).toEqual([]);
    });

    test('no editor, no program, no machine', () => {
        withState({
            machineManagerData: {},
            programmData: {},
            machineData: {machines: {LATHE1: {}}, tools: {LATHE1: [{name: 'A'}]}},
        });
        withOpenProgram(null);

        expect(machineTools()).toEqual([]);
    });
});

// Keyboard navigation of the list.
//
// There is no DOM harness for the panel, so the selection — which the module
// keeps private — is read through what Enter does with it: the marker that
// reaches the editor names the tool that was selected. That also covers the
// two rules worth pinning down, wrap-around and insert-and-close.
describe('keyboard navigation', () => {
    const THREE_TOOLS = {
        machineManagerData: {selectedMachine: 'LATHE1'},
        machineData: {tools: {LATHE1: [{name: 'A'}, {name: 'B'}, {name: 'C'}]}},
    };

    let handleToolsKey;
    let inserted;
    let replaced;
    let closed;

    // Enough of an editor for the panel: a cursor on a row, the text of that
    // row, and the two ways the marker can be written.
    const withEditor = (lines, row = 0) => {
        globalThis.atom = {
            workspace: {
                getActiveTextEditor: () => ({
                    getPath: () => '/p/main.mpf',
                    getCursorBufferPosition: () => ({row, column: 0}),
                    lineTextForBufferRow: at => lines[at],
                    insertText: text => inserted.push(text),
                    setTextInBufferRange: (range, text) => replaced.push({range, text}),
                }),
            },
        };
    };

    beforeEach(() => {
        inserted = [];
        replaced = [];
        closed = 0;

        // A fresh copy per test: the selected tool is module state, and a test
        // that inherited it from the one before would pass for the wrong
        // reason.
        jest.isolateModules(() => {
            const module = require('../lib/tools');
            handleToolsKey = module.handleToolsKey;
        });

        View.sinumerikView = {...THREE_TOOLS};
        View.toggleTools = () => {
            closed += 1;
        };
        withEditor(['G0 X0 Z0']);
    });

    const press = key => handleToolsKey({key, preventDefault: () => {}, stopPropagation: () => {}});

    test('Down from nothing selected lands on the first tool', () => {
        expect(press('ArrowDown')).toBe(true);
        press('Enter');
        expect(inserted).toEqual([';TOOL:A\n']);
    });

    test('Up from nothing selected lands on the last one', () => {
        press('ArrowUp');
        press('Enter');
        expect(inserted).toEqual([';TOOL:C\n']);
    });

    test('Down walks the list and wraps round the end', () => {
        press('ArrowDown');
        press('ArrowDown');
        press('ArrowDown');
        press('ArrowDown');
        press('Enter');
        expect(inserted).toEqual([';TOOL:A\n']);
    });

    test('Up wraps the other way', () => {
        press('ArrowDown');
        press('ArrowUp');
        press('Enter');
        expect(inserted).toEqual([';TOOL:C\n']);
    });

    test('Enter inserts the marker and closes the window', () => {
        press('ArrowDown');
        press('ArrowDown');
        expect(press('Enter')).toBe(true);
        expect(inserted).toEqual([';TOOL:B\n']);
        expect(closed).toBe(1);
    });

    test('Enter with nothing selected does nothing, and leaves the window open', () => {
        expect(press('Enter')).toBe(false);
        expect(inserted).toEqual([]);
        expect(closed).toBe(0);
    });

    test('Enter with no editor to insert into keeps the window open', () => {
        globalThis.atom = {workspace: {getActiveTextEditor: () => null}};
        press('ArrowDown');
        expect(press('Enter')).toBe(false);
        expect(closed).toBe(0);
    });

    test('a machine with no tools ignores the keys rather than throwing', () => {
        View.sinumerikView = {machineManagerData: {selectedMachine: 'LATHE1'}, machineData: {tools: {}}};
        expect(press('ArrowDown')).toBe(false);
        expect(press('Enter')).toBe(false);
    });

    test('other keys are not claimed, so Escape still reaches the panel', () => {
        expect(press('Escape')).toBe(false);
        expect(press('a')).toBe(false);
    });

    test('Enter over a marker already on the cursor line replaces its name', () => {
        withEditor([';TOOL:A']);
        press('ArrowDown');
        press('ArrowDown');
        expect(press('Enter')).toBe(true);

        // Only the name's span is written, so the rest of the line survives.
        expect(replaced).toEqual([{range: [[0, 6], [0, 7]], text: 'B'}]);
        expect(inserted).toEqual([]);
        expect(closed).toBe(1);
    });

    test('the author\'s own spacing and anything after the marker are left alone', () => {
        withEditor(['; tool: a   ; roughing']);
        press('ArrowDown');
        press('ArrowDown');
        press('Enter');

        expect(replaced).toEqual([{range: [[0, 8], [0, 9]], text: 'B'}]);
    });

    test('Enter on a marker that already names the selected tool writes nothing', () => {
        withEditor([';TOOL:A']);
        press('ArrowDown');
        expect(press('Enter')).toBe(true);

        expect(replaced).toEqual([]);
        expect(inserted).toEqual([]);
        // Still closed: the program says what it was asked to say.
        expect(closed).toBe(1);
    });

    test('a line with no marker gets one on a line of its own, as before', () => {
        withEditor(['G1 X10']);
        press('ArrowDown');
        press('Enter');

        expect(inserted).toEqual([';TOOL:A\n']);
        expect(replaced).toEqual([]);
    });

    test('the marker is read off the row the cursor is on, not the first row', () => {
        withEditor(['G0 X0', ';TOOL:C', 'G1 X1'], 1);
        press('ArrowDown');
        press('Enter');

        expect(replaced).toEqual([{range: [[1, 6], [1, 7]], text: 'A'}]);
    });
});

// The tool a line names, as the panel picks it up when the window opens.
describe('toolFromCursorLine', () => {
    const {toolFromCursorLine} = require('../lib/tools');
    const tools = [{name: 'TURN35'}, {name: 'Groove'}];

    test('the list\'s own spelling comes back, whatever the line used', () => {
        expect(toolFromCursorLine(';TOOL:groove', tools)).toBe('Groove');
        expect(toolFromCursorLine('; tool: TURN35', tools)).toBe('TURN35');
    });

    test('a tool this machine does not have is not selected', () => {
        expect(toolFromCursorLine(';TOOL:MILL8', tools)).toBeNull();
    });

    test('a line with no marker, and a marker that is not at the start of one', () => {
        expect(toolFromCursorLine('G1 X10', tools)).toBeNull();
        expect(toolFromCursorLine('G1 X10 ;TOOL:TURN35', tools)).toBeNull();
    });

    test('nothing to read is not an error', () => {
        expect(toolFromCursorLine(undefined, tools)).toBeNull();
        expect(toolFromCursorLine(';TOOL:TURN35', undefined)).toBeNull();
    });
});

describe('toolFromFile', () => {
    const { toolFromFile, fileNameOf } = require('../lib/tools');

    test('the name comes off the first row', () => {
        expect(toolFromFile(';NAME:ROMB_2_4_RIGHT', [])).toEqual({name: 'ROMB_2_4_RIGHT'});
    });

    // The file comes from disk, so on Windows the row ends with a CR.
    test('a CRLF line ending is not part of the name', () => {
        expect(toolFromFile(';NAME:ROMB\r', [])).toEqual({name: 'ROMB'});
    });

    test('a file that names nothing is refused', () => {
        expect(toolFromFile(';just a comment', []).error).toBe('no-name');
        expect(toolFromFile('', []).error).toBe('no-name');
        expect(toolFromFile(';NAME:', []).error).toBe('no-name');
    });

    // `;TOOL:NAME` resolves by name, so two tools sharing one would leave which
    // of them gets drawn to the order of a list the user cannot see.
    test('a name the machine already has is refused, and named', () => {
        const picked = toolFromFile(';NAME:ROMB', ['DRILL', 'ROMB']);

        expect(picked.error).toBe('duplicate');
        expect(picked.name).toBe('ROMB');
    });

    // Adding several at once: the caller passes the names as the list grows, so
    // two picked files naming one tool meet the same rule.
    test('two of the picked files naming one tool', () => {
        const taken = [];
        const first = toolFromFile(';NAME:ROMB', taken);
        expect(first.error).toBe(undefined);
        taken.push(first.name);

        expect(toolFromFile(';NAME:ROMB', taken).error).toBe('duplicate');
    });

    test('the file name is taken off either kind of path', () => {
        expect(fileNameOf('/storage/tools/ROMB.SPF')).toBe('ROMB.SPF');
        expect(fileNameOf('C:\\tools\\ROMB.SPF')).toBe('ROMB.SPF');
        expect(fileNameOf('ROMB.SPF')).toBe('ROMB.SPF');
    });
});

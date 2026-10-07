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

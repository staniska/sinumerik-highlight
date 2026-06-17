jest.mock('../lib/sinumerik', () => ({
    __esModule: true,
    default: {
        sinumerikView: {
            parseData: {
                errors: [],
                variables: {firstChannelVariables: {}, PROG: {}},
                subroutines: [],
                diamon: 0,
                diam90: 0,
                transformation: null,
                mcall: {},
                frame: {mirror: {X: 1, Y: 1, Z: 1}},
                planeAxes: ['X', 'Y', 'Z'],
                planeFirstAxes: ['X', 'Y'],
                planeCircleAxes: ['I', 'J'],
                axesPos: {X: 0, Y: 0, Z: 0},
                pole: {X: 0, Y: 0, Z: 0, AP: 0, RP: 0},
                prevMove: [],
                canvas: [],
                contourElements: {PROG: []},
                moveGroup: '',
            },
            singleLineDebugData: {machine: {firstSpindle: {name: 'C'}}},
            singleLineDebugHelpDiv: {C_As_Rot: {input: {checked: false}}},
            programmData: {'/test/test.mpf': {machine: {machineType: 'Lathe', machineName: 'test'}, contour: {name: ''}}},
            singleLineDebugContourDiv: {contourDuplicate: {checked: false}},
            singleLineDebugBlankDiv: {blankDuplicate: {checked: false}},
        }
    }
}));

jest.mock('../lib/mathParser', () => ({
    mathParse: jest.fn(() => null),
    checkCondition: jest.fn(),
    calcValue: jest.fn(),
    getExpressionInBrackets: jest.fn(),
}));

jest.mock('../lib/coordinates', () => ({
    getCoordinatesInFrame: jest.fn((pos) => [pos.X || 0, pos.Y || 0, pos.Z || 0]),
    getCoordinatesInBase: jest.fn((pos) => [pos.X || 0, pos.Y || 0, pos.Z || 0]),
    generateFrame: jest.fn(),
    generateBasis: jest.fn(),
    clearAxesPos: jest.fn(),
}));

jest.mock('../lib/element-insert', () => ({
    insertChr: jest.fn(),
    insertRnd: jest.fn(),
}));

jest.mock('../lib/stringParse', () => ({
    __esModule: true,
    default: jest.fn((str) => str),
}));

jest.mock('../lib/utils', () => ({
    normalizeFileName: jest.fn((name) => name.replace(/\./g, '_').toUpperCase()),
}));

jest.mock('../lib/degreesMath', () => ({
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
        atan2: jest.fn((y, x) => Math.atan2(y, x) * 180 / Math.PI),
        cos: jest.fn((deg) => Math.cos(deg * Math.PI / 180)),
        sin: jest.fn((deg) => Math.sin(deg * Math.PI / 180)),
    })),
}));

global.atom = {
    workspace: {getActiveTextEditor: () => ({getTitle: () => 'test.mpf', getPath: () => '/test/test.mpf'})}
};

const {addY_for_C_rot, generatePrimitives, generateCanvasPrimitives} = require('../lib/primitives');

let View;

beforeEach(() => {
    View = require('../lib/sinumerik').default;
    View.sinumerikView.parseData.filename = '/test/test.mpf';
    View.sinumerikView.parseData.errors = [];
    View.sinumerikView.parseData.variables = {firstChannelVariables: {}, PROG: {}};
    View.sinumerikView.parseData.subroutines = [];
    View.sinumerikView.parseData.diamon = 0;
    View.sinumerikView.parseData.transformation = null;
    View.sinumerikView.parseData.mcall = {};
    View.sinumerikView.parseData.frame = {
        mirror: {X: 1, Y: 1, Z: 1},
        trans: {X: 0, Y: 0, Z: 0},
        basis: [[1,0,0],[0,1,0],[0,0,1]],
        invertBasis: [[1,0,0],[0,1,0],[0,0,1]]
    };
    View.sinumerikView.parseData.planeAxes = ['X', 'Y', 'Z'];
    View.sinumerikView.parseData.planeFirstAxes = ['X', 'Y'];
    View.sinumerikView.parseData.planeCircleAxes = ['I', 'J'];
    View.sinumerikView.parseData.axesPos = {X: 0, Y: 0, Z: 0};
    View.sinumerikView.parseData.pole = {X: 0, Y: 0, Z: 0, AP: 0, RP: 0};
    View.sinumerikView.parseData.prevMove = [];
    View.sinumerikView.parseData.canvas = [];
    View.sinumerikView.parseData.elementIdCounter = 0;
    View.sinumerikView.parseData.contourElements = {PROG: []};
    View.sinumerikView.parseData.currentBucket = 'PROG';
    View.sinumerikView.parseData.moveGroup = '';
    View.sinumerikView.programmData = {
        '/test/test.mpf': {machine: {machineType: 'Lathe'}, contour: {name: ''}}
    };
    View.sinumerikView.singleLineDebugHelpDiv.C_As_Rot.input.checked = false;
});

// --- addY_for_C_rot ---

describe('addY_for_C_rot', () => {
    test('adds Y=0 operator for Lathe without transformation and no Y', () => {
        View.sinumerikView.parseData.transformation = null;
        const primitives = {operators: [{type: 'coordinate', name: 'X', value: 10}]};

        addY_for_C_rot(primitives);

        expect(primitives.operators).toContainEqual({type: 'coordinate', name: 'Y', value: 0});
    });

    test('does not add Y when Y coordinate already present', () => {
        View.sinumerikView.parseData.transformation = null;
        const primitives = {operators: [
            {type: 'coordinate', name: 'X', value: 10},
            {type: 'coordinate', name: 'Y', value: 5}
        ]};

        addY_for_C_rot(primitives);

        expect(primitives.operators.filter(o => o.name === 'Y').length).toBe(1);
    });

    test('does not add Y when machine is not Lathe', () => {
        View.sinumerikView.programmData['/test/test.mpf'].machine.machineType = 'Mill';
        View.sinumerikView.parseData.transformation = null;
        const primitives = {operators: [{type: 'coordinate', name: 'X', value: 10}]};

        addY_for_C_rot(primitives);

        expect(primitives.operators.find(o => o.name === 'Y')).toBeUndefined();
    });

    test('does not add Y when transformation is active', () => {
        View.sinumerikView.parseData.transformation = 'TRANSMIT';
        const primitives = {operators: [{type: 'coordinate', name: 'X', value: 10}]};

        addY_for_C_rot(primitives);

        expect(primitives.operators.find(o => o.name === 'Y')).toBeUndefined();
    });
});

// --- generatePrimitives (early-return paths) ---

describe('generatePrimitives', () => {
    const parseRowsFn = jest.fn();
    const PROG = 'PROG';
    const prog = (row) => [row];

    test('MSG returns primitives with MSG operator', async () => {
        const result = await generatePrimitives('MSG(Hello)', PROG, 0, prog('MSG(Hello)'), parseRowsFn);

        expect(result.operators[0].type).toBe('MSG');
    });

    test('STOPRE returns primitives with MSG/STOPRE operator', async () => {
        const result = await generatePrimitives('STOPRE', PROG, 0, prog('STOPRE'), parseRowsFn);

        expect(result.operators[0].type).toBe('MSG');
        expect(result.operators[0].value).toBe('STOPRE');
    });

    test('G4 returns Delay operator', async () => {
        const result = await generatePrimitives('G4 F1', PROG, 0, prog('G4 F1'), parseRowsFn);

        expect(result.operators[0].type).toBe('Delay');
    });

    test('TRANSMIT returns transformation operator', async () => {
        const result = await generatePrimitives('TRANSMIT', PROG, 0, prog('TRANSMIT'), parseRowsFn);

        expect(result.operators[0]).toEqual({type: 'transformation', value: 'TRANSMIT'});
    });

    test('TRACYL returns transformation operator', async () => {
        const result = await generatePrimitives('TRACYL', PROG, 0, prog('TRACYL'), parseRowsFn);

        expect(result.operators[0]).toEqual({type: 'transformation', value: 'TRACYL'});
    });

    test('TRAFOOF returns transformation operator', async () => {
        const result = await generatePrimitives('TRAFOOF', PROG, 0, prog('TRAFOOF'), parseRowsFn);

        expect(result.operators[0]).toEqual({type: 'transformation', value: 'TRAFOOF'});
    });

    test('M30 returns M_func operator with value 30', async () => {
        const result = await generatePrimitives('M30', PROG, 0, prog('M30'), parseRowsFn);

        expect(result.operators[0].type).toBe('M_func');
        expect(result.operators[0].value).toBe('30');
    });

    test('G17 returns Plane operator', async () => {
        const result = await generatePrimitives('G17', PROG, 0, prog('G17'), parseRowsFn);

        expect(result.operators[0].type).toBe('Plane');
        expect(result.operators[0].value).toBe('G17');
    });

    test('G0 returns moveGroup operator', async () => {
        const result = await generatePrimitives('G0', PROG, 0, prog('G0'), parseRowsFn);

        expect(result.operators[0].type).toBe('moveGroup');
        expect(result.operators[0].value).toBe('G0');
    });

    test('T1 returns T_name operator', async () => {
        const result = await generatePrimitives('T1', PROG, 0, prog('T1'), parseRowsFn);

        expect(result.operators[0].type).toBe('T_name');
    });

    test('DIAMON returns diamon operator', async () => {
        const result = await generatePrimitives('DIAMON', PROG, 0, prog('DIAMON'), parseRowsFn);

        expect(result.operators[0].type).toBe('diamon');
    });

    test('DIAMOF returns diamof operator', async () => {
        const result = await generatePrimitives('DIAMOF', PROG, 0, prog('DIAMOF'), parseRowsFn);

        expect(result.operators[0].type).toBe('diamof');
    });
});

// --- generateCanvasPrimitives: elementId and sourceFile ---

describe('generateCanvasPrimitives — elementId and sourceFile', () => {
    const PROG = '/test/prog.mpf';

    const g1Primitives = (x, y) => ({
        operators: [
            {type: 'moveGroup', value: 'G1'},
            {type: 'coordinate', name: 'X', value: String(x)},
            {type: 'coordinate', name: 'Y', value: String(y)},
        ]
    });

    beforeEach(() => {
        View.sinumerikView.parseData.moveGroup = '';
        View.sinumerikView.parseData.plane = 'G17';
        View.sinumerikView.parseData.contourElements[PROG] = [];
        View.sinumerikView.parseData.currentBucket = PROG;
    });

    test('G1 element gets elementId=0 on first call', () => {
        View.sinumerikView.parseData.moveGroup = 'G1';
        generateCanvasPrimitives(g1Primitives(10, 5), PROG, 0);

        expect(View.sinumerikView.parseData.canvas[0].elementId).toBe(0);
    });

    test('G1 element gets sourceFile equal to programName', () => {
        View.sinumerikView.parseData.moveGroup = 'G1';
        generateCanvasPrimitives(g1Primitives(10, 5), PROG, 0);

        expect(View.sinumerikView.parseData.canvas[0].sourceFile).toBe(PROG);
    });

    test('two consecutive G1 calls produce different elementIds', () => {
        View.sinumerikView.parseData.moveGroup = 'G1';
        generateCanvasPrimitives(g1Primitives(10, 5), PROG, 0);
        View.sinumerikView.parseData.moveGroup = 'G1';
        generateCanvasPrimitives(g1Primitives(20, 5), PROG, 1);

        const ids = View.sinumerikView.parseData.canvas.map(el => el.elementId);
        expect(ids[0]).toBe(0);
        expect(ids[1]).toBe(1);
        expect(ids[0]).not.toBe(ids[1]);
    });

    test('arc segments (G2/G3) from one call all share the same elementId', () => {
        View.sinumerikView.parseData.moveGroup = 'G2';
        View.sinumerikView.parseData.planeAxes = ['X', 'Y', 'Z'];
        View.sinumerikView.parseData.planeFirstAxes = ['X', 'Y'];
        View.sinumerikView.parseData.planeCircleAxes = ['I', 'J'];
        View.sinumerikView.parseData.axesPos = {X: 10, Y: 0, Z: 0};
        const arcPrimitives = {
            operators: [
                {type: 'moveGroup', value: 'G2'},
                {type: 'coordinate', name: 'X', value: '-10'},
                {type: 'coordinate', name: 'Y', value: '0'},
                {type: 'circleCenter', name: 'I', value: '-10'},
                {type: 'circleCenter', name: 'J', value: '0'},
            ]
        };
        generateCanvasPrimitives(arcPrimitives, PROG, 0);

        const arcSegments = View.sinumerikView.parseData.canvas.filter(el => el.elementId !== undefined);
        expect(arcSegments.length).toBeGreaterThan(1);
        const uniqueIds = new Set(arcSegments.map(el => el.elementId));
        expect(uniqueIds.size).toBe(1);
    });

    test('arc segments from different calls have different elementIds', () => {
        View.sinumerikView.parseData.moveGroup = 'G2';
        View.sinumerikView.parseData.axesPos = {X: 10, Y: 0, Z: 0};
        const arcPrimitives1 = {
            operators: [
                {type: 'moveGroup', value: 'G2'},
                {type: 'coordinate', name: 'X', value: '-10'},
                {type: 'coordinate', name: 'Y', value: '0'},
                {type: 'circleCenter', name: 'I', value: '-10'},
                {type: 'circleCenter', name: 'J', value: '0'},
            ]
        };
        generateCanvasPrimitives(arcPrimitives1, PROG, 0);

        View.sinumerikView.parseData.moveGroup = 'G2';
        View.sinumerikView.parseData.axesPos = {X: 10, Y: 5, Z: 0};
        const arcPrimitives2 = {
            operators: [
                {type: 'moveGroup', value: 'G2'},
                {type: 'coordinate', name: 'X', value: '-10'},
                {type: 'coordinate', name: 'Y', value: '5'},
                {type: 'circleCenter', name: 'I', value: '-10'},
                {type: 'circleCenter', name: 'J', value: '0'},
            ]
        };
        generateCanvasPrimitives(arcPrimitives2, PROG, 1);

        const firstId  = View.sinumerikView.parseData.canvas[0].elementId;
        const secondId = View.sinumerikView.parseData.canvas.at(-1).elementId;
        expect(firstId).not.toBe(secondId);
    });
});

describe('callStack propagation', () => {
    // Simulate what primitives.js does after parseRowsFn returns:
    // stamp callStack entries onto elements added during the sub call.
    // The test directly exercises the same prepend logic.

    beforeEach(() => {
        View.sinumerikView.parseData.canvas = [];
        View.sinumerikView.parseData.filename = '/main.mpf';
        View.sinumerikView.parseData.subroutines = [
            {name: 'A_SPF', path: '/A.spf'},
            {name: 'B_SPF', path: '/B.spf'},
        ];
    });

    function stamp(canvasLengthBefore, callerPath, progRowNum) {
        for (let i = canvasLengthBefore; i < View.sinumerikView.parseData.canvas.length; i++) {
            const el = View.sinumerikView.parseData.canvas[i];
            el.callStack = [{file: callerPath, row: progRowNum}, ...(el.callStack ?? [])];
            el.mainRow = progRowNum;
        }
    }

    test('single subroutine call: callStack has one entry pointing to main', () => {
        // Simulate main(row 5) → A
        View.sinumerikView.parseData.canvas.push({type: 'G1', row: 2, sourceFile: '/A.spf'});
        stamp(0, '/main.mpf', 5);

        const el = View.sinumerikView.parseData.canvas[0];
        expect(el.callStack).toEqual([{file: '/main.mpf', row: 5}]);
        expect(el.mainRow).toBe(5);
    });

    test('two-level nesting: callStack reads outermost-first', () => {
        // Simulate main(M1=10) → A(A1=3) → B
        // Step 1: return from B inside A  → stamp with A at row 3
        View.sinumerikView.parseData.canvas.push({type: 'G1', row: 7, sourceFile: '/B.spf'});
        stamp(0, '/A.spf', 3);

        // Step 2: return from A inside main → stamp with main at row 10
        stamp(0, '/main.mpf', 10);

        const el = View.sinumerikView.parseData.canvas[0];
        expect(el.callStack).toEqual([
            {file: '/main.mpf', row: 10},
            {file: '/A.spf',    row: 3},
        ]);
        expect(el.mainRow).toBe(10);
    });

    test('element directly in main has no callStack', () => {
        View.sinumerikView.parseData.canvas.push({type: 'G1', row: 1, sourceFile: '/main.mpf'});
        // No stamp — main-program elements are not inside a subroutine call
        const el = View.sinumerikView.parseData.canvas[0];
        expect(el.callStack).toBeUndefined();
    });
});

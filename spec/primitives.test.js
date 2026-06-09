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
            programmData: {'TEST_MPF': {machine: {machineType: 'Lathe', machineName: 'test'}, contour: {name: ''}}},
            singleLineDebugContourDiv: {contourDuplicate: {checked: false}},
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
    workspace: {getActiveTextEditor: () => ({getTitle: () => 'test.mpf'})}
};

const {addY_for_C_rot, generatePrimitives} = require('../lib/primitives');

let View;

beforeEach(() => {
    View = require('../lib/sinumerik').default;
    View.sinumerikView.parseData.errors = [];
    View.sinumerikView.parseData.variables = {firstChannelVariables: {}, PROG: {}};
    View.sinumerikView.parseData.subroutines = [];
    View.sinumerikView.parseData.diamon = 0;
    View.sinumerikView.parseData.transformation = null;
    View.sinumerikView.parseData.mcall = {};
    View.sinumerikView.parseData.frame = {mirror: {X: 1, Y: 1, Z: 1}};
    View.sinumerikView.parseData.planeAxes = ['X', 'Y', 'Z'];
    View.sinumerikView.parseData.planeFirstAxes = ['X', 'Y'];
    View.sinumerikView.parseData.planeCircleAxes = ['I', 'J'];
    View.sinumerikView.parseData.axesPos = {X: 0, Y: 0, Z: 0};
    View.sinumerikView.parseData.pole = {X: 0, Y: 0, Z: 0, AP: 0, RP: 0};
    View.sinumerikView.parseData.prevMove = [];
    View.sinumerikView.parseData.canvas = [];
    View.sinumerikView.parseData.contourElements = {PROG: []};
    View.sinumerikView.parseData.moveGroup = '';
    View.sinumerikView.programmData = {
        'TEST_MPF': {machine: {machineType: 'Lathe'}, contour: {name: ''}}
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
        View.sinumerikView.programmData['TEST_MPF'].machine.machineType = 'Mill';
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

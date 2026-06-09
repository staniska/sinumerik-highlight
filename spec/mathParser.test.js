// Моки для зависимостей, которые тянут Pulsar/Electron
jest.mock('../lib/sinumerik', () => ({
    __esModule: true,
    default: {
        sinumerikView: {
            parseData: {
                variables: {firstChannelVariables: {}},
                axesPos: {X: 0, Y: 0, Z: 0},
                frame: {
                    basis: [[1,0,0],[0,1,0],[0,0,1]],
                    trans: {X: 0, Y: 0, Z: 0},
                },
                diamon: 0,
                diam90: 0,
                activeToolR: 0,
                activeTool: 0,
                errors: [],
            }
        }
    }
}));

jest.mock('../lib/coordinates', () => ({
    __esModule: true,
    getCoordinatesInFrame: jest.fn(() => [0, 0, 0])
}));

const {getExpressionInBrackets, mathParse} = require('../lib/mathParser');

// --- getExpressionInBrackets ---
//
// Функция извлекает содержимое скобок после matcher и оценивает его.
// Возвращает {string, value, error?}.
// value — это eval содержимого (не sqrt!). Caller делает replace(string, value),
// чтобы в eval-выражении не было отрицательного аргумента.

describe('getExpressionInBrackets', () => {
    test('простое число: string = "25", value = 25', () => {
        const r = getExpressionInBrackets('Math.sqrt(25)', 'Math.sqrt');
        expect(r.string).toBe('25');
        expect(r.value).toBe(25);
        expect(r.error).toBeUndefined();
    });

    test('выражение: string = "3*3", value = 9', () => {
        const r = getExpressionInBrackets('Math.sqrt(3*3)', 'Math.sqrt');
        expect(r.string).toBe('3*3');
        expect(r.value).toBe(9);
    });

    test('отрицательный аргумент — error и value=0', () => {
        const r = getExpressionInBrackets('Math.sqrt(-4)', 'Math.sqrt');
        expect(r.value).toBe(0);
        expect(r.error).toMatch(/SQRT arg < 0/);
    });

    test('очень маленькое значение приводится к нулю', () => {
        const r = getExpressionInBrackets('Math.sqrt(1e-15)', 'Math.sqrt');
        expect(r.value).toBe(0);
        expect(r.error).toBeUndefined();
    });

    test('невалидное выражение — error и string возвращается как value', () => {
        const r = getExpressionInBrackets('Math.sqrt(abc)', 'Math.sqrt');
        expect(r.error).toBeDefined();
    });
});

// --- mathParse (без именованных переменных) ---

describe('mathParse', () => {
    let View;

    beforeEach(() => {
        View = require('../lib/sinumerik').default;
        View.sinumerikView.parseData.variables = {firstChannelVariables: {}};
        View.sinumerikView.parseData.errors = [];
    });

    test('простое сложение', () => {
        expect(mathParse('1+2', 'prog', 0)).toBe(3);
    });

    test('умножение', () => {
        expect(mathParse('2*3', 'prog', 0)).toBe(6);
    });

    test('деление', () => {
        expect(mathParse('10/4', 'prog', 0)).toBe(2.5);
    });

    test('константа PI', () => {
        const result = mathParse('$PI', 'prog', 0);
        expect(result).toBeCloseTo(Math.PI, 5);
    });

    test('тригонометрия SIN(90) = 1', () => {
        // SIN заменяется на myMath.sin, который работает в градусах
        expect(mathParse('SIN(90)', 'prog', 0)).toBeCloseTo(1, 5);
    });

    test('тригонометрия COS(0) = 1', () => {
        expect(mathParse('COS(0)', 'prog', 0)).toBeCloseTo(1, 5);
    });

    test('SQRT через замену', () => {
        expect(mathParse('SQRT(25)', 'prog', 0)).toBeCloseTo(5, 5);
    });

    test('ABS отрицательного', () => {
        expect(mathParse('ABS(-7)', 'prog', 0)).toBe(7);
    });

    test('ошибочное выражение возвращает null', () => {
        expect(mathParse('abc_not_a_number', 'prog', 0)).toBeNull();
    });

    test('именованная переменная подставляется', () => {
        View.sinumerikView.parseData.variables['prog'] = {
            myVar: {name: 'myVar', value: 42}
        };
        expect(mathParse('myVar+1', 'prog', 0)).toBe(43);
    });
});

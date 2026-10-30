const {
    noteVariableChanges, variablesAt, sortVariableNames, GLOBAL_SCOPE,
} = require('../lib/variableLog');

// A store as the parser keeps it: {name: {name, type, value}}.
const store = (values) => Object.fromEntries(
    Object.entries(values).map(([name, value]) => [name, {name, type: 'real', value}]));

const scopes = (global, local, scope = 'MAIN_MPF') => [
    {scope: GLOBAL_SCOPE, variables: global && store(global)},
    {scope, variables: local && store(local)},
];

describe('noteVariableChanges', () => {
    test('the first look records everything there is', () => {
        const log = {}, seen = {};
        noteVariableChanges(log, seen, scopes({R1: 5}, {_ANG: 30}), 0);

        expect(log[GLOBAL_SCOPE].R1).toEqual([{at: 0, value: 5}]);
        expect(log.MAIN_MPF._ANG).toEqual([{at: 0, value: 30}]);
    });

    test('a value that did not move records nothing further', () => {
        const log = {}, seen = {};
        noteVariableChanges(log, seen, scopes({R1: 5}), 0);
        noteVariableChanges(log, seen, scopes({R1: 5}), 7);
        noteVariableChanges(log, seen, scopes({R1: 5}), 9);

        expect(log[GLOBAL_SCOPE].R1).toEqual([{at: 0, value: 5}]);
    });

    test('each change is an entry at the element that first sees it', () => {
        const log = {}, seen = {};
        noteVariableChanges(log, seen, scopes({R1: 5}), 0);
        noteVariableChanges(log, seen, scopes({R1: 7}), 12);
        noteVariableChanges(log, seen, scopes({R1: 9}), 40);

        expect(log[GLOBAL_SCOPE].R1).toEqual([
            {at: 0, value: 5}, {at: 12, value: 7}, {at: 40, value: 9},
        ]);
    });

    // Several assignments between two elements are one change as far as the
    // position goes, and the last of them is what the element sees.
    test('two changes before the same element collapse into the last', () => {
        const log = {}, seen = {};
        noteVariableChanges(log, seen, scopes({R1: 5}), 3);
        noteVariableChanges(log, seen, scopes({R1: 7}), 3);

        expect(log[GLOBAL_SCOPE].R1).toEqual([{at: 3, value: 7}]);
    });

    // `===` would make a variable that once held NaN look changed on every
    // element for ever, filling the history with nothing.
    test('a NaN stays equal to itself', () => {
        const log = {}, seen = {};
        noteVariableChanges(log, seen, scopes({R1: NaN}), 0);
        noteVariableChanges(log, seen, scopes({R1: NaN}), 5);

        expect(log[GLOBAL_SCOPE].R1.length).toBe(1);
    });

    test('a variable declared without a value is recorded as having none', () => {
        const log = {}, seen = {};
        noteVariableChanges(log, seen, [
            {scope: GLOBAL_SCOPE, variables: {_X: {name: '_X', type: 'real'}}},
        ], 0);

        expect(log[GLOBAL_SCOPE]._X).toEqual([{at: 0, value: undefined}]);
    });

    test('a store that is not there is not an error', () => {
        const log = {}, seen = {};
        expect(() => noteVariableChanges(log, seen, scopes(null, null), 0)).not.toThrow();
        expect(() => noteVariableChanges(log, seen, [{scope: undefined, variables: store({R1: 1})}], 0))
            .not.toThrow();
        expect(log).toEqual({});
    });

    // What makes the whole thing affordable: scanning every variable on every
    // element cost 1312 ms over 50 000 elements with fifty variables, against
    // 28 ms when the writers say what they touched. A program whose blocks
    // assign inside a loop pays that on every element.
    describe('only the names the writers announced', () => {
        test('a change nobody announced is not recorded', () => {
            const log = {}, seen = {};
            noteVariableChanges(log, seen, scopes({R1: 5, R2: 1}), 0, new Set(['R1']));

            expect(log[GLOBAL_SCOPE].R1).toEqual([{at: 0, value: 5}]);
            expect(log[GLOBAL_SCOPE].R2).toBe(undefined);
        });

        // A name reaches both stores and each skips what it does not hold: the
        // body assignment picks a store by where the name already exists, so
        // the announcement cannot say which one.
        test('a name is offered to both stores', () => {
            const log = {}, seen = {};
            noteVariableChanges(log, seen, scopes({R1: 5}, {_ANG: 30}), 0,
                                new Set(['R1', '_ANG']));

            expect(log[GLOBAL_SCOPE].R1).toEqual([{at: 0, value: 5}]);
            expect(log.MAIN_MPF._ANG).toEqual([{at: 0, value: 30}]);
            expect(log[GLOBAL_SCOPE]._ANG).toBe(undefined);
            expect(log.MAIN_MPF.R1).toBe(undefined);
        });

        test('a name that exists nowhere is quietly skipped', () => {
            const log = {}, seen = {};
            noteVariableChanges(log, seen, scopes({R1: 5}), 0, new Set(['NOPE']));

            expect(log[GLOBAL_SCOPE]).toEqual({});
        });

        // The one full sweep, which the first element of a parse asks for, so
        // the state the DEF defaults left behind is recorded whole whatever the
        // writers did or did not announce.
        test('null records everything there is', () => {
            const log = {}, seen = {};
            noteVariableChanges(log, seen, scopes({R1: 5, R2: 1}), 0, null);

            expect(Object.keys(log[GLOBAL_SCOPE]).sort()).toEqual(['R1', 'R2']);
        });
    });

    test('two subroutines of the same name keep their locals apart', () => {
        const log = {}, seen = {};
        noteVariableChanges(log, seen, scopes(null, {_D: 5}, 'POCKET'), 0);
        noteVariableChanges(log, seen, scopes(null, {_D: 9}, 'POCKET_r'), 4);

        expect(log.POCKET._D).toEqual([{at: 0, value: 5}]);
        expect(log.POCKET_r._D).toEqual([{at: 4, value: 9}]);
    });
});

describe('variablesAt', () => {
    const log = {};
    const seen = {};
    beforeAll(() => {
        noteVariableChanges(log, seen, scopes({R1: 5}, {_ANG: 30}), 0);
        noteVariableChanges(log, seen, scopes({R1: 7, R2: 1}, {_ANG: 45}), 10);
        noteVariableChanges(log, seen, scopes({R1: 9, R2: 1}, {_ANG: 45}), 20);
    });

    test('the value in force at the position, not the final one', () => {
        expect(variablesAt(log, 'MAIN_MPF', 0)).toEqual({R1: 5, _ANG: 30});
        expect(variablesAt(log, 'MAIN_MPF', 9)).toEqual({R1: 5, _ANG: 30});
        expect(variablesAt(log, 'MAIN_MPF', 10)).toEqual({R1: 7, R2: 1, _ANG: 45});
        expect(variablesAt(log, 'MAIN_MPF', 19)).toEqual({R1: 7, R2: 1, _ANG: 45});
        expect(variablesAt(log, 'MAIN_MPF', 25)).toEqual({R1: 9, R2: 1, _ANG: 45});
    });

    // A variable that did not exist yet is absent, which is not the same as one
    // declared without a value — the panel says different things about them.
    test('a variable the position has not reached is absent', () => {
        expect('R2' in variablesAt(log, 'MAIN_MPF', 0)).toBe(false);
        expect('R2' in variablesAt(log, 'MAIN_MPF', 10)).toBe(true);
    });

    test('the locals of another program are not shown', () => {
        expect(variablesAt(log, 'OTHER_MPF', 25)).toEqual({R1: 9, R2: 1});
    });

    test('the shared store alone, with no scope at all', () => {
        expect(variablesAt(log, undefined, 25)).toEqual({R1: 9, R2: 1});
    });

    // The end of a run: an assignment after the last move has no element behind
    // which to be seen, so the panel asks for the final state.
    test('Infinity is the final state', () => {
        expect(variablesAt(log, 'MAIN_MPF', Infinity)).toEqual({R1: 9, R2: 1, _ANG: 45});
    });

    test('nothing logged, nothing shown', () => {
        expect(variablesAt({}, 'MAIN_MPF', 5)).toEqual({});
        expect(variablesAt(undefined, 'MAIN_MPF', 5)).toEqual({});
    });

    test('the search finds the right entry in a long history', () => {
        const loopLog = {};
        const loopSeen = {};
        for (let i = 0; i < 2000; i++) {
            noteVariableChanges(loopLog, loopSeen, scopes({R1: i}), i * 3);
        }

        expect(variablesAt(loopLog, null, 0).R1).toBe(0);
        expect(variablesAt(loopLog, null, 1).R1).toBe(0);
        expect(variablesAt(loopLog, null, 3).R1).toBe(1);
        expect(variablesAt(loopLog, null, 2998).R1).toBe(999);
        expect(variablesAt(loopLog, null, 1e9).R1).toBe(1999);
    });
});

describe('sortVariableNames', () => {
    // Underscore first, which is where a Sinumerik named variable lives; R2
    // before R10, because a number inside a name is read as a number; and the
    // two spellings of one name side by side.
    test('alphabetical, numeric inside a name, case-insensitive', () => {
        expect(sortVariableNames(['R10', '_ANG', 'R2', 'r1', '_depth', 'R1', 'ZZ', 'AAA']))
            .toEqual(['_ANG', '_depth', 'AAA', 'R1', 'r1', 'R2', 'R10', 'ZZ']);
    });

    test('the input is left alone', () => {
        const names = ['B', 'A'];
        sortVariableNames(names);
        expect(names).toEqual(['B', 'A']);
    });

    test('nothing to sort', () => {
        expect(sortVariableNames([])).toEqual([]);
    });
});

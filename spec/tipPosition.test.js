// Cutting-edge position ($TC_DP2) — the table, and its agreement with the
// pictures the machine manager shows (lib/tipPosition.js).

const {TIP_POSITIONS, tipPositionOffset, toolPositionGrid} = require('../lib/tipPosition');

describe('the cutting-edge position table', () => {
    test('position 3 is the right-hand external tool the fixtures are drawn as', () => {
        // The anchor, verified against a real tool file: ROMB_2_4_RIGHT declares
        // T103 R2.4 and draws its nose centre at Z +2.4, X +2.4 from the file
        // zero. Everything else in the table hangs off this one being right.
        expect(tipPositionOffset(3, 2.4)).toEqual({Z: 2.4, X: 2.4});
    });

    test('9 is the tool dimensioned about the nose centre itself', () => {
        expect(tipPositionOffset(9, 2.4)).toEqual({Z: 0, X: 0});
    });

    test('the eight offsets are the eight directions, each once', () => {
        const seen = new Set();
        for (let n = 1; n <= 8; n++) {
            const at = TIP_POSITIONS[n];
            expect(Math.abs(at.Z) + Math.abs(at.X)).toBeGreaterThan(0);
            seen.add(`${at.Z},${at.X}`);
        }
        expect(seen.size).toBe(8);
    });

    test('opposite numbers point opposite ways', () => {
        // 1 and 3, 2 and 4, 5 and 7, 6 and 8 are the diagonals and the axes of
        // the same square, so each pair must cancel.
        [[1, 3], [2, 4], [5, 7], [6, 8]].forEach(([a, b]) => {
            expect(TIP_POSITIONS[a].Z + TIP_POSITIONS[b].Z).toBe(0);
            expect(TIP_POSITIONS[a].X + TIP_POSITIONS[b].X).toBe(0);
        });
    });

    test('a number outside the nine, or no radius, has no offset', () => {
        expect(tipPositionOffset(0, 2.4)).toBeNull();
        expect(tipPositionOffset(10, 2.4)).toBeNull();
        expect(tipPositionOffset(undefined, 2.4)).toBeNull();
        expect(tipPositionOffset(3, 0)).toBeNull();
        expect(tipPositionOffset(3, undefined)).toBeNull();
    });
});

describe('the pictures the machine manager shows', () => {
    // These four layouts are what machine-manager.js drew by hand before this
    // table existed, copied here digit for digit. They are the evidence that the
    // table is right: the same nine offsets, seen from four machines.
    const drawnByHand = {
        'Horizontal/Rear': ['104', '108', '103', '105', '109', '107', '101', '106', '102'],
        'Horizontal/Front': ['101', '106', '102', '105', '109', '107', '104', '108', '103'],
        'Vertical/Front': ['102', '107', '103', '106', '109', '108', '101', '105', '104'],
        'Vertical/Rear': ['103', '107', '102', '108', '109', '106', '104', '105', '101'],
    };

    Object.keys(drawnByHand).forEach(key => {
        const [subType, carriage] = key.split('/');
        test(`${key} comes out of the table unchanged`, () => {
            expect(toolPositionGrid(subType, carriage)).toEqual(drawnByHand[key]);
        });
    });

    test('an unknown machine has no layout rather than a wrong one', () => {
        expect(toolPositionGrid('Mill', 'Front')).toBeNull();
        expect(toolPositionGrid('Horizontal', undefined)).toBeNull();
    });

    test('every layout holds all nine numbers, 109 in the middle', () => {
        Object.keys(drawnByHand).forEach(key => {
            const [subType, carriage] = key.split('/');
            const grid = toolPositionGrid(subType, carriage);
            expect(new Set(grid).size).toBe(9);
            expect(grid[4]).toBe('109');
        });
    });
});

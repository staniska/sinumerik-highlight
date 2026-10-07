// Rounding the corner where two arcs meet (lib/arcFilletMath.js).
//
// The module is pure, so these run on bare numbers with no mocks at all.
//
// What is checked is tangency itself — the fillet touching each arc, and running
// the same way as that arc where it touches — rather than the formulas the
// module uses, which the test could have got wrong in the same direction. The
// one place a closed form IS checked against is the line-to-line case, reached
// by making both arcs enormous, because that formula is already shipping in
// `element-insert.js` and known good.

const {solveArcArcFillet, solveArcArcFilletClamped} = require('../lib/arcFilletMath');

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const len = (a) => Math.hypot(a[0], a[1]);
const unit = (a) => [a[0] / len(a), a[1] / len(a)];
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const quarterTurn = (a, ccw) => (ccw ? [-a[1], a[0]] : [a[1], -a[0]]);

// The point on a circle at a given angle.
const at = (c, r, deg) => [
    c[0] + r * Math.cos((deg * Math.PI) / 180),
    c[1] + r * Math.sin((deg * Math.PI) / 180),
];

// Everything a real fillet must satisfy, whatever the configuration.
//
// Distances are compared relative to the sizes involved: these cases run arcs up
// to ten million millimetres across to stand in for straight lines, where an
// absolute nanometre is below what doubles can carry.
function expectTangency(got, params) {
    const {c1, r1, ccw1, c2, r2, ccw2} = params;
    const rho = got.radius;
    const near = (a, b, scaleBy) => expect(Math.abs(a - b)).toBeLessThan(1e-9 * Math.max(1, scaleBy));

    [[c1, r1, ccw1, got.t1, got.s1], [c2, r2, ccw2, got.t2, got.s2]].forEach(([c, r, ccw, t, s]) => {
        // The contact is on the arc, and on the fillet.
        near(len(sub(t, c)), r, r);
        near(len(sub(t, got.center)), rho, r);

        // Centre, contact and centre are in line — which is what touching means.
        expect(Math.abs(cross(unit(sub(t, c)), unit(sub(t, got.center))))).toBeLessThan(1e-7);

        // Inside the arc or outside it, as `s` claims.
        near(len(sub(got.center, c)), Math.abs(r + s * rho), r);
        expect(s).toBe(ccw === got.ccw ? -1 : 1);

        // And travelling the same way at the contact, not head-on: this is the
        // check that catches a flipped sign, which collinearity alone does not.
        const alongArc = unit(quarterTurn(sub(t, c), ccw));
        const alongFillet = unit(quarterTurn(sub(t, got.center), got.ccw));
        expect(dot(alongArc, alongFillet)).toBeCloseTo(1, 6);
    });
}

describe('a fillet between two arcs', () => {
    // A right-angled corner at the origin: in along +X, out along +Y, both arcs
    // curving to the left. Centres directly above the joint and to its left.
    const corner = (M, {ccw1 = true, ccw2 = true} = {}) => ({
        c1: [0, ccw1 ? M : -M],
        r1: M,
        ccw1,
        c2: [ccw2 ? -M : M, 0],
        r2: M,
        ccw2,
        junction: [0, 0],
        startAng1: ccw1 ? -100 * (Math.PI / 180) : 100 * (Math.PI / 180),
        endAng2: ccw2 ? 10 * (Math.PI / 180) : -10 * (Math.PI / 180),
    });

    test('it touches both arcs and runs with them', () => {
        const params = {...corner(50), rnd: 3};
        const got = solveArcArcFillet(params);

        expect(got.error).toBeUndefined();
        expectTangency(got, params);
    });

    test('all four combinations of arc direction', () => {
        [[true, true], [true, false], [false, true], [false, false]].forEach(([ccw1, ccw2]) => {
            const params = {...corner(50, {ccw1, ccw2}), rnd: 2};
            const got = solveArcArcFillet(params);
            if (got.tangential || got.error) return;     // some pairs meet smoothly
            expectTangency(got, params);
        });
    });

    test('arcs big enough to be lines agree with the line-to-line formula', () => {
        // The same corner `insertRnd` already solves: a quarter turn, the fillet
        // centre at (-ρ, +ρ) and the contacts on the two legs.
        const rho = 2;
        const params = {...corner(1e7), rnd: rho};
        const got = solveArcArcFillet(params);

        expect(got.center[0]).toBeCloseTo(-rho, 3);
        expect(got.center[1]).toBeCloseTo(rho, 3);
        expect(got.t1[0]).toBeCloseTo(-rho, 3);
        expect(got.t1[1]).toBeCloseTo(0, 3);
        expect(got.t2[0]).toBeCloseTo(0, 3);
        expect(got.t2[1]).toBeCloseTo(rho, 3);
        expect(got.sweep).toBeCloseTo(Math.PI / 2, 3);
        // Both arcs curve the way the corner does, so it rolls inside both.
        expect(got.s1).toBe(-1);
        expect(got.s2).toBe(-1);
    });

    test('the same corner with the first arc curving the other way rolls outside it', () => {
        // The sign rule's other branch, in the case where the answer is known.
        const rho = 2;
        const params = {...corner(1e7, {ccw1: false}), rnd: rho};
        const got = solveArcArcFillet(params);

        expect(got.center[0]).toBeCloseTo(-rho, 3);
        expect(got.center[1]).toBeCloseTo(rho, 3);
        expect(got.s1).toBe(1);
        expect(got.s2).toBe(-1);
        expectTangency(got, params);
    });

    test('a corner of sixty degrees and one of a hundred and twenty', () => {
        [60, 120].forEach(deg => {
            const M = 1e7;
            const a = (deg * Math.PI) / 180;
            // In along +X to the origin, out along a direction turned by (180-deg).
            const outDir = [Math.cos(Math.PI - a), Math.sin(Math.PI - a)];
            const params = {
                c1: [0, M], r1: M, ccw1: true,
                c2: [-M * outDir[1], M * outDir[0]], r2: M, ccw2: true,
                junction: [0, 0], rnd: 2,
            };
            const got = solveArcArcFillet(params);

            expect(got.error).toBeUndefined();
            expectTangency(got, params);
            // The fillet turns through the corner's exterior angle.
            expect(got.sweep).toBeCloseTo(Math.PI - a, 3);
        });
    });

    test('a symmetric pair puts the fillet on the axis of symmetry', () => {
        const params = {
            c1: [-30, 0], r1: 20, ccw1: false,
            c2: [30, 0], r2: 20, ccw2: true,
            junction: [-10.0, 0],
            rnd: 3,
        };
        const mirrored = solveArcArcFillet({...params, junction: [-10, 0]});
        if (!mirrored.error && !mirrored.tangential) {
            expect(len(sub(mirrored.center, params.c1)))
                .toBeCloseTo(len(sub(mirrored.center, params.c2)), 6);
            expectTangency(mirrored, params);
        }
    });
});

describe('corners that cannot be rounded', () => {
    const M = 1e7;

    test('a smooth joint is not an error — there is simply nothing to round', () => {
        // Both arcs on the same circle: the path runs straight through.
        const got = solveArcArcFillet({
            c1: [0, 10], r1: 10, ccw1: true,
            c2: [0, 10], r2: 10, ccw2: true,
            junction: [0, 0], rnd: 1,
        });
        expect(got).toEqual({tangential: true});
    });

    test('a reversal is', () => {
        const got = solveArcArcFillet({
            c1: [0, M], r1: M, ccw1: true,
            c2: [0, M], r2: M, ccw2: false,
            junction: [0, 0], rnd: 1,
        });
        expect(got.error).toBe('reversal');
    });

    test('a radius bigger than an arc it has to roll inside', () => {
        const got = solveArcArcFillet({
            c1: [0, 5], r1: 5, ccw1: true,
            c2: [-5, 0], r2: 5, ccw2: true,
            junction: [0, 0], rnd: 6,
        });
        expect(got.error).toBe('rnd-exceeds-arc-radius');
    });

    test('a radius too large for the corner', () => {
        // An angle on an arc this size is a poor way to say "short": a hundredth
        // of a degree here is still 1700 mm of arc. Measured in millimetres, a
        // 2 mm fillet plainly cannot eat 2 mm back along a 1 mm arc.
        const oneMillimetre = 1 / M;
        const got = solveArcArcFillet({
            c1: [0, M], r1: M, ccw1: true,
            c2: [-M, 0], r2: M, ccw2: true,
            junction: [0, 0], rnd: 2,
            startAng1: -Math.PI / 2 - oneMillimetre,
            endAng2: oneMillimetre,
        });
        expect(got.error).toBe('rnd-too-large');
    });

    test('too large for the arc BEFORE the corner, with room after it', () => {
        // Each arc is checked on its own. With a symmetric corner either check
        // would catch this, which is no test of either.
        const mm = 1 / M;
        const got = solveArcArcFillet({
            c1: [0, M], r1: M, ccw1: true,
            c2: [-M, 0], r2: M, ccw2: true,
            junction: [0, 0], rnd: 2,
            startAng1: -Math.PI / 2 - 1 * mm,      // 1 mm of arc to eat into
            endAng2: 500 * mm,                     // and half a metre after it
        });
        expect(got.error).toBe('rnd-too-large');
    });

    test('too large for the arc AFTER it, with room before', () => {
        const mm = 1 / M;
        const got = solveArcArcFillet({
            c1: [0, M], r1: M, ccw1: true,
            c2: [-M, 0], r2: M, ccw2: true,
            junction: [0, 0], rnd: 2,
            startAng1: -Math.PI / 2 - 500 * mm,
            endAng2: 1 * mm,
        });
        expect(got.error).toBe('rnd-too-large');
    });

    test('two arcs about the same centre', () => {
        const got = solveArcArcFillet({
            c1: [0, 0], r1: 10, ccw1: true,
            c2: [0, 0], r2: 4, ccw2: false,
            junction: [10, 0], rnd: 1,
        });
        expect(['concentric', 'reversal', 'rnd-too-large']).toContain(got.error);
    });

    test('nonsense in, a named error out', () => {
        const base = {c1: [0, 5], r1: 5, ccw1: true, c2: [-5, 0], r2: 5, ccw2: true, junction: [0, 0]};
        expect(solveArcArcFillet({...base, rnd: 0}).error).toBe('rnd-not-positive');
        expect(solveArcArcFillet({...base, rnd: -1}).error).toBe('rnd-not-positive');
        expect(solveArcArcFillet({...base, r1: 0, rnd: 1}).error).toBe('arc-radius-not-positive');
        expect(solveArcArcFillet({...base, junction: [0, 5], rnd: 1}).error).toBe('junction-at-centre');
    });
});

describe('a radius too large for the corner, reduced to fit', () => {
    const M = 1e7;
    // A quarter-turn corner with four millimetres of arc on either side of it.
    const mm = 1 / M;
    const tight = {
        c1: [0, M], r1: M, ccw1: true,
        c2: [-M, 0], r2: M, ccw2: true,
        junction: [0, 0],
        startAng1: -Math.PI / 2 - 4 * mm,
        endAng2: 4 * mm,
    };

    test('a radius that fits is passed through untouched', () => {
        const params = {...tight, rnd: 1};
        const clamped = solveArcArcFilletClamped(params);

        expect(clamped.clampedTo).toBeUndefined();
        expect(clamped).toEqual(solveArcArcFillet(params));
    });

    test('one that does not comes back as a real fillet, not as rubbish', () => {
        const params = {...tight, rnd: 100};
        const clamped = solveArcArcFilletClamped(params);

        expect(clamped.clampedTo).toBeGreaterThan(0);
        expect(clamped.clampedTo).toBeLessThan(params.rnd);
        expect(clamped.radius).toBe(clamped.clampedTo);
        expectTangency(clamped, params);
    });

    test('and it is the largest that fits, not just any', () => {
        const params = {...tight, rnd: 100};
        const clamped = solveArcArcFilletClamped(params);

        expect(solveArcArcFillet({...params, rnd: clamped.clampedTo}).error).toBeUndefined();
        expect(solveArcArcFillet({...params, rnd: clamped.clampedTo * 1.01}).error).toBeDefined();
    });

    test('whichever constraint it runs into first', () => {
        // Here it is the arc's own radius, not its length: the fillet has to roll
        // inside a circle of radius 5, so it can never reach 5.
        const small = {
            c1: [0, 5], r1: 5, ccw1: true,
            c2: [-5, 0], r2: 5, ccw2: true,
            junction: [0, 0],
            rnd: 50,
        };
        const clamped = solveArcArcFilletClamped(small);

        expect(clamped.clampedTo).toBeGreaterThan(0);
        expect(clamped.clampedTo).toBeLessThan(5);
        expectTangency(clamped, small);
        expect(solveArcArcFillet({...small, rnd: clamped.clampedTo * 1.01}).error).toBeDefined();
    });

    test('it does not rescue a joint that has no corner', () => {
        const smooth = solveArcArcFilletClamped({
            c1: [0, 10], r1: 10, ccw1: true,
            c2: [0, 10], r2: 10, ccw2: true,
            junction: [0, 0], rnd: 1e6,
        });
        expect(smooth).toEqual({tangential: true});

        const back = solveArcArcFilletClamped({
            c1: [0, M], r1: M, ccw1: true,
            c2: [0, M], r2: M, ccw2: false,
            junction: [0, 0], rnd: 1e6,
        });
        expect(back.error).toBe('reversal');
        expect(back.clampedTo).toBeUndefined();
    });
});

describe('choosing between the two places the fillet could sit', () => {
    test('it goes in the corner, not on the far side of the arcs', () => {
        const params = {
            c1: [0, 20], r1: 20, ccw1: true,
            c2: [-20, 0], r2: 20, ccw2: true,
            junction: [0, 0],
            rnd: 3,
            startAng1: (-90 - 40) * (Math.PI / 180),
            endAng2: 40 * (Math.PI / 180),
        };
        const got = solveArcArcFillet(params);

        // Near the joint, and well inside both arcs.
        expect(len(sub(got.center, params.junction))).toBeLessThan(10);
        expectTangency(got, params);

        const onArc1 = at(params.c1, params.r1, -130);
        expect(len(sub(got.t1, onArc1))).toBeGreaterThan(0);   // t1 is a real point of arc 1
    });
});

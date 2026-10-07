'use babel'

// Rounding the corner where two arcs meet — the geometry, and nothing else.
//
// `RND` on a G2/G3 block followed by another G2/G3 is the one case
// `element-insert.js` has never had: the fillet there is tangent to two circles
// at once, which is a case of Apollonius' problem, and which of the four
// internal/external combinations applies depends on the two arcs' directions.
//
// It lives on its own, with no `View` and no `parseData`, because that is what
// lets it be tested on bare numbers. The signs are the whole difficulty here —
// get one wrong and the fillet looks almost right — so the tests check tangency
// itself (the fillet's direction of travel at each contact matching the arc's)
// rather than any formula this file could also have got wrong.
//
// Everything is plane 2D in the active plane's own axes, as [u, v] pairs, and
// in radians. `ccw` is the direction of travel: true for G3, false for G2.
//
// See docs/rnd-arc-arc-plan.md, phase 1.

const EPS = 1e-9

// How close to straight-through, or to a full reversal, counts as such. A tenth
// of a milliradian is well under anything a program expresses deliberately and
// well over the rounding of a tessellated path.
const ANG_EPS = 1e-4

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]]
const add = (a, b) => [a[0] + b[0], a[1] + b[1]]
const scale = (a, k) => [a[0] * k, a[1] * k]
const len = a => Math.hypot(a[0], a[1])
const unit = a => { const l = len(a); return l > 0 ? [a[0] / l, a[1] / l] : [0, 0] }
const angleOf = a => Math.atan2(a[1], a[0])
const quarterTurn = (a, ccw) => (ccw ? [-a[1], a[0]] : [a[1], -a[0]])

// Into (-π, π].
function signedAngle(a) {
    let x = a
    while (x > Math.PI) x -= 2 * Math.PI
    while (x <= -Math.PI) x += 2 * Math.PI
    return x
}

// Into [0, 2π).
function positiveAngle(a) {
    let x = a % (2 * Math.PI)
    if (x < 0) x += 2 * Math.PI
    return x
}

// How far along an arc a point lies, as a positive sweep from its start, and how
// long the arc is. A point belongs to the arc when the first is no more than the
// second.
function sweepFrom(fromAng, toAng, ccw) {
    return positiveAngle(ccw ? toAng - fromAng : fromAng - toAng)
}

// Errors that are a property of this `rnd` and might go away with a smaller one.
// A tangential joint, a reversal and two concentric arcs are not: no radius
// makes a corner out of them.
const CLAMPABLE = new Set(['rnd-exceeds-arc-radius', 'rnd-too-large', 'implausible-sweep'])

// The fillet of radius `rnd` in the corner where arc 1 ends and arc 2 begins.
//
// Returns one of:
//   {tangential: true}    the arcs run into each other smoothly — no corner
//   {error: '<code>'}     no such fillet exists (see CLAMPABLE for which codes
//                         a smaller radius could cure)
//   {center, radius, ccw, sweep, t1, t2, s1, s2}
//
// `t1` and `t2` are where the fillet touches each arc: arc 1 is to be truncated
// at `t1` and arc 2 to begin at `t2`. `s1`/`s2` say which side the fillet rolls
// on — -1 inside the arc, +1 outside it — and are returned so a test can check
// them against the rule rather than take it on trust.
//
// `startAng1` and `endAng2` bound the two arcs: the fillet may only eat into
// them, never extend them. Leaving them out drops that check, which is only safe
// when the caller knows both arcs are longer than the corner.
export function solveArcArcFillet({c1, r1, ccw1, c2, r2, ccw2, junction, rnd, startAng1, endAng2}) {
    if (!(rnd > 0)) return {error: 'rnd-not-positive'}
    if (!(r1 > 0) || !(r2 > 0)) return {error: 'arc-radius-not-positive'}

    // Direction of travel at the joint, on each arc. A radius turned a quarter
    // the way the arc runs.
    const u1 = sub(junction, c1)
    const u2 = sub(junction, c2)
    if (len(u1) < EPS || len(u2) < EPS) return {error: 'junction-at-centre'}

    const d1 = unit(quarterTurn(u1, ccw1))
    const d2 = unit(quarterTurn(u2, ccw2))

    const turn = signedAngle(angleOf(d2) - angleOf(d1))
    if (Math.abs(turn) < ANG_EPS) return {tangential: true}
    if (Math.PI - Math.abs(turn) < ANG_EPS) return {error: 'reversal'}

    // The fillet turns the way the corner does, and so rolls inside whichever
    // arc already curves that way and outside the other.
    const ccw = turn > 0
    const s1 = ccw === ccw1 ? -1 : 1
    const s2 = ccw === ccw2 ? -1 : 1
    const R1 = r1 + s1 * rnd
    const R2 = r2 + s2 * rnd
    if (!(R1 > EPS) || !(R2 > EPS)) return {error: 'rnd-exceeds-arc-radius'}

    // Its centre is a distance R1 from one arc's centre and R2 from the other's,
    // so it is where those two circles cross.
    const span = sub(c2, c1)
    const d = len(span)
    if (d < EPS) return {error: 'concentric'}
    if (d > R1 + R2 + EPS || d < Math.abs(R1 - R2) - EPS) return {error: 'rnd-too-large'}

    const a = (d * d + R1 * R1 - R2 * R2) / (2 * d)
    const hSq = R1 * R1 - a * a
    if (hSq < -EPS) return {error: 'rnd-too-large'}
    const h = Math.sqrt(Math.max(0, hSq))

    const e = scale(span, 1 / d)
    const n = [-e[1], e[0]]
    const base = add(c1, scale(e, a))
    const near = add(base, scale(n, h))
    const far = sub(base, scale(n, h))

    // The fillet sits in the corner, not on the far side of the two circles.
    const center = len(sub(near, junction)) <= len(sub(far, junction)) ? near : far

    const t1 = add(c1, scale(unit(sub(center, c1)), r1))
    const t2 = add(c2, scale(unit(sub(center, c2)), r2))

    const sweep = sweepFrom(angleOf(sub(t1, center)), angleOf(sub(t2, center)), ccw)
    // A fillet in a corner turns by the corner's own angle, which is less than
    // half a turn. More than that means the wrong crossing or the wrong signs,
    // and it is better to say so than to draw it.
    if (sweep >= Math.PI - ANG_EPS) return {error: 'implausible-sweep'}

    if (startAng1 !== undefined) {
        const whole = sweepFrom(startAng1, angleOf(u1), ccw1)
        const upTo = sweepFrom(startAng1, angleOf(sub(t1, c1)), ccw1)
        if (upTo > whole + EPS) return {error: 'rnd-too-large'}
    }
    if (endAng2 !== undefined) {
        const whole = sweepFrom(angleOf(u2), endAng2, ccw2)
        const from = sweepFrom(angleOf(sub(t2, c2)), endAng2, ccw2)
        if (from > whole + EPS) return {error: 'rnd-too-large'}
    }

    return {center, radius: rnd, ccw, sweep, t1, t2, s1, s2}
}

// The same, with a radius too large for the corner reduced to the largest that
// fits — which is what the control does, and what the line-to-line branch of
// `insertRnd` already does with its `maxRnd` clamp.
//
// There is no closed form for the largest here: the constraints are several and
// none is linear in the radius — it must stay inside each arc it rolls within,
// the two offset circles must still cross, and both contact points must still
// land on arcs that are long enough. So the largest is found by bisection
// between a radius that is known to fit and the one asked for.
//
// Bisecting between a feasible and an infeasible bound is what makes this safe:
// even if feasibility were not monotonic somewhere in between, the answer is
// still a radius that fits — possibly not the very largest. The lower bound
// always holds, because as the radius goes to zero the fillet shrinks onto the
// joint itself, and the joint is by definition on both arcs.
export function solveArcArcFilletClamped(params) {
    const asked = solveArcArcFillet(params)
    if (!asked.error || !CLAMPABLE.has(asked.error)) return asked

    const fits = rnd => !solveArcArcFillet({...params, rnd}).error

    let lo = 0
    let hi = params.rnd
    for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2
        if (mid <= 0 || mid >= hi) break
        if (fits(mid)) lo = mid
        else hi = mid
    }
    if (!(lo > 0)) return asked

    const clamped = solveArcArcFillet({...params, rnd: lo})
    return clamped.error ? asked : {...clamped, clampedTo: lo}
}

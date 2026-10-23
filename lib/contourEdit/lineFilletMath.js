'use babel'

// Rounding or chamfering the corner between two straight lines — the geometry,
// and nothing else.
//
// Unlike `insertRnd`/`insertChr` in `element-insert.js`, which round the corner
// a program actually drives through, this answers a question the contour editor
// asks: the two lines are whatever the user clicked, they are **not required to
// intersect**, and every solution that fits is wanted at once so one of them can
// be picked.
//
// A circle of a given radius tangent to two non-parallel lines has four
// centres, one in each sector the lines cut the plane into — but a fillet is
// only of use where it touches the **segments** the user drew, not their
// infinite extensions. That filter is the whole subtlety here, and it is what
// decides how many solutions come back:
//
//   - both segments stop short of the vertex .... 1
//   - the segments meet at their endpoints ...... 1
//   - an endpoint lies within the other segment . 2
//   - the segments cross ........................ 4
//
// What governs it is not whether the segments meet but which half-lines from the
// vertex they occupy: a segment with the vertex inside it offers both of its
// half-lines, so two solutions survive even when the segments are far apart.
//
// The contacts are equidistant from the vertex — tangent lengths from an
// external point are equal — and that distance grows with the radius, so a
// radius can be too large as well as too small, and for segments lying in
// wholly different places no radius fits at all. Hence three error codes rather
// than one.
//
// It lives on its own, with no `View` and no `parseData`, because that is what
// lets it be tested on bare numbers. Nothing here trims, extends or otherwise
// touches the two lines: the editor inserts the fillet as a new element and
// leaves them as they are.
//
// Everything is plane 2D in the active plane's own axes, as [u, v] pairs, and
// in radians. `ccw` is the direction of travel: true for G3, false for G2.
//
// See docs/contour-fillet-plan.md, phase 2.

const EPS = 1e-9

// The four sign pairs, and with them the order the candidates come back in:
// `s1`/`s2` (`e1`/`e2` for a chamfer) say which side of each line the solution
// sits on, +1 to the left of its direction of travel. Fixed so that a given pair
// of lines always produces the same order — the editor numbers what it shows.
const SIGN_PAIRS = [[1, 1], [1, -1], [-1, 1], [-1, -1]]

// Two directions this close to parallel have no corner to round. A tenth of a
// milliradian is far below what a user can click apart and far above the
// rounding of coordinates that came through a file.
const ANG_EPS = 1e-4

// How far past the end of a segment a contact may land and still count as on
// it. 1e-5 is the accuracy `intersections.js` already judges contour joints by,
// and it is what lets a fillet sized exactly to a segment's end be accepted.
const ON_SEGMENT_EPS = 1e-5

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]]
const add = (a, b) => [a[0] + b[0], a[1] + b[1]]
const scale = (a, k) => [a[0] * k, a[1] * k]
const dot = (a, b) => a[0] * b[0] + a[1] * b[1]
const cross = (a, b) => a[0] * b[1] - a[1] * b[0]
const len = a => Math.hypot(a[0], a[1])
const angleOf = a => Math.atan2(a[1], a[0])
const leftNormal = a => [-a[1], a[0]]

// Into [0, 2π).
function positiveAngle(a) {
    let x = a % (2 * Math.PI)
    if (x < 0) x += 2 * Math.PI
    return x
}

// A line as this module wants it: a point on it, a unit direction and how long
// the segment that gave it is. Returns null for a line of no length, which has
// no direction to speak of.
function lineOf(l) {
    const d = sub(l.end, l.start)
    const length = len(d)
    if (length < EPS) return null
    return {p: l.start, u: scale(d, 1 / length), length}
}

// Where the two infinite lines cross. `null` when they are parallel.
function intersect(a, b) {
    const det = cross(a.u, b.u)
    if (Math.abs(det) < ANG_EPS) return null
    const w = sub(b.p, a.p)
    return add(a.p, scale(a.u, cross(w, b.u) / det))
}

// The segment's own extent along its line, measured from the vertex.
function spanFrom(line, vertex) {
    const from = dot(sub(line.p, vertex), line.u)
    const to = from + line.length
    return {min: Math.min(from, to), max: Math.max(from, to)}
}

// Where one contact falls, at signed distance `t` from the vertex along its
// line: `lo`/`hi` are how far out the segment reaches on the half-line the
// contact went to, so they are the window of tangent lengths that half-line
// accepts. `verdict` is 'on', or which way the value was wrong — and a
// half-line the segment does not reach at all is 'off-side', which no value
// cures and which must therefore not be read as a value out of range.
function placeContact(span, t) {
    const forward = t >= 0
    const lo = Math.max(0, forward ? span.min : -span.max)
    const hi = forward ? span.max : -span.min
    if (!(hi > ON_SEGMENT_EPS)) return {verdict: 'off-side', lo, hi}

    const distance = Math.abs(t)
    const verdict = distance < lo - ON_SEGMENT_EPS ? 'before'
        : distance > hi + ON_SEGMENT_EPS ? 'beyond'
        : 'on'
    return {verdict, lo, hi}
}

// Keeps the solutions whose contacts both land on their segments; if none does,
// says which way the value was wrong. Only the sectors both segments actually
// bound can be cured by a different value, so the others are left out of that
// verdict entirely.
function keepOnSegments(all, contactsOf, a, b, vertex, codes) {
    const span1 = spanFrom(a, vertex)
    const span2 = spanFrom(b, vertex)

    const verdicts = all.map(c => {
        const [c1, c2] = contactsOf(c)
        return [
            placeContact(span1, dot(sub(c1, vertex), a.u)),
            placeContact(span2, dot(sub(c2, vertex), b.u)),
        ]
    })

    const candidates = all.filter((c, i) => verdicts[i].every(v => v.verdict === 'on'))
    if (candidates.length) return {candidates}

    // Only a sector both segments bound can be cured by a different value; the
    // others are not in the corner at all. And of those, only one whose two
    // windows overlap: the contacts are always equidistant from the vertex, so
    // where the segments have no common reach no value whatever fits, and
    // saying "too small" of the value at hand would be a lie even when a larger
    // one does move towards one of the two segments.
    const feasible = verdicts
        .filter(v => v.every(c => c.verdict !== 'off-side'))
        .filter(v => Math.max(v[0].lo, v[1].lo) <= Math.min(v[0].hi, v[1].hi) + ON_SEGMENT_EPS)

    const wrong = feasible
        .reduce((acc, v) => acc.concat(v), [])
        .map(c => c.verdict)
        .filter(v => v !== 'on')

    if (!wrong.length) return {error: codes.doesNotFit}
    if (wrong.every(v => v === 'before')) return {error: codes.tooSmall}
    if (wrong.every(v => v === 'beyond')) return {error: codes.tooLarge}
    return {error: codes.doesNotFit}
}

// Every fillet of radius `radius` that is tangent to both lines and touches both
// segments.
//
// Returns `{error: '<code>'}` or `{candidates: [...]}`, each candidate:
//
//   {center, radius, t1, t2, middle, ccw, sweep, s1, s2, vertex, tangentLength}
//
// `t1` and `t2` are where it touches line 1 and line 2; `middle` is the point
// halfway along it, which is what the contour editor stores an arc by. The arc
// returned is always the minor one between the two contacts — the major one is
// the same circle gone the long way round, never what a corner means.
export function lineFilletCandidates({l1, l2, radius}) {
    if (!(radius > 0)) return {error: 'radius-not-positive'}

    const a = lineOf(l1)
    const b = lineOf(l2)
    if (!a || !b) return {error: 'line-degenerate'}

    const det = cross(a.u, b.u)
    if (Math.abs(det) < ANG_EPS) return {error: 'lines-parallel'}

    const vertex = intersect(a, b)
    const n1 = leftNormal(a.u)
    const n2 = leftNormal(b.u)

    const all = SIGN_PAIRS.map(([s1, s2]) => {
        // The centre is at signed distance s·radius from each line:
        //   n1·(c − p1) = s1·radius,  n2·(c − p2) = s2·radius.
        // Two linear equations, solved by Cramer; the determinant is cross(n1,
        // n2), which equals cross(u1, u2) — turning both normals back a quarter
        // leaves it unchanged — so it is non-zero exactly when the lines are not
        // parallel, which is already settled above.
        const k1 = s1 * radius + dot(n1, a.p)
        const k2 = s2 * radius + dot(n2, b.p)
        const center = [
            (k1 * n2[1] - k2 * n1[1]) / det,
            (k2 * n1[0] - k1 * n2[0]) / det,
        ]

        // Each contact is the foot of the perpendicular from the centre, which
        // is the centre pulled back across the offset it was placed at.
        const t1 = sub(center, scale(n1, s1 * radius))
        const t2 = sub(center, scale(n2, s2 * radius))

        const a1 = angleOf(sub(t1, center))
        const a2 = angleOf(sub(t2, center))
        // Travelling counter-clockwise from the first contact to the second is
        // the short way round for exactly one of the two directions.
        const ccw = positiveAngle(a2 - a1) <= Math.PI
        const sweep = ccw ? positiveAngle(a2 - a1) : positiveAngle(a1 - a2)
        const midAng = a1 + (ccw ? sweep / 2 : -sweep / 2)
        const middle = add(center, [radius * Math.cos(midAng), radius * Math.sin(midAng)])

        return {
            center, radius, t1, t2, middle, ccw, sweep, s1, s2, vertex,
            tangentLength: len(sub(t1, vertex)),
        }
    })

    return keepOnSegments(all, c => [c.t1, c.t2], a, b, vertex, {
        tooSmall: 'radius-too-small',
        tooLarge: 'radius-too-large',
        doesNotFit: 'radius-does-not-fit',
    })
}

// Every chamfer whose legs are `size` long, measured along each line from the
// corner — the quantity Sinumerik calls `CHR` — and whose ends both land on the
// segments. `CHF`, the length of the cut itself, is converted to this by the
// caller: the conversion needs the angle between the two edges, and
// `element-insert.js::insertChr` already holds it.
//
// Returns `{error: '<code>'}` or `{candidates: [...]}`, each candidate:
//
//   {start, end, vertex, e1, e2}
//
// `start` is on line 1 and `end` on line 2. `e1`/`e2` say which way along each
// line the leg was laid off, +1 along its direction of travel. The vertex comes
// back with every candidate because it is the one point they share, and because
// the segments need not reach it.
export function lineChamferCandidates({l1, l2, size}) {
    if (!(size > 0)) return {error: 'size-not-positive'}

    const a = lineOf(l1)
    const b = lineOf(l2)
    if (!a || !b) return {error: 'line-degenerate'}

    const vertex = intersect(a, b)
    if (!vertex) return {error: 'lines-parallel'}

    const all = SIGN_PAIRS.map(([e1, e2]) => ({
        start: add(vertex, scale(a.u, e1 * size)),
        end: add(vertex, scale(b.u, e2 * size)),
        vertex,
        e1,
        e2,
    }))

    return keepOnSegments(all, c => [c.start, c.end], a, b, vertex, {
        tooSmall: 'size-too-small',
        tooLarge: 'size-too-large',
        doesNotFit: 'size-does-not-fit',
    })
}

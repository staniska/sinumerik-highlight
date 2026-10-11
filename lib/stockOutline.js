'use babel'

// What is left of the blank, as a contour rather than as a picture.
//
// The material trace holds the stock as columns along the turning axis, each
// with exact radial intervals. That is the right shape for cutting into but the
// wrong one for handing to the next program, which wants a closed path of lines
// and arcs. This turns one into the other.
//
// It is pure 2D arithmetic on `[a0, a1]` pairs — no `View`, no axis names, no
// parse data — so it can be tested on bare numbers, and so the caller decides
// which pair of axes it is looking at.
//
// Two stages, and they are kept apart on purpose:
//
//   1. the boundary of the stored region, EXACTLY. A staircase of axis-aligned
//      edges, since that is literally what the grid holds;
//   2. that staircase fitted with lines and arcs inside a tolerance.
//
// Stage 1 has no tolerance and nothing to tune; every judgement call lives in
// stage 2, where it can be pointed at.
//
// See docs/ips-plan.md, phase 1.

import {getSpans} from './materialTrace'

const EPS = 1e-9

// The parts of `was` that `is` does not cover. Both are sorted and disjoint, as
// a column's intervals always are.
//
// Written here rather than borrowed from `materialTraceRun`, which has the same
// arithmetic: that module reaches for `View`, and this one is worth keeping able
// to run on nothing but numbers.
function without(was, is) {
    const out = []
    was.forEach(([lo, hi]) => {
        let cursor = lo
        is.forEach(([s, e]) => {
            if (e <= cursor || s >= hi) return
            if (s > cursor) out.push([cursor, s])
            cursor = Math.max(cursor, e)
        })
        if (cursor < hi) out.push([cursor, hi])
    })
    return out
}

// Points are compared by value to be stitched into loops, so they need a key
// that two arithmetically identical corners cannot miss each other on. Column
// edges are `min + i*pitch` and radii come straight out of the grid, so nine
// decimals is far below anything the geometry distinguishes and far above
// double-precision noise.
const keyOf = (p) => `${p[0].toFixed(9)}|${p[1].toFixed(9)}`

// ─── stage 1: the exact boundary ─────────────────────────────────────────────

// Every boundary edge of the stored region, directed so that the material is on
// the LEFT of the direction of travel.
//
// The region is a union of rectangles — one per interval per column — so an edge
// is on the boundary exactly where the material on one side of it is not matched
// on the other. Along a column edge that is the difference of the two columns'
// interval sets; across the top and bottom of an interval it is unconditional,
// because the intervals within a column are disjoint and maximal.
function boundaryEdges(grid) {
    const edges = []
    const zOf = (i) => grid.min + i * grid.pitch

    for (let i = 0; i <= grid.columns; i++) {
        const before = i > 0 ? getSpans(grid, i - 1) : []
        const after = i < grid.columns ? getSpans(grid, i) : []
        const z = zOf(i)

        // Material only on the far side: walking down keeps it on the left.
        without(after, before).forEach(([lo, hi]) => edges.push({from: [z, hi], to: [z, lo]}))
        // Material only on the near side: walking up does.
        without(before, after).forEach(([lo, hi]) => edges.push({from: [z, lo], to: [z, hi]}))
    }

    for (let i = 0; i < grid.columns; i++) {
        const zL = zOf(i)
        const zR = zOf(i + 1)
        getSpans(grid, i).forEach(([lo, hi]) => {
            edges.push({from: [zL, lo], to: [zR, lo]})   // underside: material above
            edges.push({from: [zR, hi], to: [zL, hi]})   // top: material below
        })
    }

    return edges
}

const direction = (edge) => {
    const d = [edge.to[0] - edge.from[0], edge.to[1] - edge.from[1]]
    const len = Math.hypot(d[0], d[1])
    return len > 0 ? [d[0] / len, d[1] / len] : [0, 0]
}

// Chain the directed edges into closed loops.
//
// Where more than two edges meet — two rectangles touching at nothing but a
// corner — which one continues the boundary is not a matter of taste: taking the
// first turn clockwise from the way we came keeps hugging the material, and
// taking any other one cuts the corner and swallows a whole component.
function stitchLoops(edges) {
    const starting = new Map()
    edges.forEach((edge, idx) => {
        const key = keyOf(edge.from)
        if (!starting.has(key)) starting.set(key, [])
        starting.get(key).push(idx)
    })

    const used = new Array(edges.length).fill(false)
    const loops = []

    for (let seed = 0; seed < edges.length; seed++) {
        if (used[seed]) continue

        const loop = []
        let at = seed
        while (at !== undefined && !used[at]) {
            used[at] = true
            loop.push(edges[at].from)

            const candidates = (starting.get(keyOf(edges[at].to)) ?? []).filter(j => !used[j])
            at = candidates.length <= 1 ? candidates[0] : clockwiseNext(edges[at], candidates, edges)
        }

        if (loop.length >= 4) loops.push(loop)
    }

    return loops
}

function clockwiseNext(incoming, candidates, edges) {
    const back = direction(incoming).map(v => -v)
    let best
    let bestTurn = Infinity

    candidates.forEach(j => {
        const out = direction(edges[j])
        // Angle from the way back to this edge, measured clockwise into
        // [0, 2π): the first one round is the one that hugs the material.
        let turn = Math.atan2(back[0] * out[1] - back[1] * out[0], back[0] * out[0] + back[1] * out[1])
        turn = turn > 0 ? 2 * Math.PI - turn : -turn
        if (turn < bestTurn) {
            bestTurn = turn
            best = j
        }
    })

    return best
}

// Three points in a row on one straight run are two points and a stop.
function collapseCollinear(points) {
    const out = []
    for (let i = 0; i < points.length; i++) {
        const prev = points[(i - 1 + points.length) % points.length]
        const here = points[i]
        const next = points[(i + 1) % points.length]
        const cross = (here[0] - prev[0]) * (next[1] - here[1]) - (here[1] - prev[1]) * (next[0] - here[0])
        if (Math.abs(cross) > EPS) out.push(here)
    }
    return out.length >= 3 ? out : points
}

// Twice the signed area. Positive means the loop runs counter-clockwise, which
// for this edge direction means the material is inside it.
function shoelace(points) {
    let sum = 0
    for (let i = 0; i < points.length; i++) {
        const a = points[i]
        const b = points[(i + 1) % points.length]
        sum += a[0] * b[1] - b[0] * a[1]
    }
    return sum / 2
}

// ─── stage 2: lines and arcs within a tolerance ──────────────────────────────

// Distance from a point to the segment through a and b — or to the line, when
// the two ends coincide.
function distanceToLine(a, b, p) {
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const len = Math.hypot(dx, dy)
    if (len < EPS) return Math.hypot(p[0] - a[0], p[1] - a[1])
    return Math.abs(dx * (a[1] - p[1]) - dy * (a[0] - p[0])) / len
}

// The point of a segment closest to `p`.
function nearestOnSegment(a, b, p) {
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const len2 = dx * dx + dy * dy
    if (len2 < EPS) return a
    let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2
    t = Math.max(0, Math.min(1, t))
    return [a[0] + dx * t, a[1] + dy * t]
}

// Least-squares circle through a run of points (Kåsa), or null when they are too
// straight for one to mean anything.
function fitCircle(points) {
    const n = points.length
    if (n < 3) return null

    let sx = 0, sy = 0
    points.forEach(p => { sx += p[0]; sy += p[1] })
    const cx = sx / n
    const cy = sy / n

    let suu = 0, svv = 0, suv = 0, suuu = 0, svvv = 0, suvv = 0, svuu = 0
    points.forEach(p => {
        const u = p[0] - cx
        const v = p[1] - cy
        suu += u * u; svv += v * v; suv += u * v
        suuu += u * u * u; svvv += v * v * v
        suvv += u * v * v; svuu += v * u * u
    })

    const det = 2 * (suu * svv - suv * suv)
    if (Math.abs(det) < EPS) return null

    const a = (svv * (suuu + suvv) - suv * (svvv + svuu)) / det
    const b = (suu * (svvv + svuu) - suv * (suuu + suvv)) / det
    const center = [cx + a, cy + b]

    let radius = 0
    points.forEach(p => { radius += Math.hypot(p[0] - center[0], p[1] - center[1]) })
    radius /= n

    return Number.isFinite(center[0]) && Number.isFinite(center[1]) && radius > EPS
        ? {center, radius}
        : null
}

const fitsLine = (points, from, to, tolerance) => {
    for (let k = from + 1; k < to; k++) {
        if (distanceToLine(points[from], points[to], points[k]) > tolerance) return false
    }
    return true
}

// A circle has three degrees of freedom, so three points always lie on one
// exactly and prove nothing by it — fitted to the corners of a rectangle it
// returns a perfectly good circle through them. An arc has to be carried by more
// points than it has freedoms before it is believed, which is also what keeps a
// single stair step from coming back as a tiny radius.
const ARC_MIN_SPAN = 4

function fitsArc(points, from, to, tolerance) {
    if (to - from < ARC_MIN_SPAN) return null
    const run = points.slice(from, to + 1)
    const circle = fitCircle(run)
    if (!circle) return null

    const offCircle = (p) => Math.abs(Math.hypot(p[0] - circle.center[0], p[1] - circle.center[1]) - circle.radius)

    for (let k = 0; k < run.length; k++) {
        if (offCircle(run[k]) > tolerance) return null
    }

    // And between them. The boundary is segments, not a cloud of points: a
    // straight edge of the stock carries no points along its length, so a circle
    // fitted through its two ends can bulge millimetres away from it and still
    // pass a check made only at the ends. On a segment the distance to a circle
    // is extreme at an end or where the segment comes closest to the centre, so
    // those three places settle it.
    for (let k = 1; k < run.length; k++) {
        if (offCircle(nearestOnSegment(run[k - 1], run[k], circle.center)) > tolerance) return null
    }

    // Which way round, and how far: a boundary arc turns one way throughout, and
    // one that claims to sweep past half a turn between two points is a circle
    // fitted to noise rather than a feature.
    const angleAt = (p) => Math.atan2(p[1] - circle.center[1], p[0] - circle.center[0])
    let sweep = 0
    for (let k = 1; k < run.length; k++) {
        let step = angleAt(run[k]) - angleAt(run[k - 1])
        while (step > Math.PI) step -= 2 * Math.PI
        while (step < -Math.PI) step += 2 * Math.PI
        sweep += step
    }
    if (Math.abs(sweep) >= Math.PI) return null

    return {...circle, ccw: sweep > 0}
}

// How far the run starting at `from` can be taken while `fits` still holds.
// Doubling then halving, so a long straight run costs a handful of checks
// instead of one per point.
// `minimum` is the shortest run worth testing. Below it the predicate may be
// false for reasons that have nothing to do with the geometry — an arc is not
// believed on three points — so the search starts there rather than growing into
// it from a run it would have rejected.
function longestRun(points, from, fits, minimum = 1) {
    const first = from + minimum
    if (first >= points.length || !fits(first)) return from

    let good = first
    let step = 1

    while (good + step < points.length && fits(good + step)) {
        good += step
        step *= 2
    }

    let lo = good
    let hi = Math.min(good + step, points.length - 1)
    while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2)
        if (fits(mid)) lo = mid
        else hi = mid - 1
    }
    return lo
}

// Walk the staircase once, taking the longest line or arc that stays inside the
// tolerance at each step.
//
// Both are measured against the ORIGINAL staircase points, never against an
// already-simplified version of them: a tolerance spent twice is a tolerance
// exceeded, and the whole promise of this file is that the contour it returns
// lies within one tolerance of the stock the grid holds.
export function fitPrimitives(points, tolerance) {
    const n = points.length
    if (n < 2) return []

    // Open the loop at a corner of its bounding box. Any start splits whatever
    // primitive it lands in the middle of; a bounding-box corner is a real
    // corner of any stock profile, so it splits nothing.
    let anchor = 0
    for (let i = 1; i < n; i++) {
        const p = points[i]
        const best = points[anchor]
        if (p[0] < best[0] - EPS || (Math.abs(p[0] - best[0]) < EPS && p[1] < best[1] - EPS)) anchor = i
    }

    const path = []
    for (let i = 0; i <= n; i++) path.push(points[(anchor + i) % n])

    const elements = []
    let at = 0
    while (at < path.length - 1) {
        const lineEnd = longestRun(path, at, (to) => fitsLine(path, at, to, tolerance))
        const arcEnd = longestRun(path, at, (to) => fitsArc(path, at, to, tolerance) !== null, ARC_MIN_SPAN)

        if (arcEnd > lineEnd) {
            const arc = fitsArc(path, at, arcEnd, tolerance)
            elements.push({
                type: 'arc',
                start: path[at],
                end: path[arcEnd],
                center: arc.center,
                radius: arc.radius,
                ccw: arc.ccw,
            })
            at = arcEnd
        } else {
            elements.push({type: 'line', start: path[at], end: path[lineEnd]})
            at = lineEnd
        }
    }

    return elements
}

// ─── what the caller asks for ────────────────────────────────────────────────

// Every piece of stock the grid still holds, as a closed contour of lines and
// arcs, largest first.
//
// Several pieces are an ordinary outcome, not an error: parting off leaves two,
// and a through groove leaves two. Which one the caller wants is the caller's
// business, so they all come back, each with the area and the bounding box that
// tell them apart.
export function stockOutline(grid, options = {}) {
    const tolerance = options.tolerance ?? 0.3

    return stitchLoops(boundaryEdges(grid))
        .map(loop => collapseCollinear(loop))
        .filter(loop => loop.length >= 3)
        .map(loop => {
            const area = shoelace(loop)
            return {
                elements: fitPrimitives(loop, tolerance),
                points: loop,
                area: Math.abs(area),
                bounds: boundsOf(loop),
            }
        })
        .filter(piece => piece.elements.length >= 3)
        .sort((a, b) => b.area - a.area)
}

function boundsOf(points) {
    let a0min = Infinity
    let a0max = -Infinity
    let a1min = Infinity
    let a1max = -Infinity
    points.forEach(p => {
        if (p[0] < a0min) a0min = p[0]
        if (p[0] > a0max) a0max = p[0]
        if (p[1] < a1min) a1min = p[1]
        if (p[1] > a1max) a1max = p[1]
    })
    return {a0min, a0max, a1min, a1max}
}

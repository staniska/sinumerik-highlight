'use babel'

// Material-trace core: what is left of the blank, and what the tool sweeps.
//
// No `View`, no `parseData`. The integration layer converts canvas elements
// into the plain `[a0, a1]` point arrays used here, and that separation is the
// whole point: this is the geometry, and geometry with a sign error draws a
// picture that looks entirely plausible. It has to be unit-testable.
//
// See docs/material-trace-plan.md. The short version:
//
//   Material is stored as columns along the stepping axis (Z on a lathe), each
//   holding the radial intervals where material remains. Exact along the
//   radial axis — which is the diameter, the number that matters — and
//   discretised only along the axial one. Memory therefore does not depend on
//   the radial extent at all, which is what makes a 4000 x 20000 mm part
//   possible where a 2D raster would need gigabytes.
//
// Axis naming is deliberately neutral: `a0` is the axial (stepping) axis and
// `a1` the radial one. For G18 the caller maps them to Z and X.
//
// Everything here works in radii, because `parseData.canvas` does:
// `primitives.js:1219` halves X at the tokenizer while DIAMON is active. Only
// the eventual readout to the user has to double it back into a diameter.

// Two Float64 bounds per interval. Float64 rather than Float32 on purpose:
// Float32 carries ~7 significant digits, so at X = 2000 mm its resolution is
// about 1e-4 mm — below any machining tolerance, but it would quietly make
// "exact along the radial axis" untrue. The cost is in `bytesPerColumn`, and
// `pickPitch` spends it as it finds it.
export const BYTES_PER_INTERVAL = 16

// A column holds one interval for anything turnable: material at a given Z is
// a single radial span (solid bar, tube, bore). It can split transiently
// mid-pass, when the swept region does not reach the outer boundary in that
// particular column although it does in its neighbours. Four is room for that
// without pretending to model sealed internal cavities, which turning cannot
// produce anyway.
export const DEFAULT_MAX_INTERVALS = 4

// Finer than this buys nothing: it is already an order below the tolerances
// these programs are written to, and the cost is linear in 1/pitch for both
// memory and time.
export const MIN_PITCH = 0.01

export function bytesPerColumn(maxIntervals = DEFAULT_MAX_INTERVALS) {
    return maxIntervals * BYTES_PER_INTERVAL + 1   // + the Uint8 interval count
}

// Largest pitch that is still worth having, given a memory budget.
//
// Both memory and CPU scale as 1/pitch, so this one dial governs both — unlike
// a raster, where memory and area fills both grow as 1/pitch².
export function pickPitch(axialExtent, budgetBytes, options = {}) {
    const maxIntervals = options.maxIntervals ?? DEFAULT_MAX_INTERVALS
    const minPitch = options.minPitch ?? MIN_PITCH
    if (!(axialExtent > 0) || !(budgetBytes > 0)) return minPitch

    const affordable = Math.max(1, Math.floor(budgetBytes / bytesPerColumn(maxIntervals)))
    return Math.max(minPitch, axialExtent / affordable)
}

export function createGrid(options) {
    const {min, max, pitch} = options
    const maxIntervals = options.maxIntervals ?? DEFAULT_MAX_INTERVALS

    if (!(pitch > 0)) throw new Error('materialTrace: pitch must be positive')
    if (!(max > min)) throw new Error('materialTrace: max must exceed min')

    const columns = Math.max(1, Math.ceil((max - min) / pitch))

    return {
        min,
        max: min + columns * pitch,     // snapped up to a whole number of columns
        pitch,
        columns,
        maxIntervals,
        starts: new Float64Array(columns * maxIntervals),
        ends: new Float64Array(columns * maxIntervals),
        counts: new Uint8Array(columns),
        // Largest radius of remaining material per column, or -Infinity when
        // the column is empty. Kept so that "could this shape reach any
        // material at all?" is a comparison of numbers rather than a scan
        // conversion — the difference between sweeping a 70 mm holder over 350
        // columns and rejecting it outright.
        maxRadius: new Float64Array(columns).fill(-Infinity),
        // Columns that needed more intervals than the grid can hold. Not an
        // error — see `setSpans` for what is done instead — but worth
        // surfacing, because it means the stored profile is coarser than the
        // geometry that produced it.
        overflows: 0,
    }
}

// Column holding this axial coordinate, or -1 when outside the grid.
export function columnIndex(grid, a0) {
    if (a0 < grid.min || a0 >= grid.max) return -1
    return Math.min(grid.columns - 1, Math.floor((a0 - grid.min) / grid.pitch))
}

// Columns are sampled at their centre: a feature thinner than the pitch along
// the axial direction can fall between two samples and be missed. That is the
// pitch's own limitation, not an extra one.
export function columnCenter(grid, i) {
    return grid.min + (i + 0.5) * grid.pitch
}

export function getSpans(grid, i) {
    if (i < 0 || i >= grid.columns) return []
    const base = i * grid.maxIntervals
    const out = []
    for (let k = 0; k < grid.counts[i]; k++) {
        out.push([grid.starts[base + k], grid.ends[base + k]])
    }
    return out
}

// Replace a column's intervals. Input must be sorted and disjoint — `union`
// produces exactly that.
//
// When there are more intervals than the column can hold, the SMALLEST GAPS
// are closed until they fit. That direction is chosen deliberately: closing a
// gap keeps material that is really air, so the picture shows leftover stock
// that is not there. The opposite — dropping an interval — would show cleared
// space where metal remains, which is the unsafe way to be wrong.
export function setSpans(grid, i, spans) {
    if (i < 0 || i >= grid.columns) return

    let fitted = spans
    if (fitted.length > grid.maxIntervals) {
        fitted = fitted.map(s => [s[0], s[1]])
        grid.overflows++
        while (fitted.length > grid.maxIntervals) {
            let at = 0
            let smallest = Infinity
            for (let k = 0; k + 1 < fitted.length; k++) {
                const gap = fitted[k + 1][0] - fitted[k][1]
                if (gap < smallest) { smallest = gap; at = k }
            }
            fitted[at] = [fitted[at][0], fitted[at + 1][1]]
            fitted.splice(at + 1, 1)
        }
    }

    const base = i * grid.maxIntervals
    for (let k = 0; k < fitted.length; k++) {
        grid.starts[base + k] = fitted[k][0]
        grid.ends[base + k] = fitted[k][1]
    }
    grid.counts[i] = fitted.length
    grid.maxRadius[i] = fitted.length ? fitted[fitted.length - 1][1] : -Infinity
}

// Largest radius of material anywhere in a column range, or -Infinity when the
// whole range is empty. Bounds are clamped, so a caller may hand over a range
// that runs off the grid.
export function maxRadiusIn(grid, first, last) {
    const from = Math.max(0, first)
    const to = Math.min(grid.columns - 1, last)
    let max = -Infinity
    for (let i = from; i <= to; i++) {
        if (grid.maxRadius[i] > max) max = grid.maxRadius[i]
    }
    return max
}

// Bounding box of the region a polygon sweeps along a segment.
export function sweptBounds(polygon, from, to) {
    let a0min = Infinity
    let a0max = -Infinity
    let a1min = Infinity
    let a1max = -Infinity
    polygon.forEach(p => {
        if (p[0] < a0min) a0min = p[0]
        if (p[0] > a0max) a0max = p[0]
        if (p[1] < a1min) a1min = p[1]
        if (p[1] > a1max) a1max = p[1]
    })

    return {
        a0min: a0min + Math.min(from[0], to[0]),
        a0max: a0max + Math.max(from[0], to[0]),
        a1min: a1min + Math.min(from[1], to[1]),
        a1max: a1max + Math.max(from[1], to[1]),
    }
}

// Sort and merge a list of intervals into disjoint, ascending ones.
export function union(spans) {
    const sorted = spans
        .filter(s => s[1] > s[0])
        .map(s => [s[0], s[1]])
        .sort((a, b) => a[0] - b[0])
    if (!sorted.length) return []

    const out = [sorted[0]]
    for (let k = 1; k < sorted.length; k++) {
        const last = out[out.length - 1]
        if (sorted[k][0] <= last[1]) {
            if (sorted[k][1] > last[1]) last[1] = sorted[k][1]
        } else {
            out.push(sorted[k])
        }
    }
    return out
}

// Intervals present in both lists. Both must be sorted and disjoint, which is
// what `union` and `getSpans` produce.
//
// Used to ask the one question stage 5 exists for: of the material this element
// removed, how much of it was supposed to stay?
export function intersectSpans(a, b) {
    const out = []
    let i = 0
    let k = 0
    while (i < a.length && k < b.length) {
        const lo = Math.max(a[i][0], b[k][0])
        const hi = Math.min(a[i][1], b[k][1])
        if (hi > lo) out.push([lo, hi])
        if (a[i][1] < b[k][1]) i++
        else k++
    }
    return out
}

export function spansLength(spans) {
    return spans.reduce((sum, s) => sum + (s[1] - s[0]), 0)
}

// Remove [lo, hi] from a column. Returns the radial length actually removed,
// which is what makes a cut measurable in millimetres rather than only
// visible as a colour.
export function subtractSpan(grid, i, lo, hi) {
    if (i < 0 || i >= grid.columns || !(hi > lo)) return 0

    const spans = getSpans(grid, i)
    const kept = []
    let removed = 0

    spans.forEach(([s, e]) => {
        if (hi <= s || lo >= e) { kept.push([s, e]); return }   // untouched
        removed += Math.min(e, hi) - Math.max(s, lo)
        // A cut strictly inside an interval splits it in two — a bore seen in
        // one column while its neighbours still reach the outside.
        if (s < lo) kept.push([s, lo])
        if (hi < e) kept.push([hi, e])
    })

    if (removed > 0) setSpans(grid, i, kept)
    return removed
}

// How deeply [lo, hi] reaches into the material of a column, in millimetres.
//
// Returns a length rather than a boolean so a holder collision can be reported
// as "1.2 mm into the stock" instead of just "collision". Zero means clear.
export function overlapLength(grid, i, lo, hi) {
    if (i < 0 || i >= grid.columns || !(hi > lo)) return 0

    let overlap = 0
    getSpans(grid, i).forEach(([s, e]) => {
        const from = Math.max(s, lo)
        const to = Math.min(e, hi)
        if (to > from) overlap += to - from
    })
    return overlap
}

// Total remaining material, in square millimetres of the (axial, radial)
// section. Not a physical volume — a diagnostic that makes "exactly this much
// was removed" assertable.
export function totalArea(grid) {
    let sum = 0
    for (let i = 0; i < grid.columns; i++) {
        const base = i * grid.maxIntervals
        for (let k = 0; k < grid.counts[i]; k++) {
            sum += grid.ends[base + k] - grid.starts[base + k]
        }
    }
    return sum * grid.pitch
}

// ─── polygon scan conversion ─────────────────────────────────────────────────

// Radial intervals a closed polygon covers at one axial coordinate.
//
// `polygon` is an array of `[a0, a1]` points, implicitly closed. Crossings are
// counted with the even-odd rule, so a self-intersecting outline still gives a
// sane answer.
export function polygonSpansAt(polygon, at) {
    const n = polygon.length
    if (n < 3) return []

    const hits = []
    for (let i = 0; i < n; i++) {
        const p = polygon[i]
        const q = polygon[(i + 1) % n]
        const lo = Math.min(p[0], q[0])
        const hi = Math.max(p[0], q[0])

        // Half-open in the scan direction: a vertex belongs to the edge
        // starting at it and not to the one ending there, so a scan line
        // through a vertex yields one crossing rather than two or none. The
        // same rule drops edges parallel to the scan line, where `lo === hi`
        // and the interpolation would divide by zero.
        if (at < lo || at >= hi) continue

        const t = (at - p[0]) / (q[0] - p[0])
        hits.push(p[1] + t * (q[1] - p[1]))
    }

    if (hits.length < 2) return []
    hits.sort((a, b) => a - b)

    const spans = []
    for (let i = 0; i + 1 < hits.length; i += 2) {
        if (hits[i + 1] > hits[i]) spans.push([hits[i], hits[i + 1]])
    }
    return union(spans)
}

export function polygonAxialRange(polygon) {
    let min = Infinity
    let max = -Infinity
    polygon.forEach(p => {
        if (p[0] < min) min = p[0]
        if (p[0] > max) max = p[0]
    })
    return [min, max]
}

// Fill the grid from a closed profile — the blank, or the finished part when
// the reference for gouges is being built.
export function seedFromPolygon(grid, polygon) {
    for (let i = 0; i < grid.columns; i++) {
        setSpans(grid, i, polygonSpansAt(polygon, columnCenter(grid, i)))
    }
}

// ─── sweep of an outline along a segment ─────────────────────────────────────

// Decompose the region swept by `polygon` moving from `from` to `to`.
//
// The swept region is the Minkowski sum P ⊕ [0, d]. For a polygon that equals
// P at the start position plus every boundary edge dragged into a
// parallelogram:
//
//     P ⊕ [0,d] = P ∪ (∂P ⊕ [0,d])
//
// (for x = p + t·d in the sum, take the smallest s with x − s·d ∈ P: either
// s = 0 and x ∈ P, or x − s·d lies on ∂P because just short of s it is outside)
//
// so the union of those pieces is exact, not an approximation — no sampling
// along the path, and no need for the outline to be convex. The copy at the end
// position is added too; it is redundant but free, and it makes a zero-length
// move behave.
export function sweptComponents(polygon, from, to) {
    if (polygon.length < 3) return []

    const shift = (poly, by) => poly.map(p => [p[0] + by[0], p[1] + by[1]])
    const components = []

    const push = poly => {
        const [min, max] = polygonAxialRange(poly)
        components.push({polygon: poly, min, max})
    }

    push(shift(polygon, from))
    push(shift(polygon, to))

    const moved = from[0] !== to[0] || from[1] !== to[1]
    if (moved) {
        const n = polygon.length
        for (let i = 0; i < n; i++) {
            const p = polygon[i]
            const q = polygon[(i + 1) % n]
            push([
                [p[0] + from[0], p[1] + from[1]],
                [q[0] + from[0], q[1] + from[1]],
                [q[0] + to[0], q[1] + to[1]],
                [p[0] + to[0], p[1] + to[1]],
            ])
        }
    }

    return components
}

export function componentsSpansAt(components, at) {
    const spans = []
    components.forEach(c => {
        if (at < c.min || at >= c.max) return     // cheap reject before scanning
        polygonSpansAt(c.polygon, at).forEach(s => spans.push(s))
    })
    return union(spans)
}

export function componentsAxialRange(components) {
    let min = Infinity
    let max = -Infinity
    components.forEach(c => {
        if (c.min < min) min = c.min
        if (c.max > max) max = c.max
    })
    return [min, max]
}

// Walk the columns the sweep touches, handing each one its radial spans.
//
// `apply(columnIndex, spans)` decides what the sweep means: subtract them for a
// cutting section, test them against the material for a holder. That choice is
// the caller's because the two need opposite things from the same geometry —
// and the holder test has to happen BEFORE the cut of the same step is
// subtracted, which only a sequential caller can arrange.
//
// `accept(column)`, when given, is asked before a column is scan-converted at
// all. That is where the cost is — converting a 70 mm holder outline over 350
// columns — so a caller that can rule a column out by a cheaper test (see
// `maxRadiusIn`) saves the whole conversion rather than just the work after it.
//
// Returns how many columns were visited.
export function sweepSegment(grid, polygon, from, to, apply, accept = null) {
    const components = sweptComponents(polygon, from, to)
    if (!components.length) return 0

    const [min, max] = componentsAxialRange(components)

    // Clamp to the grid, but keep the column containing `min` even when the
    // whole sweep is narrower than one pitch: a move shorter than the pitch
    // still removes material.
    let first = Math.floor((min - grid.min) / grid.pitch)
    let last = Math.floor((max - grid.min) / grid.pitch)
    if (first < 0) first = 0
    if (last > grid.columns - 1) last = grid.columns - 1

    let visited = 0
    for (let i = first; i <= last; i++) {
        if (accept && !accept(i)) continue
        const spans = componentsSpansAt(components, columnCenter(grid, i))
        if (!spans.length) continue
        apply(i, spans)
        visited++
    }
    return visited
}

// ─── reference-point path (C_P) ──────────────────────────────────────────────

// Where the tool's reference point travels while the programmed point travels
// from `from` to `to`.
//
// Under G40 the programmed path IS the reference point, so the two coincide —
// including the case the user cares about most, where the compensation was
// worked out by hand and the drawn line runs inside the part. The painted
// boundary comes from the outline placed at this point, never from the line
// itself.
//
// Under G41/G42 the programmed path is the finished surface and the nose circle
// rolls along it: the nose centre sits one nose radius off to the compensation
// side, and the reference point is that centre minus wherever the centre sits
// in the file's own frame.
//
//     C_P = programmed + r·n − c
//
// `nose` is `{center: [a0, a1], radius}` read from the outline itself, not from
// declared numbers — the file is drawn in the reference-point frame, so the
// offset is already in its geometry. A tool with no nose arc (theoretically
// sharp) gives radius 0 and centre at the origin, and the formula degenerates
// to the programmed path, which is correct.
//
// The side of `n` follows the convention already shipped in `offn.js:44`:
// G41 is +90° from the direction of travel in the (a0, a1) axis order. Matching
// the OFFN implementation rather than reasoning it out afresh means the painted
// side agrees with the offsetting the user already sees and trusts.
//
// `ramp` handles the approach and departure blocks, where the control eases the
// correction in or out: 'in' goes from no offset to full across the block,
// 'out' the reverse. A linear ramp — NORM/KONT and G450/G451 are deliberately
// not reproduced.
export function referencePointSegment(from, to, options = {}) {
    const compensation = options.compensation ?? 'none'
    const ramp = options.ramp ?? null
    const nose = options.nose ?? null

    const side = compensation === 'G41' ? 1 : compensation === 'G42' ? -1 : 0
    if (!side || !nose) return {from: [from[0], from[1]], to: [to[0], to[1]]}

    const d0 = to[0] - from[0]
    const d1 = to[1] - from[1]
    const len = Math.hypot(d0, d1)

    // A block with no movement has no direction to take a normal from, so
    // there is no meaningful offset to apply to it. It also sweeps nothing.
    if (!(len > 0)) return {from: [from[0], from[1]], to: [to[0], to[1]]}

    const radius = nose.radius ?? 0
    const center = nose.center ?? [0, 0]

    // +90° from the direction of travel, i.e. (-d1, d0) normalised.
    const full = [
        side * radius * (-d1 / len) - center[0],
        side * radius * (d0 / len) - center[1],
    ]

    const atStart = ramp === 'in' ? 0 : 1
    const atEnd = ramp === 'out' ? 0 : 1

    return {
        from: [from[0] + full[0] * atStart, from[1] + full[1] * atStart],
        to: [to[0] + full[0] * atEnd, to[1] + full[1] * atEnd],
    }
}

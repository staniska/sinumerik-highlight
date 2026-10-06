'use babel'

// Driving the material-trace core over a program's canvas elements.
//
// Owns the grid, advances it as slow debug reveals elements, and turns what is
// left into rectangles a renderer can draw. The geometry itself lives in
// `materialTrace.js` and knows nothing about canvas elements; this module is
// the translation layer, and it imports only `View` and that core so it stays
// unit-testable.
//
// See docs/material-trace-plan.md, stage 4.

import View from './sinumerik'
import {
    createGrid,
    pickPitch,
    seedFromPolygon,
    getSpans,
    subtractSpan,
    sweepSegment,
    referencePointSegment,
    polygonAxialRange,
} from './materialTrace'

// Two grids are kept — the blank as seeded and the material as it stands — so
// that what the tool removed is their difference. Half the budget each.
export const MATERIAL_TRACE_BUDGET_BYTES = 30e6

// Index of an axis name inside the `[X, Y, Z]` arrays that `contourElements`
// entries carry (`getCoordinatesInBase` output).
const AXIS_INDEX = {X: 0, Y: 1, Z: 2}

// Columns need a privileged axis, so only the lathe planes work. G17 would need
// a raster instead and is out of scope (see the plan).
const PLANE_AXES = {G18: ['Z', 'X'], G19: ['Y', 'Z']}

const isGeometry = el => !!el && typeof el.type === 'string' && /^G[01]$/.test(el.type)

let state = null

export function resetMaterialTrace() {
    state = null
}

export function materialTraceState() {
    return state
}

// Closed outline of a canvas-element path in the two named axes: the first
// element's start, then every element's end. Same construction the WebGL blank
// fill uses, so the painted material lines up with the drawn blank exactly.
export function elementsToPolygon(elements, a0, a1) {
    const segs = (elements ?? []).filter(isGeometry)
    if (!segs.length) return []

    const points = [[segs[0][`${a0}_start`] ?? 0, segs[0][`${a1}_start`] ?? 0]]
    segs.forEach(el => points.push([el[a0] ?? 0, el[a1] ?? 0]))
    return points
}

// Outline of one tool section, in the two named axes.
export function sectionToPolygon(section, a0, a1) {
    return elementsToPolygon(section?.shapes, a0, a1)
}

// The nose circle, read from the outline rather than from declared numbers: the
// file is drawn in the reference-point frame, so the offset from that point to
// the nose centre is already in its geometry.
//
// The nose is the smallest arc of the cutting section — on a turning insert it
// is the tightest curve by construction. A tool drawn with straight lines only
// (theoretically sharp) has no nose, and the compensation then degenerates to
// the programmed path, which is correct.
export function noseFromSections(sections, a0, a1) {
    const i0 = AXIS_INDEX[a0]
    const i1 = AXIS_INDEX[a1]

    let best = null
    ;(sections ?? []).forEach(section => {
        if (!section || section.role !== 'cut') return
        ;(section.elements ?? []).forEach(el => {
            if (!el || el.type !== 'arc') return
            if (!Number.isFinite(el.radius) || !(el.radius > 0)) return
            if (!Array.isArray(el.center)) return
            if (!best || el.radius < best.radius) best = el
        })
    })

    if (!best) return null
    return {center: [best.center[i0] ?? 0, best.center[i1] ?? 0], radius: best.radius}
}

// What compensation state an element really runs under.
//
// `offn()` rewrites `toolRadiusCompensation` on the transition blocks, replacing
// G41/G42 with 'Approach' / 'Departure' — and on the blocks it synthesises,
// with 'AutoInsert' / 'offn_loop'. The side is lost in all four cases, so it is
// recovered from the nearest neighbour that still carries it. Without this a
// compensated finishing pass would be swept as if uncompensated, placing the
// outline a nose radius away from where the tool really was.
export function resolveCompensation(elements, index) {
    const label = elements[index]?.toolRadiusCompensation
    if (label === 'G41' || label === 'G42') return {compensation: label, ramp: null}

    const sideAt = (from, step) => {
        for (let i = from; i >= 0 && i < elements.length; i += step) {
            const at = elements[i]?.toolRadiusCompensation
            if (at === 'G41' || at === 'G42') return at
            if (at === 'G40') return null
        }
        return null
    }

    if (label === 'Approach') {
        const side = sideAt(index + 1, 1)
        return side ? {compensation: side, ramp: 'in'} : {compensation: 'none', ramp: null}
    }
    if (label === 'Departure') {
        const side = sideAt(index - 1, -1)
        return side ? {compensation: side, ramp: 'out'} : {compensation: 'none', ramp: null}
    }
    if (label === 'AutoInsert' || label === 'offn_loop') {
        const side = sideAt(index - 1, -1)
        return side ? {compensation: side, ramp: null} : {compensation: 'none', ramp: null}
    }

    return {compensation: 'none', ramp: null}
}

// How far a tool outline reaches along the axial axis, used as the margin the
// grid needs beyond the trajectory itself: the holder extends tens of
// millimetres behind the tip, and a grid cut to the path would clip it.
function toolAxialReach(elements, a0, a1) {
    const cache = View.sinumerikView.toolGeometry ?? {}
    const seen = new Set()
    let reach = 0

    elements.forEach(el => {
        const path = el?.toolDef?.path
        if (!path || seen.has(path)) return
        seen.add(path)
        ;(cache[path]?.sections ?? []).forEach(section => {
            const poly = sectionToPolygon(section, a0, a1)
            if (poly.length < 3) return
            const [min, max] = polygonAxialRange(poly)
            reach = Math.max(reach, Math.abs(min), Math.abs(max))
        })
    })

    return reach
}

function axialRange(points) {
    let min = Infinity
    let max = -Infinity
    points.forEach(v => {
        if (v < min) min = v
        if (v > max) max = v
    })
    return [min, max]
}

function buildState(elements) {
    const pd = View.sinumerikView.parseData
    const machine = View.sinumerikView.programmData?.[pd?.filename]?.machine

    // Only the lathe planes have a privileged axis for the columns to run
    // along. Reported rather than silently skipped: a feature whose job is to
    // show what was cut must not look like "nothing was cut".
    const plane = machine?.machineType === 'Lathe' ? 'G18' : null
    if (!plane) return {status: 'notLathe', grid: null}

    const [a0, a1] = PLANE_AXES[plane]

    const blankPolygon = elementsToPolygon(pd?.blank, a0, a1)
    if (blankPolygon.length < 3) return {status: 'noBlank', grid: null, a0, a1}

    const [blankMin, blankMax] = polygonAxialRange(blankPolygon)
    const [pathMin, pathMax] = axialRange(
        elements.filter(isGeometry).flatMap(el => [el[`${a0}_start`] ?? 0, el[a0] ?? 0])
    )

    const margin = toolAxialReach(elements, a0, a1) + 1
    const min = Math.min(blankMin, Number.isFinite(pathMin) ? pathMin : blankMin) - margin
    const max = Math.max(blankMax, Number.isFinite(pathMax) ? pathMax : blankMax) + margin

    // Half the budget each, because the seeded blank is kept alongside the
    // working copy so the removed region is their difference.
    const pitch = pickPitch(max - min, MATERIAL_TRACE_BUDGET_BYTES / 2)

    const grid = createGrid({min, max, pitch})
    const seed = createGrid({min, max, pitch})
    seedFromPolygon(grid, blankPolygon)
    seedFromPolygon(seed, blankPolygon)

    return {
        status: 'ok',
        grid,
        seed,
        a0,
        a1,
        source: elements,
        appliedUpTo: 0,
        skippedPlane: 0,
        skippedTool: 0,
        removed: 0,
        // Columns the sweep has ever reached. Removed material can only exist
        // inside this range, and scanning the whole grid instead would mean
        // walking 1.4 million columns every frame on a 20 m part.
        touchedMin: Infinity,
        touchedMax: -Infinity,
        rects: null,            // cached, invalidated by `rectsAt`
        rectsAt: -1,
    }
}

// Sweep one element's cutting sections out of the material.
function applyElement(st, elements, index) {
    const el = elements[index]
    if (!isGeometry(el)) return

    // An element made in another plane cannot be projected onto these columns.
    if (el.workPlane && !PLANE_AXES[el.workPlane]) { st.skippedPlane++; return }

    const path = el.toolDef?.path
    const geometry = path ? View.sinumerikView.toolGeometry?.[path] : null
    if (!geometry?.sections?.length) { st.skippedTool++; return }

    const {a0, a1} = st
    const nose = noseFromSections(geometry.sections, a0, a1)
    const {compensation, ramp} = resolveCompensation(elements, index)

    const cp = referencePointSegment(
        [el[`${a0}_start`] ?? 0, el[`${a1}_start`] ?? 0],
        [el[a0] ?? 0, el[a1] ?? 0],
        {compensation, ramp, nose},
    )

    geometry.sections.forEach(section => {
        if (section.role !== 'cut') return
        const poly = sectionToPolygon(section, a0, a1)
        if (poly.length < 3) return
        sweepSegment(st.grid, poly, cp.from, cp.to, (column, spans) => {
            spans.forEach(([lo, hi]) => {
                const cut = subtractSpan(st.grid, column, lo, hi)
                if (cut <= 0) return
                st.removed += cut
                if (column < st.touchedMin) st.touchedMin = column
                if (column > st.touchedMax) st.touchedMax = column
            })
        })
    })
}

// Bring the material up to `limit` elements of `elements`.
//
// Rebuilds from the blank when the element array changes (a re-parse) or when
// the limit moves backwards (the animation restarted) — advancing is
// subtractive and cannot be undone.
export function advanceMaterialTrace(elements, limit) {
    if (!elements || !elements.length) return null

    if (!state || state.source !== elements || state.status !== 'ok') {
        state = buildState(elements)
        if (state.status !== 'ok') return state
    }
    if (limit < state.appliedUpTo) {
        state = buildState(elements)
        if (state.status !== 'ok') return state
    }

    const to = Math.min(limit, elements.length)
    for (let i = state.appliedUpTo; i < to; i++) applyElement(state, elements, i)
    state.appliedUpTo = to

    return state
}

// What the tool has removed, as rectangles in the (axial, radial) plane.
//
// Consecutive columns whose remaining material is identical are merged into one
// rectangle. Without that a 100 mm cut at a 0.01 mm pitch would be ten thousand
// quads per frame; with it, a plain cylindrical pass is a handful.
//
// Only the columns the sweep has reached are scanned, and the result is cached
// until something is cut again — a redraw that changes nothing (a pan, a zoom)
// then costs nothing.
export function materialTraceRects(epsilon = 1e-9) {
    const st = state
    if (!st || st.status !== 'ok') return []
    if (st.rects && st.rectsAt === st.appliedUpTo) return st.rects

    const {grid, seed} = st
    const rects = []
    let run = null          // {spans, firstColumn, lastColumn}

    const same = (a, b) => a.length === b.length
        && a.every((s, i) => Math.abs(s[0] - b[i][0]) < epsilon && Math.abs(s[1] - b[i][1]) < epsilon)

    const flush = () => {
        if (!run) return
        const a0lo = grid.min + run.firstColumn * grid.pitch
        const a0hi = grid.min + (run.lastColumn + 1) * grid.pitch
        run.spans.forEach(([lo, hi]) => rects.push({a0lo, a0hi, a1lo: lo, a1hi: hi}))
        run = null
    }

    const first = Math.max(0, st.touchedMin)
    const last = Math.min(grid.columns - 1, st.touchedMax)

    for (let i = first; i <= last; i++) {
        const removedHere = subtractSpansFrom(getSpans(seed, i), getSpans(grid, i))
        if (!removedHere.length) { flush(); continue }

        if (run && same(run.spans, removedHere)) {
            run.lastColumn = i
        } else {
            flush()
            run = {spans: removedHere, firstColumn: i, lastColumn: i}
        }
    }
    flush()

    st.rects = rects
    st.rectsAt = st.appliedUpTo
    return rects
}

// `was` minus `is` — the spans present in the blank and no longer in the
// material. Both are sorted and disjoint.
export function subtractSpansFrom(was, is) {
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

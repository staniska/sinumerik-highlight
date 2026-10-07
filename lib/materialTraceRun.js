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
    setSpans,
    subtractSpan,
    sweepSegment,
    referencePointSegment,
    polygonAxialRange,
    columnCenter,
    columnIndex,
    union,
    maxRadiusIn,
    sweptBounds,
    intersectSpans,
    spansLength,
} from './materialTrace'

// Two grids are kept — the blank as seeded and the material as it stands — so
// that what the tool removed is their difference. Half the budget each.
export const MATERIAL_TRACE_BUDGET_BYTES = 30e6

// Column pitch along the axial axis, in mm.
//
// Cost per element is linear in 1/pitch — the sweep visits one column per pitch
// of its axial extent — so this is the dial that decides whether the animation
// keeps up. Measured on a 2000-element roughing program: 7.8 ms per element at
// 0.01 mm, which froze the UI, against 0.4 ms at 0.2 mm. The radial direction
// stays exact either way, and the radial direction is the diameter.
export const MATERIAL_TRACE_PITCH = 0.2

// Memory for the rewind keyframes. Scrubbing the progress bar backwards (a
// click, or ArrowLeft) is a first-class interaction, and advancing is
// subtractive, so going back means restoring an earlier state and replaying the
// remainder. Without keyframes that replay starts from the blank every time.
// Memory for the rewind keyframes, and how many of them to aim for.
//
// Keyframes are run-length encoded rather than copied whole, because a turned
// profile is piecewise constant along the axis — the same property that collapses
// a whole cylindrical pass into one painted rectangle. A full copy of the grid
// costs 65 bytes per column, so on a 12 m part at the working pitch it is near
// 4 MB and only three of them fit; the interval between them then collapses to
// tens of thousands of elements and every scrub replays that many. Measured at
// 29 seconds. Encoded, the same keyframe is kilobytes and hundreds fit.
//
// The count is what the interval is derived from; the budget is the backstop,
// and a profile with no runs to collapse (every column different) simply thins
// back towards the old behaviour instead of eating memory.
export const SNAPSHOT_BUDGET_BYTES = 48e6
export const MAX_SNAPSHOTS = 2048

// What share of the sweeping may be spent on making keyframes.
//
// A keyframe costs one pass over every column of the grid; what it buys is not
// having to replay the elements it stands in for. Spacing them by element count
// alone ignored both sides of that: on a part long enough for the grid to run to
// thousands of columns, keyframes came to cost about as much as the cut they
// were shortening — half of the whole forward pass, measured.
//
// The share also bounds the other direction without any further rule: a gap is
// only allowed to grow while keyframes are unaffordable, which is while the
// elements in it are cheap, so replaying one costs at most about 1/share of a
// single keyframe.
export const KEYFRAME_WORK_SHARE = 0.25

// Undo log for stepping back one element at a time, which is what ArrowLeft
// does and what it does repeatedly.
//
// Keyframes alone make a single step cost a replay from the nearest one — up to
// `snapshotEvery` elements — and ten keypresses pay that ten times over. The log
// records what each element changed, so undoing it is exactly as much work as
// doing it was. Counted in changed columns rather than bytes, because that is
// what a record actually costs.
export const UNDO_BUDGET_ENTRIES = 400000

// Collided spans kept for painting. A sound program collides nowhere, so this is
// generous; a program that collides everywhere stops being painted in detail
// long before the memory matters, and the depth report keeps working.
export const COLLISION_SPAN_BUDGET = 200000

// After this many colliding blocks the holder check stops.
//
// A holder that strikes on every block means its outline is wrong — most often a
// ROLE:body section drawn below the cutting tip, where a real holder is ground
// clear of it. By then the report has said so hundreds of times over, and
// carrying on costs ten times the rest of the trace: measured at 4.8 ms per
// element against 0.5 for a sound tool. Stopping is recorded, so stage 7 can say
// that collisions are no longer being checked rather than leave it looking clean.
export const COLLISION_GIVEUP = 500

// How far the painted boundary may sit from the programmed path on a
// compensated block, in mm, before it is reported.
//
// The error this is hunting is the tool file's zero drawn somewhere other than
// the reference point the control compensates about — for cutting-edge
// positions 1…8 that is out by `r·√2`, well over half a millimetre on a 0.4 mm
// nose. Nothing of that order can arise by accident: the sweep is exact along
// the radial axis and columns are scanned along a line, so a correctly drawn
// tool lands within a thousandth even on a steep taper.
export const OFF_CONTOUR_TOLERANCE = 0.02

// Index of an axis name inside the `[X, Y, Z]` arrays that `contourElements`
// entries carry (`getCoordinatesInBase` output).
const AXIS_INDEX = {X: 0, Y: 1, Z: 2}

// Columns need a privileged axis, so only the lathe planes work. G17 would need
// a raster instead and is out of scope (see the plan).
const PLANE_AXES = {G18: ['Z', 'X'], G19: ['Y', 'Z']}

const isGeometry = el => !!el && typeof el.type === 'string' && /^G[01]$/.test(el.type)

// What counts as a collider — the one place that decides it.
//
// `ignore` is decoration. Everything that is not a cutting edge collides,
// including a section with no ROLE: at all, which is why the default is `body`:
// a forgotten role then shows a false collision, visible and fixable, rather
// than a false all-clear in a feature whose purpose is catching crashes.
//
// Leaving `cut` out is an optimisation rather than a rule: a cutting section's
// hits are a subset of its own sweep, which `recordCollision` subtracts, so they
// would cancel out anyway. Not sweeping them twice is simply cheaper.
const isCollider = section => !!section && section.role !== 'cut' && section.role !== 'ignore'

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
//
// Cached on the section, because this is asked once per cutting section per
// element and the answer never changes: rebuilding the point array each time
// meant a fresh array per edge for every block of the program.
export function sectionToPolygon(section, a0, a1) {
    if (!section) return []

    const key = `_polygon_${a0}${a1}`
    if (section[key]) return section[key]

    const polygon = elementsToPolygon(section.shapes, a0, a1)
    section[key] = polygon
    return polygon
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

    // The finished part: material that must survive. Without it a gouge cannot
    // be told from a legitimate cut, and that absence has to be visible rather
    // than read as "no gouges".
    const partPolygon = elementsToPolygon(pd?.contour, a0, a1)

    const [blankMin, blankMax] = polygonAxialRange(blankPolygon)
    const [pathMin, pathMax] = axialRange(
        elements.filter(isGeometry).flatMap(el => [el[`${a0}_start`] ?? 0, el[a0] ?? 0])
    )

    const margin = toolAxialReach(elements, a0, a1) + 1
    const min = Math.min(blankMin, Number.isFinite(pathMin) ? pathMin : blankMin) - margin
    const max = Math.max(blankMax, Number.isFinite(pathMax) ? pathMax : blankMax) + margin

    // A third of the budget each: the working material, the blank it was seeded
    // from (their difference is what the tool removed) and the finished part.
    // The budget only coarsens the pitch further on a part too long to hold at
    // the target one.
    const pitch = pickPitch(max - min, MATERIAL_TRACE_BUDGET_BYTES / 3, {minPitch: MATERIAL_TRACE_PITCH})

    const grid = createGrid({min, max, pitch})
    const seed = createGrid({min, max, pitch})
    seedFromPolygon(grid, blankPolygon)
    seedFromPolygon(seed, blankPolygon)

    // Immutable, so it needs no keyframe and no undo record.
    const part = partPolygon.length >= 3 ? createGrid({min, max, pitch}) : null
    if (part) seedFromPolygon(part, partPolygon)

    const st = {
        status: 'ok',
        // X is held in radii throughout (primitives.js:1219 halves it at the
        // tokenizer while DIAMON is active), so a position shown to the user has
        // to be doubled back. Depths stay radial and are labelled as such: a
        // factor of two in a gouge report is exactly the kind of thing that
        // destroys trust in it.
        diamon: !!pd?.diamon,
        grid,
        seed,
        part,
        partKnown: !!part,
        // Elements that cut into the finished part, worst first by depth. Part
        // of the state, so keyframes carry it and undo unwinds it.
        gouges: [],
        // Where the holder met material that was still there. Unlike gouges
        // these cannot be derived after the fact: the material a holder hit may
        // be legitimately gone a moment later, so the moment has to be kept.
        collisions: [],
        collisionSpans: 0,
        collisionSpansTruncated: false,
        collisionRects: null,
        collisionRectsAt: -1,
        // Blocks whose painted boundary did not land on the path they
        // programmed. See `checkAgainstProgrammedPath`.
        offContour: [],
        a0,
        a1,
        source: elements,
        appliedUpTo: 0,
        skippedPlane: 0,
        skippedTool: 0,
        // Elements actually swept. Alongside the skip counters it says how much
        // of the program the trace really accounts for, and it is what makes
        // the keyframe shortcuts observable: a jump should sweep a fraction of
        // the program, not all of it again.
        swept: 0,
        removed: 0,
        // Columns the sweep has ever reached. Removed material can only exist
        // inside this range, and scanning the whole grid instead would mean
        // walking 1.4 million columns every frame on a 20 m part.
        touchedMin: Infinity,
        touchedMax: -Infinity,
        rects: null,            // cached, invalidated by `rectsAt`
        rectsAt: -1,
        gougeRects: null,
        gougeRectsAt: -1,
        snapshots: [],
        snapshotEvery: 1,       // set below, once the grid size is known
        // Running total of what the keyframes hold, kept rather than re-summed.
        bytes: 0,
        // Work done, in columns, by sweeping and by keyframing. Counted in
        // columns rather than milliseconds so that the same program keyframes in
        // the same places on every machine, and a test can pin them.
        sweptColumns: 0,
        keyframeColumns: 0,
        // A contiguous suffix of the applied elements, ending exactly at
        // `appliedUpTo`. Cleared whenever a keyframe is restored, since the
        // position it would undo from no longer holds.
        undo: [],
        undoEntries: 0,
    }

    // One keyframe every `snapshotEvery` elements. The worst-case scrub then
    // replays that many, not the whole program — and because keyframes are
    // encoded rather than copied, that interval stays short even on a part long
    // enough for the grid itself to run to megabytes.
    st.snapshotEvery = Math.max(1, Math.ceil(elements.length / MAX_SNAPSHOTS))
    takeSnapshot(st)            // the blank itself, so any rewind has a floor

    return st
}

// Do two columns hold exactly the same material?
function sameColumn(grid, a, b) {
    const n = grid.counts[a]
    if (grid.counts[b] !== n) return false
    const ba = a * grid.maxIntervals
    const bb = b * grid.maxIntervals
    for (let k = 0; k < n; k++) {
        if (grid.starts[ba + k] !== grid.starts[bb + k]) return false
        if (grid.ends[ba + k] !== grid.ends[bb + k]) return false
    }
    return true
}

// The grid as runs of identical columns. What makes a keyframe affordable.
function encodeGrid(grid) {
    const runs = []
    let i = 0
    while (i < grid.columns) {
        let j = i + 1
        while (j < grid.columns && sameColumn(grid, i, j)) j++

        const n = grid.counts[i]
        const base = i * grid.maxIntervals
        const bounds = new Float64Array(n * 2)
        for (let k = 0; k < n; k++) {
            bounds[2 * k] = grid.starts[base + k]
            bounds[2 * k + 1] = grid.ends[base + k]
        }
        runs.push({len: j - i, n, bounds})
        i = j
    }
    return runs
}

function decodeGrid(grid, runs) {
    let i = 0
    runs.forEach(run => {
        for (let r = 0; r < run.len; r++, i++) {
            const base = i * grid.maxIntervals
            for (let k = 0; k < run.n; k++) {
                grid.starts[base + k] = run.bounds[2 * k]
                grid.ends[base + k] = run.bounds[2 * k + 1]
            }
            grid.counts[i] = run.n
            grid.maxRadius[i] = run.n ? run.bounds[2 * run.n - 1] : -Infinity
        }
    })
}

// Rough but honest: the run objects plus the bounds they carry.
//
// Measured once, when the keyframe is made, and carried on it. Re-deriving it
// walks every run of every keyframe, and the budget is checked on every
// keyframe — so summing it afresh each time made the whole trace quadratic in
// the number of keyframes. It was 77% of the trace's entire running time, four
// times everything the sweep itself does.
function snapshotBytes(snap) {
    if (snap.bytes === undefined) {
        snap.bytes = snap.runs.reduce((n, run) => n + 24 + run.bounds.byteLength, 0)
    }
    return snap.bytes
}

function takeSnapshot(st) {
    const snap = {
        at: st.appliedUpTo ?? 0,
        runs: encodeGrid(st.grid),
        removed: st.removed ?? 0,
        gouges: (st.gouges ?? []).slice(),
        offContour: (st.offContour ?? []).slice(),
        collisions: (st.collisions ?? []).slice(),
        collisionSpans: st.collisionSpans ?? 0,
        collisionSpansTruncated: st.collisionSpansTruncated ?? false,
        touchedMin: st.touchedMin ?? Infinity,
        touchedMax: st.touchedMax ?? -Infinity,
    }
    st.snapshots.push(snap)
    st.bytes += snapshotBytes(snap)
    st.keyframeColumns += st.grid.columns

    const thinned = thinKeyframes(st.snapshots, st.snapshotEvery, st.bytes)
    st.snapshots = thinned.snapshots
    st.snapshotEvery = thinned.every
    st.bytes = thinned.bytes
}

// Over the cap or over the budget, drop every other keyframe and double the
// interval. The spread stays even and memory stays put, at the cost of a longer
// worst-case replay — the right thing to trade away last.
//
// Pure, and exported, because reaching either limit through `advanceMaterialTrace`
// takes tens of thousands of elements — the keyframes have to be worth making
// first (see `KEYFRAME_WORK_SHARE`) — and a test that slow would have bought
// coverage of the cap only, never of the byte budget.
//
// The byte total is re-summed only here, where the set actually changes, which on
// a long program happens a dozen times in all.
export function thinKeyframes(snapshots, every, bytes) {
    while (snapshots.length > MAX_SNAPSHOTS || bytes > SNAPSHOT_BUDGET_BYTES) {
        if (snapshots.length < 4) break
        snapshots = snapshots.filter((_, i) => i % 2 === 0)
        every *= 2
        bytes = snapshots.reduce((n, snap) => n + snapshotBytes(snap), 0)
    }
    return {snapshots, every, bytes}
}

// Is another keyframe worth what it costs? See `KEYFRAME_WORK_SHARE`.
function keyframeAffordable(st) {
    return st.keyframeColumns + st.grid.columns <= KEYFRAME_WORK_SHARE * st.sweptColumns
}

function restoreSnapshot(st, snap) {
    st.undo = []
    st.undoEntries = 0
    decodeGrid(st.grid, snap.runs)
    st.appliedUpTo = snap.at
    st.removed = snap.removed
    st.gouges = snap.gouges.slice()
    st.offContour = snap.offContour.slice()
    st.collisions = snap.collisions.slice()
    st.collisionSpans = snap.collisionSpans
    st.collisionSpansTruncated = snap.collisionSpansTruncated
    st.touchedMin = snap.touchedMin
    st.touchedMax = snap.touchedMax
    st.rects = null
    st.rectsAt = -1
    st.gougeRects = null
    st.gougeRectsAt = -1
    st.collisionRects = null
    st.collisionRectsAt = -1
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

    // One extra sweep per element is only worth paying when there is something
    // to collide with.
    const colliders = geometry.sections.filter(isCollider)
    st.hasBody = colliders.length > 0

    st.swept++

    const {a0, a1} = st
    const nose = noseFromSections(geometry.sections, a0, a1)
    const {compensation, ramp} = resolveCompensation(elements, index)

    // Only a fully compensated block leaves its own line: an approach or a
    // departure is partway through taking the correction up, by design.
    const side = (compensation === 'G41' || compensation === 'G42') && !ramp

    const cp = referencePointSegment(
        [el[`${a0}_start`] ?? 0, el[`${a1}_start`] ?? 0],
        [el[a0] ?? 0, el[a1] ?? 0],
        {compensation, ramp, nose},
    )

    // The holder is measured against the material as it stands before this
    // element's cut, and judged below once the block's cutting sweep is known.
    //
    // Note that measuring before or after the subtraction is in fact the same
    // answer: subtracting the cut SWEEP (see `recordCollision`) removes exactly
    // what the cut would have removed from the material. The ordering that does
    // matter is between elements, not inside one — a holder must never be
    // excused by a cut that comes later, and that is what processing elements in
    // sequence guarantees.
    const hit = colliders.length && st.collisions.length < COLLISION_GIVEUP
        ? collectBodyHits(st, colliders, cp)
        : null

    // First touch of a column in this element keeps its previous spans, so the
    // element can be undone without replaying anything.
    const before = new Map()
    const cutSwept = hit ? new Map() : null
    let removedHere = 0

    geometry.sections.forEach(section => {
        if (section.role !== 'cut') return
        const poly = sectionToPolygon(section, a0, a1)
        if (poly.length < 3) return

        // Reject columns that hold nothing this section could reach, before
        // they are scan-converted — the same test the holder uses, and it earns
        // as much here. A tool trails its own outline behind the cutting point:
        // on a pass of any length most of the columns it covers are the ones it
        // has already cut, where the material now stops at the very level the
        // outline's lowest point is at. The longer the outline, the larger that
        // share, and the cost of an element is otherwise its whole axial extent
        // divided by the pitch.
        const bounds = sweptBounds(poly, cp.from, cp.to)
        const reachesMaterial = column => st.grid.maxRadius[column] > bounds.a1min

        st.sweptColumns += sweepSegment(st.grid, poly, cp.from, cp.to, (column, spans) => {
            if (cutSwept) cutSwept.set(column, union((cutSwept.get(column) ?? []).concat(spans)))
            spans.forEach(([lo, hi]) => {
                if (!before.has(column)) before.set(column, getSpans(st.grid, column))
                const cut = subtractSpan(st.grid, column, lo, hi)
                if (cut <= 0) return
                removedHere += cut
                if (column < st.touchedMin) st.touchedMin = column
                if (column > st.touchedMax) st.touchedMax = column
            })
        }, reachesMaterial)
    })

    if (hit) recordCollision(st, el, index, hit, cutSwept)

    st.removed += removedHere
    if (before.size) recordUndo(st, index, before, removedHere)

    // A gouge is what this element took OUT OF THE FINISHED PART — never a
    // question about where its trajectory ran. Under hand-computed
    // compensation the programmed line legitimately runs inside the part on
    // every finishing block, so comparing the path with the contour would light
    // up the whole program. Only the swept material counts, and `before` says
    // exactly what this element swept.
    if (st.part && before.size) detectGouge(st, el, index, before)
    if (side && before.size) checkAgainstProgrammedPath(st, el, index, before, cp, side)
}

// Does the boundary this block left lie on the path it programmed?
//
// Under G41/G42 the control keeps the nose circle tangent to the programmed
// path, so the surface the block leaves behind IS that path. The outline is
// placed at the reference point and the offset to the nose comes from the
// file's own geometry — so if the file was drawn about a different point than
// the control compensates about, every painted boundary sits a constant
// distance off, and nothing else gives it away. No crash, no warning: the
// picture is simply wrong, and so is every gouge depth read off it.
//
// Checked against the PROGRAMMED path rather than the finished contour, which
// is what the plan asked for: a compensated block need not follow the contour
// at all — a roughing pass with compensation leaves stock on purpose — but it
// must always leave its own line.
function checkAgainstProgrammedPath(st, el, index, before, cp, side) {
    const {a0, a1} = st
    const from = [el[`${a0}_start`] ?? 0, el[`${a1}_start`] ?? 0]
    const to = [el[a0] ?? 0, el[a1] ?? 0]

    const da0 = to[0] - from[0]
    const da1 = to[1] - from[1]

    // A facing cut has no axial extent to interpolate along — the division
    // below would be by zero. Blocks that are merely short are already harmless,
    // because the slope term in the tolerance grows as they steepen; this is
    // about the degenerate case, and about not asking a column a question it
    // cannot answer.
    if (Math.abs(da0) < 2 * st.grid.pitch) return

    // Sampled from the middle of the block, where the swept region is fully
    // developed: at either end it is cut short by the outline's own extent, and
    // a column past the end would have the path extrapolated to reach it.
    const column = columnIndex(st.grid, (from[0] + to[0]) / 2)
    if (column < 0 || !before.has(column)) return

    const took = subtractSpansFrom(before.get(column), getSpans(st.grid, column))
    if (!took.length) return      // nothing was cut here, so nothing was left

    // The path's own radial value at the line this column is scanned on. Columns
    // are sampled along their centre line rather than averaged across their
    // width, so the axial pitch does not enter the comparison at all and the
    // tolerance needs no allowance for slope — measured residual on a 4:1 taper
    // is 0.0002 mm. Taking the block's end value instead would be out by the
    // slope times half the block, which is what a slope-scaled tolerance would
    // then have had to hide.
    const at = columnCenter(st.grid, column)
    const expected = from[1] + da1 * ((at - from[0]) / da0)

    let deviation = Infinity
    took.forEach(([lo, hi]) => {
        deviation = Math.min(deviation, Math.abs(lo - expected), Math.abs(hi - expected))
    })
    if (!(deviation > OFF_CONTOUR_TOLERANCE)) return

    st.offContour.push({
        at: index,
        deviation,
        row: el.row,
        sourceFile: el.sourceFile,
        [a0]: at,
        [a1]: expected,
    })
}

// The worst departure of a painted boundary from its programmed path, or null.
export function worstOffContour() {
    if (!state || state.status !== 'ok' || !state.offContour.length) return null
    return state.offContour.reduce((worst, o) => (o.deviation > worst.deviation ? o : worst))
}

// Material the holder passes through, as it stands right now.
function collectBodyHits(st, colliders, cp) {
    const {a0, a1} = st
    const hits = new Map()

    colliders.forEach(section => {
        const poly = sectionToPolygon(section, a0, a1)
        if (poly.length < 3) return

        // Reject before sweeping. A holder is a large shape — a 70 mm shank
        // covers 350 columns at the working pitch, where the insert covers a
        // dozen — and sweeping it cost twelve times the rest of the element put
        // together. On a correctly set-back holder travelling through its own
        // channel the lowest point of the holder sits at or above the highest
        // remaining material, and that is a comparison of two numbers.
        const bounds = sweptBounds(poly, cp.from, cp.to)
        const first = Math.floor((bounds.a0min - st.grid.min) / st.grid.pitch)
        const last = Math.floor((bounds.a0max - st.grid.min) / st.grid.pitch)
        if (maxRadiusIn(st.grid, first, last) <= bounds.a1min) return

        // And again per column, because the range test is only as good as its
        // weakest column: one stretch of uncut stock anywhere under the holder
        // would otherwise pay for converting all 350 of them. A holder
        // travelling through its own channel is rejected column by column at
        // the cost of one comparison each.
        st.sweptColumns += sweepSegment(st.grid, poly, cp.from, cp.to, (column, spans) => {
            const into = intersectSpans(spans, getSpans(st.grid, column))
            if (!into.length) return
            hits.set(column, union((hits.get(column) ?? []).concat(into)))
        }, column => st.grid.maxRadius[column] > bounds.a1min)
    })

    return hits.size ? hits : null
}

// Judge the holder's hits, now that this block's cutting sweep is known.
//
// What the cutting edge sweeps in this same block is subtracted: the holder
// trails the edge along the path, so on any ordinary pass it travels through
// space the edge cleared moments earlier, within the very same block. Without
// this every normal cut would report a collision — the same crying-wolf failure
// the gouge check avoids by never looking at the trajectory.
//
// The case this does excuse wrongly is a holder LEADING the edge, which needs
// the tool to travel backwards relative to its own geometry. Rarer, and the
// alternative is a warning on every pass.
function recordCollision(st, el, index, hits, cutSwept) {
    const columns = []
    let depth = 0
    let worstColumn = -1
    let worstSpan = null

    hits.forEach((spans, column) => {
        const real = subtractSpansFrom(spans, cutSwept.get(column) ?? [])
        if (!real.length) return

        const here = spansLength(real)
        if (here > depth) {
            depth = here
            worstColumn = column
            worstSpan = real[real.length - 1]
        }
        columns.push([column, real])
    })

    if (!columns.length) return

    // Past the budget the depth report carries on; only the painted detail
    // stops, and says so.
    let kept = columns
    if (st.collisionSpans + columns.length > COLLISION_SPAN_BUDGET) {
        kept = []
        st.collisionSpansTruncated = true
    }
    st.collisionSpans += kept.length

    st.collisions.push({
        at: index,
        depth,
        row: el.row,
        sourceFile: el.sourceFile,
        [st.a0]: columnCenter(st.grid, worstColumn),
        [st.a1]: worstSpan[0],
        columns: kept,
    })
}

// Has the holder check given up? Derived from the collision list rather than
// stored, so there is no flag to put back on a rewind — the list is already
// carried by keyframes and unwound by undo, and this follows it for free.
export function collisionCheckStopped() {
    return !!state && state.status === 'ok' && state.collisions.length >= COLLISION_GIVEUP
}

// How far the trace still has to go to reach `limit`. Zero when it is there.
export function materialTraceOwed(limit) {
    if (!state || state.status !== 'ok') return 0
    return Math.max(0, limit - state.appliedUpTo)
}

// What the trace found, as data.
//
// The coverage counters are carried too — blocks with no tool outline, blocks
// made in another plane, whether the finished contour was known — but they are
// deliberately NOT written out to the user. By the user's decision only the two
// things that matter are reported: a gouge and a holder strike. The counters
// stay here because the detection depends on them and because they are the
// honest answer if the question is ever asked again.
export function materialTraceReport() {
    const st = state
    if (!st || st.status !== 'ok') return {status: st ? st.status : 'noTrace'}

    return {
        status: 'ok',
        checked: st.swept,
        applied: st.appliedUpTo,
        skippedTool: st.skippedTool,
        skippedPlane: st.skippedPlane,
        partKnown: st.partKnown,
        gouges: {count: st.gouges.length, worst: worstGouge()},
        collisions: {count: st.collisions.length, worst: worstCollision(), stopped: collisionCheckStopped()},
        offContour: {count: st.offContour.length, worst: worstOffContour()},
    }
}

// Damage, as lines of text, worst first. Empty when nothing was hit.
//
// A holder strike comes before a gouge: a gouge spoils the part, a strike breaks
// the machine.
export function describeMaterialTrace() {
    const r = materialTraceReport()
    if (r.status !== 'ok') return []

    const st = state
    const place = point => {
        const axial = point[st.a0]
        const radial = point[st.a1]
        // Doubled back into a diameter when the program works in diameters,
        // which is what the operator reads off the machine. X is held in radii
        // all the way through, and a factor of two here is exactly what would
        // destroy confidence in the number.
        return st.diamon
            ? `${st.a0}${axial.toFixed(2)} ⌀${(radial * 2).toFixed(3)}`
            : `${st.a0}${axial.toFixed(2)} ${st.a1}${radial.toFixed(3)}`
    }
    const where = g => (g.row === undefined ? '' : ` at ${g.sourceFile ?? 'program'} row ${g.row + 1}`)

    const lines = []

    // First, because it says the other two numbers cannot be trusted: if the
    // boundary is off, so is every depth measured from it.
    if (r.offContour.count) {
        const w = r.offContour.worst
        lines.push(`TRACE IS OFF by ${w.deviation.toFixed(3)} mm on ${r.offContour.count} compensated block(s), worst ${place(w)}${where(w)}. The tool file's zero is probably not the point the control compensates about — depths below are wrong by the same amount.`)
    }

    if (r.collisions.count) {
        const w = r.collisions.worst
        lines.push(`HOLDER HIT STOCK in ${r.collisions.count} block(s); deepest ${w.depth.toFixed(3)} mm radial, ${place(w)}${where(w)}.`)
    }
    if (r.collisions.stopped) {
        lines.push(`Holder checking stopped after ${r.collisions.count} strikes — the ROLE:body outline is probably drawn below the cutting tip. Later blocks are not checked.`)
    }

    if (r.gouges.count) {
        const w = r.gouges.worst
        lines.push(`CUT INTO THE PART in ${r.gouges.count} block(s); deepest ${w.depth.toFixed(3)} mm radial, ${place(w)}${where(w)}.`)
    }

    return lines
}

// The deepest holder intrusion so far, or null.
export function worstCollision() {
    if (!state || state.status !== 'ok' || !state.collisions.length) return null
    return state.collisions.reduce((worst, c) => (c.depth > worst.depth ? c : worst))
}

// Where the holder met material, merged across every block that hit it.
export function materialTraceCollisionRects(epsilon = 1e-9) {
    const st = state
    if (!st || st.status !== 'ok') return []
    if (st.collisionRects && st.collisionRectsAt === st.appliedUpTo) return st.collisionRects

    const perColumn = new Map()
    st.collisions.forEach(c => c.columns.forEach(([column, spans]) => {
        perColumn.set(column, union((perColumn.get(column) ?? []).concat(spans)))
    }))

    st.collisionRects = buildRects(st, i => perColumn.get(i) ?? [], epsilon, perColumn)
    st.collisionRectsAt = st.appliedUpTo
    return st.collisionRects
}

function detectGouge(st, el, index, before) {
    let depth = 0
    let worstColumn = -1
    let worstSpan = null

    before.forEach((wasSpans, column) => {
        const took = subtractSpansFrom(wasSpans, getSpans(st.grid, column))
        if (!took.length) return
        const into = intersectSpans(took, getSpans(st.part, column))
        if (!into.length) return

        const here = spansLength(into)
        if (here > depth) {
            depth = here
            worstColumn = column
            worstSpan = into[into.length - 1]
        }
    })

    if (depth <= 0) return

    st.gouges.push({
        at: index,
        depth,
        row: el.row,
        sourceFile: el.sourceFile,
        // Where to look: axial position of the column, and the radius reached.
        [st.a0]: columnCenter(st.grid, worstColumn),
        [st.a1]: worstSpan[0],
    })
}

// The deepest gouge so far, or null. Depths are radii — a diameter readout is
// twice this, which is the caller's business (see the plan's note on DIAMON).
export function worstGouge() {
    if (!state || state.status !== 'ok' || !state.gouges.length) return null
    return state.gouges.reduce((worst, g) => (g.depth > worst.depth ? g : worst))
}

function recordUndo(st, index, before, removed) {
    st.undo.push({at: index, columns: [...before.entries()], removed})
    st.undoEntries += before.size

    // Over budget the oldest records go. Stepping far enough back then falls
    // through to the keyframe path, which is slower but bounded — the recent
    // past is what gets scrubbed.
    while (st.undoEntries > UNDO_BUDGET_ENTRIES && st.undo.length > 1) {
        st.undoEntries -= st.undo.shift().columns.length
    }
}

// Take back the last applied element. Costs what applying it cost.
function undoLast(st) {
    const record = st.undo.pop()
    if (!record) return false

    record.columns.forEach(([column, spans]) => setSpans(st.grid, column, spans))
    while (st.gouges.length && st.gouges[st.gouges.length - 1].at >= record.at) st.gouges.pop()
    while (st.offContour.length && st.offContour[st.offContour.length - 1].at >= record.at) st.offContour.pop()
    while (st.collisions.length && st.collisions[st.collisions.length - 1].at >= record.at) {
        st.collisionSpans -= st.collisions.pop().columns.reduce((n, c) => n + c[1].length, 0)
    }
    st.undoEntries -= record.columns.length
    st.removed -= record.removed
    st.appliedUpTo = record.at
    st.swept--
    st.rects = null
    st.rectsAt = -1
    st.gougeRects = null
    st.gougeRectsAt = -1
    st.collisionRects = null
    st.collisionRectsAt = -1
    return true
}

// Bring the material up to `limit` elements of `elements`.
//
// Rebuilds from the blank when the element array changes (a re-parse) or when
// the limit moves backwards (the animation restarted) — advancing is
// subtractive and cannot be undone.
// How often the time budget is consulted. Checking the clock per element would
// cost more than some elements do.
const BUDGET_CHECK_EVERY = 32

export function advanceMaterialTrace(elements, limit, options = {}) {
    if (!elements || !elements.length) return null

    if (!state || state.source !== elements || state.status !== 'ok') {
        state = buildState(elements)
        if (state.status !== 'ok') return state
    }
    // A keyframe is valid whichever direction it is reached from: the material
    // after N elements is a pure function of the first N. So the newest one at
    // or before the target is a shortcut both ways — restoring it to go back,
    // and skipping past it to jump forward, which is what a click far along the
    // progress bar does.
    let best = null
    state.snapshots.forEach(snap => {
        if (snap.at <= limit && (!best || snap.at > best.at)) best = snap
    })

    // Stepping back a few elements is undone directly — the common case, and
    // the one that is pressed repeatedly. The log is a contiguous suffix ending
    // at `appliedUpTo`, so it can cover the gap or it cannot.
    if (limit < state.appliedUpTo && state.appliedUpTo - limit <= state.undo.length) {
        while (state.appliedUpTo > limit && undoLast(state)) { /* unwound */ }
        if (state.appliedUpTo === limit) return state
    }

    if (limit < state.appliedUpTo) {
        if (best) restoreSnapshot(state, best)
        else {
            // No keyframe at or before the target, so the blank is the only
            // state to start from.
            state = buildState(elements)
            if (state.status !== 'ok') return state
        }
    } else if (best && best.at > state.appliedUpTo) {
        restoreSnapshot(state, best)
    }

    // Jumping forward into ground the program has not covered yet cannot be
    // short-cut: the material at a block is what all the blocks before it left.
    // What it can be is interruptible, so a long jump fills in over a few frames
    // instead of locking the window — which is the difference between waiting
    // and being unable to do anything while waiting.
    const deadline = options.msBudget > 0 ? Date.now() + options.msBudget : Infinity

    const to = Math.min(limit, elements.length)
    for (let i = state.appliedUpTo; i < to; i++) {
        applyElement(state, elements, i)
        state.appliedUpTo = i + 1
        if (state.appliedUpTo % state.snapshotEvery === 0
            && keyframeAffordable(state)
            && !state.snapshots.some(snap => snap.at === state.appliedUpTo)) {
            takeSnapshot(state)
        }
        if ((i & (BUDGET_CHECK_EVERY - 1)) === 0 && Date.now() > deadline) return state
    }
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

    st.rects = buildRects(st, i => removedAt(st, i), epsilon)
    st.rectsAt = st.appliedUpTo
    return st.rects
}

// Where the tool cut into the finished part.
//
// Derived from the grids rather than accumulated, which is what keeps it in step
// with rewinding for free: undo restores the material, the removed region
// shrinks, and so does this.
export function materialTraceGougeRects(epsilon = 1e-9) {
    const st = state
    if (!st || st.status !== 'ok' || !st.part) return []
    if (st.gougeRects && st.gougeRectsAt === st.appliedUpTo) return st.gougeRects

    st.gougeRects = buildRects(
        st,
        i => intersectSpans(removedAt(st, i), getSpans(st.part, i)),
        epsilon,
    )
    st.gougeRectsAt = st.appliedUpTo
    return st.gougeRects
}

function removedAt(st, i) {
    return subtractSpansFrom(getSpans(st.seed, i), getSpans(st.grid, i))
}

function buildRects(st, spansAt, epsilon, columnSet = null) {
    const {grid} = st
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

    // Collided columns need not lie inside the cut range — a holder can hit
    // stock the tool never touched, which is the whole point — so the caller
    // may hand over its own column set to walk.
    let first = Math.max(0, st.touchedMin)
    let last = Math.min(grid.columns - 1, st.touchedMax)
    if (columnSet) {
        if (!columnSet.size) return rects
        const keys = [...columnSet.keys()]
        first = Math.max(0, Math.min(...keys))
        last = Math.min(grid.columns - 1, Math.max(...keys))
    }

    for (let i = first; i <= last; i++) {
        const here = spansAt(i)
        if (!here.length) { flush(); continue }

        if (run && same(run.spans, here)) {
            run.lastColumn = i
        } else {
            flush()
            run = {spans: here, firstColumn: i, lastColumn: i}
        }
    }
    flush()

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

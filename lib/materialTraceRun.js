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
export const SNAPSHOT_BUDGET_BYTES = 8e6
export const MAX_SNAPSHOTS = 64

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
        // A contiguous suffix of the applied elements, ending exactly at
        // `appliedUpTo`. Cleared whenever a keyframe is restored, since the
        // position it would undo from no longer holds.
        undo: [],
        undoEntries: 0,
    }

    // One keyframe every `snapshotEvery` elements, as densely as the budget
    // allows: the worst-case rewind then replays that many elements, not the
    // whole program.
    const affordable = Math.max(1, Math.min(MAX_SNAPSHOTS, Math.floor(SNAPSHOT_BUDGET_BYTES / gridBytes(grid))))
    st.snapshotEvery = Math.max(1, Math.ceil(elements.length / affordable))
    takeSnapshot(st)            // the blank itself, so any rewind has a floor

    return st
}

function gridBytes(grid) {
    return grid.starts.byteLength + grid.ends.byteLength + grid.counts.byteLength
}

function takeSnapshot(st) {
    st.snapshots.push({
        at: st.appliedUpTo ?? 0,
        starts: st.grid.starts.slice(),
        ends: st.grid.ends.slice(),
        counts: st.grid.counts.slice(),
        maxRadius: st.grid.maxRadius.slice(),
        removed: st.removed ?? 0,
        gouges: (st.gouges ?? []).slice(),
        collisions: (st.collisions ?? []).slice(),
        collisionSpans: st.collisionSpans ?? 0,
        collisionSpansTruncated: st.collisionSpansTruncated ?? false,
        touchedMin: st.touchedMin ?? Infinity,
        touchedMax: st.touchedMax ?? -Infinity,
    })

    // At the cap, drop every other keyframe and halve the density. The spread
    // stays even and memory stays put, at the cost of a longer worst-case
    // replay — which is the right thing to trade away last.
    if (st.snapshots.length > MAX_SNAPSHOTS) {
        st.snapshots = st.snapshots.filter((_, i) => i % 2 === 0)
        st.snapshotEvery *= 2
    }
}

function restoreSnapshot(st, snap) {
    st.undo = []
    st.undoEntries = 0
    st.grid.starts.set(snap.starts)
    st.grid.ends.set(snap.ends)
    st.grid.counts.set(snap.counts)
    st.grid.maxRadius.set(snap.maxRadius)
    st.appliedUpTo = snap.at
    st.removed = snap.removed
    st.gouges = snap.gouges.slice()
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
        sweepSegment(st.grid, poly, cp.from, cp.to, (column, spans) => {
            if (cutSwept) cutSwept.set(column, union((cutSwept.get(column) ?? []).concat(spans)))
            spans.forEach(([lo, hi]) => {
                if (!before.has(column)) before.set(column, getSpans(st.grid, column))
                const cut = subtractSpan(st.grid, column, lo, hi)
                if (cut <= 0) return
                removedHere += cut
                if (column < st.touchedMin) st.touchedMin = column
                if (column > st.touchedMax) st.touchedMax = column
            })
        })
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
        sweepSegment(st.grid, poly, cp.from, cp.to, (column, spans) => {
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

// What the trace covered, and what it could not.
//
// The point of this is one thing: a feature whose job is catching crashes must
// never let "nothing was hit" and "could not be checked" look the same. So
// `verdict` is only `clean` when the whole program was actually swept, the
// finished part was known, and the holder check ran to the end.
//
// Modelled on the turning generator's self-check (`turning.js`,
// `validateZones`), which says "could not match this zone" rather than going
// quiet.
export function materialTraceReport() {
    const st = state
    if (!st) return {verdict: 'off', status: 'noTrace', notes: []}
    if (st.status !== 'ok') return {verdict: 'off', status: st.status, notes: []}

    const stopped = collisionCheckStopped()
    const notes = []
    if (st.grid.overflows) notes.push({kind: 'columnOverflow', count: st.grid.overflows})
    if (st.collisionSpansTruncated) notes.push({kind: 'collisionDetailDropped'})

    // A stopped holder check needs no term of its own here: stopping means at
    // least COLLISION_GIVEUP strikes were found, so the verdict is `damage`
    // either way. The text still says plainly that later blocks went unchecked.
    const covered = st.skippedTool === 0 && st.skippedPlane === 0
    const complete = covered && st.partKnown

    let verdict = 'clean'
    if (st.gouges.length || st.collisions.length) verdict = 'damage'
    else if (!complete) verdict = 'partial'

    return {
        verdict,
        status: 'ok',
        checked: st.swept,
        applied: st.appliedUpTo,
        skippedTool: st.skippedTool,
        skippedPlane: st.skippedPlane,
        partKnown: st.partKnown,
        gouges: {count: st.gouges.length, worst: worstGouge()},
        collisions: {count: st.collisions.length, worst: worstCollision(), stopped},
        notes,
    }
}

// The report as lines of text, worst first.
export function describeMaterialTrace() {
    const r = materialTraceReport()

    if (r.verdict === 'off') {
        if (r.status === 'notLathe') return ['Material trace: lathe programs only.']
        if (r.status === 'noBlank') return ['Material trace: no BLANK, so there is nothing to cut into.']
        return []
    }

    const st = state
    const place = point => {
        const axial = point[st.a0]
        const radial = point[st.a1]
        // Doubled back into a diameter when the program works in diameters,
        // which is what the operator reads off the machine.
        return st.diamon
            ? `${st.a0}${axial.toFixed(2)} ⌀${(radial * 2).toFixed(3)}`
            : `${st.a0}${axial.toFixed(2)} ${st.a1}${radial.toFixed(3)}`
    }
    const where = g => (g.row === undefined ? '' : ` at ${g.sourceFile ?? 'program'} row ${g.row + 1}`)

    const lines = []

    if (r.collisions.count) {
        const w = r.collisions.worst
        lines.push(`HOLDER HIT STOCK in ${r.collisions.count} block(s); deepest ${w.depth.toFixed(3)} mm radial, ${place(w)}${where(w)}.`)
    }
    if (r.collisions.stopped) {
        lines.push(`Holder checking stopped after ${r.collisions.count} strikes — the ROLE:body outline is probably drawn below the cutting tip. Later blocks are NOT checked.`)
    }

    if (r.gouges.count) {
        const w = r.gouges.worst
        lines.push(`CUT INTO THE PART in ${r.gouges.count} block(s); deepest ${w.depth.toFixed(3)} mm radial, ${place(w)}${where(w)}.`)
    } else if (!r.partKnown) {
        lines.push('No CONTOUR, so cutting into the finished part cannot be detected.')
    }

    if (r.skippedTool) {
        lines.push(`${r.skippedTool} block(s) had no tool outline — NOT checked. Add a ;TOOL: marker, or the tool to the machine's list.`)
    }
    if (r.skippedPlane) {
        lines.push(`${r.skippedPlane} block(s) were made in another plane — NOT checked.`)
    }

    r.notes.forEach(note => {
        if (note.kind === 'columnOverflow') {
            lines.push(`${note.count} column(s) held more detail than the grid can keep; small gaps were closed, leaving stock that is not really there.`)
        }
        if (note.kind === 'collisionDetailDropped') {
            lines.push('Too many collided spans to paint them all; the depths above are still right.')
        }
    })

    if (r.verdict === 'clean') {
        lines.push(`${r.checked} block(s) checked: nothing cut into the part, nothing hit the holder.`)
    } else if (!lines.length) {
        lines.push(`${r.checked} block(s) checked, with gaps listed above.`)
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
export function advanceMaterialTrace(elements, limit) {
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

    const to = Math.min(limit, elements.length)
    for (let i = state.appliedUpTo; i < to; i++) {
        applyElement(state, elements, i)
        state.appliedUpTo = i + 1
        if (state.appliedUpTo % state.snapshotEvery === 0
            && !state.snapshots.some(snap => snap.at === state.appliedUpTo)) {
            takeSnapshot(state)
        }
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

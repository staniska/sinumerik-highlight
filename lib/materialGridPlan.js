'use babel'

import {polygonAxialRange, sweptBounds, union} from './materialTrace'

export const ADAPTIVE_COARSE_PITCH = 0.5
export const ADAPTIVE_FINE_PITCH = 0.02
const EPS = 1e-9

// Plan once, before seeding any material. All three profiles share these edges.
// The placements are the SAME compensated placements used by the cutting run.
// A horizontal translation has constant sections between its endpoint footprints;
// all other moves are conservatively refined over their entire swept projection.
export function planMaterialGrid({min, max, profiles = [], placements = [], maxColumns = Infinity}) {
    const fine = []
    const events = [min, max]
    const refine = (lo, hi) => {
        if (!Number.isFinite(lo) || !Number.isFinite(hi)) return
        const left = Math.max(min, lo - ADAPTIVE_COARSE_PITCH)
        const right = Math.min(max, hi + ADAPTIVE_COARSE_PITCH)
        if (right > left) fine.push([left, right])
        if (lo > min && lo < max) events.push(lo)
        if (hi > min && hi < max) events.push(hi)
    }

    profiles.forEach(poly => {
        for (let i = 0; i < poly.length; i++) {
            const p = poly[i]
            const q = poly[(i + 1) % poly.length]
            if (p[0] > min && p[0] < max) events.push(p[0])
            // Includes axial faces (zero axial extent), not just slopes.
            if (p[1] !== q[1]) refine(Math.min(p[0], q[0]), Math.max(p[0], q[0]))
        }
    })

    for (const {polygon, from, to} of placements) {
        const bounds = sweptBounds(polygon, from, to)
        if (from[1] !== to[1]) {
            refine(bounds.a0min, bounds.a0max)
        } else {
            const [lo, hi] = polygonAxialRange(polygon)
            refine(from[0] + lo, from[0] + hi)
            refine(to[0] + lo, to[0] + hi)
        }
    }

    const zones = union(fine)
    zones.forEach(([lo, hi]) => events.push(lo, hi))
    events.sort((a, b) => a - b)
    const anchors = events.filter((z, i) => i === 0 || z - events[i - 1] > EPS)
    // Always retain the actual far edge even if an event was within EPS of it.
    anchors[anchors.length - 1] = max
    const edges = [min]
    let zone = 0
    let fineColumns = 0
    let coarseColumns = 0
    for (let i = 1; i < anchors.length; i++) {
        const lo = anchors[i - 1]
        const hi = anchors[i]
        const mid = (lo + hi) / 2
        while (zone < zones.length && zones[zone][1] <= mid) zone++
        const refined = zone < zones.length && zones[zone][0] <= mid
        const pitch = refined ? ADAPTIVE_FINE_PITCH : ADAPTIVE_COARSE_PITCH
        const count = Math.max(1, Math.ceil((hi - lo) / pitch))
        if (edges.length - 1 + count > maxColumns) {
            throw new RangeError('Adaptive mesh exceeds the material memory budget; use the 0.2 mm mesh.')
        }
        // Divide between anchors: never accumulate a floating-point increment.
        for (let k = 1; k <= count; k++) edges.push(k === count ? hi : lo + (hi - lo) * k / count)
        if (refined) fineColumns += count
        else coarseColumns += count
    }
    return {edges: new Float64Array(edges), fineColumns, coarseColumns,
        fineLength: zones.reduce((sum, [lo, hi]) => sum + hi - lo, 0),
        finePitch: ADAPTIVE_FINE_PITCH, coarsePitch: ADAPTIVE_COARSE_PITCH}
}

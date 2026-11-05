'use babel'

// Thread marks — where one revolution of a thread-cutting block ends.
//
// Pure: no `View`, no `parseData`, no axis names beyond the three letters the
// pitch can be written with. Everything is answered as a FRACTION along the
// block rather than as a coordinate, which is what keeps it that way: the
// caller owns the frames, the mirror and the plane, and the animation pieces
// (`utils.js::subdivideElement`) interpolate the phase alongside the
// coordinates, so rewinding and a partially drawn block come out right without
// this module knowing they exist.
//
// G33, G34 and G35 are one formula. With a pitch change F (mm/rev²) the travel
// after n revolutions is
//
//     s(n) = ka·n + F·n²/2
//
// and the documented `F = |ke² − ka²| / (2·IG)` is that same relation read at
// the far end — substituting ke = ka + F·N into it returns IG identically. G33
// is F = 0, which is why there is no second code path for it.

// The axis a pitch vector belongs to. Fixed by the control, not by the plane.
export const PITCH_AXIS = {I: 'X', J: 'Y', K: 'Z'}

// A block may not draw more marks than this. A real thread runs about a
// hundred per block; the cap is here for the typo (`K=0.01` on a long pass),
// which would otherwise generate marks until the renderer choked.
export const MAX_MARKS_PER_BLOCK = 1000

// Two travels count as equal — a 45° taper, where either pitch vector is
// allowed. Exact equality is useless: a cone drawn as `X20 Z20` lands on two
// deltas that differ in the last bit.
export const AXIS_EQUAL_EPS = 1e-9

// Below this an axis is not moving at all. Also the floor for a usable travel:
// a thread block with no travel along its pitch axis has no revolutions.
export const MOVE_EPS = 1e-9

// How many revolutions a block takes, and the pitch it ends on.
//
// Returns {turns, endPitch} or {error}. The one error worth naming is
// `unreachable`, and it covers both ways a degressive thread can fail: the
// quadratic has no root exactly when the travel asked for is longer than the
// most a shrinking pitch can deliver, which is the same moment the pitch would
// reach zero. s(n) peaks at n = ka/|F| with s = ka²/(2|F|), so
// `ka² + 2·F·travel < 0` and `travel > s(peak)` are the same test.
export function threadRevolutions(travel, pitch, pitchChange = 0) {
    if (!Number.isFinite(travel) || travel <= MOVE_EPS) return {error: 'travel'}
    if (!Number.isFinite(pitch) || pitch <= 0) return {error: 'pitch'}
    if (!Number.isFinite(pitchChange)) return {error: 'pitchChange'}

    if (pitchChange === 0) {
        const turns = travel / pitch
        return {turns, endPitch: pitch}
    }

    const disc = pitch * pitch + 2 * pitchChange * travel
    if (disc < 0) {
        // What the pitch would have been at the far end if it could get there,
        // for the error text: it says how far off the block is.
        return {error: 'unreachable', reachable: (pitch * pitch) / (2 * Math.abs(pitchChange))}
    }

    // The root to take is always the one with +√: for a growing pitch it is the
    // only positive root, and for a shrinking one it is the first crossing,
    // before the pitch turns round.
    const turns = (-pitch + Math.sqrt(disc)) / pitchChange
    return {turns, endPitch: pitch + pitchChange * turns}
}

// The marks of one block, as fractions of its length.
//
// `phaseIn` is the fractional revolution already run by the chain this block
// continues — a mark falls on a whole revolution of the thread, not of the
// block. SF sets it, a chain carries it, and anything that is not a thread
// move clears it; none of that is decided here, only used.
//
// Returns {marks, phaseOut, turns, endPitch} or {error, ...}.
export function threadMarks({travel, pitch, pitchChange = 0, phaseIn = 0}) {
    const run = threadRevolutions(travel, pitch, pitchChange)
    if (run.error) return run

    const {turns, endPitch} = run
    const phase = Number.isFinite(phaseIn) ? phaseIn - Math.floor(phaseIn) : 0

    // Marks sit at whole revolutions of the chain, so the first one is a whole
    // revolution less whatever the previous block left over. With nothing left
    // over the block starts on a mark.
    const first = Math.ceil(phase - AXIS_EQUAL_EPS)
    const last = Math.floor(turns + phase + AXIS_EQUAL_EPS)
    const count = Math.max(0, last - first + 1)
    if (count > MAX_MARKS_PER_BLOCK) return {error: 'tooMany', count}

    const marks = []
    for (let k = first; k <= last; k++) {
        const n = k - phase
        if (n < 0) continue
        // s(n) / travel. Clamped because the last mark can land a rounding
        // error past the end, and a fraction over 1 would draw outside the
        // block.
        const s = pitch * n + pitchChange * n * n / 2
        marks.push(Math.min(1, Math.max(0, s / travel)))
    }

    const total = phase + turns
    return {marks, phaseOut: total - Math.floor(total), turns, endPitch}
}

// The same marks as the dotted presentation draws them: one more point at the
// very end of the block, so the line of the next block starts from something
// that looks true. It is not a crest — it leaves no blue mark on the part — and
// it is not added twice when a crest already lands on the end.
export function dottedMarks(result) {
    const marks = result?.marks ?? []
    const last = marks[marks.length - 1]
    if (last !== undefined && 1 - last <= AXIS_EQUAL_EPS) return marks
    return marks.concat(1)
}

// Which axis leads, checked against what the block actually travels.
//
// `vectors` are the pitch words found in the block, by their own letter
// (`{K: 2}`). `travels` are the block's signed movements by axis name. The
// pitch is a length and never carries the direction, so only magnitudes count
// here; the direction comes from the travel and the spindle.
//
// Returns {name, axis, pitch, travel} or {error, ...}.
export function resolveThreadPitch({vectors = {}, travels = {}, planeVectors = []}) {
    const names = Object.keys(vectors).filter(name => vectors[name] !== undefined)
    if (!names.length) return {error: 'noPitch'}
    if (names.length > 1) return {error: 'manyPitch', names}

    const name = names[0]
    const axis = PITCH_AXIS[name]
    if (!axis) return {error: 'noPitch'}
    if (!planeVectors.includes(name)) return {error: 'offPlane', name}

    const pitch = vectors[name]
    if (!Number.isFinite(pitch) || pitch <= 0) return {error: 'pitch', name}

    const moving = Object.keys(travels).filter(ax => Math.abs(travels[ax] ?? 0) > MOVE_EPS)
    if (!moving.length) return {error: 'noTravel'}

    const travel = Math.abs(travels[axis] ?? 0)
    if (travel <= MOVE_EPS) return {error: 'axisStill', name, axis}

    // The pitch belongs to the axis that travels furthest; equal travels (a 45°
    // taper) accept either. Relative, because the two numbers being compared
    // are the block's own lengths.
    const longest = moving.reduce((m, ax) => Math.max(m, Math.abs(travels[ax])), 0)
    if (longest - travel > AXIS_EQUAL_EPS * longest) {
        return {error: 'shortAxis', name, axis, travel, longest}
    }

    return {name, axis, pitch, travel}
}

// The marks that fall inside one piece of a block, as fractions OF THE PIECE.
//
// The slow-debug animation draws pieces, not blocks (`utils.js::subdivideElement`),
// and a piece carries the slice of its block it covers. Marks are placed from
// the block's start, so this is where the two meet.
export function marksInSlice(marks, from = 0, to = 1) {
    const span = to - from
    if (!(span > 0)) return []

    const out = []
    for (const m of marks ?? []) {
        if (m < from - AXIS_EQUAL_EPS || m > to + AXIS_EQUAL_EPS) continue
        // A mark landing exactly on a seam belongs to the piece that ends
        // there, not to the one that starts there, or two pieces draw the same
        // point. The start of the block itself is nobody's seam.
        if (from > AXIS_EQUAL_EPS && m <= from + AXIS_EQUAL_EPS) continue
        out.push(Math.min(1, Math.max(0, (m - from) / span)))
    }
    return out
}

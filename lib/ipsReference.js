'use babel'

// The `ips` reference of a program: which earlier program's leftover stock
// serves as this one's blank, and how that stock has to be placed.
//
// A part is often split across several programs (op10 → op20 → op30). The old
// way of connecting them was a copy: press `save IPS` in op10, write the file
// name into op20 as its blank. A copy goes stale the moment op10 is edited, and
// it goes stale silently. An `ips` reference makes the connection a derivation
// instead.
//
// Pure: no `View`, no `parseData`. The shape defined here is what reaches the
// auto-comment, so the rules for it live in one testable place.
//
// See docs/ips-blank-plan.md.

// Only X/Y/Z. Frames in this package work on the linear axes and nothing else
// (utils.js::isFrameAxis): `frame.mirror` holds only those three, and a rotary
// axis in a `trans` would multiply by `undefined` — a shift of NaN, which reads
// as a reset rather than as an error.
export const IPS_AXES = ['X', 'Y', 'Z']

// `blank` and `ips` are mutually exclusive. That is what keeps every program
// written before this feature working unchanged, and what keeps the comment
// short; the UI toggle is a view of this, not a third piece of state.
export function blankMode(data) {
    return data && data.ips ? 'ips' : 'blank'
}

// Whatever the file carries → `{name, trans, mirror}`.
//
// A stray key is dropped, not refused: the auto-comment is a text file people
// edit by hand, and a typo in an axis name must not take the whole reference
// with it. `null` only for a reference with no usable name — without one there
// is nothing to resolve.
export function normalizeIpsReference(raw) {
    if (!raw) return null

    const name = typeof raw === 'string' ? raw : raw.name
    if (typeof name !== 'string' || !name.trim().length) return null

    const ref = {name: name.trim().replace(/\r$/, '').toUpperCase()}

    const trans = {}
    const rawTrans = raw.trans ?? {}
    IPS_AXES.forEach(axis => {
        const value = Number(rawTrans[axis])
        // A zero is a value a user can have typed on purpose, so it is kept
        // here; `commentPayload` is what decides it need not reach the file.
        if (rawTrans[axis] !== undefined && rawTrans[axis] !== null
            && rawTrans[axis] !== '' && Number.isFinite(value)) {
            trans[axis] = value
        }
    })
    if (Object.keys(trans).length) ref.trans = trans

    const mirror = IPS_AXES.filter(axis => Array.from(raw.mirror ?? [])
        .some(a => typeof a === 'string' && a.trim().toUpperCase() === axis))
    if (mirror.length) ref.mirror = mirror

    if (raw.piece) ref.piece = raw.piece

    return ref
}

// Does this reference move the stock at all? Drives the look of the transform
// button: a flip between operations is the normal reason to split a turning
// job in two, and it must be visible without opening the popup.
export function ipsIsTransformed(ref) {
    if (!ref) return false
    const shifted = Object.keys(ref.trans ?? {}).some(axis => ref.trans[axis] !== 0)
    return shifted || (ref.mirror ?? []).length > 0
}

// One line for the button title. Nothing invented: the axes as they are.
export function describeIpsTransform(ref) {
    if (!ipsIsTransformed(ref)) return 'No offset, no mirror'

    const parts = IPS_AXES
        .filter(axis => (ref.trans ?? {})[axis] !== undefined && ref.trans[axis] !== 0)
        .map(axis => `${axis}${ref.trans[axis] > 0 ? '+' : '−'}${Math.abs(ref.trans[axis])}`)

    if ((ref.mirror ?? []).length) parts.push(`mirror ${ref.mirror.join(' ')}`)
    return parts.join(', ')
}

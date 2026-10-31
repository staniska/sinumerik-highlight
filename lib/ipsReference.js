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


// Why a reference could not be turned into a blank, in the words the user needs
// to act. Pure, and the single place these sentences live: the parse writes one
// into `parseData.errors`, and the panel may want the same text later.
//
// Silence is not an option for any of them. A program whose blank failed to
// resolve draws its trajectory against nothing, and every number the material
// trace reports about it would be about the wrong stock.
export function ipsStatusText(status, ref) {
    const name = ref?.name || '—';
    return {
        noName: 'The IPS reference has no program name, so this program has no blank.',
        notFound: `No program named ${name} next to this one, so there is no stock to borrow.`,
        cycle: `${name} borrows its own stock back from this program — the chain is a loop.`,
        tooDeep: `The chain of borrowed stock through ${name} is too long to follow.`,
        noMachine: `${name} has no machine in its auto-comment, so its stock cannot be computed.`,
        readError: `${name} could not be read from disk.`,
        notLathe: 'Borrowed stock is computed for turning only.',
        noBlank: `${name} has no blank of its own, so it leaves nothing.`,
        noTools: `No block of ${name} declares a tool, so nothing was cut from its blank. ` +
            'Declare a tool there with ;TOOL:NAME.',
        toolsNotReady: `The tool outlines ${name} uses have not been read yet. Press Redraw.`,
        nothingLeft: `${name} leaves nothing of its blank.`,
        manyPieces: `${name} leaves several separate pieces. Open it, press IPS and choose one.`,
        noProgram: `${name} has no trajectory to run.`,
        cancelled: 'Computing the borrowed stock was interrupted.',
        chainBroken: `${name} takes its own blank from another program, and that one could not be computed.`,
        chainNoName: `${name} is switched to IPS but names no program, so it has no blank of its own.`,
        failed: `Computing the stock of ${name} failed.`,
        notComputed: `The stock of ${name} has not been computed yet. Press Redraw.`,
        stale: `${name} has changed — the blank shown is the one computed before. Press Redraw.`,
    }[status] ?? `The stock of ${name} could not be computed (${status}).`;
}


// Names to suggest in a field that takes a program name, out of the entries
// found in the folders worth looking at.
//
// A program cannot be its own blank, its own contour or its own stock source,
// so its own name is left out: offering it would be offering the one answer
// that is certainly wrong.
export function uniqueProgramNames(entries, selfName) {
    const self = typeof selfName === 'string' ? selfName.toUpperCase() : null;
    const names = [];
    (entries ?? []).forEach(entry => {
        const name = entry?.name;
        if (typeof name !== 'string' || !name.length) return;
        if (name === self) return;
        if (names.indexOf(name) < 0) names.push(name);
    });
    return names.sort();
}


// Place a borrowed stock in the datum of the program that borrows it.
//
// The outline comes out of the trace in the datum of the program that produced
// it, and that is how it is stored: a stock kept already transformed would be
// transformed twice in a chain of three. So this runs on the way out, every
// time, and costs nothing — which is also what lets the offset be nudged in the
// popup without re-running anything.
//
// Mirror first, then the offset. The offset then always means a move in THIS
// program's datum — the direction seen on screen — whatever the mirror does;
// the other order makes a mirror flip the meaning of a number already typed,
// which is unusable for adjusting one by eye.
//
// `unitMult` converts the offset from the units it is written in to the
// millimetres the geometry is held in. The offset is written in the MACHINE's
// own units, not the program's: `G70`/`G71` in the code would otherwise change
// what a number in the auto-comment means.
//
// X is NOT doubled, under DIAMON or otherwise. An offset in X acts on the side,
// exactly as it does on the machine, and that is also what the geometry wants:
// X is held as a radius throughout.
export function placeStockElements(elements, ref, unitMult = 1) {
    if (!elements || !elements.length) return elements ?? [];

    const trans = ref?.trans ?? {};
    const mirror = Array.from(ref?.mirror ?? []);
    if (!Object.keys(trans).length && !mirror.length) return elements;

    const factor = {};
    const shift = {};
    IPS_AXES.forEach(axis => {
        factor[axis] = mirror.indexOf(axis) > -1 ? -1 : 1;
        const value = Number(trans[axis]);
        shift[axis] = Number.isFinite(value) ? value * unitMult : 0;
    });

    // A mirror reverses the way round the ring is traversed. Nothing downstream
    // minds: the grid is filled by counting crossings along a column
    // (materialTrace.js::polygonSpansAt), and the filled meshes read the points
    // as a path. Were an arc ever carried through here instead of the chords it
    // is tessellated into, its direction would have to be inverted with it.
    return elements.map(element => {
        const placed = {...element};
        IPS_AXES.forEach(axis => {
            const startKey = `${axis}_start`;
            if (element[startKey] !== undefined) {
                placed[startKey] = element[startKey] * factor[axis] + shift[axis];
            }
            if (element[axis] !== undefined) {
                placed[axis] = element[axis] * factor[axis] + shift[axis];
            }
        });
        return placed;
    });
}


// Millimetres per unit of what the offset is written in: the machine's own
// units, so that a `G70` in the program cannot change the meaning of a number
// in the auto-comment.
export function ipsUnitMult(machine) {
    return machine?.units === 'inch' ? 25.4 : 1;
}

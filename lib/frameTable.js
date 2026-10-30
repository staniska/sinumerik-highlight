'use babel'

// The table of frame states a parse went through, so a coordinate can be shown
// the way the control would have shown it at any position the user rewinds to.
//
// Why a table at all. An element reaches the canvas in BASE coordinates
// (primitives.js, `getCoordinatesInBase(canvasElement)` just before the push),
// and `parseData.frame` is a single object edited in place. By the time the
// animation runs it holds the LAST frame of the program, so converting an
// element's BASE coordinate back with it is wrong for every element cut under a
// different TRANS — and wrong quietly, since the number stays plausible.
// Stamping each element with an index into this table fixes the conversion to
// the frame that actually produced it, which is what makes rewinding honest.
//
// `diamon`, `diam90` and `unitMult` ride along because they are modal in
// exactly the same way and the display depends on them just as much: X is
// stored as a radius (primitives.js halves it under DIAMON) and an inch program
// is stored in mm, so showing what the control showed needs the state as it was
// at that element, not at the end of the parse.
//
// No `View` import: the whole decision lives in `recordFrameState`, which takes
// the parse state as an argument and is therefore testable without a harness —
// the same reason shapeParseState.js is its own module.

// A detached copy. The frame is edited in place by generateFrame, so anything
// stored by reference would quietly follow it.
export function frameSnapshot(frame, diamon, diam90, unitMult) {
    return {
        trans:       {...frame.trans},
        mirror:      {...frame.mirror},
        rot:         {...frame.rot},
        basis:       frame.basis.map(row => [...row]),
        invertBasis: frame.invertBasis.map(row => [...row]),
        diamon,
        diam90,
        unitMult,
    }
}

const sameVector = (a, b) => a.X === b.X && a.Y === b.Y && a.Z === b.Z

const sameMatrix = (a, b) => a.every((row, i) => row.every((v, j) => v === b[i][j]))

// Two entries that would read a coordinate the same way.
export function sameFrameState(a, b) {
    return a.diamon === b.diamon
        && a.diam90 === b.diam90
        && a.unitMult === b.unitMult
        && sameVector(a.trans, b.trans)
        && sameVector(a.mirror, b.mirror)
        && sameVector(a.rot, b.rot)
        && sameMatrix(a.basis, b.basis)
        && sameMatrix(a.invertBasis, b.invertBasis)
}

// The index of the entry the element being pushed belongs to, appending one
// first if the state has moved since the last.
//
// Which writer touched what is announced by a flag rather than discovered by
// comparing: the flag costs a boolean per element, while comparing would cost
// some thirty number comparisons per element, and a repeated DIAMON — modal,
// and legal to restate in every block — would fill the table with identical
// entries either way.
//
// The comparison that remains is inside the flag, so it runs a handful of times
// per parse rather than per element. It earns its place because not every mark
// means a change: `clearAxesPos` marks after each shape is read, having just
// set the diameter mode and the unit back to the machine's own, which usually
// is what they already were. Without this the table stopped being a list of
// distinct states — and that list is what makes it readable as a diagnostic.
export function recordFrameState(pd) {
    if (pd.frameDirty || !pd.frames.length) {
        const snapshot = frameSnapshot(pd.frame, pd.diamon, pd.diam90, pd.unitMult)
        const last = pd.frames[pd.frames.length - 1]
        if (!last || !sameFrameState(last, snapshot)) {
            pd.frames.push(snapshot)
            pd.frameId = pd.frames.length - 1
        }
        pd.frameDirty = false
    }
    return pd.frameId
}

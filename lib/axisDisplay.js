'use babel'

// Turning a stored coordinate into the number the control would have shown.
//
// Pure, and holding the one copy of three rules that used to live only inside
// `$AA_IW` (mathParser.js). The panel and the system variable have to agree: a
// readout that says one thing while `$AA_IW[X]` computes another would make the
// program's own arithmetic look wrong.
//
// Everything is stored in millimetres, and X as a radius. The state that
// decides how it reads — the frame, the diameter mode, the unit — is modal, so
// it comes from the element's own entry in `parseData.frames` rather than from
// wherever the parse happened to end (see frameTable.js).

import {isLinearAxis} from './utils'

// One axis of an already-converted position.
//
// `diamon` doubles X alone: the stored value is a radius, and a lathe shows a
// diameter. `unitMult` divides a length and leaves an angle be — A/B/C are
// degrees in any unit, which is what `isLinearAxis` has always said.
export function displayCoordinate(value, {axis, diamon = 0, unitMult = 1} = {}) {
    if (!Number.isFinite(value)) return null

    let out = value
    if (diamon && axis === 'X') out *= 2
    if (isLinearAxis(axis)) out /= unitMult
    return out
}

// How many decimals to print. A thousandth of a millimetre is the finest a
// control shows; in inches the same resolution is a ten-thousandth.
export function decimalsFor(unitMult) {
    return unitMult === 1 ? 3 : 4
}

const isGeometric = (el) => !!el && el.type !== 'msg' && el.type !== 'pause'

// Which animation piece the tool is standing on, and which end of it.
//
// `drawn` pieces have been drawn, so the tool is at the END of piece
// `drawn - 1`. Nothing drawn yet means it has not moved: the START of the first
// piece is where it waits.
//
// The walk is needed because a message or a pause is a piece too — passed
// through whole by buildAnimationPieces and carrying no coordinate at all. The
// position has not changed at one, so the answer is the last piece that moved,
// the same way a hanging message is read from the last one that spoke
// (utils.js::stickyMsgAt).
export function positionAt(elements, drawn) {
    if (!elements?.length) return null

    if (!drawn) {
        const index = elements.findIndex(isGeometric)
        return index < 0 ? null : {element: elements[index], atStart: true, index}
    }

    for (let i = Math.min(drawn, elements.length) - 1; i >= 0; i--) {
        if (isGeometric(elements[i])) return {element: elements[i], atStart: false, index: i}
    }
    return null
}

// Which block of the program the position belongs to. The variable history is
// keyed by block, not by animation piece (variableLog.js), and
// `parseData.elementFrames` is the map between them — built by
// buildAnimationPieces, which records for every piece the index of the block it
// was cut from. With slow debug off there are no pieces and the two are the
// same list, hence the fallback.
//
// `Infinity` once everything is drawn, which is not a shortcut: an assignment
// made after the last move of the program has no element behind which to be
// seen, so without this the value a program sets on its last line would never
// show. At the end of a run the final state is the honest answer.
export function blockIndexAt(position, elementFrames, drawn, total) {
    if (!position) return null
    if (total && drawn >= total) return Infinity
    return elementFrames?.[position.index] ?? position.index
}

// The stored value of one axis at that position, before any display rule.
export function storedValue(position, axis) {
    if (!position) return null
    const key = position.atStart ? `${axis}_start` : axis
    const value = position.element[key]
    return Number.isFinite(value) ? value : null
}

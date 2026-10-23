'use babel'

// Putting a corner between two lines the user clicked: the picking, and turning
// what `lineFilletMath` answers into contour elements.
//
// Every solution that fits is inserted at once, as ordinary elements of the
// contour marked with a group number. Ordinary on purpose: they are drawn,
// listed and deleted like anything else, which is what makes an interrupted
// insertion harmless — whatever is left behind can be removed with the bin, and
// the editor needs no notion of a half-finished state.
//
// The two picked lines are **not** touched: no trimming, no extending, no
// splitting. Shortening them to the corner is what `Divide` and the bin are
// for, and doing it here would mean a wrong pick damaged the contour.

import View from '../sinumerik'
import {draw, getFrame, setAng, updateArcProperties} from "./canvas";
import {updateIntersections} from "./intersections";
import {pushUndoSnapshot} from "./undo";
import {duplicateOf} from "./contourEdit";
import {alertDialog} from "../dialog/alert";
import {lineChamferCandidates, lineFilletCandidates} from "./lineFilletMath";

// What the button says, and the mode it arms. The two are kept apart because
// `action.reset()` finds the button to deselect by its text, and they live here
// because this is the module every user of them already imports.
export const FILLET_BUTTON_TEXT = 'rnd/chr'
export const FILLET_ACTION = 'fillet' 

// The panel's size field, handed over by createContourTools when it builds it.
// This module has to be able to put the cursor back there when the second line
// is picked and no size has been typed yet, and asking the DOM for it by class
// would be that selector written in a second file. Same arrangement as
// tools.js::registerToolListButton.
let valueInput = null

export const registerFilletValueInput = (input) => {
    valueInput = input
}

// contourEdit keeps its geometry in millimetres and converts at the edges where
// the user reads or types it, so a machine whose units are inches has its
// corners stated in inches too — the units toggle defaults from
// `machine.units`, and the size field is read through the same multiplier.
const unitMult = () => View.sinumerikView.contourEditData.units === 'inch' ? 25.4 : 1

// The step a size is stated in: 0.01 mm, or 0.001" — one digit finer, an inch
// being 25.4 times the coarser unit.
const inchMode = () => View.sinumerikView.contourEditData.units === 'inch'

// A range the user can type straight back in: the low bound is rounded up and
// the high one down, so every value the text allows is one the corner really
// accepts. Rounding both to nearest would offer a bound a hundredth outside the
// range and have the next attempt refused again. A window thinner than one step
// has no such pair and is given as the single value nearest its middle.
const formatRange = ([loMm, hiMm]) => {
    const mult = unitMult()
    const step = inchMode() ? 0.001 : 0.01
    const digits = inchMode() ? 3 : 2
    const lo = Math.ceil(loMm / mult / step - 1e-9) * step
    const hi = Math.floor(hiMm / mult / step + 1e-9) * step
    if (hi < lo) return `≈${((loMm + hiMm) / 2 / mult).toFixed(digits)}`
    return `${lo.toFixed(digits)}…${hi.toFixed(digits)}`
}

const rangesText = (fits) => {
    if (!fits || !fits.length) return ''
    return `${fits.map(formatRange).join(' or ')}${inchMode() ? '"' : ' mm'}`
}

const MESSAGES = {
    'lines-parallel': 'These two lines are parallel — there is no corner between them.',
    'line-degenerate': 'One of the picked lines has no length.',
    'radius-not-positive': 'Enter a positive radius.',
    'size-not-positive': 'Enter a positive chamfer size.',
    'radius-too-small': 'The radius is too small to reach both lines.',
    'radius-too-large': 'The radius is too large to stay on both lines.',
    'radius-does-not-fit': 'No radius can touch both of these lines.',
    'size-too-small': 'The chamfer is too small to reach both lines.',
    'size-too-large': 'The chamfer is too large to stay on both lines.',
    'size-does-not-fit': 'No chamfer can reach both of these lines.',
}

// Said in place of the two "nothing fits" lines above when the corner does
// accept something and this value merely fell between two of its ranges, which
// happens where the vertex lies inside one of the segments: both of its sides
// are then in play, and they take different sizes.
const GAP_MESSAGES = {
    'radius-does-not-fit': 'This radius does not fit the corner.',
    'size-does-not-fit': 'This chamfer does not fit the corner.',
}

// Exported for the tests: the rounding of the bounds is the part worth pinning
// down, and nothing else in the editor states it.
export const errorMessage = (error, fits) => {
    const ranges = rangesText(fits)
    const base = (ranges && GAP_MESSAGES[error]) || MESSAGES[error] || error
    return ranges ? `${base} Allowed: ${ranges}.` : base
}

const segmentOf = (el, x, y) => ({
    start: [el.start[x], el.start[y]],
    end: [el.end[x], el.end[y]],
})

// Elements drawn by clicking carry only the two axes of the active plane —
// `setCursorPosition` writes no others — while elements loaded from a shape file
// carry all three. A corner inserted between two of the latter has to keep that
// third coordinate, or it would sit at zero in the axis the contour does not
// lie in.
export const thirdAxisOf = (el, x, y) => {
    const key = Object.keys(el.start).find(k => k !== x && k !== y)
    return key === undefined ? null : {key, value: el.start[key]}
}

// The two plane axes first, the third one last. `changeLinePoint` finds the
// other plane axis as "the first key that is not this one", so a point that
// led with its third axis would be dragged along the wrong one. Exported, with
// `thirdAxisOf`, for the tests: the order is the whole point of the function
// and nothing else in the editor states it.
export const pointOf = (coords, x, y, third) => {
    const point = {[x]: coords[0], [y]: coords[1]}
    if (third) point[third.key] = third.value
    return point
}

// Takes the marked corners of a group out of the contour, keeping `spare` if it
// is one of them. By identity and from the end: `del` shifts the elements above
// the hole down and renumbers every id, so indices taken before it are only
// good while nothing below them has gone.
const removeGroup = (groupId, spare) => {
    const elements = View.sinumerikView.contourEditData.editContour
    const doomed = []
    elements.forEach((el, i) => {
        if (el !== spare && el.filletGroup === groupId) doomed.push(i)
    })
    doomed.reverse().forEach(i => elements.del(i))
}

const elementOf = (candidate, chamfer, x, y, third1, third2) => {
    const element = chamfer
        ? {
            type: 'line',
            start: pointOf(candidate.start, x, y, third1),
            end: pointOf(candidate.end, x, y, third2),
            angBlocked: false,
        }
        : {
            type: 'arc',
            start: pointOf(candidate.t1, x, y, third1),
            middle: pointOf(candidate.middle, x, y, third1 || third2),
            end: pointOf(candidate.t2, x, y, third2),
        }

    if (element.type === 'line') {
        setAng(element)
    } else {
        // The editor keeps an arc by three points and derives the rest, so the
        // centre and the direction are recomputed here rather than copied from
        // the solution — one source for them, not two.
        updateArcProperties(element)
    }
    return element
}

// Builds and inserts every corner of `value` that fits between the two picked
// lines. Called again with another size while corners are on offer, it replaces
// them.
export const applyFillet = (value) => {
    const data = View.sinumerikView.contourEditData
    const filletData = data.filletData
    const resizing = filletData.stage === 'pickVariant'

    if (filletData.lines.length < 2) {
        alertDialog('Pick two lines on the canvas first.')
        return false
    }

    const {x, y} = getFrame()
    const [el1, el2] = filletData.lines
    const chamfer = filletData.mode === 'chr'
    const result = chamfer
        ? lineChamferCandidates({l1: segmentOf(el1, x, y), l2: segmentOf(el2, x, y), size: value})
        : lineFilletCandidates({l1: segmentOf(el1, x, y), l2: segmentOf(el2, x, y), radius: value})

    // Said before anything is touched, so a size the corner cannot take leaves
    // the corners already on offer where they are.
    if (result.error) {
        alertDialog(errorMessage(result.error, result.fits))
        return false
    }

    pushUndoSnapshot()
    // The old set goes first, before the new one is judged for duplicates:
    // otherwise a size close to the previous one would find its own corners,
    // about to be deleted, already in the contour.
    if (resizing) removeGroup(filletData.groupId)

    const third1 = thirdAxisOf(el1, x, y)
    const third2 = thirdAxisOf(el2, x, y)
    const built = result.candidates.map(c => elementOf(c, chamfer, x, y, third1, third2))
    const fresh = built.filter(element => duplicateOf(element) < 0)

    const groupId = filletData.groupId + 1
    fresh.forEach(element => {
        element.filletGroup = groupId
        data.editContour.push(element)
    })

    filletData.groupId = groupId
    filletData.stage = fresh.length ? 'pickVariant' : 'pickLines'
    filletData.appliedValue = fresh.length ? value : null
    // The hover pick was worked out against the elements as they were. Cleared
    // rather than trusted: the click that follows a rebuilt set would otherwise
    // take whatever element has landed on that index.
    data.elements.nearCursor = -1
    updateIntersections()
    draw()

    if (!fresh.length) {
        alertDialog('Every corner of that size is already in the contour.')
        return false
    }
    if (fresh.length < built.length) {
        alertDialog(
            `${built.length - fresh.length} of ${built.length} corners of that size `
            + 'are already in the contour and are not offered again.'
        )
    }
    return true
}

// A new size while corners are on offer replaces them instead of waiting for
// insert: the field loses focus on the very click that would pick one, so the
// next click would otherwise take a corner of the old size.
export const resizeOpenFillet = (value) => {
    const filletData = View.sinumerikView.contourEditData.filletData
    if (filletData.stage !== 'pickVariant') return false
    if (filletData.appliedValue !== null &&
        Math.abs(value - filletData.appliedValue) < 1e-9) return false
    return applyFillet(value)
}

// A click on the canvas while the rnd/chr mode is armed. Returns true when it
// was the mode's business, so `clickHandler` leaves it at that — a click it did
// not want falls through to the ordinary element selection.
export const handleFilletClick = () => {
    const filletData = View.sinumerikView.contourEditData.filletData
    return filletData.stage === 'pickVariant' ? pickFilletVariant() : pickFilletLine()
}

const pickFilletLine = () => {
    const data = View.sinumerikView.contourEditData
    const filletData = data.filletData
    if (filletData.stage !== 'pickLines') return false

    const idx = data.elements.nearCursor
    if (idx < 0) return false
    const element = data.editContour[idx]
    if (!element) return false

    if (element.type !== 'line') {
        // Said only when a line is already picked, which is when the click was
        // plainly an attempt to complete the pair. On the first click it would
        // be a modal dialog for a misclick.
        if (filletData.lines.length) {
            alertDialog('A corner can only be put between two straight lines.')
        }
        return true
    }

    const picked = filletData.lines.indexOf(element)
    if (picked >= 0) {
        // Clicking a picked line again lets go of it, so a wrong pick costs one
        // click rather than leaving the mode.
        filletData.lines.splice(picked, 1)
        draw()
        return true
    }

    // Two are already picked and the corner was refused (a size nothing
    // accepts, or every corner of it already in the contour): this click starts
    // a new pair rather than growing the set to three.
    if (filletData.lines.length >= 2) filletData.lines = []

    filletData.lines.push(element)
    if (filletData.lines.length < 2) {
        draw()
        return true
    }

    if (filletData.value === null) {
        // Nothing typed yet: this is the point in the sequence where the size
        // is asked for, so the cursor goes there instead of a dialog saying so.
        draw()
        if (valueInput) valueInput.focus()
        return true
    }

    applyFillet(filletData.value)
    return true
}

// A click on one of the offered corners: it stays, its siblings go. The two
// lines are still untouched, and the mode stays armed with the same size, so
// the next corner takes two clicks.
const pickFilletVariant = () => {
    const data = View.sinumerikView.contourEditData
    const filletData = data.filletData

    const idx = data.elements.nearCursor
    if (idx < 0) return false
    const chosen = data.editContour[idx]
    // Something else under the cursor: leave the click to the element
    // selection rather than guessing which corner was meant.
    if (!chosen || chosen.filletGroup !== filletData.groupId) return false

    pushUndoSnapshot()
    removeGroup(filletData.groupId, chosen)

    // Clears the picks and the stage, and takes the mark off what is left —
    // which by now is the chosen corner alone, an ordinary element of the
    // contour like any other.
    filletData.reset()
    updateIntersections()
    draw()
    return true
}

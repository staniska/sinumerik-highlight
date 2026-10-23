'use babel'

import View from '../sinumerik'
import {CEditContour, newCreatingElement, updateElementsOl} from "./contourEdit";
import {updateIntersections} from "./intersections";
import {elementProperties} from "./footer/elementProperties";
import {draw} from "./canvas";

// Ten steps back. A snapshot is the whole element array — a contour of a few
// hundred elements is tens of kilobytes, so the depth costs nothing to hold —
// and what keeps it cheap is that one gesture takes one slot, never one
// mutation. Pushing per mutation would be hopeless here: loading a contour from
// the blank/bounding list pushes N elements in a loop, and inserting the
// corners of one angle pushes up to four.
export const UNDO_DEPTH = 10

// Pure half, so the stack can be tested without the View global. `elements`
// is anything array-like (CEditContour included).
export const pushSnapshot = (stack, elements, depth = UNDO_DEPTH) => {
    stack.push(JSON.parse(JSON.stringify(Array.from(elements))))
    while (stack.length > depth) {
        stack.shift()
    }
    return stack
}

const undoStack = () => {
    const data = View.sinumerikView.contourEditData
    if (!data) return null
    if (!data.undoStack) data.undoStack = []
    return data.undoStack
}

// Called before a gesture mutates the contour, never after: the snapshot has
// to be the state the user wants back.
export const pushUndoSnapshot = () => {
    const stack = undoStack()
    if (!stack) return
    pushSnapshot(stack, View.sinumerikView.contourEditData.editContour)
}

// The stack belongs to one plane: G17/G18/G19 switching wipes editContour, and
// a snapshot taken under the old plane would come back projected into the new
// one. Cheaper to forget it than to explain it.
export const clearUndoStack = () => {
    const stack = undoStack()
    if (stack) stack.length = 0
}

// The stroke being drawn right now: `type` is set once a start point exists,
// which is also how creatingElementPoint pre-seeds the next element to chain
// onto the one just pushed. Both cases show a rubber band at the cursor, so
// both are "the element not finished yet" and both go. The mode itself
// (action.name) stays armed — the next click starts a fresh element.
const discardCreatingElement = (data) => {
    if (data.eventData.creatingElement.type === undefined) return false
    data.eventData.creatingElement = newCreatingElement()
    data.eventData.action.confines = []
    return true
}

export const undoContourEdit = () => {
    const stack = undoStack()
    if (!stack) return false

    const data = View.sinumerikView.contourEditData
    // A drag in flight holds references to the elements being replaced; its
    // mousemove handler would keep writing into the discarded objects.
    if (data.points.dragging.length) return false

    // Dropped even when the stack is empty: the stroke is not in the contour
    // yet, so no snapshot covers it.
    const discarded = discardCreatingElement(data)

    if (!stack.length) {
        if (discarded) draw()
        return discarded
    }

    // Restored the same way a saved contour is loaded in tools/fs.js — plain
    // objects in a fresh CEditContour, which is what the editor expects.
    data.editContour = new CEditContour(stack.pop())

    // Element indices moved under the footer panel and the focus arrays: a
    // stale properties panel would write its next edit into whatever element
    // now sits at that index.
    elementProperties()
    // The rnd/chr mode holds references to the elements it was picking between;
    // the restore replaces those objects, so the picks would match nothing and
    // an insertion would be built on discarded ones.
    data.filletData.reset()
    data.points.inFocus = []
    data.elements.nearCursor = -1
    data.elements.propertyEdit = -1

    updateElementsOl()
    updateIntersections()
    draw()
    return true
}

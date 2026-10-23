'use babel'

// Is this element one the contour already has?
//
// Pure, with the plane's axis names passed in, so it can be tested on bare
// numbers. Only the two axes of the active plane are compared: a contour is
// planar, the third coordinate is the same for every element in it, and one
// element carrying it while another does not — which happens as soon as a shape
// file is loaded next to elements drawn by hand — would otherwise read as a
// difference.
//
// Direction of travel is not part of being the same element. A line drawn back
// along itself is the same line, and so is an arc traversed the other way —
// which for an arc means its endpoints swapped **and** its direction flipped.
// Swapping only the endpoints, or flipping only the direction, names the rest
// of the circle instead: the same two points and the same centre, the other way
// round the middle. That one is a different element and must not be taken for a
// duplicate, or deleting it would take real geometry with it.

const DEFAULT_EPS = 1e-4

const samePoint = (p, q, x, y, eps) =>
    p !== undefined && q !== undefined &&
    Math.abs(p[x] - q[x]) <= eps && Math.abs(p[y] - q[y]) <= eps

export const isSameElement = (a, b, x, y, eps = DEFAULT_EPS) => {
    if (!a || !b || a.type !== b.type) return false

    const forward = samePoint(a.start, b.start, x, y, eps) && samePoint(a.end, b.end, x, y, eps)
    const reversed = samePoint(a.start, b.end, x, y, eps) && samePoint(a.end, b.start, x, y, eps)
    if (!forward && !reversed) return false

    if (a.type === 'line') return true

    if (a.type === 'arc') {
        if (!samePoint(a.center, b.center, x, y, eps)) return false
        return forward ? a.ccw === b.ccw : a.ccw !== b.ccw
    }

    return false
}

// The index of the first element of `elements` that is the same as `element`,
// or -1. `element` itself is skipped by identity, so an element already in the
// array can be asked about without finding itself.
export const findSameElement = (elements, element, x, y, eps = DEFAULT_EPS) => {
    for (let i = 0; i < elements.length; i++) {
        if (elements[i] === element) continue
        if (isSameElement(elements[i], element, x, y, eps)) return i
    }
    return -1
}

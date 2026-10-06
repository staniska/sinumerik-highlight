'use babel'

// Borrowing and returning the global parse state around a shape-file
// mini-parse (equipment / tools).
//
// `parseRows` only ever writes into the one global `parseData`, so loading a
// tool outline means temporarily pointing that object at a scratch canvas and
// then putting everything back. If anything is missed on the way out, the
// symptom is not a crash: it is a quietly wrong trajectory in the program the
// user is debugging — a stray TRANS, a fillet carried over from the tool file,
// a plane left in G17. That is why this lives in its own module with no `View`
// import at all: the round-trip is then testable without any harness, and
// `spec/shapeParseState.test.js` asserts it field by field.
//
// Callers (`interpretator.js::runShapeFileParse`) are responsible for the two
// `View`-level flags — `boundingContourRequest` and `boundingMiniParseScope` —
// which are not part of `parseData`.

export function freshFrame() {
    return {
        trans:       {X: 0, Y: 0, Z: 0},
        mirror:      {X: 1, Y: 1, Z: 1},
        rot:         {X: 0, Y: 0, Z: 0},
        basis:       [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
        invertBasis: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
    }
}

// Every field of `parseData` a section's G-code can reach. Kept as an explicit
// list rather than a loop over keys so that adding modal state to the parser
// shows up here as a deliberate decision — a new field that nobody added is a
// field that leaks.
export const BORROWED_FIELDS = [
    'canvas',
    'frame',
    'axesPos',
    'pole',
    'prevMove',
    'plane',
    'diamon',
    'diam90',
    'unitMult',
    'rndm',
    'transformation',
    'moveBeforeTransform',
    'moveGroup',
    'primitives',
    'errors',
    'elementIdCounter',
    'calledSubroutines',
    'currentBucket',
    'activeTool',
    'activeToolR',
    'toolRadiusCompensation',
    'offn',
    'spindleSpeed',
    'feed',
]

// Fields left exactly as the program had them, on purpose: the file is drawn
// in the same plane and the same diameter mode as the active trajectory, which
// is what makes a lathe outline (G18, diametral X) line up with the path it
// rides on. They are still backed up, because the file's own G-code may change
// them.
export const INHERITED_FIELDS = ['plane', 'diamon', 'diam90', 'unitMult', 'rndm']

// Snapshot the borrowed state, then seed the mini-parse.
//
// `plane` is an accessor installed by `clearAxesPos` (coordinates.js:16) whose
// setter derives `planeAxes` / `planeFirstAxes` / `planeCircleAxes`. Reading it
// yields the plain value and assigning it re-derives all three, so a plain
// read/write round-trip is both necessary and sufficient.
// `overrides` seeds inherited fields explicitly. The one that matters is
// `diamon`: a fixture (chuck, steady rest) is drawn in machine coordinates
// where X is a diameter, just like the program, but a tool outline has no
// diametral meaning at all — its zero is the tip and its dimensions are local,
// so a 0.4 mm nose radius would have to be written `X0.8` under an inherited
// `diamon`. The two consumers of this parser genuinely want different answers,
// so the choice is the caller's.
export function borrowParseState(pd, createCanvas, overrides = {}) {
    const backup = {}
    BORROWED_FIELDS.forEach(key => { backup[key] = pd[key] })

    pd.canvas            = createCanvas()
    pd.primitives        = []
    pd.errors            = []        // the delta becomes this file's own errors
    pd.prevMove          = []
    pd.calledSubroutines = new Set()

    // The file is drawn in its own coordinates — for a tool, zero is the
    // reference point P of the compensation system. It must not inherit the
    // program's TRANS/MIRROR/ROT, so the mini-parse gets an identity frame.
    pd.frame   = freshFrame()
    pd.axesPos = {X: 0, Y: 0, Z: 0}
    pd.pole    = {X: 0, Y: 0, Z: 0, AP: 0, RP: 0}

    pd.transformation      = null
    pd.moveBeforeTransform = null
    pd.moveGroup           = ''

    // Compensation and offset are reset, not inherited: a G41 still active in
    // the program must not bend the outline of the file being loaded.
    pd.toolRadiusCompensation = 'G40'
    pd.offn                   = 0

    // Everything in INHERITED_FIELDS is otherwise LEFT AS THE PROGRAM HAS IT.
    // Inheriting `plane` is what makes a lathe outline (G18) line up with the
    // path it rides on; inheriting `unitMult` lets an inch-drawn file load in
    // an inch program. Only what the caller names is changed.
    INHERITED_FIELDS.forEach(key => {
        if (overrides[key] !== undefined) pd[key] = overrides[key]
    })

    return backup
}

// Put everything back, and drop the buckets `parseRows` created along the way.
export function returnParseState(pd, backup, bucket) {
    BORROWED_FIELDS.forEach(key => { pd[key] = backup[key] })

    // Buckets left behind would survive until the next `parseDataClear` and
    // show up as a stray contour source.
    if (bucket !== undefined && bucket !== null) {
        if (pd.variables)       delete pd.variables[bucket]
        if (pd.jumps)           delete pd.jumps[bucket]
        if (pd.mcall)           delete pd.mcall[bucket]
        if (pd.contourElements) delete pd.contourElements[bucket]
    }
}

// Keep only drawable geometry. `msg` / `pause` / `transform` elements carry no
// outline (and `transform` would render as a stray black edge), so they are
// dropped here rather than in every consumer.
export function isShapeGeometry(el) {
    return !!el && typeof el.type === 'string' && /^G[01]$/.test(el.type)
}

// Does this section open with an approach move?
//
// Its leading rapid is the move to the first contour point and is not drawn,
// exactly as for blank/contour (`.slice(1)` in contourEdit/tools/fs.js). The
// test is conditional rather than an unconditional `.slice(1)`, because a
// section that opens with G1 means the author wants that line drawn and
// dropping it would thin the outline by one edge.
//
// Returned as a predicate rather than applied here because the same answer has
// to govern both views of a section — the tessellated canvas and the true
// elements kept alongside it — and they must agree.
export function hasLeadingRapid(shapes) {
    return shapes.length > 0 && shapes[0].type === 'G0'
}

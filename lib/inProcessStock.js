'use babel'

// What the program leaves of the blank — computed without running slow debug.
//
// The trace already knows how to do this: run it over every block of the program
// and the grid it ends with IS the remaining stock. Two things stop that from
// being a one-liner.
//
// The first is that the trace keeps its state in one module-level slot, and the
// renderer paints whatever it finds there. A background run in that slot would
// put the removed material on the canvas with slow debug switched off, so this
// runs in a state of its own, swapped in for the length of a chunk.
//
// The second is that a whole program is hundreds of milliseconds of work, which
// is not something to do between two keystrokes. It is taken in slices with the
// event loop given a turn in between, and a new request cancels the one in
// flight rather than queueing behind it — the program has changed, so the
// answer it was computing is no longer about anything.
//
// See docs/ips-plan.md, phase 2.

import View from './sinumerik'
import {
    advanceMaterialTrace,
    materialTraceState,
    swapMaterialTraceState,
} from './materialTraceRun'
import {stockOutline} from './stockOutline'
import {alertDialog} from './dialog/alert'

const fsPromises = require('fs').promises
const {dialog} = require('electron').remote

// How long one slice may take. Short enough that typing stays smooth, long
// enough that the slicing itself is not the cost.
const SLICE_MS = 10

let current = null

const breathe = () => new Promise(resolve => setTimeout(resolve, 0))

// Abandon the run in flight, if any. Called when the program is reparsed: what
// it was computing was about the previous text.
export function cancelStockRun() {
    if (current) current.cancelled = true
    current = null
}

export function stockRunInFlight() {
    return current !== null
}

// The grid the program ends with, as `{status, grid, …}`.
//
//   ok        — `grid` holds the remaining stock
//   notLathe  — no privileged axis for the columns to run along
//   noBlank   — nothing to remove material from
//   noTools   — the program never had a tool outline to sweep, so an empty
//               result would mean "nothing was cut", which is not the same as
//               "nothing is left"
//   cancelled — a newer request took over
//
// `skippedTool` is carried even on success: blocks that passed without a tool
// removed nothing, so the stock still stands where they cut, and the caller
// should say so rather than present the answer as complete.
export async function buildStockGrid(elements, options = {}) {
    const msBudget = options.msBudget ?? SLICE_MS

    cancelStockRun()
    const token = {cancelled: false}
    current = token

    if (!elements || !elements.length) {
        current = null
        return {status: 'noProgram'}
    }

    // The trace on screen may already be standing at the end of this very
    // program — slow debug was run to the end — and then the stock is already
    // computed. Reading its grid is free and cannot disturb it.
    const shown = materialTraceState()
    if (shown && shown.status === 'ok' && shown.source === elements
        && shown.appliedUpTo >= elements.length) {
        current = null
        return report(shown, true)
    }

    let mine = null
    while (true) {
        const displayed = swapMaterialTraceState(mine)
        let state
        try {
            state = advanceMaterialTrace(elements, elements.length, {msBudget})
            mine = materialTraceState()
        } finally {
            // Whatever happened, the screen gets its own state back.
            swapMaterialTraceState(displayed)
        }

        if (!state || state.status !== 'ok') {
            current = null
            return {status: state ? state.status : 'noTrace'}
        }
        if (mine.appliedUpTo >= elements.length) break

        // The only place anything else gets to run, so the only place a
        // cancellation can have arrived.
        await breathe()
        if (token.cancelled) return {status: 'cancelled'}
    }

    current = null
    return report(mine, false)
}

function report(state, reused) {
    return {
        // A program whose blocks all passed without an outline swept nothing.
        // Handing back the untouched blank would read as "the program removes
        // nothing", which is a different statement from "this program was not
        // understood".
        status: state.swept > 0 ? 'ok' : 'noTools',
        grid: state.grid,
        swept: state.swept,
        skippedTool: state.skippedTool,
        skippedPlane: state.skippedPlane,
        removed: state.removed,
        reused,
    }
}


// ─── the IPS button ──────────────────────────────────────────────────────────

// How far the contour may stray from the stock the grid holds, in mm. The
// user's figure: a blank is approached with clearance anyway, and a tenth of a
// millimetre of staircase is not worth a thousand-element file.
const TOLERANCE = 0.3

// Everything the button knows between presses. Thrown away whenever the program
// is reparsed — what it describes was the previous text.
let computed = null      // [{elements, area, bounds, ...}] from stockOutline
let showing = null       // the piece being drawn in place of the blank
let working = false
let button = null

export function createIpsButton(container) {
    button = document.createElement('button')
    button.className = 'sinumerikButton'
    button.title = 'In-process stock'
    button.addEventListener('click', () => pressed())
    container.appendChild(button)
    paint()
    return button
}

// What the renderers should draw instead of the blank, or null for the blank
// itself. Arcs are tessellated here because the blank is drawn as a filled
// polygon, which reads only straight moves; the file written out keeps them.
export function inProcessStockShape() {
    return showing ? showing.shape : null
}

export function resetInProcessStock() {
    cancelStockRun()
    generation++
    computed = null
    showing = null
    working = false
    paint()
}

// A slow-debug run that reached the end leaves the trace standing on the last
// block, which is the stock this feature exists to describe. Taking it then
// costs nothing and saves the user a press.
export function noteSlowDebugFinished() {
    if (computed || working || !button) return
    generate({quiet: true})
}

function paint() {
    if (!button) return
    button.textContent = working ? 'IPS…' : showing ? 'save IPS' : computed ? 'show IPS' : 'IPS'
    button.disabled = working
    button.classList.toggle('sinumerikButton--ready', !working && !!computed)
}

function pressed() {
    if (working) return
    if (showing) return save()
    if (computed) return show()
    generate({quiet: false})
}

// A press while a run is in flight starts a newer one; the older must then stop
// touching the button, or it will report itself finished over the top of the run
// that replaced it.
let generation = 0

async function generate(options) {
    const mine = ++generation
    const elements = View.sinumerikView.parseData?.canvas
    working = true
    paint()

    let result
    try {
        result = await buildStockGrid(elements ?? [])
    } finally {
        if (mine === generation) {
            working = false
            paint()
        }
    }

    if (mine !== generation || result.status === 'cancelled') return
    if (result.status !== 'ok') {
        computed = null
        paint()
        if (!options.quiet) alertDialog(refusal(result.status))
        return
    }

    computed = stockOutline(result.grid, {tolerance: TOLERANCE})
        .map(piece => ({...piece, shape: tessellate(piece.elements)}))
    if (!computed.length) {
        computed = null
        paint()
        if (!options.quiet) alertDialog('Nothing is left of the blank.')
        return
    }

    paint()
    if (!options.quiet && result.skippedTool > 0) {
        alertDialog(
            `In-process stock computed, but ${result.skippedTool} block(s) ran without a tool outline. ` +
            'Material still stands where those blocks cut.'
        )
    }
}

const refusal = (status) => ({
    noTools: 'No tool outline anywhere in this program, so there is nothing to cut the blank with. ' +
        'Declare a tool with ;TOOL:NAME.',
    notLathe: 'In-process stock is computed for turning only.',
    noBlank: 'This program has no blank to take stock of.',
    noProgram: 'Nothing to run.',
}[status] ?? `In-process stock could not be computed (${status}).`)

function show() {
    showing = computed[0]
    paint()
    redrawOnly()
}

// Redraw without reparsing. `View.redraw()` would do the job and then undo it:
// it goes through the parser, which clears the stock along with everything else
// derived from the program text. That is exactly how the user gets the real
// blank back — press Redraw — so it must not be how it is put on screen.
function redrawOnly() {
    View.sinumerikView.eventRouter?.route('{"emitter": "singleLine", "event": "changeCanvasPrimitives"}')
}

// ─── drawing and writing ─────────────────────────────────────────────────────

// The axes the stock was computed in. The grid runs along the turning plane's
// own pair, which for a lathe is Z and X — never the display axes, which the
// user may have switched.
const AXES = ['Z', 'X']

// Canvas elements, the shape `parseData.blank` has: straight moves only.
function tessellate(elements) {
    const out = []
    const push = (from, to) => out.push({
        type: 'G1',
        [`${AXES[0]}_start`]: from[0], [`${AXES[1]}_start`]: from[1], Y_start: 0,
        [AXES[0]]: to[0], [AXES[1]]: to[1], Y: 0,
    })

    elements.forEach(el => {
        if (el.type === 'line') return push(el.start, el.end)

        const angleAt = (p) => Math.atan2(p[1] - el.center[1], p[0] - el.center[0])
        const from = angleAt(el.start)
        let sweep = angleAt(el.end) - from
        while (sweep > Math.PI) sweep -= 2 * Math.PI
        while (sweep < -Math.PI) sweep += 2 * Math.PI

        const steps = Math.max(2, Math.ceil(Math.abs(sweep) * el.radius))
        let at = el.start
        for (let i = 1; i <= steps; i++) {
            const a = from + (sweep * i) / steps
            const to = i === steps
                ? el.end
                : [el.center[0] + el.radius * Math.cos(a), el.center[1] + el.radius * Math.sin(a)]
            push(at, to)
            at = to
        }
    })

    return out
}

async function save() {
    const piece = showing
    const Editor = atom.workspace.getActiveTextEditor()
    const programPath = Editor?.getPath() ?? ''
    const separator = programPath.match(':') ? '\\' : '/'
    const folder = programPath.substring(0, programPath.lastIndexOf(separator))

    const {canceled, filePath} = await dialog.showSaveDialog({
        title: 'Save in-process stock as a contour',
        defaultPath: folder,
    })
    if (canceled || !filePath) return

    let path = filePath
    if (path.indexOf('.', path.lastIndexOf(separator)) < 1) path += '.MPF'

    try {
        await fsPromises.writeFile(path, stockProgramText(piece).join('\n'))
        alertDialog(`In-process stock saved as ${path.slice(path.lastIndexOf(separator) + 1)}`)
    } catch (e) {
        console.log('in-process stock save', e)
        alertDialog(`Could not write ${path}: ${e.message}`)
    }
}

// The contour as a shape program, in the units and the diameter mode the
// program itself runs under — the same conventions contourEdit writes an area
// with, so the file can be used as a blank without being edited.
export function stockProgramText(piece) {
    const diameters = View.sinumerikView.parseData?.diamon === 1
    const radial = (v) => (diameters ? v * 2 : v)
    const fixed = (v) => Number(v.toFixed(4))

    const point = (p) => `${AXES[0]}${fixed(p[0])} ${AXES[1]}${fixed(radial(p[1]))}`
    const text = [
        ';In-process stock, generated from the material trace',
        `G0 ${point(piece.elements[0].start)}`,
    ]

    piece.elements.forEach(el => {
        if (el.type === 'line') {
            text.push(`G1 ${point(el.end)}`)
            return
        }
        // The fitter never returns an arc sweeping half a turn or more, so the
        // radius is always written positive.
        text.push(`G${el.ccw ? 3 : 2} ${point(el.end)} CR=${fixed(el.radius)}`)
    })

    text.push('M30')
    return text
}

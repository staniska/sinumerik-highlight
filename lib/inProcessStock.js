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

import {
    advanceMaterialTrace,
    materialTraceState,
    swapMaterialTraceState,
} from './materialTraceRun'

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

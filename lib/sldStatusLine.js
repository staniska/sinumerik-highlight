'use babel'

// The one-line status under the SLD canvas.
//
// It has two sources — the parse, and the material trace — and they arrive at
// different times: the parse once per redraw, damage frame by frame during slow
// debug. Both render through here so the wording and the colouring cannot drift
// apart, and so neither can quietly overwrite the other's news.
//
// Imports only `View` and the trace, so both callers can reach it without a
// cycle.

import View from './sinumerik'
import {materialTraceReport} from './materialTraceRun'

// Damage outranks a parse error here. A parse error means a line could not be
// read; a strike or a gouge means the program, as read, destroys something.
// The error count is still carried along so it is never simply hidden.
export function updateSldStatusLine() {
    const stringDiv = View.sinumerikView.singleLineDebugParseStringDiv?.stringDiv
    if (!stringDiv) return

    const errors = View.sinumerikView.parseData?.errors ?? []
    const damage = worstDamage()

    if (damage) {
        const tail = errors.length ? `  ·  ERR (${errors.length})` : ''
        stringDiv.innerText = damage + tail
    } else if (errors.length) {
        stringDiv.innerText = `ERR (${errors.length}).  Last: ${errors[errors.length - 1].text}`
    } else {
        stringDiv.innerText = 'PARSE OK'
    }

    const bad = !!damage || errors.length > 0
    stringDiv.classList.toggle('sinumerikSLDStringDiv--error', bad)
    stringDiv.classList.toggle('sinumerikSLDStringDiv--ok', !bad)
}

// The worst thing the trace found, in a few words. Null when it found nothing.
//
// A holder strike wins over a gouge: a gouge spoils the part, a strike breaks
// the machine. Depths are radial; the full account, with positions and the file,
// is in Details.
function worstDamage() {
    const r = materialTraceReport()
    if (r.status !== 'ok') return null

    const at = g => (g.row === undefined ? '' : ` at row ${g.row + 1}`)

    // Ahead of both, because it invalidates them: a boundary in the wrong place
    // makes every depth measured from it wrong by the same amount.
    if (r.offContour?.count) {
        const w = r.offContour.worst
        return `TRACE IS OFF ${w.deviation.toFixed(3)} mm${at(w)} — check the tool file's zero`
    }

    if (r.collisions?.count) {
        const w = r.collisions.worst
        return `HOLDER HIT STOCK ${w.depth.toFixed(3)} mm${at(w)}` +
            (r.collisions.count > 1 ? ` (+${r.collisions.count - 1} more)` : '')
    }
    if (r.gouges?.count) {
        const w = r.gouges.worst
        return `CUT INTO THE PART ${w.depth.toFixed(3)} mm${at(w)}` +
            (r.gouges.count > 1 ? ` (+${r.gouges.count - 1} more)` : '')
    }
    return null
}

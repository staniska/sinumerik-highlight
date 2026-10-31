'use babel'

// Resolving an `ips` reference: the stock a previous program leaves, computed
// so it can serve as this program's blank.
//
// The work is a full parse of that program plus a trace run over it, and it
// cannot happen inside the parse of the program being drawn: both write the one
// global `parseData`, and reading the other program's tool files is refused
// while a parse is in flight (`interpretator.js::_runShapeFileParse`). So this
// runs as a PRE-PASS, before the parse it feeds, and the two calls into the
// parser arrive as `deps` — that way this module does not import the
// interpretator that imports it.
//
// Chains work by recursion: op30 borrows from op20, which borrows from op10.
// Each link is resolved before the program above it is parsed, and a link's
// result is shared — a chain of N programs costs N−1 runs, not N(N−1)/2.
//
// See docs/ips-blank-plan.md, stage 3.

import View from './sinumerik'
import {normalizeIpsReference, ipsIsTransformed, uniqueProgramNames} from './ipsReference'
import {parseAutoComment} from './inner-comment'
import {readShapeLines, programFilesIn} from './utils'
import {buildStockGrid, outlineTolerance, tessellate} from './inProcessStock'
import {stockOutline} from './stockOutline'

const nodePath = require('path')

// How many borrowed links to follow. A part split into more operations than
// this is not what the feature is for, and the limit is what keeps a mistake
// from being indistinguishable from a hang.
const MAX_CHAIN = 5

// What the last resolve produced, per program being drawn. Not in `parseData`:
// `parseDataClear` runs on every re-parse, and this describes another file.
const resolved = {}

export function ipsResolvedFor(filename) {
    return resolved[filename] ?? null
}

export function resetIpsResolved(filename) {
    if (filename === undefined) Object.keys(resolved).forEach(key => delete resolved[key])
    else delete resolved[filename]
}

// Resolve the blank of `filename`, if it borrows one.
//
// `options.force` recomputes; without it an answer already in hand is returned
// as it is. That is the whole protection against doing this between two
// keystrokes: an edit reuses the last answer, an explicit Redraw asks again.
export async function resolveIpsBlank(filename, deps, options = {}) {
    // The first parse of a session resolves the blank before `progParser` has
    // built its `parseData`, and the trace reads four fields out of it.
    if (!View.sinumerikView.parseData) View.sinumerikView.parseData = {}

    const data = View.sinumerikView.programmData?.[filename]
    if (!data?.ips) {
        delete resolved[filename]
        return null
    }

    const ref = normalizeIpsReference(data.ips)
    if (!ref) {
        resolved[filename] = {status: 'noName'}
        return resolved[filename]
    }

    if (resolved[filename] && !options.force) return resolved[filename]

    deps.markBusy()
    try {
        resolved[filename] = await resolveLink(filename, ref, deps, new Set([filename]), 1)
    } catch (e) {
        console.log('ips resolve', e)
        resolved[filename] = {status: 'failed', detail: e.message, ref}
    } finally {
        deps.unmarkBusy()
    }
    return resolved[filename]
}

// One link: the stock `ref` names, placed for the program that asked.
async function resolveLink(consumer, ref, deps, visited, depth) {
    const result = (status, extra = {}) => ({status, ref, ...extra})

    if (depth > MAX_CHAIN) return result('tooDeep')

    const machineName = View.sinumerikView.programmData?.[consumer]?.machine?.machineName
    const found = await findProgram(ref.name, consumer, machineName)
    if (!found) return result('notFound')
    if (visited.has(found.path)) return result('cycle')

    let text
    try {
        text = await readShapeLines(found.path)
    } catch (e) {
        return result('readError', {detail: e.message})
    }

    const prepared = prepareProgrammData(found.path, text)
    if (!prepared) return result('noMachine')

    // The source may borrow in its turn. Resolved first, and recorded under its
    // own path, so that the parse below injects it exactly the way the parse of
    // the program being drawn will inject this one.
    const ownRef = normalizeIpsReference(View.sinumerikView.programmData[found.path].ips)
    if (View.sinumerikView.programmData[found.path].ips) {
        if (!ownRef) {
            resolved[found.path] = {status: 'noName'}
        } else {
            resolved[found.path] = await resolveLink(
                found.path, ownRef, deps, new Set([...visited, found.path]), depth + 1)
            if (resolved[found.path].status !== 'ok') {
                return result('chainBroken', {detail: resolved[found.path]})
            }
        }
    }

    const neighbours = await programFilesIn(nodePath.dirname(found.path))
    const parsed = await deps.parseProgram(found.path, text, neighbours)

    // Tool outlines are read with the borrow released, as after every other
    // parse: reading one is itself a mini-parse and is refused while `parseData`
    // is spoken for (interpretator.js::progParser does the same dance).
    deps.unmarkBusy()
    try {
        await deps.loadTools(parsed.toolPaths)
    } finally {
        deps.markBusy()
    }

    const grid = await runTrace(found.path, parsed)
    if (!grid || grid.status !== 'ok') return result(grid?.status ?? 'noProgram')

    const pieces = stockOutline(grid.grid, {tolerance: outlineTolerance(grid.grid.pitch)})
    if (!pieces.length) return result('nothingLeft')
    if (pieces.length > 1) return result('manyPieces', {pieces, source: found.path})

    return result('ok', {
        source: found.path,
        pieces,
        elements: canvasElementsOf(pieces[0]),
        // Everything this answer was computed from, for the cache key that
        // replaces `force` in stage 4.
        inputs: {
            program: found.path,
            read: parsed.read,
            tools: parsed.toolPaths,
            machine: View.sinumerikView.programmData[found.path].machine?.machineName ?? null,
        },
        skippedTool: grid.skippedTool,
    })
}

// The trace needs four things out of the live `parseData` — the file it belongs
// to (for the machine), the blank, the finished part and the diameter mode —
// and writes nothing back into it. So this is a four-field loan rather than a
// borrow of the whole state: the canvas it works from is passed in.
async function runTrace(source, parsed) {
    const pd = View.sinumerikView.parseData
    const backup = {
        filename: pd.filename,
        blank: pd.blank,
        contour: pd.contour,
        diamon: pd.diamon,
    }

    pd.filename = source
    pd.blank = parsed.blank
    pd.contour = parsed.contour
    pd.diamon = parsed.diamon

    try {
        return await buildStockGrid(parsed.canvas, {msBudget: 10})
    } finally {
        Object.keys(backup).forEach(key => { pd[key] = backup[key] })
    }
}

// The outline as canvas elements, with the leading rapid a shape file would
// have: `extractFlaggedShape` drops element[0] as the approach move and closes
// the ring itself, so without it the first real edge would be the one dropped.
function canvasElementsOf(piece) {
    const tessellated = tessellate(piece.elements)
    if (!tessellated.length) return []

    const first = tessellated[0]
    const lead = {
        type: 'G0',
        X_start: first.X_start, Y_start: first.Y_start, Z_start: first.Z_start,
        X: first.X_start, Y: first.Y_start, Z: first.Z_start,
    }
    return [lead, ...tessellated]
}

// Register the source program so the parser can run it: `parseRows` reads the
// machine out of `programmData`, and the trace reads it again to decide the
// turning plane. Its own auto-comment is where that comes from — the same text
// the user sees, read through the same pure parser.
//
// An entry already there is left alone: the file may be open, with a machine
// the user activated by hand.
function prepareProgrammData(path, lines) {
    if (!View.sinumerikView.programmData) View.sinumerikView.programmData = {}
    const store = View.sinumerikView.programmData

    if (!store[path]) {
        const parsed = parseAutoComment(lines.join('\n'))
        store[path] = {blank: {name: 'BLANK'}, contour: {name: 'CONTOUR'}}
        if (parsed.machine) {
            // Same back-compat as `loadDataFromComment`: a program commented
            // before the metric/inch toggle existed is metric.
            if (!parsed.machine.units) parsed.machine.units = 'metric'
            store[path].machine = parsed.machine
        }
        if (parsed.blank) store[path].blank = parsed.blank
        if (parsed.contour) store[path].contour = parsed.contour
        if (parsed.ips) {
            delete store[path].blank
            store[path].ips = parsed.ips
        }
    }

    return store[path].machine ? store[path] : null
}

// Where a named program might be: beside the one that names it, then in the
// machine's subroutine folders. The same two places and the same matching rule
// `progParser` uses, because this runs before `progParser` has built its list
// — and for a link deeper in the chain, against a different folder than its.
async function findProgram(name, consumer, machineName) {
    for (const dir of programFolders(consumer, machineName)) {
        const found = (await programFilesIn(dir)).find(entry => entry.name === name)
        if (found) return found
    }
    return null
}

// The folders a program name could be found in: beside the program that names
// it, then the machine's subroutine folders. Shared by the resolver and by the
// autocomplete of the three name fields, so that what is offered is exactly
// what can be resolved.
export function programFolders(consumer, machineName) {
    const dirs = [nodePath.dirname(consumer)]
    const extra = View.sinumerikView.machineData?.subroutines?.[machineName] ?? []
    extra.forEach(dir => { if (dirs.indexOf(dir) < 0) dirs.push(dir) })
    return dirs
}

// Every program name those folders hold, for the autocomplete behind the
// Blank / IPS / Contour fields. A mistyped name is otherwise noticed only as a
// blank that silently is not there.
export async function programNamesFor(consumer, machineName) {
    const entries = []
    for (const dir of programFolders(consumer, machineName)) {
        entries.push(...(await programFilesIn(dir)))
    }
    const self = nodePath.basename(consumer).replace(/\.[^.]*$/, '')
    return uniqueProgramNames(entries, self)
}

// Is there an offset or a mirror that this stage does not apply yet? Said out
// loud rather than ignored: a transform typed and silently dropped is the kind
// of thing that looks like the geometry being wrong.
export function ipsTransformPending(filename) {
    const ref = normalizeIpsReference(View.sinumerikView.programmData?.[filename]?.ips)
    return ipsIsTransformed(ref)
}

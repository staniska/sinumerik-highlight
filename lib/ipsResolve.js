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
// result is cached — so a chain of N programs costs N−1 runs once, and after
// that a few hashes.
//
// See docs/ips-blank-plan.md, stages 3 and 4.

import View from './sinumerik'
import {normalizeIpsReference, uniqueProgramNames, placeStockElements,
    ipsUnitMult} from './ipsReference'
import {parseAutoComment} from './inner-comment'
import {readShapeLines, programFilesIn} from './utils'
import {buildStockGrid, outlineTolerance, tessellate} from './inProcessStock'
import {stockOutline} from './stockOutline'
import {confirmDialog} from './dialog/confirm'

const nodePath = require('path')
const crypto = require('crypto')

// How many borrowed links to follow. A part split into more operations than
// this is not what the feature is for, and the limit is what keeps a mistake
// from being indistinguishable from a hang.
const MAX_CHAIN = 5

// Bumped BY HAND whenever the geometry changes — the grid pitch, the fitter
// tolerance, anything in `materialTrace`. An answer computed by the previous
// version of the code is not a valid cached answer, and nothing about the files
// it was computed from would say so.
const IPS_CACHE_EPOCH = 'ips-1'

// What the last resolve produced, per program being drawn. Not in `parseData`:
// `parseDataClear` runs on every re-parse, and this describes another file.
const resolved = {}

// The stock each source program leaves, with everything needed to tell whether
// it still holds. Kept in memory only: if something is missing from the
// signature, in memory that mistake lasts one session — on disk it would last
// until someone worked out why a restart does not help.
const entries = {}

// Where the text of a modified source was taken from, remembered per source so
// the question is asked once and not on every switch of the active editor.
const takeFrom = {}

export function ipsResolvedFor(filename) {
    return resolved[filename] ?? null
}

// Resolve the blank of `filename`, if it borrows one.
//
//   `compute` — may a cache miss do the work? False on the path a keystroke
//               takes: validating costs milliseconds, recomputing costs
//               seconds, and the answer to that is to say so, not to spend
//               them between two keystrokes.
//   `ask`     — may the user be asked where to read a modified source from?
//               Never from that same path: a modal dialog on every pause in
//               typing is the end of working in the editor.
export async function resolveIpsBlank(filename, deps, options = {}) {
    // The first parse of a session resolves the blank before `progParser` has
    // built its `parseData`, and the trace reads four fields out of it.
    if (!View.sinumerikView.parseData) View.sinumerikView.parseData = {}
    // And `filename` is one of them, for everything that looks up the machine
    // through it — `parseRows` does, on every block with a transformation, and
    // the tool files this pre-pass reads go through `parseRows` too. It is the
    // file being drawn, which is what `progParser` is about to set anyway.
    if (!View.sinumerikView.parseData.filename) View.sinumerikView.parseData.filename = filename

    const data = View.sinumerikView.programmData?.[filename]
    if (!data?.ips) {
        delete resolved[filename]
        return null
    }

    // Nothing has set this `parseData` up yet — the first program of a session
    // resolves its borrowed blank before `progParser` gets to it. Everything
    // below runs a real parse into that object, so it is built here first,
    // the same way the parse itself would build it. Patching the pieces one at
    // a time is what produced three bugs in a row.
    if (!View.sinumerikView.parseData.variables) deps.initParseData(filename)

    const ref = normalizeIpsReference(data.ips)
    if (!ref) {
        resolved[filename] = {status: 'noName'}
        return resolved[filename]
    }

    ensureSaveWatch(deps)

    const opts = {compute: options.compute !== false, ask: !!options.ask}

    deps.markBusy()
    try {
        resolved[filename] = await resolveLink(filename, ref, deps, new Set([filename]), 1, opts)
    } catch (e) {
        console.log('ips resolve', e)
        resolved[filename] = {status: 'failed', detail: e.message, ref}
    } finally {
        deps.unmarkBusy()
    }
    return resolved[filename]
}

// One link: the stock `ref` names.
async function resolveLink(consumer, ref, deps, visited, depth, opts) {
    const result = (status, extra = {}) => ({status, ref, ...extra})

    if (depth > MAX_CHAIN) return result('tooDeep')

    const machineName = View.sinumerikView.programmData?.[consumer]?.machine?.machineName
    const found = await findProgram(ref.name, consumer, machineName)
    if (!found) return result('notFound')
    if (visited.has(found.path)) return result('cycle')

    const source = found.path
    const text = await sourceText(source, opts)
    if (!text) return result('readError')

    const prepared = prepareProgrammData(source, text.lines)
    if (!prepared) return result('noMachine')

    // The source may borrow in its turn, and then ITS blank is an input of its
    // own result: a program fed a different blank cut different metal. So the
    // chain below is resolved first and its signature goes into this link's.
    let chainKey = ''
    if (View.sinumerikView.programmData[source].ips) {
        const ownRef = normalizeIpsReference(View.sinumerikView.programmData[source].ips)
        if (!ownRef) {
            // Its own reference names nothing. Reported against the name WE
            // know it by: a bare "the reference has no program name" leaves the
            // user looking for which of the two programs is meant.
            resolved[source] = {status: 'chainNoName', ref}
            return result('chainBroken', {detail: resolved[source]})
        }
        resolved[source] = await resolveLink(
            source, ownRef, deps, new Set([...visited, source]), depth + 1, opts)
        // `stale` carries a usable answer, just not a current one, and it has no
        // signature — so this link's own check fails too and the whole chain
        // comes back stale together. That is the honest result: one link out of
        // date makes every link above it out of date.
        if (resolved[source].status !== 'ok' && resolved[source].status !== 'stale') {
            return result('chainBroken', {detail: resolved[source]})
        }
        chainKey = resolved[source].signature ?? ''
    }

    // The reference of the SOURCE is read out of memory, not out of its text:
    // an offset changed in the popup and not yet saved leaves the file's hash
    // untouched, and the answer would quietly be the old one.
    const refSig = JSON.stringify(normalizeIpsReference(View.sinumerikView.programmData[source].ips) ?? null)
    const machineSig = machineSignature(View.sinumerikView.programmData[source].machine?.machineName)

    const cached = entries[source]
    if (cached) {
        const signature = await signatureOf(cached.inputs, {refSig, machineSig, chainKey, text})
        if (signature === cached.signature) return placed(cached.result, consumer, ref, signature)
    }

    // Not a moment to spend seconds. What was computed before is handed back as
    // it is, marked `stale`: taking the blank away mid-typing would leave the
    // trajectory hanging in nothing and the trace reporting it as a program
    // with no blank, which is a worse lie than a blank one press out of date.
    if (!opts.compute) {
        return cached
            ? {...placed(cached.result, consumer, ref), status: 'stale'}
            : result('notComputed')
    }

    // The source's OWN subroutine list, built the way `progParser` builds one:
    // its folder first, then its machine's subroutine folders. Not inherited
    // from the program on screen — at pre-pass time that list belongs to
    // whatever file was open before, and the answer would then depend on where
    // the user had been. That was the bug where a three-program chain resolved
    // only after the middle program had been visited once: its blank lived in a
    // machine folder, and nothing else had put that folder on the list.
    const parsed = await deps.parseProgram(source, text.lines,
        await programsFor(source, View.sinumerikView.programmData[source].machine?.machineName))

    // The tool outlines of the source. The busy mark STAYS up through this:
    // dropping it is what the post-parse preload has to do (its reader refuses
    // while a parse is in flight), but here the reader is told to skip that
    // check instead — the pre-pass is the owner of the busy state, and the gap
    // was a window for a queued parse to start inside our own phases.
    const toolFailures = await deps.loadTools(parsed.toolPaths)

    const grid = await runTrace(source, parsed)
    if (!grid || grid.status !== 'ok') {
        // The source's own parse errors go with the refusal. Without them the
        // line says the stock could not be computed and stops exactly where the
        // reason is — and the source is a file the user is not looking at, so
        // there is nowhere else for them to appear.
        return result(grid?.status ?? 'noProgram', {errors: [...toolFailures, ...parsed.errors]})
    }

    const pieces = stockOutline(grid.grid, {tolerance: outlineTolerance(grid.grid.pitch)})
    if (!pieces.length) return result('nothingLeft')
    if (pieces.length > 1) return result('manyPieces', {pieces, source})

    const inputs = inputsOf(source, parsed)
    const signature = await signatureOf(inputs, {refSig, machineSig, chainKey, text})

    const answer = {
        status: 'ok',
        source,
        pieces,
        elements: canvasElementsOf(pieces[0]),
        skippedTool: grid.skippedTool,
        takenFrom: text.from,
        // Carried even on success: a block whose tool outline is missing simply
        // removes nothing, so the stock looks plausible while material stands
        // where that block cut.
        errors: toolFailures,
    }
    // Stored UNPLACED, in the source's own datum. Two programs may borrow the
    // same stock with different offsets, and a chain would transform a stored
    // transformed one twice.
    entries[source] = {inputs, signature, result: answer}

    return placed(answer, consumer, ref, signature)
}

// The answer as the program that asked for it needs it: moved and mirrored into
// its datum, with the offset read in its machine's units.
function placed(answer, consumer, ref, signature) {
    const machine = View.sinumerikView.programmData?.[consumer]?.machine
    return {
        ...answer,
        ref,
        signature,
        elements: placeStockElements(answer.elements, ref, ipsUnitMult(machine)),
    }
}

// ─── what an answer was computed from ────────────────────────────────────────

// Every file that went into it, each with the rule its reader used — the hash
// has to be of what the parse actually consumed, or it invalidates for ever
// (hashing a buffer the parse did not read) or not at all (hashing a file when
// the parse read the buffer).
//
// A source that starts calling a file it never called before changes its own
// text, so a set that grew is caught by the source's own hash.
function inputsOf(source, parsed) {
    const data = View.sinumerikView.programmData[source] ?? {}
    return classifyInputs(source, parsed, [data.blank?.name, data.contour?.name].filter(Boolean))
}

// Pure, so the classification can be checked on its own: getting a kind wrong
// is either a cache that never holds or one that never notices.
export function classifyInputs(source, parsed, shapeNames) {
    const names = (shapeNames ?? []).map(name => String(name).toUpperCase())
    const isShape = (path) => {
        const name = nodePath.basename(path).replace(/\.[^.]*$/, '').toUpperCase()
        return names.indexOf(name) > -1
    }

    const inputs = [{path: source, kind: 'source'}]
    const seen = new Set([source])
    ;(parsed?.read ?? []).forEach(path => {
        if (seen.has(path)) return
        seen.add(path)
        // Shapes are read from disk by rule (`readShapeLines`); a subroutine is
        // read from the open buffer when there is one (`readProgramLines`).
        inputs.push({path, kind: isShape(path) ? 'disk' : 'program'})
    })
    // Tool files are shape files: disk.
    ;(parsed?.toolPaths ?? []).forEach(path => {
        if (seen.has(path)) return
        seen.add(path)
        inputs.push({path, kind: 'disk'})
    })
    return inputs
}

let missingSeq = 0

const hashOf = (text) => crypto.createHash('md5').update(text ?? '').digest('hex')

// One string standing for everything the answer depends on. A checksum rather
// than a timestamp: the text being edited is a buffer, which has no mtime at
// all; `git checkout` and a copy change mtime without changing content; and
// worst, a folder sync can preserve mtime while changing content, which would
// leave a silently wrong blank.
export async function signatureOf(inputs, context) {
    const parts = [IPS_CACHE_EPOCH, context.refSig, context.machineSig, context.chainKey]

    for (const input of inputs) {
        const text = input.kind === 'source'
            ? context.text.text
            : await inputText(input)
        parts.push(`${input.path}:${hashOf(text)}`)
    }
    return hashOf(parts.join('|'))
}

async function inputText(input) {
    if (input.kind === 'program') {
        const editor = atom.workspace.getTextEditors().find(e => e.getPath() === input.path)
        if (editor) return editor.getText()
    }
    try {
        return (await readShapeLines(input.path)).join('\n')
    } catch (e) {
        // A file that has gone is a change like any other, and must never read
        // as "unchanged": a counter rather than a clock, so two checks in the
        // same millisecond cannot agree.
        return `missing:${++missingSeq}`
    }
}

// The machine of the source, as a value. Its tool list, its carriage and its
// units all reach the trace, and none of them live in a file this would
// otherwise hash.
function machineSignature(machineName) {
    const machine = View.sinumerikView.machineData?.machines?.[machineName]
    return machine ? hashOf(JSON.stringify(machine)) : `none:${machineName ?? ''}`
}

// ─── disk or buffer ──────────────────────────────────────────────────────────

// A source that is open and modified is two different programs: the one on disk
// and the one on screen. Which one is meant is the user's to say — and the
// question is itself the reminder that the previous operation has unsaved
// changes.
//
// Asked once per source. Not asked at all on the path a keystroke takes; there
// the remembered answer is used, and without one the file on disk wins, with a
// line in the errors so the choice is not invisible.
async function sourceText(source, opts) {
    const editor = atom.workspace.getTextEditors().find(e => e.getPath() === source)

    if (!editor || !editor.isModified()) {
        // Nothing to choose between any more.
        delete takeFrom[source]
        try {
            const lines = await readShapeLines(source)
            return {lines, text: lines.join('\n'), from: 'disk'}
        } catch (e) {
            return null
        }
    }

    if (!takeFrom[source] && opts.ask) {
        const name = nodePath.basename(source)
        takeFrom[source] = confirmDialog(
            `${name} has unsaved changes.\n\n` +
            'Take its stock from the editor as it is now?\n' +
            'Cancel — take it from the saved file.\n\n' +
            `${name} содержит несохранённые изменения.\n` +
            'Взять остаток из редактора? Отмена — из сохранённого файла.'
        ) ? 'buffer' : 'disk'
    }

    if (takeFrom[source] === 'buffer') {
        const text = editor.getText()
        return {lines: text.split('\n'), text, from: 'buffer'}
    }

    try {
        const lines = await readShapeLines(source)
        return {lines, text: lines.join('\n'), from: 'disk-while-modified'}
    } catch (e) {
        return null
    }
}

// Saving a source is the moment its stock really has changed, and it is an
// action in that file rather than a keystroke in this one — so it is the right
// place to recompute from. The entry goes, the remembered disk/buffer answer
// goes with it (there is nothing to choose between any more), and the program
// on screen is redrawn if it depended on the file saved.
let saveWatch = null

function ensureSaveWatch(deps) {
    if (saveWatch) return
    saveWatch = atom.workspace.observeTextEditors(editor => {
        editor.onDidSave(() => {
            const path = editor.getPath()
            if (!path) return
            delete takeFrom[path]

            const affected = Object.keys(entries)
                .filter(source => entries[source].inputs.some(input => input.path === path))
            if (!affected.length) return

            affected.forEach(source => delete entries[source])
            deps.onSourceSaved?.()
        })
    })
}

// ─── the trace, and the shape it leaves ──────────────────────────────────────

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

// ─── finding a program by name ───────────────────────────────────────────────

// The folders a program name could be found in: beside the program that names
// it, then the machine's subroutine folders. Shared by the resolver and by the
// autocomplete of the three name fields, so that what is offered is exactly
// what can be resolved.
function programFolders(consumer, machineName) {
    const dirs = [nodePath.dirname(consumer)]
    const extra = View.sinumerikView.machineData?.subroutines?.[machineName] ?? []
    extra.forEach(dir => { if (dirs.indexOf(dir) < 0) dirs.push(dir) })
    return dirs
}

// Every program name those folders hold, for the autocomplete behind the
// Blank / IPS / Contour fields. A mistyped name is otherwise noticed only as a
// blank that silently is not there.
export async function programNamesFor(consumer, machineName) {
    const self = nodePath.basename(consumer).replace(/\.[^.]*$/, '')
    return uniqueProgramNames(await programsFor(consumer, machineName), self)
}

// Every program of those folders, in the order a lookup should see them: the
// program's own folder wins over a machine folder, exactly as in `progParser`.
// Duplicate names are kept rather than merged, for the same reason — first one
// found wins, and that has to mean the same thing in both places.
export async function programsFor(consumer, machineName) {
    const entriesFound = []
    for (const dir of programFolders(consumer, machineName)) {
        entriesFound.push(...(await programFilesIn(dir)))
    }
    return entriesFound
}

async function findProgram(name, consumer, machineName) {
    for (const dir of programFolders(consumer, machineName)) {
        const found = (await programFilesIn(dir)).find(entry => entry.name === name)
        if (found) return found
    }
    return null
}

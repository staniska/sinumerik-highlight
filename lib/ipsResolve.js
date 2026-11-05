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
// The plan this was written from is gone (passed); what it decided lives in
// CLAUDE.md, «IPS как заготовка».

import View from './sinumerik'
import {normalizeIpsReference, uniqueProgramNames, placeStockElements,
    ipsUnitMult, matchPiece} from './ipsReference'
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

// Whether a source that declares no machine may use the machine of the program
// being drawn. Per source, remembered like `takeFrom` and for the same reason —
// and `false` is remembered too, or a refusal would be re-asked on every
// redraw.
//
// The ANSWER is remembered, not the machine it meant: the machine is read again
// on every resolve, so switching the drawn program to another one carries
// through to the borrowed stock, and the signature below changes with it. A
// remembered name would freeze the first answer and go on handing back a stock
// computed on a machine that is no longer in use, without saying so.
const borrowMachine = {}

export function ipsResolvedFor(filename) {
    return resolved[filename] ?? null
}

// Resolve the blank of `filename`, if it borrows one.
//
//   `compute` — may a cache miss do the work? False on the path a keystroke
//               takes: validating costs milliseconds, recomputing costs
//               seconds, and the answer to that is to say so, not to spend
//               them between two keystrokes.
//   `ask`     — may the user be asked where to read a modified source from, and
//               whether a source with no machine may use this program's?
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

    // `rootMachine` is the machine of the file the redraw started from — this
    // one — and it is passed down the whole chain rather than taken from each
    // link's own consumer. A part split into three operations is made on one
    // machine, which is the premise of the offer; reading it off the immediate
    // consumer would make the machine a middle program happens to declare the
    // answer for the one below it, which is a rule nobody could follow.
    const opts = {
        compute: options.compute !== false,
        ask: !!options.ask,
        rootMachine: data.machine ?? null,
    }

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

    const store = prepareProgrammData(source, text.lines)
    const machine = sourceMachine(source, store, opts)
    if (!machine) return result('noMachine')

    // Everything below runs with that machine in place: the chain recursion
    // looks the next link up in ITS folders, `machineSig` puts it in the
    // signature so a switch of machine invalidates the answer, and the parse
    // and the trace read it through `programmData`.
    return withSourceMachine(store, machine, async () => {
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
            if (!cached) return result('notComputed')
            const answer = placed(cached.result, consumer, ref)
            // A piece that cannot be identified is worth saying even about an
            // answer that is out of date anyway.
            return answer.status === 'ok' ? {...answer, status: 'stale'} : answer
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

        const inputs = inputsOf(source, parsed)
        const signature = await signatureOf(inputs, {refSig, machineSig, chainKey, text})

        const answer = {
            status: 'ok',
            source,
            pieces,
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
    })
}

// The answer as the program that asked for it needs it: one piece of it, moved
// and mirrored into its datum, with the offset read in its machine's units.
//
// Everything here is the CONSUMER's business and none of it is cached: two
// programs may take different pieces of the same stock with different offsets,
// and a chain of three would transform a stored transformed one twice.
function placed(answer, consumer, ref, signature) {
    const machine = View.sinumerikView.programmData?.[consumer]?.machine
    const carry = {...answer, ref, signature}

    // Which piece: what this program says, else what the source itself
    // recorded when the choice was made there, else — if it leaves only one —
    // that one.
    const chosen = matchPiece(answer.pieces, ref?.piece ?? sourcePieceOf(answer.source))
    if (chosen.error) {
        return {...carry, status: chosen.error === 'unchosen' ? 'manyPieces'
            : chosen.error === 'ambiguous' ? 'pieceAmbiguous' : 'pieceGone'}
    }

    return {
        ...carry,
        chosenPiece: chosen.index,
        elements: placeStockElements(
            canvasElementsOf(answer.pieces[chosen.index]), ref, ipsUnitMult(machine)),
    }
}

// What the source program recorded for itself, in its own auto-comment, the
// time someone looked at the pictures and chose. The default for everyone who
// borrows from it; a program that wants the other piece says so in its own
// reference.
function sourcePieceOf(source) {
    return View.sinumerikView.programmData?.[source]?.ipsPiece ?? null
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
            'Cancel — take it from the saved file.'
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
// place to recompute from. The entry goes, the remembered answers go with it
// (there is nothing to choose between any more, and the comment may now name a
// machine), and the program on screen is redrawn if it depended on the file
// saved.
let saveWatch = null

function ensureSaveWatch(deps) {
    if (saveWatch) return
    saveWatch = atom.workspace.observeTextEditors(editor => {
        editor.onDidSave(() => {
            const path = editor.getPath()
            if (!path) return
            delete takeFrom[path]
            // And the borrowed-machine answer: saving is when a machine may
            // have been written into that file's auto-comment, and it is the
            // one event that lets an accidental Cancel be taken back without
            // restarting Pulsar.
            delete borrowMachine[path]

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
        // Every field it declares, the way `loadDataFromComment` takes them —
        // `ipsPiece` among them, which is how a source that parts off says
        // which piece it means.
        Object.keys(parsed).forEach(key => { store[path][key] = parsed[key] })
        if (store[path].machine && !store[path].machine.units) {
            // Same back-compat as `loadDataFromComment`: a program commented
            // before the metric/inch toggle existed is metric.
            store[path].machine.units = 'metric'
        }
        // Mutually exclusive, and that holds from the moment the file is read.
        if (parsed.ips) delete store[path].blank
    }

    return store[path]
}

// The machine the source's parse runs on: the one it declares, else — asked
// once per source — the machine of the program being drawn.
//
// A part split into op10 / op20 / op30 is made on one machine, so repeating it
// in three auto-comments is work that only creates a way to get it wrong. What
// cannot be done is to assume it: a source may be a program for another machine
// that simply carries no comment, and then the borrowed units, tool list and
// subroutine folders are all the wrong ones — so the offer names the machine it
// is making, and a refusal leaves the stock uncomputed exactly as before.
//
// Not asked on the path a keystroke takes (`opts.ask`), where an unanswered
// source stays `noMachine`: the pre-pass runs before every parse, and a modal
// dialog between two keystrokes is the end of working in the editor.
export function sourceMachine(source, store, opts) {
    if (store.machine) return store.machine

    const root = opts.rootMachine
    if (!root?.machineName) return null

    if (borrowMachine[source] === undefined) {
        if (!opts.ask) return null
        const name = nodePath.basename(source)
        // Named, with its type and units: those three are what make a borrowed
        // machine the wrong one, and the answer is remembered for the session.
        borrowMachine[source] = confirmDialog(
            `${name} has no machine in its auto-comment, so its leftover stock cannot be computed.\n\n` +
            `Use ${root.machineName} (${root.machineType ?? 'type not set'}, ${root.units ?? 'metric'}), ` +
            'the machine of the program being drawn?\n' +
            'Cancel — leave the stock uncomputed.'
        )
    }

    return borrowMachine[source] ? root : null
}

// Lend the source its machine for the length of the resolve.
//
// `programmData` is keyed by path and shared with the editor's own view of that
// file, so a borrowed machine written into it permanently would show up as a
// machine op10 never declared the moment someone opened op10 — and its own
// trace would then run on it, having asked nobody. The parse reads the machine
// through `programmData[parseData.filename]`, so it has to be there while the
// parse runs and nowhere else.
export async function withSourceMachine(store, machine, run) {
    if (store.machine === machine) return run()

    const had = Object.prototype.hasOwnProperty.call(store, 'machine')
    const was = store.machine
    store.machine = machine
    try {
        return await run()
    } finally {
        if (had) store.machine = was
        else delete store.machine
    }
}

// ─── finding a program by name ───────────────────────────────────────────────

// The folders a program name could be found in: beside the program that names
// it, then the machine's subroutine folders — the same two places, in the same
// order, that `progParser` builds its subroutine list from.
//
// The second place is wrong for a blank, a contour or a stock source and right
// for a subroutine call, and this list serves both. Kept as it is on purpose;
// see the note on `programNamesFor`.
function programFolders(consumer, machineName) {
    const dirs = [nodePath.dirname(consumer)]
    const extra = View.sinumerikView.machineData?.subroutines?.[machineName] ?? []
    extra.forEach(dir => { if (dirs.indexOf(dir) < 0) dirs.push(dir) })
    return dirs
}

// The program names to suggest behind the Blank / IPS / Contour fields: the
// ones in the program's OWN folder, and no others.
//
// Not the folders a name is RESOLVED in (`programsFor`), which also take in the
// machine's subroutine folders — those hold the cycles, hundreds of them, and a
// list of cycles is not a list of answers to any of these three questions. What
// belongs in these fields lives beside the program: the stock source is the
// previous operation of the same job, and a blank or a contour is a shape drawn
// for this part.
//
// That the resolver accepts a name from a machine folder at all is a DEFECT, not
// a door left open on purpose: a cycle is not a shape, and naming one as a blank
// gets whatever its PROC draws. It is inherited from the lookup `progParser`
// does and is left alone deliberately — narrowing it would change how cycles are
// found and parsed, which is a far larger risk than a name nobody is now
// offered. Not suggesting them is the whole of the mitigation.
//
// `includeSelf` is the field's to decide. For a blank or a contour the program's
// own name is a usable answer — the shape comes off the disk and the trajectory
// off the buffer, so naming itself shows the edits in hand over the version last
// saved. For a stock source it is not: borrowing from itself is a loop.
export async function programNamesFor(consumer, includeSelf = false) {
    const self = includeSelf
        ? null
        : nodePath.basename(consumer).replace(/\.[^.]*$/, '')
    return uniqueProgramNames(await programFilesIn(nodePath.dirname(consumer)), self)
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

'use babel';

const fs = require('fs-extra')

export const normalizeFileName = (name) => name.replace(/\./g, '_').toUpperCase()

// Linear axes carry length values and scale with unitMult (inch/metric).
// Excludes rotary axes (A/B/C) and any spindle axis name (e.g. C1/C2 on a
// lathe), which are angular/degrees and must never be scaled.
export const isLinearAxis = (name) => /^[XYZUVW]$/.test(name)

// Sinumerik string literals may contain spaces ("HELLO WORLD"), but the parser
// tokenizes rows with programRow.split(' '), which would tear such literals
// apart. We mask spaces *inside double-quoted literals* with a sentinel before
// parsing (maskStringSpaces), let the masked strings flow through the whole
// evaluation core untouched (comparison / assignment / << concatenation stay
// consistent because the sentinel is just an ordinary char everywhere), and
// unmask only at the "leaves" where a string leaves the interpreter:
//   - MSG          → shown to the user
//   - EXECSTRING   → re-executed as G-code (needs real spaces to re-tokenize)
//   - WRITE        → future, writes to file/screen
//   - error texts  → echo program source back to the user
// READ (future) is symmetric: mask spaces on input and everything stays consistent.
//
// The sentinel is a single Private-Use-Area char: it never occurs in G-code,
// keeps substring/indexOf offsets intact (single char), and is regex/eval-safe.
export const STRING_SPACE_SENTINEL = String.fromCharCode(0xE000)

// Replace spaces inside double-quoted literals with the sentinel. Non-greedy
// per-literal ("[^"]*") so structural spaces between literals / around << are
// left untouched. Only double quotes — single quotes are binary/hex constants.
export const maskStringSpaces = (line) =>
    typeof line === 'string'
        ? line.replace(/"[^"]*"/g, m => m.split(' ').join(STRING_SPACE_SENTINEL))
        : line

// Reverse of maskStringSpaces. Safe to call on any string (no-op without a
// sentinel), so leaves can unmask unconditionally.
export const unmaskStringSpaces = (str) =>
    typeof str === 'string' ? str.split(STRING_SPACE_SENTINEL).join(' ') : str

// Subdivide a canvas element into smaller pieces for slow-debug animation.
// step = max(1, 0.16 × length^0.7) → ~4mm pieces at 100mm, ~20mm at 1000mm.
export function subdivideElement(element) {
    const axes = ['X', 'Y', 'Z']
    const len  = Math.sqrt(axes.reduce((s, ax) => s + (element[ax] - element[`${ax}_start`]) ** 2, 0))
    if (len <= 1) return [element]
    const step = Math.max(1, 0.16 * Math.pow(len, 0.7))
    const nums = Math.round(len / step)
    const result = []
    const base   = JSON.parse(JSON.stringify(element))
    for (let i = 0; i < nums; i++) {
        const sub = JSON.parse(JSON.stringify(base))
        axes.forEach(ax => {
            sub[`${ax}_start`] = element[`${ax}_start`] + (element[ax] - element[`${ax}_start`]) * (i / nums)
            sub[ax]            = element[`${ax}_start`] + (element[ax] - element[`${ax}_start`]) * ((i + 1) / nums)
        })
        result.push(sub)
    }
    return result
}

// Read a program file as an array of lines.
// Prefers the live editor buffer if the file is open in Pulsar so that
// unsaved changes in the subroutine are picked up without saving.
export async function readProgramLines(filePath) {
    const openEditor = atom.workspace.getTextEditors().find(e => e.getPath() === filePath)
    if (openEditor) return openEditor.getText().split('\n')
    return (await fs.promises.readFile(filePath, 'utf8')).split('\n')
}

// Read shape program (blank / contour / any future shape) lines from disk,
// ignoring unsaved buffer changes. The visual difference between live
// trajectory (buffer) and saved shape (disk) makes shape edits immediately
// visible while editing.
export async function readShapeLines(filePath) {
    return (await fs.promises.readFile(filePath, 'utf8')).split('\n')
}

const BOUNDING_BEGIN_RE = /^\s*;\s*BOUNDING_CONTOUR_BEGIN\b/
const BOUNDING_END_RE   = /^\s*;\s*BOUNDING_CONTOUR_END\b/

// Extract the bounding-contour block from a subroutine source.
// Returns { body, beginRow, endRow } where body is the array of inner
// lines with the leading `;` and surrounding whitespace stripped, or
// null when no block is present. Logs a warning and returns null on
// malformed input (duplicate BEGIN, END without BEGIN, BEGIN without END).
export function extractBoundingContourBlock(lines) {
    let beginIdx = -1
    let endIdx = -1

    for (let i = 0; i < lines.length; i++) {
        if (BOUNDING_BEGIN_RE.test(lines[i])) {
            if (beginIdx !== -1) {
                console.warn(`extractBoundingContourBlock: duplicate BEGIN at line ${i + 1}`)
                return null
            }
            beginIdx = i
            continue
        }
        if (BOUNDING_END_RE.test(lines[i])) {
            if (beginIdx === -1) {
                console.warn(`extractBoundingContourBlock: END without BEGIN at line ${i + 1}`)
                return null
            }
            endIdx = i
            break
        }
    }

    if (beginIdx === -1) return null
    if (endIdx === -1) {
        console.warn('extractBoundingContourBlock: BEGIN without matching END')
        return null
    }

    const body = []
    for (let i = beginIdx + 1; i < endIdx; i++) {
        const raw = lines[i]
        if (!raw.trim().length) continue
        if (!/^\s*;/.test(raw)) {
            console.warn(`extractBoundingContourBlock: non-comment line at ${i + 1} ignored: ${raw}`)
            continue
        }
        const stripped = raw.replace(/^\s*;\s*/, '').trimEnd()
        if (stripped.length > 0) body.push(stripped)
    }
    return { body, beginRow: beginIdx, endRow: endIdx }
}

// Build the slow-debug animation list, and say where each piece came from.
//
// `frameOf[i]` is the index in `canvas` of the program block piece `i` belongs
// to, and `endFracOf[i]` how far along that block the piece ends. The material
// trace runs on blocks, not pieces — a compensated block takes its correction
// up across the whole block, so a piece of one is not a smaller block — and
// these two arrays are what let it tell which block the animation is inside and
// how much of it to show.
export function buildAnimationPieces(canvas) {
    const elements = []
    const frameOf = []
    const endFracOf = []

    ;(canvas ?? []).forEach((element, frame) => {
        if (element.type === 'msg' || element.type === 'pause') {
            elements.push(element)
            frameOf.push(frame)
            endFracOf.push(1)
            return
        }
        const pieces = subdivideElement(element)
        pieces.forEach((sub, i) => {
            elements.push(sub)
            frameOf.push(frame)
            endFracOf.push((i + 1) / pieces.length)
        })
    })

    return {elements, frameOf, endFracOf}
}

// Which program blocks the trace owes, and which one is only being shown.
//
// `pieceLimit` is how many animation pieces have been drawn. A block is applied
// once its last piece is drawn; the block the animation is inside is handed back
// as `partial` instead, for the overlay that paints without applying.
//
// Without the mapping (slow debug off, or a stale list) pieces ARE blocks.
export function traceFrameTarget(frameOf, endFracOf, pieceLimit, frameCount) {
    if (!frameOf || frameOf.length !== (endFracOf?.length ?? -1)) {
        return {limit: Math.min(pieceLimit, frameCount), partial: null}
    }

    const limit = pieceLimit >= frameOf.length ? frameCount : frameOf[pieceLimit]
    if (pieceLimit <= 0) return {limit, partial: null}

    const index = frameOf[pieceLimit - 1]
    const fraction = endFracOf[pieceLimit - 1]
    const partial = index >= limit && fraction < 1 ? {index, fraction} : null
    return {limit, partial}
}

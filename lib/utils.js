'use babel';

const fs = require('fs-extra')

export const normalizeFileName = (name) => name.replace(/\./g, '_').toUpperCase()

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

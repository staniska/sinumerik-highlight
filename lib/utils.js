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

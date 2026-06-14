'use babel';

const fs = require('fs-extra')

export const normalizeFileName = (name) => name.replace(/\./g, '_').toUpperCase()

// Read a program file as an array of lines.
// Prefers the live editor buffer if the file is open in Pulsar so that
// unsaved changes in the subroutine are picked up without saving.
export async function readProgramLines(filePath) {
    const openEditor = atom.workspace.getTextEditors().find(e => e.getPath() === filePath)
    if (openEditor) return openEditor.getText().split('\n')
    return (await fs.promises.readFile(filePath, 'utf8')).split('\n')
}

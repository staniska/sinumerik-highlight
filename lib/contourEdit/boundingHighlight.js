'use babel'

let _decoration = null
let _cursorSub = null

function _stopCursorWatch() {
    _cursorSub?.dispose()
    _cursorSub = null
}

export function clearBoundingHighlight() {
    _decoration?.marker?.destroy()
    _decoration = null
    _stopCursorWatch()
}

// Highlight a row in the file at filePath using the same visual style
// as single-line-debug's active-line decoration. Moving the cursor in
// that editor clears the highlight.
export function highlightBoundingRow(filePath, row) {
    clearBoundingHighlight()
    if (!filePath || row == null) return

    const editor = atom.workspace.getTextEditors().find(e => e.getPath() === filePath)
    if (!editor) return

    const marker = editor.markBufferRange([[row, 0], [row, Infinity]], {invalidate: 'never'})
    editor.decorateMarker(marker, {type: 'line',        class: 'sld-active-line'})
    editor.decorateMarker(marker, {type: 'line-number', class: 'sld-active-line'})
    _decoration = {marker, editor}

    editor.scrollToBufferPosition([row, 0], {center: true})
    _cursorSub = editor.onDidChangeCursorPosition(() => clearBoundingHighlight())
}

'use babel'

require = require('esm')(module)

import View from '../sinumerik'

const path = require('path')
const fs   = require('fs')


let popupEl = null

export function showSubroutinePopup(el) {
    hideSubroutinePopup()

    const mainWindow = View.sinumerikView.singleLineDebugMainWindow
    const parseData  = View.sinumerikView.parseData

    // el.sourceFile may be a transformed name ('SUB_SPF') rather than a real
    // path when the subroutine comes from a cycles/machine folder. Resolve the
    // actual path via parseData.subroutines before reading or displaying.
    const realPath = _resolveSourcePath(el.sourceFile)
    const lines = _readLines(realPath)

    popupEl = document.createElement('div')
    popupEl.className = 'sld-subroutine-popup'

    // Header — subroutine file name
    const header = document.createElement('div')
    header.className = 'sld-popup-header'
    header.textContent = path.basename(realPath)
    popupEl.appendChild(header)

    // Callstack — one level: main file call line → subroutine line
    const callstack = document.createElement('div')
    callstack.className = 'sld-popup-callstack'
    const mainName = path.basename(parseData.filename ?? '')
    const subName  = path.basename(realPath)
    callstack.textContent =
        `${mainName} : ${(el.mainRow ?? 0) + 1}  →  ${subName} : ${el.row + 1}`
    popupEl.appendChild(callstack)

    // Code block with syntax highlighting
    const codeEl = document.createElement('pre')
    codeEl.className = 'sld-popup-code syntax--sinumerik-popup'
    // Match editor font settings so highlighting looks identical to the editor
    const editorFontFamily = atom.config.get('editor.fontFamily')
    const editorFontSize   = atom.config.get('editor.fontSize')
    if (editorFontFamily) codeEl.style.fontFamily = editorFontFamily
    if (editorFontSize)   codeEl.style.fontSize   = `${editorFontSize}px`
    if (lines) {
        _renderCode(codeEl, lines, el.row)
    } else {
        codeEl.textContent = '(file not readable)'
    }
    popupEl.appendChild(codeEl)

    // Footer — Close / Edit buttons
    const footer = document.createElement('div')
    footer.className = 'sld-popup-footer'

    const closeBtn = document.createElement('button')
    closeBtn.className = 'sinumerikButton'
    closeBtn.textContent = 'Close'
    closeBtn.addEventListener('click', hideSubroutinePopup)
    footer.appendChild(closeBtn)

    const editBtn = document.createElement('button')
    editBtn.className = 'sinumerikButton'
    editBtn.textContent = 'Edit'
    editBtn.addEventListener('click', () => {
        atom.workspace.open(realPath, {
            initialLine: el.row,
            initialColumn: 0,
            searchAllPanes: true
        })
        hideSubroutinePopup()
    })
    footer.appendChild(editBtn)

    popupEl.appendChild(footer)
    mainWindow.appendChild(popupEl)

    // Close on Escape; clean up listener when popup is removed
    const onKeyDown = (e) => { if (e.key === 'Escape') hideSubroutinePopup() }
    document.addEventListener('keydown', onKeyDown)
    popupEl._cleanupKeyDown = () => document.removeEventListener('keydown', onKeyDown)

    // Scroll active line into view inside the code block
    const activeLine = codeEl.querySelector('.sld-popup-line--active')
    if (activeLine) activeLine.scrollIntoView({ block: 'center' })
}

export function hideSubroutinePopup() {
    if (!popupEl) return
    popupEl._cleanupKeyDown?.()
    if (popupEl.parentElement) popupEl.parentElement.removeChild(popupEl)
    popupEl = null
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function _renderCode(codeEl, lines, activeRow) {
    const grammar = atom.grammars.grammarForScopeName('source.sinumerik')

    if (grammar) {
        const tokenizedLines = grammar.tokenizeLines(lines.join('\n'))
        tokenizedLines.forEach((tokens, i) => {
            const lineEl = document.createElement('div')
            lineEl.className = 'sld-popup-line'
            if (i === activeRow) lineEl.classList.add('sld-popup-line--active')

            tokens.forEach(token => {
                const span = document.createElement('span')
                const classes = new Set()
                token.scopes.forEach(scope =>
                    scope.split('.').forEach(part => classes.add(`syntax--${part}`))
                )
                span.className = [...classes].join(' ')
                span.textContent = token.value
                lineEl.appendChild(span)
            })
            codeEl.appendChild(lineEl)
        })
    } else {
        lines.forEach((line, i) => {
            const lineEl = document.createElement('div')
            lineEl.className = 'sld-popup-line'
            if (i === activeRow) lineEl.classList.add('sld-popup-line--active')
            lineEl.textContent = line
            codeEl.appendChild(lineEl)
        })
    }
}

// Return the real filesystem path for a canvas element's sourceFile.
// For elements from the main program, sourceFile IS the real path.
// For subroutine elements (any folder), sourceFile is a transformed name
// like 'SUB_SPF' (from primitives.js: basename.replace('.','_').toUpperCase()).
// We resolve it by matching against parseData.subroutines[].path.
function _resolveSourcePath(sourceFile) {
    if (!sourceFile) return sourceFile
    // Real paths start with / (Linux/Mac) or a drive letter (Windows)
    if (sourceFile[0] === '/' || sourceFile[1] === ':') return sourceFile

    const subroutines = View.sinumerikView.parseData?.subroutines ?? []
    const matched = subroutines.find(s => {
        const transformed = s.path
            .slice(s.path.lastIndexOf('/') + 1)
            .replace('.', '_')
            .toUpperCase()
        return transformed === sourceFile
    })
    return matched?.path ?? sourceFile
}

function _readLines(filePath) {
    // Prefer the live editor buffer — most up-to-date, works for unsaved changes
    const editor = atom.workspace.getTextEditors().find(e => e.getPath() === filePath)
    if (editor) return editor.getText().split('\n')

    try {
        return fs.readFileSync(filePath, 'utf8').split('\n')
    } catch (e) {
        return null
    }
}

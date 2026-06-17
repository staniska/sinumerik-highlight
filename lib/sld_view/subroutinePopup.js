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

    // Build the full call-chain as an array of {file, row} entries.
    // callStack (outermost-first) is populated by primitives.js after each
    // subroutine return. The final entry in the display is always the element
    // itself (el.sourceFile / el.row).
    const resolvedSourceFile = _resolveSourcePath(el.sourceFile)
    const chain = [
        ...(el.callStack ?? []).map(e => ({file: e.file, row: e.row})),
        {file: resolvedSourceFile, row: el.row}
    ]

    // selectedIdx: which chain entry is currently shown in the code block.
    // Start at the deepest level (the element itself).
    let selectedIdx = chain.length - 1

    popupEl = document.createElement('div')
    popupEl.className = 'sld-subroutine-popup'

    // ── Header ────────────────────────────────────────────────────────────────
    const header = document.createElement('div')
    header.className = 'sld-popup-header'
    popupEl.appendChild(header)

    // ── Call-stack row ────────────────────────────────────────────────────────
    const callstackEl = document.createElement('div')
    callstackEl.className = 'sld-popup-callstack'
    popupEl.appendChild(callstackEl)

    // ── Code block ────────────────────────────────────────────────────────────
    const codeEl = document.createElement('pre')
    codeEl.className = 'sld-popup-code syntax--sinumerik-popup'
    const editorFontFamily = atom.config.get('editor.fontFamily')
    const editorFontSize   = atom.config.get('editor.fontSize')
    if (editorFontFamily) codeEl.style.fontFamily = editorFontFamily
    if (editorFontSize)   codeEl.style.fontSize   = `${editorFontSize}px`
    popupEl.appendChild(codeEl)

    // ── Footer ────────────────────────────────────────────────────────────────
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
    footer.appendChild(editBtn)

    const pinEditBtn = document.createElement('button')
    pinEditBtn.className = 'sinumerikButton icon-pin'
    pinEditBtn.textContent = ' Pin SLD & edit'
    pinEditBtn.title = 'Pin the main file to SLD and open this subroutine in a split pane'
    footer.appendChild(pinEditBtn)

    popupEl.appendChild(footer)
    mainWindow.appendChild(popupEl)

    // ── Render function ───────────────────────────────────────────────────────
    // Rebuilds callstack chips, code block and button targets for selectedIdx.
    function render() {
        const entry = chain[selectedIdx]

        // Header: basename of current file
        header.textContent = path.basename(entry.file)

        // Callstack chips
        callstackEl.innerHTML = ''
        chain.forEach((c, i) => {
            const chip = document.createElement('span')
            chip.className = 'sld-popup-chip'
            if (i === selectedIdx) chip.classList.add('sld-popup-chip--active')
            chip.textContent = `${path.basename(c.file)} : ${c.row + 1}`
            chip.addEventListener('click', () => {
                if (i === selectedIdx) return
                selectedIdx = i
                render()
            })
            callstackEl.appendChild(chip)

            if (i < chain.length - 1) {
                const sep = document.createElement('span')
                sep.className = 'sld-popup-chip-sep'
                sep.textContent = '→'
                callstackEl.appendChild(sep)
            }
        })

        // Code block
        codeEl.innerHTML = ''
        const lines = _readLines(entry.file)
        if (lines) {
            _renderCode(codeEl, lines, entry.row)
        } else {
            codeEl.textContent = '(file not readable)'
        }
        const activeLine = codeEl.querySelector('.sld-popup-line--active')
        if (activeLine) activeLine.scrollIntoView({ block: 'center' })

        // Button targets
        editBtn.onclick = () => {
            atom.workspace.open(entry.file, {
                initialLine: entry.row,
                initialColumn: 0,
                searchAllPanes: true
            })
            hideSubroutinePopup()
        }

        pinEditBtn.onclick = () => {
            hideSubroutinePopup()
            if (!View.sinumerikView.sldPinnedFile) {
                View.sinumerikView.toggleSldPin()
            }
            atom.workspace.open(entry.file, {
                initialLine:   entry.row,
                initialColumn: 0,
                split:         'right',
                searchAllPanes: true
            })
        }
    }

    render()

    // ── Keyboard ──────────────────────────────────────────────────────────────
    const onKeyDown = (e) => { if (e.key === 'Escape') hideSubroutinePopup() }
    document.addEventListener('keydown', onKeyDown)
    popupEl._cleanupKeyDown = () => document.removeEventListener('keydown', onKeyDown)
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

    // Strip recursive-call suffixes added by primitives.js to avoid variable
    // collisions: 'SUB_SPF_r', 'SUB_SPF_r_r', ... → 'SUB_SPF'
    const baseName = sourceFile.replace(/(_r)+$/, '')

    const subroutines = View.sinumerikView.parseData?.subroutines ?? []
    const matched = subroutines.find(s => {
        const transformed = s.path
            .slice(s.path.lastIndexOf('/') + 1)
            .replace('.', '_')
            .toUpperCase()
        return transformed === baseName
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

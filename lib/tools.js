'use babel'

// Tools panel: the list of tools belonging to a machine, and a preview of the
// selected one.
//
// Modelled on `equipment.js`, with one difference that runs through
// everything: equipment is stored per program (`equipment.json`), tools are
// stored per machine (`machineData.tools[machineName]`), because a tool lives
// in a turret, not in a file. The program only ever names a tool — `;TOOL:NAME`
// — and the path to its file is resolved through this list.
//
// Layout: a scrollable list on the left under a search box, a static preview
// on the right, and the actions that work on the selection in the footer. The
// per-row insert/delete buttons were moved there so that a row is nothing but
// a name to click, and so that the list stays readable at the width the
// preview needs.
//
// See docs/tools-plan.md, stage 1.

import View from "./sinumerik";
import {create_element} from "./createElement";
import {runShapeFileParse, isParseBusy, onParseBusyChange} from "./interpretator";
import {saveMachineData} from "./machine-manager";
import {checkToolConsistency, describeShapeFileWarnings} from "./shapeFile";
import {TOOL_SHAPE_PARSE_OPTIONS} from "./shapeParseState";
import {confirmDialog} from "./dialog/confirm";
import {noseFromSections} from "./materialTraceRun";
import {toolMarkerOf} from "./utils";
import {TOOL_GRID_AXES} from "./tipPosition";
import {
    DEFAULT_PREVIEW_AXES,
    describeToolGeometry,
    drawToolPreview,
} from "./toolPreview";

const fsPromises = require('fs').promises
const {dialog} = require("electron").remote;

// Whose tools the panel is about.
//
// The machine picked in machineManager, and failing that the one the program in
// the active editor belongs to. The second case is what makes the panel usable
// from the SLDebug tab, where the point is to drop a `;TOOL:NAME` into the
// program being debugged: going to machineManager first to select the machine
// that program already names would be a detour with one possible answer.
//
// Only a machine that actually exists is accepted, so a stale or hand-edited
// name in a program comment cannot open a panel offering to add tools to it.
const selectedMachine = () => {
    const picked = View.sinumerikView.machineManagerData?.selectedMachine
    if (picked) return picked

    // Through `globalThis`: `atom` is a global inside Pulsar and simply absent
    // under jest, and this function is otherwise plain data access.
    const path = globalThis.atom?.workspace?.getActiveTextEditor?.()?.getPath?.()
    const named = path ? View.sinumerikView.programmData?.[path]?.machine?.machineName : null
    if (named && View.sinumerikView.machineData?.machines?.[named]) return named

    return null
}

// Tools of the machine currently selected in machineManager.
//
// Always an array: a machine saved before this feature existed has no `tools`
// key at all, and every caller would otherwise need the same guard.
export const machineTools = machineName => {
    const machine = machineName ?? selectedMachine()
    if (!machine) return []
    return View.sinumerikView.machineData?.tools?.[machine] ?? []
}

const machineToolsWritable = machineName => {
    if (!View.sinumerikView.machineData.tools) View.sinumerikView.machineData.tools = {}
    if (!View.sinumerikView.machineData.tools[machineName]) View.sinumerikView.machineData.tools[machineName] = []
    return View.sinumerikView.machineData.tools[machineName]
}

//region openers

// The buttons that open this panel — one in machineManager, one in the SLDebug
// footer. They go dead while a parse is in flight, because reading a tool file
// borrows the one global `parseData` (`runShapeFileParse`) and the two cannot
// share it: opening the panel mid-parse would either get nothing back or, if
// the refusal in `_runShapeFileParse` were ever relaxed, redirect the
// program's own trajectory into a temporary bucket.
//
// A Set, so registering the same button twice (the SLDebug footer is rebuilt
// when its components are regenerated) cannot pile up duplicates.
const openerButtons = new Set()

export const registerToolListButton = button => {
    if (!button) return button
    openerButtons.add(button)
    applyOpenerState(button)
    return button
}

const applyOpenerState = button => {
    const busy = isParseBusy()
    button.disabled = busy
    button.title = busy
        ? 'Not while the program is being parsed'
        : button.dataset.toolsTitle || 'Tools of this program\'s machine'
}

const refreshToolListButtons = () => openerButtons.forEach(applyOpenerState)

// Registered once, at module load: `drawChanges` / `progParser` report both
// edges of a parse, and nothing else has to know when to re-check.
onParseBusyChange(refreshToolListButtons)

//endregion

export const createToolsWindow = () => {
    const panel = create_element(['sinumerik-tools', 'native-key-bindings'])
    const closeButton = create_element(['sinumerik-tools-close-button', 'icon-x'], panel, 'button')
    closeButton.addEventListener('click', () => View.toggleTools())
    return panel
}

// Which tool the preview shows. Kept by name, not by index: the list is
// rebuilt on every update and an index would follow whatever moved into that
// slot. Deliberately not in `machineData` — it is a view state, and saving it
// would write it into machine-data.json.
let selectedToolName = null

// Paths a lazy re-read has already been tried for, so a file that cannot be
// parsed does not retry — and re-raise its dialog — on every click. Cleared
// when the window is opened again, which is the natural moment to try a file
// that has since been fixed.
const retried = new Set()

// Read a tool's geometry once and keep it. The key is the path, so two
// machines sharing a tool file share the parse.
const loadToolGeometry = async tools => {
    if (!View.sinumerikView.toolGeometry) View.sinumerikView.toolGeometry = {}

    const complaints = []
    for (const tool of tools) {
        if (View.sinumerikView.toolGeometry[tool.path]) continue

        const parsed = await runShapeFileParse(tool.path, TOOL_SHAPE_PARSE_OPTIONS)

        // Only a clean read is cached. Caching a failure would pin an empty
        // outline for the rest of the session — the complaint below would be
        // shown once and the tool would then quietly never draw, with nothing
        // left to retry it.
        if (!parsed.errors.length) View.sinumerikView.toolGeometry[tool.path] = parsed

        // The declared nose radius against the drawn one. Worth saying out
        // loud at load time: the outline is drawn from the geometry while the
        // compensation numbers come from the declaration, so a mismatch
        // otherwise describes two different tools in silence.
        const warnings = [...parsed.warnings, ...checkToolConsistency(parsed.variables, parsed.sections)]
        const message = describeShapeFileWarnings(warnings, tool.name)
        if (message) complaints.push(message)
        parsed.errors.forEach(err => complaints.push(`${tool.name}: ${err.text}`))
    }

    // One dialog per update, not one per tool: opening the panel on a machine
    // with five rough files should not mean five clicks.
    if (complaints.length) {
        dialog.showMessageBox(null, {message: complaints.join('\n'), type: 'warning'})
    }
}

// The tool the given line already names, as this machine's list spells it, or
// null. Matched case-insensitively because that is how the parser resolves a
// marker (`resolveActiveTool` upper-cases both sides), so a marker the program
// honours is one the panel recognises.
export const toolFromCursorLine = (line, tools) => {
    const marker = toolMarkerOf(line)
    if (!marker) return null
    const named = (tools ?? []).find(t => String(t.name).toUpperCase() === marker.name.toUpperCase())
    return named?.name ?? null
}

const cursorToolName = () => {
    const editor = globalThis.atom?.workspace?.getActiveTextEditor?.()
    if (!editor) return null
    const row = editor.getCursorBufferPosition().row
    return toolFromCursorLine(editor.lineTextForBufferRow(row), machineTools(selectedMachine()))
}

// Put the marker in the program, and return whether anything reached it — so
// that Enter does not close the window on a press that did nothing.
//
// A marker already on the cursor line is overwritten rather than doubled: two
// `;TOOL:` lines in a row are not an error the parser reports, it simply takes
// the last one, so the first would sit there looking meaningful. Only the name
// is replaced, which leaves the rest of the line alone — the author's spacing,
// a note after the marker — and leaves the cursor on the row being looked at.
const insertToolMarker = toolName => {
    const editor = atom.workspace.getActiveTextEditor()
    if (!editor) return false

    const row = editor.getCursorBufferPosition().row
    const marker = toolMarkerOf(editor.lineTextForBufferRow(row))

    if (!marker) {
        editor.insertText(`;TOOL:${toolName}\n`)
        return true
    }

    // Already this tool: writing it again would dirty the file and ask for a
    // re-parse for no change.
    if (marker.name !== toolName) {
        editor.setTextInBufferRange([[row, marker.start], [row, marker.end]], toolName)
    }
    return true
}

const removeTool = async (machine, name) => {
    const tools = machineTools(machine)
    const idx = tools.findIndex(t => t.name === name)
    if (idx < 0) return
    if (!confirmDialog(`Remove tool ${name} from ${machine}?`)) return

    machineToolsWritable(machine).splice(idx, 1)
    if (selectedToolName === name) selectedToolName = null
    await saveMachineData()
    updateToolsPanel()
}

// Cross-platform, and the same trick the rest of the package uses: a path from
// a dialog carries the host's separator, and only the file name is worth showing
// in a list of what went wrong.
export const fileNameOf = path => path.split(/[\\/]/).pop()

// What a picked file contributes to the list, or why it cannot. Pure and given
// the names already taken, so the rules can be checked without a file dialog —
// the same reason `toolFromCursorLine` above is its own function.
//
// The caller composes the wording: only it knows which machine is being stocked.
export const toolFromFile = (firstRow, takenNames) => {
    // Same contract as equipment: the name lives on the first line. Trimmed for
    // CRLF, since the file comes from disk.
    const nameMatch = firstRow.replace(/\r$/, '').match(/(?<=NAME:)\w+/)
    if (!nameMatch) return {error: 'no-name'}

    // `;TOOL:NAME` resolves by name, so two tools sharing one would make the
    // marker ambiguous — and which one got drawn would depend on list order,
    // which the user has no way to see.
    if (takenNames.includes(nameMatch[0])) return {name: nameMatch[0], error: 'duplicate'}

    return {name: nameMatch[0]}
}

const addTool = async machine => {
    // Several at once. The same tool file is shared by several machines in a
    // shop, so stocking a new machine meant walking the dialog once per tool.
    const {canceled, filePaths} = await dialog.showOpenDialog({
        properties: ['openFile', 'multiSelections'],
    })
    if (canceled || !filePaths.length) return

    const tools = machineToolsWritable(machine)
    const added = []
    const refused = []

    for (const path of filePaths) {
        let text
        try {
            text = await fsPromises.readFile(path, 'utf8')
        } catch (e) {
            // One unreadable file out of twenty must not abandon the other
            // nineteen — which is what the throw from here used to do.
            refused.push(`${fileNameOf(path)} — ${e.message}`)
            continue
        }

        // The names are read from the list as it grows, so two of the picked
        // files naming one tool are refused by the same rule that refuses one
        // already in the list.
        const picked = toolFromFile(text.split('\n')[0], tools.map(t => t.name))
        if (picked.error === 'no-name') {
            refused.push(`${fileNameOf(path)} — first row must contain ";NAME:..."`)
            continue
        }
        if (picked.error === 'duplicate') {
            refused.push(`${fileNameOf(path)} — ${machine} already has a tool named ${picked.name}`)
            continue
        }

        tools.push({name: picked.name, path})
        added.push(picked.name)
    }

    if (added.length) {
        // A tool is added to be looked at: select one, so the preview shows
        // something that was just picked rather than staying on the previous
        // tool. The first of them, which is where the eye goes.
        selectedToolName = added[0]
        await saveMachineData()
        updateToolsPanel()
    }

    // Only the refusals are reported, and in one message rather than one per
    // file: what was added is visible in the list, while twenty dialogs for
    // twenty bad files would be worse than the problem.
    if (refused.length) {
        dialog.showMessageBox(null, {
            type: 'warning',
            message: added.length
                ? `Added ${added.length} of ${filePaths.length}.`
                : 'No tool was added.',
            detail: refused.join('\n'),
        })
    }
}

//region preview

// How this machine is looked at.
//
// The same table machine-manager lays the nine tip positions out by, and the
// same arrangement the SLD canvas uses (`axesByPlane` picks the axis pair and
// `factor` the signs) — one source of truth, so the outline in the preview
// cannot face a different way than the trajectory it will cut.
const previewAxes = machineName => {
    const machine = View.sinumerikView.machineData?.machines?.[machineName]
    if (!machine || machine.machineType !== 'Lathe') return DEFAULT_PREVIEW_AXES
    return TOOL_GRID_AXES[`${machine.subType}/${machine.firstCarriage?.position}`] ?? DEFAULT_PREVIEW_AXES
}

// Canvas colours, read from the CSS custom properties the stylesheet defines
// on the element. The canvas needs real values and the theme's are in LESS, so
// this is the same route `changePauseBackground` takes for the pause gradient.
// The fallbacks are the element's own computed colours rather than literals —
// never a hex here (CLAUDE.md), and they only ever apply when the stylesheet
// has not loaded, as under a test harness.
const previewColors = element => {
    const style = getComputedStyle(element)
    // Anything the browser would not accept as a colour is treated as absent:
    // a 2d context silently ignores an invalid fillStyle and keeps the previous
    // one, which would show up as a picture painted in the wrong colour rather
    // than as an error.
    const usable = value => {
        if (!value) return false
        return typeof CSS === 'undefined' || typeof CSS.supports !== 'function'
            ? true
            : CSS.supports('color', value)
    }
    const pick = (name, fallback) => {
        const value = (style.getPropertyValue(name) || '').trim()
        return usable(value) ? value : fallback
    }
    return {
        bg: pick('--tool-preview-bg', style.backgroundColor),
        axis: pick('--tool-preview-axis', style.color),
        text: pick('--tool-preview-text', style.color),
        warn: pick('--tool-preview-warn', style.color),
        nose: pick('--tool-preview-nose', style.color),
    }
}

// The backing store in device pixels, the drawing in CSS pixels.
const sizePreviewCanvas = canvas => {
    const ratio = window.devicePixelRatio || 1
    const width = canvas.clientWidth || 300
    const height = canvas.clientHeight || 220

    canvas.width = Math.round(width * ratio)
    canvas.height = Math.round(height * ratio)

    const ctx = canvas.getContext('2d')
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    return {ctx, width, height}
}

// `noseFromSections` answers with `{center: [a0, a1]}` for the axis pair it
// was asked about; the preview works in named axes throughout, so the two
// forms are converted here, once, at the boundary.
const drawnNoseOf = geometry => {
    const nose = noseFromSections(geometry?.sections, 'Z', 'X')
    if (!nose) return null
    return {Z: nose.center[0], X: nose.center[1], radius: nose.radius}
}

const drawPreview = async () => {
    const body = View.sinumerikView.toolsPanelBody
    if (!body?.previewCanvas) return

    const machine = selectedMachine()
    const tool = machineTools(machine).find(t => t.name === selectedToolName)
    const geometry = tool ? View.sinumerikView.toolGeometry?.[tool.path] : null

    const {ctx, width, height} = sizePreviewCanvas(body.previewCanvas)
    const colors = previewColors(body.previewCanvas)
    // Measured once: the circle in the picture and the radius in the text have
    // to be the same number, or the two halves of the window argue.
    const drawnNose = geometry ? drawnNoseOf(geometry) : null

    drawToolPreview(ctx, geometry, {
        width,
        height,
        axes: previewAxes(machine),
        colors,
        drawnNose,
        message: tool ? 'Geometry not loaded' : 'Select a tool',
    })

    body.previewName.innerText = tool ? tool.name : ''
    body.previewInfo.innerText = tool ? describeToolGeometry(geometry, drawnNose).join('\n') : ''

    // Not loaded yet, and loadable now: the panel may have been opened during
    // a parse, in which case `runShapeFileParse` refused and the cache is
    // empty. One retry per path, so an unparseable file does not re-raise its
    // dialog on every click.
    if (tool && !geometry && !isParseBusy() && !retried.has(tool.path)) {
        retried.add(tool.path)
        await loadToolGeometry([tool])
        if (View.sinumerikView.toolGeometry?.[tool.path]) {
            retried.delete(tool.path)
            await drawPreview()
        }
    }
}

const selectTool = name => {
    selectedToolName = name
    const body = View.sinumerikView.toolsPanelBody
    if (body) {
        Array.from(body.toolsList.children).forEach(row => {
            const selected = row.dataset.toolName === name
            row.classList.toggle('sinumerik-tools-element--selected', selected)
            // For the arrow keys: the selection can walk out of the scrolled
            // list, and a highlight nobody can see is the same as none.
            if (selected) row.scrollIntoView?.({block: 'nearest'})
        })
        updateFooterState()
    }
    drawPreview()
}

// Keyboard in the Tools window. Up/Down walk the list and wrap around, Enter
// inserts the marker and closes — the same two rules the snippets menu
// follows (lib/snippets.js), so the windows do not need learning twice.
// Escape is handled by the panel's owner, which is what opened it.
export const handleToolsKey = event => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown' && event.key !== 'Enter') return false

    // Arrows would otherwise scroll the list out from under the selection
    // they are moving, and both keys have a meaning in the editor behind.
    event.preventDefault?.()
    event.stopPropagation?.()

    const tools = machineTools(selectedMachine())
    if (!tools.length) return false

    if (event.key === 'Enter') {
        if (!selectedToolName) return false
        if (!insertToolMarker(selectedToolName)) return false
        View.toggleTools()
        return true
    }

    const step = event.key === 'ArrowDown' ? 1 : -1
    const at = tools.findIndex(t => t.name === selectedToolName)
    // Nothing selected yet: step onto the end the key points at.
    const next = at < 0
        ? (step > 0 ? 0 : tools.length - 1)
        : (at + step + tools.length) % tools.length

    selectTool(tools[next].name)
    return true
}

const updateFooterState = () => {
    const body = View.sinumerikView.toolsPanelBody
    if (!body) return
    const exists = machineTools(selectedMachine()).some(t => t.name === selectedToolName)
    body.insertButton.disabled = !exists
    body.deleteButton.disabled = !exists
}

//endregion

const createToolsElements = () => {
    const panel = document.querySelector('.sinumerik-tools')
    const body = create_element([], panel)
    View.sinumerikView.toolsPanelBody = body

    body.machineLabel = create_element(['sinumerik-tools-machine'], body)

    const columns = create_element(['sinumerik-tools-body'], body)

    const left = create_element(['sinumerik-tools-left'], columns)
    // Inactive for now: the room for it is reserved so the layout does not
    // move when it starts working, and it is disabled rather than absent so
    // that it cannot silently do nothing when typed into.
    body.search = create_element(['sinumerik-tools-search', 'native-key-bindings'], left, 'input')
    body.search.type = 'search'
    body.search.placeholder = 'Search'
    body.search.disabled = true
    body.search.title = 'Search is not implemented yet'
    body.toolsList = create_element(['sinumerik-tools-list'], left)

    const right = create_element(['sinumerik-tools-preview'], columns)
    body.previewName = create_element(['sinumerik-tools-preview-name'], right)
    body.previewCanvas = create_element(['sinumerik-tools-preview-canvas'], right, 'canvas')
    body.previewInfo = create_element(['sinumerik-tools-preview-info'], right)

    const footer = create_element(['sinumerik-tools-footer'], body)
    body.addButton = create_element(['sinumerikButton', 'icon-plus'], footer, 'button', 'Add')
    body.addButton.addEventListener('click', () => {
        const machine = selectedMachine()
        if (machine) addTool(machine)
    })

    body.insertButton = create_element(['sinumerikButton', 'icon-arrow-down'], footer, 'button', 'Insert')
    body.insertButton.title = 'Insert ;TOOL:NAME of the selected tool at the cursor'
    body.insertButton.addEventListener('click', () => {
        if (selectedToolName) insertToolMarker(selectedToolName)
    })

    body.deleteButton = create_element(['sinumerikButton', 'icon-x'], footer, 'button', 'Delete')
    body.deleteButton.title = 'Remove the selected tool from this machine'
    body.deleteButton.addEventListener('click', () => {
        const machine = selectedMachine()
        if (machine && selectedToolName) removeTool(machine, selectedToolName)
    })
}

// Called when the window opens, as opposed to when it refreshes after an add
// or a delete.
//
// The cursor line decides the selection here: pressing Tool list on a line
// that already names a tool is a request to look at that tool — and, with
// Enter rewriting the marker in place, to change it. The selection is only
// moved when the line names a tool this machine has; otherwise whatever was
// selected before stands, and `updateToolsPanel` falls back from there.
export const openToolsPanel = async () => {
    const fromCursor = cursorToolName()
    if (fromCursor) selectedToolName = fromCursor
    // A file that failed to parse is worth one more try now that the window is
    // being opened again — it may have been fixed since.
    retried.clear()
    await updateToolsPanel()
}

export const updateToolsPanel = async () => {
    if (!View.sinumerikView.toolsPanelBody) createToolsElements()

    const body = View.sinumerikView.toolsPanelBody
    const machine = selectedMachine()

    while (body.toolsList.firstChild) body.toolsList.removeChild(body.toolsList.firstChild)

    if (!machine) {
        // The panel edits the machine selected in machineManager, so without
        // one there is nothing to edit. Saying so beats an empty list that
        // looks like a machine with no tools.
        body.machineLabel.innerText = 'No machine selected in machineManager'
        body.addButton.disabled = true
        selectedToolName = null
        updateFooterState()
        await drawPreview()
        return
    }

    body.machineLabel.innerText = `Tools of ${machine}`
    body.addButton.disabled = false

    const tools = machineTools(machine)

    // The tool the program is actually using beats the first in the list: the
    // panel is opened from the SLDebug footer while debugging, and that is the
    // tool being looked at. Same reasoning as `selectedMachine` taking the
    // machine from the active editor.
    if (!tools.some(t => t.name === selectedToolName)) {
        const active = View.sinumerikView.parseData?.activeToolDef?.name
        const fromProgram = active && tools.find(t => String(t.name).toUpperCase() === String(active).toUpperCase())
        selectedToolName = fromProgram?.name ?? tools[0]?.name ?? null
    }

    tools.forEach(tool => {
        const row = create_element(['sinumerik-tools-element'], body.toolsList)
        row.dataset.toolName = tool.name
        if (tool.name === selectedToolName) row.classList.add('sinumerik-tools-element--selected')
        create_element(['sinumerik-tools-name'], row, 'div', tool.name)
        row.title = tool.path
        row.addEventListener('click', () => selectTool(tool.name))
    })

    updateFooterState()

    await loadToolGeometry(tools)
    await drawPreview()
}

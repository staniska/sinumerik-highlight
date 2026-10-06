'use babel'

// Tools panel: the list of tools belonging to a machine.
//
// Modelled on `equipment.js`, with one difference that runs through
// everything: equipment is stored per program (`equipment.json`), tools are
// stored per machine (`machineData.tools[machineName]`), because a tool lives
// in a turret, not in a file. The program only ever names a tool — `;TOOL:NAME`
// — and the path to its file is resolved through this list.
//
// See docs/tools-plan.md, stage 1.

import View from "./sinumerik";
import {create_element} from "./createElement";
import {runShapeFileParse} from "./interpretator";
import {saveMachineData} from "./machine-manager";
import {checkToolConsistency, describeShapeFileWarnings} from "./shapeFile";
import {confirmDialog} from "./dialog/confirm";

const fsPromises = require('fs').promises
const {dialog} = require("electron").remote;

// Tool outlines are drawn and measured in radii, not diameters: a tool has no
// diametral feature, its zero is the tool reference point and its dimensions
// are local, so a 0.4 mm nose radius is `R0.4` and a 10 mm flank is `X-10`.
// Fixtures are the opposite — drawn in machine coordinates, so they inherit the
// program's diameter mode. See README and docs/tools-plan.md.
const TOOL_PARSE_OPTIONS = {diamon: 0}

const selectedMachine = () => View.sinumerikView.machineManagerData?.selectedMachine ?? null

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

export const createToolsWindow = () => {
    const panel = create_element(['sinumerik-tools', 'native-key-bindings'])
    const closeButton = create_element(['sinumerik-tools-close-button', 'icon-x'], panel, 'button')
    closeButton.addEventListener('click', () => View.toggleTools())
    return panel
}

// Read a tool's geometry once and keep it. The key is the path, so two
// machines sharing a tool file share the parse.
const loadToolGeometry = async tools => {
    if (!View.sinumerikView.toolGeometry) View.sinumerikView.toolGeometry = {}

    const complaints = []
    for (const tool of tools) {
        if (View.sinumerikView.toolGeometry[tool.path]) continue

        const parsed = await runShapeFileParse(tool.path, TOOL_PARSE_OPTIONS)
        View.sinumerikView.toolGeometry[tool.path] = parsed

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

const insertToolMarker = toolName => {
    const editor = atom.workspace.getActiveTextEditor()
    if (!editor) return
    editor.insertText(`;TOOL:${toolName}\n`)
}

const removeTool = async (machine, idx) => {
    const tools = machineTools(machine)
    const tool = tools[idx]
    if (!tool) return
    if (!confirmDialog(`Remove tool ${tool.name} from ${machine}?`)) return

    machineToolsWritable(machine).splice(idx, 1)
    await saveMachineData()
    updateToolsPanel()
}

const addTool = async machine => {
    const {canceled, filePaths} = await dialog.showOpenDialog({properties: ['openFile']})
    if (canceled || !filePaths.length) return

    const text = await fsPromises.readFile(filePaths[0], 'utf8')
    // Same contract as equipment: the name lives on the first line. Trimmed
    // for CRLF, since the file comes from disk.
    const nameMatch = text.split('\n')[0].replace(/\r$/, '').match(/(?<=NAME:)\w+/)
    if (!nameMatch) {
        dialog.showMessageBox(null, {message: 'Tool file first row must contain ";NAME:..."', type: 'warning'})
        return
    }

    const tools = machineToolsWritable(machine)
    if (tools.some(t => t.name === nameMatch[0])) {
        // `;TOOL:NAME` resolves by name, so two tools sharing one would make
        // the marker ambiguous — and which one got drawn would depend on list
        // order, which the user has no way to see.
        dialog.showMessageBox(null, {
            message: `${machine} already has a tool named ${nameMatch[0]}.`,
            type: 'warning',
        })
        return
    }

    tools.push({name: nameMatch[0], path: filePaths[0]})
    await saveMachineData()
    updateToolsPanel()
}

const createToolsElements = () => {
    View.sinumerikView.toolsPanelBody = create_element([], document.querySelector('.sinumerik-tools'))
    View.sinumerikView.toolsPanelBody.machineLabel = create_element(
        ['sinumerik-tools-machine'], View.sinumerikView.toolsPanelBody,
    )
    View.sinumerikView.toolsPanelBody.toolsList = create_element([], View.sinumerikView.toolsPanelBody)
    View.sinumerikView.toolsPanelBody.addButton = create_element(
        ['sinumerikButton', 'icon-plus'], View.sinumerikView.toolsPanelBody, 'button', 'Add',
    )
    View.sinumerikView.toolsPanelBody.addButton.addEventListener('click', () => {
        const machine = selectedMachine()
        if (machine) addTool(machine)
    })
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
        return
    }

    body.machineLabel.innerText = `Tools of ${machine}`
    body.addButton.disabled = false

    const tools = machineTools(machine)
    tools.forEach((tool, idx) => {
        const row = create_element(['sinumerik-tools-element'], body.toolsList)
        create_element(['sinumerik-tools-name'], row, 'div', tool.name)

        const insertButton = create_element(['sinumerikButton', 'icon-arrow-down'], row, 'button')
        insertButton.title = `Insert ;TOOL:${tool.name} at the cursor`
        insertButton.addEventListener('click', () => insertToolMarker(tool.name))

        const deleteButton = create_element(['sinumerikButton', 'icon-x'], row, 'button')
        deleteButton.title = `Remove ${tool.name} from ${machine}`
        deleteButton.addEventListener('click', () => removeTool(machine, idx))
    })

    await loadToolGeometry(tools)
}

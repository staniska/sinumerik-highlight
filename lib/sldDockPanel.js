'use babel'

import View from "./sinumerik";
import {create_element} from "./createElement";
import {getCoordinatesInFrame} from "./coordinates";
import {positionAt, storedValue, displayCoordinate, decimalsFor, blockIndexAt} from "./axisDisplay";
import {variablesAt, sortVariableNames, formatVariableValue} from "./variableLog";

// The slow-debug panel in Pulsar's left dock: a tab beside the project tree,
// open only while slow debug is on.
//
// A dock item rather than a left panel (`addLeftPanel`) on purpose. The dock
// already has everything the panel would have had to grow by hand — a tab, a
// width the user can drag, a size remembered between sessions — and it leaves
// the project tree alone: the tree becomes the other tab, which is why opening
// this panel takes nothing away. An open dock also stands in the layout rather
// than over it (`atom-dock-inner:not(.atom-dock-open)` is the absolutely
// positioned one), so the program text is never covered.
const SLD_DOCK_URI = 'atom://sinumerik-highlight/slow-debug'

const PREFERRED_WIDTH = 250

let item = null
// What the dock looked like before we opened, so it can be put back: whether it
// was open at all, and which tab was in front.
let restoreVisible = null
let restoreItem = null
// The open in flight, for callers that must not start anything heavy until the
// tab is on screen — see sldDockReady.
let opening = null

// One row per axis and per variable, kept between updates rather than rebuilt.
// The update runs once per animation piece — thousands of times in a run — so it
// may only write text that changed.
let rows = null
let variableRows = null

function buildItem() {
    const element = create_element(['sinumerikSldDock'])
    const header = create_element(['sinumerikSldDockHeader'], element, 'div', 'Position')
    const units = create_element(['sinumerikSldDockUnits'], header, 'span')
    const axes = create_element(['sinumerikSldDockAxes'], element)

    // The variables sit under the axes behind their own heading, and only the
    // list of them scrolls: the position has to stay on screen while a long
    // list is being read.
    const varsHeader = create_element(
        ['sinumerikSldDockHeader', 'sinumerikSldDockHeader--vars'], element, 'div', 'Variables')
    const varsCount = create_element(['sinumerikSldDockUnits'], varsHeader, 'span')
    const varList = create_element(['sinumerikSldDockVarList'], element)

    const placeholder = create_element(['sinumerikSldDockPlaceholder'], element, 'div',
        'Press Slow debug to follow the axes and the variables.')

    rows = new Map()
    variableRows = new Map()

    return {
        element,
        header,
        units,
        axes,
        varsHeader,
        varsCount,
        varList,
        placeholder,
        getElement: () => element,
        getTitle: () => 'Slow debug',
        getURI: () => SLD_DOCK_URI,
        getDefaultLocation: () => 'left',
        getAllowedLocations: () => ['left', 'right'],
        getPreferredWidth: () => PREFERRED_WIDTH,

        // Closing the tab by hand has to be noticed, or the next close would
        // try to destroy an item the pane has already let go of — and, worse,
        // would restore a dock state captured a run ago.
        destroy() {
            if (item === this) {
                item = null
                opening = null
                rows = null
                variableRows = null
                restoreVisible = null
                restoreItem = null
            }
            element.remove()
        }
    }
}

// ─── what the panel shows ────────────────────────────────────────────────────

const GEOMETRY_AXES = ['X', 'Y', 'Z']

// One row, made the first time its axis has something to say. Axes come and go
// during a run — an additional one appears only once the program names it — so
// a row is removed when its axis falls silent rather than left showing a stale
// number.
function rowFor(store, parent, key) {
    let row = store.get(key)
    if (row) return row

    const line = create_element(['sinumerikSldDockAxis'], parent)
    row = {
        line,
        label: create_element(['sinumerikSldDockAxisName'], line, 'span'),
        value: create_element(['sinumerikSldDockAxisValue'], line, 'span'),
    }
    store.set(key, row)
    return row
}

function writeRow(store, parent, key, label, text) {
    const row = rowFor(store, parent, key)
    if (row.label.textContent !== label) row.label.textContent = label
    if (row.value.textContent !== text) row.value.textContent = text
    return row
}

function dropRow(store, key) {
    const row = store.get(key)
    if (!row) return
    row.line.remove()
    store.delete(key)
}

function clearRows(store) {
    store.forEach(row => row.line.remove())
    store.clear()
}

// Re-read the position and write it out. Called from `_sldScrollToElement`,
// which is every place the drawn count moves: each piece of a run, a drag of
// the progress bar, the end of a run.
export function updateSldDockPanel() {
    if (!item) return

    const parseData = View.sinumerikView.parseData
    const position = positionAt(parseData?.elements, parseData?.drawnElementsNums ?? 0)
    if (!position) {
        clearRows(rows)
        clearRows(variableRows)
        item.placeholder.style.display = ''
        item.header.style.display = 'none'
        item.varsHeader.style.display = 'none'
        item.units.textContent = ''
        return
    }
    item.placeholder.style.display = 'none'
    item.header.style.display = ''
    item.varsHeader.style.display = ''

    // The state of the element, not the state the parse ended in: a rewound
    // position belongs to whichever frame, diameter mode and unit were in force
    // where it was cut. See frameTable.js.
    const frame = parseData.frames?.[position.element.frameId] ?? parseData.frame
    const diamon = frame?.diamon ?? parseData.diamon ?? 0
    const unitMult = frame?.unitMult ?? parseData.unitMult ?? 1
    const digits = decimalsFor(unitMult)
    const show = (value) => value === null ? '—' : value.toFixed(digits)

    item.units.textContent = unitMult === 1 ? 'mm' : 'inch'

    // X/Y/Z are stored in machine coordinates and converted together: the frame
    // is a basis, so an axis cannot be converted on its own.
    const stored = {}
    GEOMETRY_AXES.forEach(axis => { stored[axis] = storedValue(position, axis) })

    // A missing frame would throw inside `getCoordinatesInFrame`, and this runs
    // inside an animation tick: the exception would end the run, not just the
    // readout.
    if (frame?.basis && GEOMETRY_AXES.every(axis => stored[axis] !== null)) {
        const vector = getCoordinatesInFrame(stored, frame)
        GEOMETRY_AXES.forEach((axis, i) => {
            // The diameter is marked, because X reading twice the obvious is the
            // first thing to wonder about on a lathe.
            writeRow(rows, item.axes, axis,
                     diamon && axis === 'X' ? `⌀${axis}` : axis,
                     show(displayCoordinate(vector[i], {axis, diamon, unitMult})))
        })
    } else {
        GEOMETRY_AXES.forEach(axis => dropRow(rows, axis))
    }

    // The additional axes carry no frame and no diameter mode — a rotary axis
    // has neither — and only a length takes the unit, which displayCoordinate
    // decides for itself.
    const auxAxes = parseData.auxAxes ?? []
    auxAxes.forEach(axis => {
        const value = displayCoordinate(storedValue(position, axis), {axis, unitMult})
        if (value === null) {
            dropRow(rows, axis)
            return
        }
        writeRow(rows, item.axes, axis, axis, show(value))
    })

    // An axis that is no longer in the list at all — a re-parse of another
    // program — leaves with its row.
    rows.forEach((_, axis) => {
        if (!GEOMETRY_AXES.includes(axis) && !auxAxes.includes(axis)) dropRow(rows, axis)
    })

    writeVariables(parseData, position)
}

// The variables the program could see at that position: the shared store plus
// the locals of the program this element came from. A subroutine's locals are
// DELETED when it returns (primitives.js, after the recursive call), so they
// cannot be read live at all by the time the animation runs — the history is
// the only place they survive.
function writeVariables(parseData, position) {
    const at = blockIndexAt(position, parseData.elementFrames,
                            parseData.drawnElementsNums ?? 0, parseData.elements?.length)
    const values = at === null
        ? {}
        : variablesAt(parseData.variableLog, position.element.sourceFile, at)

    const names = sortVariableNames(Object.keys(values))
    names.forEach(name => writeRow(variableRows, item.varList, name, name,
                                   formatVariableValue(values[name])))

    variableRows.forEach((_, name) => {
        if (!(name in values)) dropRow(variableRows, name)
    })

    item.varsCount.textContent = names.length ? String(names.length) : 'none'
}

// Open the panel and remember what to put back.
export function openSldDock() {
    if (item) return opening ?? Promise.resolve()

    const dock = atom.workspace.getLeftDock()
    restoreVisible = dock.isVisible()
    restoreItem = dock.getActivePaneItem() ?? null

    item = buildItem()

    const mine = item
    opening = (async () => {
        // `activatePane: false` keeps the focus where the user left it — in the
        // program being debugged. The cost is that the dock does not open
        // itself: it shows on pane activation, and on nothing else, so adding
        // an item to a closed dock would add an invisible tab. Hence the
        // explicit show().
        await atom.workspace.open(mine, {activatePane: false, searchAllPanes: true})

        // Closed while the open was in flight — a quick toggle, or an edit that
        // cancelled the run. The close could not take the tab out, because the
        // pane had not been given it yet; by now it has, so take it out here.
        if (item !== mine) {
            atom.workspace.paneForItem(mine)?.destroyItem(mine)
            return
        }
        dock.show()

        // Resolve only once the tab has been painted. Opening a dock is
        // asynchronous twice over — the open itself, and the dock's own render —
        // so a caller that merely started it and went on to seize the main
        // thread would have the panel appear after its work, not before it.
        updateSldDockPanel()
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    })()

    return opening
}

// The open in flight, or a resolved promise when there is nothing to wait for.
export function sldDockReady() {
    return opening ?? Promise.resolve()
}

// Put the dock back as it was found.
export function closeSldDock() {
    if (!item) return

    const closing = item
    const wasVisible = restoreVisible
    const previous = restoreItem
    item = null
    opening = null
    restoreVisible = null
    restoreItem = null

    const dock = atom.workspace.getLeftDock()
    // Destroying the last item in a dock hides it and forgets its width, which
    // is the behaviour wanted when the dock was closed to begin with and ours
    // was the only tab in it.
    atom.workspace.paneForItem(closing)?.destroyItem(closing)

    if (previous && dock.getPaneItems().includes(previous)) {
        atom.workspace.paneForItem(previous)?.activateItem(previous)
    }
    if (!wasVisible) dock.hide()
}

// For package deactivation: let go of the tab without touching the dock's
// remembered state, which is no longer ours to restore.
export function destroySldDock() {
    const closing = item
    item = null
    opening = null
    restoreVisible = null
    restoreItem = null
    if (closing) atom.workspace.paneForItem(closing)?.destroyItem(closing)
}

'use babel'

import {create_element} from "./createElement";

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

function buildItem() {
    const element = create_element(['sinumerikSldDock'])
    create_element(['sinumerikSldDockPlaceholder'], element, 'div',
        'Coordinates and variables appear here during a run.')

    return {
        element,
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
                restoreVisible = null
                restoreItem = null
            }
            element.remove()
        }
    }
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

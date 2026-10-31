'use babel';

import SinumerikView from './sinumerik-view';
import { CompositeDisposable } from 'atom';
import {createEquipmentWindow, updateEquipmentPanel} from "./equipment";
import {createToolsWindow, handleToolsKey, openToolsPanel} from "./tools";
import {isParseBusy, flushDeferredParse, parseBlocked} from "./interpretator";
import {undoContourEdit} from "./contourEdit/undo";
import {destroySldDock} from "./sldDockPanel";

export default {

    sinumerikView: null,
    // Set from the console to take the material trace out of every frame:
    //   atom.packages.getActivePackage('sinumerik-highlight')
    //       .mainModule.materialTraceOff = true
    // Declared here so it exists from activation, before the SLD panel is built.
    materialTraceOff: false,
    modalPanel: null,
    equipmentPanel: null,
    toolsPanel: null,
    subscriptions: null,

    activate(state) {
        this.sinumerikView = new SinumerikView(state.sinumerikViewState);

        this.modalPanel = atom.workspace.addRightPanel({
            item: this.sinumerikView.getElement(),
            visible: false
        });

        this.equipmentPanel = atom.workspace.addModalPanel({
            item: createEquipmentWindow(),
            visible: false,
            autoFocus: true
        });

        this.toolsPanel = atom.workspace.addModalPanel({
            item: createToolsWindow(),
            visible: false,
            autoFocus: true
        });

        // Bound once so that add/removeEventListener see the same reference
        // and the listener is actually removed on hide.
        this.handleToolsKeyboard = this.handleToolsKeyboard.bind(this);

        // Events subscribed to in atom's system can be easily cleaned up with a CompositeDisposable
        this.subscriptions = new CompositeDisposable();

        // Register command that toggles this view
        this.subscriptions.add(atom.commands.add('atom-workspace', {
            'sinumerik:toggle': () => this.toggle(),
            'sinumerik:comment': () => this.comment(),
            'sinumerik:redraw': () => this.redraw(),
            'sinumerik:getSnippets': () => this.getSnippets(),
            'sinumerik:contourEditTab': () => this.contourEditTab(),
            'sinumerik:pin-sld-file': () => this.pinSldFile(),
            'sinumerik:createBoundingContour': () => this.createBoundingContour(),
            'sinumerik:contourEditUndo': () => this.contourEditUndo(),
        }));

        this.subscriptions.add(atom.contextMenu.add({
            'atom-text-editor:not([mini])': [{
                label: 'Create bounding contour',
                command: 'sinumerik:createBoundingContour',
                shouldDisplay: () => this.detectSubroutineCallAtCursor() !== null,
            }],
        }));
    },

    deactivate() {
        destroySldDock();
        this.modalPanel.destroy();
        this.equipmentPanel.destroy();
        this.toolsPanel.destroy();
        this.subscriptions.dispose();
        this.sinumerikView.destroy();
    },

    serialize() {
        return {
            sinumerikViewState: this.sinumerikView.serialize()
        };
    },

    toggle() {
        //Change panel width before it show up
        if (!this.modalPanel.isVisible()) {

            this.sinumerikView.resizePanel();

            if (!this.hasBeenOpened) {
                this.hasBeenOpened = true;
                let sinumerikEventHandler = this.sinumerikView.eventRouter.route.bind(this);
                sinumerikEventHandler('{"emitter": "machineManager", "event": "machineManagerButtonClick"}');
            }
        }

        //Show / hide panel
        return (
            this.modalPanel.isVisible() ?
                this.modalPanel.hide() :
                this.modalPanel.show()
        );
    },

    toggleEquipment() {
        if (this.equipmentPanel.isVisible()) {
            this.equipmentPanel.hide()
            this.equipmentPanel.element.removeEventListener('keydown', this.handleKeyboard)
        } else {
            this.equipmentPanel.show()
            this.equipmentPanel.element.addEventListener('keydown', this.handleKeyboard.bind(this))
            updateEquipmentPanel()
        }
    },

    // The Tools window borrows the one global `parseData` to read tool files,
    // so it and a program parse cannot be in flight together. Two halves of
    // the same rule: it will not open while a parse runs, and while it is open
    // a parse is held back (`interpretator.js::parseBlocked`).
    toggleTools() {
        if (this.toolsPanel.isVisible()) {
            this.toolsPanel.hide()
            this.toolsPanel.element.removeEventListener('keydown', this.handleToolsKeyboard)
            // An edit made behind the window is drawn now, rather than being
            // dropped on the floor.
            flushDeferredParse()
        } else {
            if (isParseBusy()) {
                atom.notifications.addInfo('The program is being parsed — try the tool list again in a moment.')
                return
            }
            this.toolsPanel.show()
            this.toolsPanel.element.addEventListener('keydown', this.handleToolsKeyboard)
            openToolsPanel()
        }
    },

    handleKeyboard(e) {
        if (e.key === 'Escape') {
            this.toggleEquipment()
        }
    },

    // Separate from `handleKeyboard`: that one closes the equipment panel by
    // name, so sharing it would make Escape in Tools shut the wrong window.
    //
    // Escape belongs here, with whatever opened the panel; the keys that act
    // on the list (Up/Down, Enter) belong to the list, which is the only thing
    // that knows what is selected.
    handleToolsKeyboard(e) {
        if (e.key === 'Escape') {
            this.toggleTools()
            return
        }
        handleToolsKey(e)
    },

    comment() {
        this.sinumerikView.comment();
    },

    contourEditTab() {
        this.sinumerikView.contourEditTab();
    },

    // Fallback for ctrl-z, which the canvas handles itself while it has focus.
    // Scoped to the contourEdit tab so the chord does nothing elsewhere rather
    // than editing a contour the user cannot see.
    contourEditUndo() {
        if (this.sinumerikView.activeTab !== 'contourEdit') return;
        if (!this.sinumerikView.contourEditData) return;
        undoContourEdit();
    },

    redraw() {
        // ctrl-alt-R with the Tools window open would clear `parseData.canvas`
        // under the tool file the window is reading. Refused rather than
        // queued: a redraw is asked for to be seen, and silently postponing it
        // behind a modal window reads as the key having done nothing.
        if (parseBlocked()) {
            atom.notifications.addInfo('Close the tool list to redraw the program.');
            return;
        }
        this.sinumerikView.redraw();
    },
    getSnippets() {
        this.sinumerikView.getSnip()
    },

    pinSldFile() {
        this.sinumerikView.toggleSldPin();
    },

    detectSubroutineCallAtCursor() {
        const editor = atom.workspace.getActiveTextEditor();
        if (!editor) return null;
        const subroutines = this.sinumerikView?.parseData?.subroutines;
        if (!Array.isArray(subroutines) || !subroutines.length) return null;

        const row = editor.getCursorBufferPosition().row;
        const lineRaw = editor.lineTextForBufferRow(row);
        if (!lineRaw) return null;
        const line = lineRaw.split(';')[0].trim();
        if (!line) return null;

        const stripped = line.replace(/^CALL\s+/, '');
        for (const sub of subroutines) {
            const re = new RegExp(`^${sub.name}(?=$|\\s|\\()`);
            if (re.test(stripped)) {
                return { sub, row };
            }
        }
        return null;
    },

    createBoundingContour() {
        const hit = this.detectSubroutineCallAtCursor();
        if (!hit) {
            atom.notifications.addWarning('Cursor is not on a subroutine call line.');
            return;
        }
        return this.sinumerikView.createBoundingContour(hit);
    }
};
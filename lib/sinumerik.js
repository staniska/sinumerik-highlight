'use babel';

import SinumerikView from './sinumerik-view';
import { CompositeDisposable } from 'atom';
import {createEquipmentWindow, updateEquipmentPanel} from "./equipment";

export default {

    sinumerikView: null,
    modalPanel: null,
    equipmentPanel: null,
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
        this.modalPanel.destroy();
        this.equipmentPanel.destroy();
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

    handleKeyboard(e) {
        if (e.key === 'Escape') {
            this.toggleEquipment()
        }
    },

    comment() {
        this.sinumerikView.comment();
    },

    contourEditTab() {
        this.sinumerikView.contourEditTab();
    },

    redraw() {
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
        atom.notifications.addInfo(
            `Bounding contour for ${hit.sub.name} (row ${hit.row + 1}) — not yet implemented.`
        );
    }
};
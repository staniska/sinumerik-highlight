'use babel';

import SinumerikView from './sinumerik-view';
import { CompositeDisposable } from 'atom';
import {createEquipmentWindow} from "./equipment";

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
        //console.log(atom);
        //Change panel width before it show up
        if (!this.modalPanel.isVisible()) {

            this.sinumerikView.resizePanel();

            if (this.sinumerikView.activeTab === 'jopa') {
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
    }
};
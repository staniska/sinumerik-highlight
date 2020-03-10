'use babel';

import SinumerikView from './sinumerik-view';
import { CompositeDisposable } from 'atom';

export default {

  sinumerikView: null,
  modalPanel: null,
  subscriptions: null,

  activate(state) {
    this.sinumerikView = new SinumerikView(state.sinumerikViewState);

    this.modalPanel = atom.workspace.addRightPanel({
      item: this.sinumerikView.getElement(),
      visible: false
    });

    // Events subscribed to in atom's system can be easily cleaned up with a CompositeDisposable
    this.subscriptions = new CompositeDisposable();

    // Register command that toggles this view
    this.subscriptions.add(atom.commands.add('atom-workspace', {
      'sinumerik:toggle': () => this.toggle(),
    }));
  },

  deactivate() {
    this.modalPanel.destroy();
    this.subscriptions.dispose();
    this.sinumerikView.destroy();
  },

  serialize() {
    return {
      sinumerikViewState: this.sinumerikView.serialize()
    };
  },

  toggle() {
    console.log(atom);
    //Change panel width before it show up
    if (!this.modalPanel.isVisible()) {
      console.log("ActiveTab - " + this.sinumerikView.activeTab);
      this.sinumerikView.resizePanel();
      //this.sinumerikView.bufferFromEditor();
      //
      //atom.workspace.getActiveTextEditor().setCursorScreenPosition([0,3],);

    }

    //Show / hide panel
    return (
      this.modalPanel.isVisible() ?
      this.modalPanel.hide() :
      this.modalPanel.show()
    );
  }
};
'use babel'

import View from './sinumerik'

export function handleSelection ( range ) {
    const Editor = atom.workspace.getActiveTextEditor()

    if (!Editor.getSelectedText().length) {
        delete View.sinumerikView.selection
        return
    }

    View.sinumerikView.selection = range
    // console.log(range)
}
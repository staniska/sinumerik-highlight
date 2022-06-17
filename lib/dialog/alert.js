'use babel'

const {dialog} = require('electron').remote

export function alertDialog(message) {
    dialog.showMessageBoxSync({
        message,
        type: 'warning',
        buttons: ['OK']
    })
}
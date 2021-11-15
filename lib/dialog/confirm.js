'use babel'

const {dialog} = require('electron').remote

export function confirmDialog(message) {
    console.log('confirmDialog')
    const buttons = ['OK', 'Cancel']

    return !dialog.showMessageBoxSync(
        {
            message: message,
            type: 'question',
            buttons: buttons
        })
}
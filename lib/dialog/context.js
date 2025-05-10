'use babel'

const {Menu} = require('electron').remote

import View from '../sinumerik'

export const contextMenu = (template) => {
    const menu = Menu.buildFromTemplate(template)
    View.sinumerikView.contourEditData.eventData.action.type = 'context'
    menu.on ( 'menu-will-close', () => {
        View.sinumerikView.contourEditData.eventData.action.reset()
    })
    return menu
}
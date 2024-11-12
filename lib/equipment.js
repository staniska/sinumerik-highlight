'use babel'

import View from "./sinumerik";
import {create_element} from "./createElement";
import {getPath} from "./contourEdit/tools/fs";

const fs = require('fs')
const fsPromises = fs.promises
const {dialog} = require("electron").remote;

export const createEquipmentWindow = () => {
    View.sinumerikView.equipmentData = []
    const panel = create_element(['sinumerik-equipment', 'native-key-bindings'])
    const closeButton = create_element(['sinumerik-equipment-close-button', 'icon-x'], panel, '', 'button')
    closeButton.addEventListener('click', () => {
        View.toggleEquipment()
    })
    return panel
}

export const updateEquipmentPanel = () => {
    if (!View.sinumerikView.equipmentPanel) createEquipmentElements()
    View.sinumerikView.equipmentData = load_equipment()
    View.sinumerikView.programEquipment = []
    const filename = atom.workspace.getActiveTextEditor().getPath().replace(/\./g, '_').toUpperCase()
    const programEquipment = View.sinumerikView.equipmentData.find(el => el.filename === filename)
    if (!programEquipment) return
    while (View.sinumerikView.equipmentPanel.equipmentList.children.length) {
        View.sinumerikView.equipmentPanel.equipmentList.removeChild(View.sinumerikView.equipmentPanel.equipmentList.firstChild)
    }
    programEquipment.equipment.forEach((el,idx) => {
        const eqip = create_element(['sinumerik-equipment-element'],View.sinumerikView.equipmentPanel.equipmentList,el.name)
        eqip.id = `eqip_${idx}`
        const closeButton = create_element(['sinumerikButton', 'icon-x'], eqip,'','button')
        View.sinumerikView.programEquipment.push({el: eqip, data: el})
    })

    View.sinumerikView.equipmentPanel.equipmentList.appendChild(View.sinumerikView.equipmentPanel.addButton)
}

const createEquipmentElements = () => {
    const filename = atom.workspace.getActiveTextEditor().getPath().replace(/\./g, '_').toUpperCase()
    View.sinumerikView.equipmentPanel = create_element([], document.querySelector('.sinumerik-equipment'))
    View.sinumerikView.equipmentPanel.equipmentList = create_element([], View.sinumerikView.equipmentPanel)
    View.sinumerikView.equipmentPanel.equipmentList.addEventListener('click', (e) => {
        if (!e.target.classList.contains('icon-x')) return
        View.sinumerikView.equipmentData.find(el => el.filename === filename).equipment
            .splice(parseInt(e.target.closest('.sinumerik-equipment-element').id.substring(5)),1)
        save_equipment()
    })
    View.sinumerikView.equipmentPanel.addButton = create_element(['sinumerikButton', 'icon-plus'], View.sinumerikView.equipmentPanel.equipmentList, 'Add', 'button')
    View.sinumerikView.equipmentPanel.addButton.addEventListener('click', () => {
        let path;
        try {
            path = dialog.showOpenDialogSync({properties: ['openFile']});
        } catch (e) {
            path = dialog.showOpenDialog({properties: ['openFile']});
        }
        if (path) {
            const text = fs.readFileSync(path[0], 'utf8')
            const nameMatch = text.split('\n')[0].match(/(?<=NAME:)\w+/)
            if (!nameMatch) {
                dialog.showMessageBox(null, {message: 'Equipment file first row must contain ";NAME:..."', type: 'warning'})
                return
            }
            let programEquipment = View.sinumerikView.equipmentData.find(el => el.filename === filename)
            if (!programEquipment) {
                View.sinumerikView.equipmentData.push({filename, equipment: []})
                programEquipment = View.sinumerikView.equipmentData.find(el => el.filename === filename)
            }
            programEquipment.equipment.push({name: nameMatch[0], path: path[0], color: '#ff7777', position: [0,0,0]})
            save_equipment()
        }
    })
}

const load_equipment = () => {
    const Editor = atom.workspace.getActiveTextEditor()
    const path = getPath('equipment.json').contoursPath

    if (!fs.existsSync(path) ||
        !fs.readFileSync(path, 'utf8').length
    ) {
        return []
    } else {
        return JSON.parse(fs.readFileSync(path, 'utf8'))
    }
}

const save_equipment = () => {
    const path = getPath('equipment.json').contoursPath

    fsPromises
        .writeFile(path, JSON.stringify(View.sinumerikView.equipmentData))
        .then(() => {
            updateEquipmentPanel()
        })
        .catch(e => {
            console.log(e)
        })
}


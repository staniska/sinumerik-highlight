'use babel'

import View from "./sinumerik";
import {create_element} from "./createElement";
import {getPath} from "./contourEdit/tools/fs";
import {normalizeFileName} from "./utils";

const fsPromises = require('fs').promises
const {dialog} = require("electron").remote;

export const createEquipmentWindow = () => {
    View.sinumerikView.equipmentData = []
    const panel = create_element(['sinumerik-equipment', 'native-key-bindings'])
    const closeButton = create_element(['sinumerik-equipment-close-button', 'icon-x'], panel, 'button')
    closeButton.addEventListener('click', () => {
        View.toggleEquipment()
    })
    return panel
}

export const updateEquipmentPanel = async () => {
    if (!View.sinumerikView.equipmentPanel) createEquipmentElements()
    View.sinumerikView.equipmentData = await load_equipment()
    View.sinumerikView.programEquipment = []
    const filename = normalizeFileName(atom.workspace.getActiveTextEditor().getPath())
    const programEquipment = View.sinumerikView.equipmentData.find(el => el.filename === filename)
    if (!programEquipment) return
    while (View.sinumerikView.equipmentPanel.equipmentList.children.length) {
        View.sinumerikView.equipmentPanel.equipmentList.removeChild(View.sinumerikView.equipmentPanel.equipmentList.firstChild)
    }
    programEquipment.equipment.forEach((el,idx) => {
        const eqip = create_element(['sinumerik-equipment-element'],View.sinumerikView.equipmentPanel.equipmentList, 'div', el.name)
        eqip.id = `eqip_${idx}`
        const closeButton = create_element(['sinumerikButton', 'icon-x'], eqip, 'button')
        View.sinumerikView.programEquipment.push({el: eqip, data: el})
    })

    View.sinumerikView.equipmentPanel.equipmentList.appendChild(View.sinumerikView.equipmentPanel.addButton)
}

const createEquipmentElements = () => {
    const filename = normalizeFileName(atom.workspace.getActiveTextEditor().getPath())
    View.sinumerikView.equipmentPanel = create_element([], document.querySelector('.sinumerik-equipment'))
    View.sinumerikView.equipmentPanel.equipmentList = create_element([], View.sinumerikView.equipmentPanel)
    View.sinumerikView.equipmentPanel.equipmentList.addEventListener('click', (e) => {
        if (!e.target.classList.contains('icon-x')) return
        View.sinumerikView.equipmentData.find(el => el.filename === filename).equipment
            .splice(parseInt(e.target.closest('.sinumerik-equipment-element').id.substring(5)),1)
        save_equipment()
    })
    View.sinumerikView.equipmentPanel.addButton = create_element(['sinumerikButton', 'icon-plus'], View.sinumerikView.equipmentPanel.equipmentList, 'button', 'Add')
    View.sinumerikView.equipmentPanel.addButton.addEventListener('click', async () => {
        const {canceled, filePaths} = await dialog.showOpenDialog({properties: ['openFile']})
        if (!canceled) {
            const text = await fsPromises.readFile(filePaths[0], 'utf8')
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
            programEquipment.equipment.push({name: nameMatch[0], path: filePaths[0], color: '#ff7777', position: [0,0,0]})
            save_equipment()
        }
    })
}

const load_equipment = async () => {
    const {contoursPath} = getPath('equipment.json')
    try {
        const text = await fsPromises.readFile(contoursPath, 'utf8')
        if (!text.length) return []
        return JSON.parse(text)
    } catch (err) {
        if (err.code === 'ENOENT') return []
        throw err
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


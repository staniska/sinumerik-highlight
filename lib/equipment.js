'use babel'

import View from "./sinumerik";
import {create_element} from "./createElement";

export const createEquipmentWindow = () => {
    const panel = create_element(['sinumerik-equpiment', 'native-key-bindings'])
    const closeButton = create_element(['sinumerik-equipment-close-button', 'icon-x'], panel, '', 'button')
    closeButton.addEventListener('click', () => {
        View.toggleEquipment()
    })
    return panel
}
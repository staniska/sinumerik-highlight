'use babel'

import {create_element} from "../createElement";
import View from "../../sinumerik";
import {draw} from "../canvas";

export const viewTools = () => {

    if (View.sinumerikView.contourEditRightContainer.querySelector('.contourEditViewTools')) return

    const viewToolsContainer = create_element(['contourEditContainer', 'contourEditViewTools'])
    const normalize = create_element(['contourEditButton','icon-screen-full', 'exclude'], viewToolsContainer,'','button')
    normalize.addEventListener('click', handleNormalize)
    View.sinumerikView.contourEditRightContainer.appendChild(viewToolsContainer)
}

const handleNormalize = () => {
    const canvas = View.sinumerikView.contourEditMainWindow.canvas


    //TODO вписать заготовку в экран

    // if (View.sinumerikView.contourEditData.blank) {
    //
    // }

    View.sinumerikView.contourEditData.canvasFrame.trans[0] = View.sinumerikView.contourEditMainWindow.canvas.width * (3 / 4)
    View.sinumerikView.contourEditData.canvasFrame.trans[1] = View.sinumerikView.contourEditMainWindow.canvas.height * (1 / 2)

    View.sinumerikView.contourEditData.canvasFrame.scale = 1

    draw()
}
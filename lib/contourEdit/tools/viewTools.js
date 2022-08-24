'use babel'

import {create_element} from "../createElement";
import View from "../../sinumerik";
import {draw} from "../canvas";
import {getContourRange} from "./turning";

export const viewTools = () => {

    if (View.sinumerikView.contourEditRightContainer.querySelector('.contourEditViewTools')) return

    const viewToolsContainer = create_element(['contourEditContainer_visible', 'contourEditViewTools'])
    const normalize = create_element(['contourEditButton', 'icon-screen-full', 'exclude'], viewToolsContainer, '', 'button')
    normalize.addEventListener('click', handleNormalize)
    View.sinumerikView.contourEditRightContainer.appendChild(viewToolsContainer)
}

export const handleNormalize = () => {
    const canvas = View.sinumerikView.contourEditMainWindow.canvas
    const contour = View.sinumerikView.contourEditData.editContour
    const trans = View.sinumerikView.contourEditData.canvasFrame.trans

    if (contour.length < 1) {
        trans[0] = canvas.width * (3 / 4)
        trans[1] = canvas.height * (1 / 2)

        View.sinumerikView.contourEditData.canvasFrame.scale = 1
        draw()
        return
    }

    const range = getContourRange(contour)
    console.log(range)

    View.sinumerikView.contourEditData.canvasFrame.scale =
        ((range.right - range.left) / canvas.width > (range.top - range.bottom) / canvas.height ?
                canvas.width / (range.right - range.left) :
                canvas.height / (range.top - range.bottom)
        ) * 0.8

    trans[0] = -(range.left + range.right) / 2 * View.sinumerikView.contourEditData.canvasFrame.scale + canvas.width / 2
    trans[1] = -(range.top + range.bottom) / 2 * View.sinumerikView.contourEditData.canvasFrame.scale + canvas.height / 2
    draw()
}
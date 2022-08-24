'use babel'

import {create_element} from "../createElement";
import View from "../../sinumerik";
import {draw, getFrame} from "../canvas";
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
    let {x, y, plane} = getFrame()

    if (contour.length < 1) {
        trans[0] = canvas.width * (3 / 4)
        trans[1] = canvas.height * (1 / 2)

        View.sinumerikView.contourEditData.canvasFrame.scale = 1
        draw()
        return
    }

    const range = getContourRange(contour)

    const axesRange = {
        [x]: [range.right, range.left],
        [y]: [range.top, range.bottom]
    }


    if ([x,y].sort().toString() === 'X,Z' && plane.abscissa.name === 'X' && plane.ordinate.name === 'Z') {
        x = 'X'
        y = 'Z'
    }

    View.sinumerikView.contourEditData.canvasFrame.scale =
        ((axesRange[x][0] - axesRange[x][1]) / canvas.width > (axesRange[y][0] - axesRange[y][1]) / canvas.height ?
                canvas.width / (axesRange[x][0] - axesRange[x][1]) :
                canvas.height / (axesRange[y][0] - axesRange[y][1])
        ) * 0.8

    trans[0] = (plane.abscissa.reverse ? 1 : -1) * (axesRange[x][0] + axesRange[x][1]) / 2 * View.sinumerikView.contourEditData.canvasFrame.scale + canvas.width / 2
    trans[1] = (plane.ordinate.reverse ? -1 : 1) * (axesRange[y][0] + axesRange[y][1]) / 2 * View.sinumerikView.contourEditData.canvasFrame.scale + canvas.height / 2
    draw()
}
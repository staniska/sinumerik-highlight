'use babel'

import View from '../../sinumerik'
import {confirmDialog} from "../../dialog/confirm";
import {draw} from "../canvas";

export const createTurning = () => {
    const processingData = View.sinumerikView.contourEditData.processingData
    if (processingData.type !== 'turning') {
        processingData.reset()
        processingData.type = 'turning'
    }

    if (View.sinumerikView.contourEditData.eventData.action.name === 'selectPoint') {
        processingData.startPoint = View.sinumerikView.contourEditData.cursorPosition
        View.sinumerikView.contourEditData.eventData.action.reset()
        draw()
    }

    if (processingData.startPoint === null) {
        if (confirmDialog('Select cycle start point')) {
            View.sinumerikView.contourEditData.eventData.action.name = 'selectPoint'
            View.sinumerikView.contourEditData.eventData.action.type = 'turning'
        }
        return
    }

    // console.log(processingData[1])

    // console.log(contour)
}
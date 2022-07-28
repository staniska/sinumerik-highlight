'use babel'

import View from '../../sinumerik'
import {confirmDialog} from "../../dialog/confirm";
import {draw, getFrame} from "../canvas";
import {create_element} from "../createElement";
import {checkPointBelongsArc} from "../intersections";

export const createTurning = () => {
    const {x, y} = getFrame()
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


    View.sinumerikView.modalWindow = document.createElement('div')
    View.sinumerikView.modalWindow.className = 'contourEdit_modalWindow'
    View.sinumerikView.modalWindow.header = create_element(['contourEdit_modalWindowHeader'], View.sinumerikView.modalWindow, 'Select machining direction')
    const {top, right, bottom, left} = getBurnedContourRange()
    console.log(top, right, bottom, left)
    console.log(processingData.startPoint)
    View.sinumerikView.modalWindow.directions = create_element(['contourEdit_modalWindowDirections'], View.sinumerikView.modalWindow)
    if (processingData.startPoint[x] > right) {
        create_element(['contourEdit_modalWindow_Direction'], View.sinumerikView.modalWindow.directions, 'left', 'button')
    }
    if (processingData.startPoint[x] < left) {
        create_element(['contourEdit_modalWindow_Direction'], View.sinumerikView.modalWindow.directions, 'right', 'button')
    }
    if (processingData.startPoint[y] > top) {
        create_element(['contourEdit_modalWindow_Direction'], View.sinumerikView.modalWindow.directions, 'bottom', 'button')
    }
    if (processingData.startPoint[y] < bottom) {
        create_element(['contourEdit_modalWindow_Direction'], View.sinumerikView.modalWindow.directions, 'top', 'button')
    }
    if (View.sinumerikView.modalWindow.directions.children.length < 2) {

        while (View.sinumerikView.modalWindow.directions.children.length) {
            View.sinumerikView.modalWindow.directions.removeChild(View.sinumerikView.modalWindow.directions.lastChild)
        }
        View.sinumerikView.modalWindow.directions.innerText = 'Directions can\'t be determined for start point'
    }
    View.sinumerikView.modalWindow.closeBtn = create_element(['contourEdit_Button'], View.sinumerikView.modalWindow, 'Close', 'button')
    View.sinumerikView.modalWindowPanel = atom.workspace.addModalPanel({item: View.sinumerikView.modalWindow})
    View.sinumerikView.modalWindowPanel.show()
    View.sinumerikView.modalWindow.closeBtn.addEventListener('click', () => {
        View.sinumerikView.contourEditData.processingData.reset()
        View.sinumerikView.modalWindowPanel.destroy()
    })


}

export const getBurnedContourRange = () => {
    let range
    const contour = View.sinumerikView.contourEditData.burnedContour

    contour.forEach((el, idx) => {
        if (idx === 0) {
            range = getElementRange(el)
            return
        }
        const {top, right, bottom, left} = getElementRange(el)
        if (top > range.top) range.top = top
        if (right > range.right) range.right = right
        if (bottom < range.bottom) range.bottom = bottom
        if (left < range.left) range.left = left
    })
    return range
}

const getElementRange = (el) => {
    if (el.type === 'line') {
        return getLineRange(el)
    }
    if (el.type === 'arc') {
        return getArcRange(el)
    }
}

const getArcRange = (el) => {
    const {x,y} = getFrame()
    let top = Math.max(el.start[y], el.end[y])
    let p = {[x]: center[x], [y]: center[y] + radius}
    if (checkPointBelongsArc(el, p)) {
        top = pointWithCoords(p)
    }
    let bottom = Math.min(el.start[y], el.end[y])
    p = {[x]: center[x], [y]: center[y] - radius}
    if (checkPointBelongsArc(el, p)) {
        bottom = pointWithCoords(p)
    }
    let right = Math.max(el.start[x], el.end[x])
    p = {[x]: center[x] + radius, [y]: center[y]}
    if (checkPointBelongsArc(el, p)) {
        right = pointWithCoords(p)
    }
    let left = Math.min(el.start[x], el.end[x])
    p = {[x]: center[x] - radius, [y]: center[y]}
    if (checkPointBelongsArc(el, p)) {
        left = pointWithCoords(p)
    }
    return {top, right, bottom, left}

}

const getLineRange = (el) => {
    const {x, y} = getFrame()
    const horizontal = [el.start[x], el.end[x]].sort()
    const vertical = [el.start[y], el.end[y]].sort()
    return {top: vertical[1], bottom: vertical[0], left: horizontal[0], right: horizontal[1]}
}

const pointWithCoords = (p) => {
    return {
        type: point,
        coords: p,
    }
}

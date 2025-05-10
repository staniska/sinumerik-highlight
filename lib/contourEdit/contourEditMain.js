'use babel'

import {alertDialog} from "../dialog/alert";

const fs = require('fs')

import View from '../sinumerik'
import {create_element} from './createElement'
import {clickHandler, draw, getFrame, mouseDownHandler, moveCanvas, scrollCanvas, setCursorPosition} from "./canvas";
import {checkCanvasArea} from "./tools/canvasArea";
import {contextMenu} from "../dialog/context";
import {elementProperties} from "./footer/elementProperties";
import {updateIntersections} from "./intersections";

export const generateCanvas = () => {
    const Editor = atom.workspace.getActiveTextEditor();
    const filename = Editor.getPath().replace(/\./g, '_').toUpperCase();


    let eventRequire = false
    if (!View.sinumerikView.contourEditMainWindow.canvas) {
        eventRequire = true
        View.sinumerikView.contourEditMainWindow.canvas = create_element(['contourEditCanvas'], View.sinumerikView.contourEditMainWindow, '', 'canvas')
    }

    View.sinumerikView.contourEditMainWindow.canvas.width = View.sinumerikView.contourEditMainWindow.canvas.offsetWidth
    View.sinumerikView.contourEditMainWindow.canvas.height = View.sinumerikView.contourEditMainWindow.canvas.offsetHeight

    View.sinumerikView.contourEditData.canvasFrame.trans[0] = View.sinumerikView.contourEditMainWindow.canvas.width * (3 / 4)
    View.sinumerikView.contourEditData.canvasFrame.trans[1] = View.sinumerikView.contourEditMainWindow.canvas.height * (1 / 2)

    const savedFrame = View.sinumerikView.contourEditData.savedFrames.find(el => el.filename === filename)
    if (savedFrame) {
        View.sinumerikView.contourEditData.canvasFrame.trans[0] = savedFrame.trans[0]
        View.sinumerikView.contourEditData.canvasFrame.trans[1] = savedFrame.trans[1]
        View.sinumerikView.contourEditData.canvasFrame.scale = savedFrame.scale
    } else {
        View.sinumerikView.contourEditData.savedFrames.push(
            {
                filename,
                trans: [View.sinumerikView.contourEditData.canvasFrame.trans[0], View.sinumerikView.contourEditData.canvasFrame.trans[1]],
                scale: View.sinumerikView.contourEditData.canvasFrame.scale
            }
        )
    }

    View.sinumerikView.contourEditMainWindow.canvas.addEventListener('wheel', event => {
        scrollCanvas(event)
    })

    View.sinumerikView.contourEditMainWindow.canvas.addEventListener('mousedown', (event) => {
        if (event.button === 2) return
        View.sinumerikView.contourEditData.eventData.mouseDown = {X: event.offsetX, Y: event.offsetY}
        View.sinumerikView.contourEditMainWindow.canvas.style.cursor = 'grabbing'
        View.sinumerikView.contourEditMainWindow.canvas.addEventListener('mousemove', moveCanvas)
    })
    View.sinumerikView.contourEditMainWindow.canvas.addEventListener('mouseup', () => {
        View.sinumerikView.contourEditMainWindow.canvas.style.cursor = 'pointer'
        View.sinumerikView.contourEditMainWindow.canvas.removeEventListener('mousemove', moveCanvas)
    })
    View.sinumerikView.contourEditMainWindow.canvas.tabIndex = 2
    View.sinumerikView.contourEditMainWindow.canvas.title = 'Click on graphic field to activate keyboard events';
    View.sinumerikView.contourEditMainWindow.canvas.addEventListener('keydown', function (event) {
        if (event.code === 'Equal') {
            scrollCanvas(null, -50)
        }
        if (event.code === 'Minus') {
            scrollCanvas(null, 50)
        }

        if (event.key === 'ArrowUp') {
            moveCanvas(null, {Y: 20, X: 0})
        }
        if (event.key === 'ArrowDown') {
            moveCanvas(null, {Y: -20, X: 0})
        }
        if (event.key === 'ArrowLeft') {
            moveCanvas(null, {Y: 0, X: 20})
        }
        if (event.key === 'ArrowRight') {
            moveCanvas(null, {Y: 0, X: -20})
        }
    })

    View.sinumerikView.contourEditMainWindow.canvas.addEventListener('mousemove', mouseMoveHandle);
    View.sinumerikView.contourEditMainWindow.canvas.addEventListener('click', clickHandler)
    View.sinumerikView.contourEditMainWindow.canvas.addEventListener('contextmenu', contextMenuHandle)
    View.sinumerikView.contourEditMainWindow.canvas.addEventListener('mousedown', mouseDownHandler)
    return eventRequire
}

const contextMenuHandle = () => {
    if (View.sinumerikView.contourEditData.elements.propertyEdit >= 0) {
        if (View.sinumerikView.contourEditData.points.intersectionInFocus) {
            // console.log(View.sinumerikView.contourEditData.points.intersectionInFocus)
            const menu = contextMenu([
                { label: 'Divide', click: divideHandle },
            ])
            menu.popup()
        }
    }
}

const divideHandle = () => {
    const idx = View.sinumerikView.contourEditData.elements.propertyEdit
    elementProperties()
    const el1 = {
        ...View.sinumerikView.contourEditData.editContour[idx],
        id: undefined,
        end: View.sinumerikView.contourEditData.points.intersectionInFocus.coords
    }
    const el2 = {
        ...View.sinumerikView.contourEditData.editContour[idx],
        id: undefined,
        start: View.sinumerikView.contourEditData.points.intersectionInFocus.coords
    }
    View.sinumerikView.contourEditData.editContour.push(el1)
    View.sinumerikView.contourEditData.editContour.push(el2)
    View.sinumerikView.contourEditData.editContour.del(idx)
    updateIntersections()
    draw()
}

const mouseMoveHandle = (e) => {
    setCursorPosition(e)
    checkCanvasPoint()
    if (View.sinumerikView.contourEditData.elements.propertyEdit >= 0) checkIntersectionPoint()
    const nearestElId = View.sinumerikView.contourEditData.points.inFocus.length ? -1 : checkCanvasElement()
    if (nearestElId !== View.sinumerikView.contourEditData.elements.nearCursor) {
        View.sinumerikView.contourEditData.elements.nearCursor = nearestElId
        draw()
    }

    checkCanvasArea()
    if (
        View.sinumerikView.contourEditData.eventData.action.type ||
        View.sinumerikView.contourEditData.points.inFocus.length ||
        View.sinumerikView.contourEditData.points.burned.length ||
        View.sinumerikView.contourEditData.visibleActions
    ) {
        draw(e)
    }
}

const checkCanvasElement = () => {
    const roundedPoints = View.sinumerikView.contourEditData.points.roundedObj
    if (!roundedPoints) return -1
    const {x, y} = getFrame()

    const roundedCursorPosition = Object.fromEntries(Object.entries(View.sinumerikView.contourEditData.cursorPosition).map(e => [e[0], Math.round(e[1])]))
    const roundedPointsNearCursor = []
    const range = Math.round(10 / View.sinumerikView.contourEditData.canvasFrame.scale)
    for (let i = -range; i < range + 1; i++) {
        if (roundedPoints[roundedCursorPosition[x] + i]) {
            for (let j = -range; j < range + 1; j++) {
                if (roundedPoints[roundedCursorPosition[x] + i][roundedCursorPosition[y] + j]) {
                    roundedPointsNearCursor.push(...roundedPoints[roundedCursorPosition[x] + i][roundedCursorPosition[y] + j])
                }
            }
        }
    }
    if (!roundedPointsNearCursor.length) return -1

    let nearestPoint = roundedPointsNearCursor[0]
    if (roundedPointsNearCursor.length > 1) {
        const littleElementsPoints = View.sinumerikView.contourEditData.canvasFrame.scale > 30 ? roundedPointsNearCursor.filter(p => {
            const parentEl = View.sinumerikView.contourEditData.editContour[p.parentId]
            return ((parentEl.type === 'arc' && parentEl.radius < 4) || (getDistance(parentEl.start, parentEl.end)) < 5)
        }) : []

        const findNearestPoint = (points) => {
            points.slice(1).forEach(p => {
                if (getDistance(p.coords, roundedCursorPosition) < getDistance(nearestPoint.coords, roundedCursorPosition)) {
                    nearestPoint = p
                }
            })
        }

        if (littleElementsPoints.length) {
            nearestPoint = littleElementsPoints[0]
            findNearestPoint(littleElementsPoints)
        } else {
            findNearestPoint(roundedPointsNearCursor)
        }
    }

    return nearestPoint.parentId
}

const checkCanvasPoint = () => {
    if (Date.now() < View.sinumerikView.contourEditData.checkPointsTimestamp + 100) return
    View.sinumerikView.contourEditData.checkPointsTimestamp = Date.now()

    const editContour = View.sinumerikView.contourEditData.editContour
    if (!editContour.length) return

    const pointsWithDistance = editContour
        .map((el, idx) => {
            const returnPoints = []

            returnPoints.push({
                idx,
                type: 'point',
                subType: 'start',
                coords: el.start,
                distance: getDistance(el.start, null, true)
            })
            returnPoints.push({
                idx,
                type: 'point',
                subType: 'end',
                coords: el.end,
                distance: getDistance(el.end, null, true)
            })

            if (el.type === 'arc') {
                returnPoints.push({
                    idx,
                    type: 'point',
                    subType: 'middle',
                    coords: el.middle,
                    distance: getDistance(el.middle, null, true)
                })
            }

            return returnPoints
        })
        .flat()

    const minDistance =
        View.sinumerikView.contourEditData.points.dragging.length ?
            Math.min(...pointsWithDistance
                .filter(p => {
                    return p.distance > Math.min(...pointsWithDistance.map(point => {
                        return point.distance
                    }))
                })
                .map(point => {
                    return point.distance
                })
            )
            : Math.min(...pointsWithDistance.map(point => {
                return point.distance
            }))

    if (minDistance < 15) {
        View.sinumerikView.contourEditData.points.inFocus = pointsWithDistance.filter(point => {
            if (!View.sinumerikView.contourEditData.points.dragging.length) {
                return point.distance < minDistance + 1e-8
            } else {
                return (
                    point.distance < minDistance + 1e-8 &&
                    !View.sinumerikView.contourEditData.points.dragging.filter(p => {
                            return (p.idx === point.idx && p.subType === point.subType)
                        }
                    ).length
                )
            }


        })
    } else {
        const drawFlag = View.sinumerikView.contourEditData.points.inFocus.length
        View.sinumerikView.contourEditData.points.inFocus = []
        if (drawFlag) draw()
    }

}

const checkIntersectionPoint = () => {
    const intersectionsAtElement = View.sinumerikView.contourEditData.points.intersectionsAtElement
    const intersectionsNearCursor = intersectionsAtElement.filter(p => getDistance(p.coords, View.sinumerikView.contourEditData.cursorPosition, true) < 15)
    if (!intersectionsNearCursor.length) {
        View.sinumerikView.contourEditData.points.intersectionInFocus = null
        draw()
    } else {
        if (!View.sinumerikView.contourEditData.points.intersectionInFocus) {
            View.sinumerikView.contourEditData.points.intersectionInFocus = intersectionsNearCursor[0]
            draw()
        }
    }
}

export const getDistance = (p1, p2, scale) => {
    const {x, y} = getFrame()
    if (p2 === null) {
        p2 = View.sinumerikView.contourEditData.cursorPosition
    }
    return Math.sqrt((p1[x] - p2[x]) ** 2 + (p1[y] - p2[y]) ** 2) * (scale ? View.sinumerikView.contourEditData.canvasFrame.scale : 1)
}

export const getBlankContour = () => {
    const Editor = atom.workspace.getActiveTextEditor()
    const fileName = Editor.getTitle().replace(/\./g, '_').toUpperCase()

    try {
        const blankFileName = View.sinumerikView.programmData[fileName].blank.name + '.MPF'
        let path = Editor.getPath()
        let pathSplitter = '/'
        if (path[1] === ':') {
            pathSplitter = '\\'
        }
        path = path.substring(0, path.lastIndexOf(pathSplitter) + 1) + blankFileName
        let text = fs.readFileSync(path, 'utf8')
        if (!checkText(text)) {
            return []
        }
        text = text.split('\n')
        return getContourFromText(text)

    } catch (e) {
        console.log(e)
    }
}

const checkText = (text) => {
    const equalLength = text.match('=') ? text.match('=').length : 0
    const crLength = text.match(/CR=\d/) ? text.match(/CR=\d/).length : 0
    const arLength = text.match(/AR=\d/) ? text.match(/AR=\d/).length : 0
    const rndLength = text.match(/RND=\d/) ? text.match(/RND=\d/).length : 0
    const chrLength = text.match(/CHR=\d/) ? text.match(/CHR=\d/).length : 0


    if (equalLength > crLength + arLength + rndLength + chrLength) {
        alertDialog(`workpiece contour cannot be parsed`)
        return false
    }
    return true
}

export const getContourFromText = (text) => {
    text = text
        .map(row => {
            if (row.match(';')) {
                return row.substring(0, row.indexOf(';')).trim()
            }
            return row.trim()
        })
        .filter(row => row.length)
        .filter(row => row !== 'M30')
    text[text.length] = `G1 ${text[0].replace('G0', '').trim()}`

    return (text.map((row, idx, text) => parseRow(row, idx, text)))
}

const parseRowData = {
    prevPosition: {}
}

export const parseRow = (row, idx, text) => {

    const el = {}

    const elType = (row) => {
        if (row.match(/G[123]/)) {
            if (row.match(/G[23]/)) {
                el.type = 'arc'
                el.direction = row.match(/G[23]/)[0][1] === '2' ? 'cw' : 'ccw'
            } else {
                el.type = 'line'
            }
        } else {
            elType(text.slice(0, idx).reverse().find(str => str.match(/G[123]/)))
        }
    }

    if (!idx) {
        row.split(' ').forEach(word => {
            if (word.match(/[XYZ]/)) {
                parseRowData.prevPosition[word.match(/[XYZ]/)[0]] = word.substring(1)
            }
        })
        return null
    }

    elType(row)

    let targetPosition = JSON.parse(JSON.stringify(parseRowData.prevPosition))

    if (el.type === 'line') {
        row.split(' ').forEach(word => {
            if (word.match(/[XYZ]/)) {
                targetPosition[word.match(/[XYZ]/)[0]] = word.substring(1)
            }
        })

        el.start = JSON.parse(JSON.stringify(parseRowData.prevPosition))
        el.end = JSON.parse(JSON.stringify(targetPosition))
        if (row.match(/RND=\d.?\d*/)) {
            el.rnd = row.match(/RND=\d.?\d*/)[0].substring(4)
        }
    }

    return el
}

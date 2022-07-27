'use babel'

import {alertDialog} from "../dialog/alert";

const fs = require('fs')

import View from '../sinumerik'
import {create_element} from './createElement'
import {clickHandler, draw, mouseDownHandler, moveCanvas, scrollCanvas, setCursorPosition} from "./canvas";
import {checkCanvasArea} from "./tools/canvasArea";

export const generateCanvas = () => {
    let eventRequire = false
    if (!View.sinumerikView.contourEditMainWindow.canvas) {
        eventRequire = true
        View.sinumerikView.contourEditMainWindow.canvas = create_element(['contourEditCanvas'], View.sinumerikView.contourEditMainWindow, '', 'canvas')
    }

    View.sinumerikView.contourEditMainWindow.canvas.width = View.sinumerikView.contourEditMainWindow.canvas.offsetWidth
    View.sinumerikView.contourEditMainWindow.canvas.height = View.sinumerikView.contourEditMainWindow.canvas.offsetHeight

    View.sinumerikView.contourEditData.canvasFrame.trans[0] = View.sinumerikView.contourEditMainWindow.canvas.width * (3 / 4)
    View.sinumerikView.contourEditData.canvasFrame.trans[1] = View.sinumerikView.contourEditMainWindow.canvas.height * (1 / 2)

    View.sinumerikView.contourEditMainWindow.canvas.addEventListener('wheel', event => {
        scrollCanvas(event)
    })

    View.sinumerikView.contourEditMainWindow.canvas.addEventListener('mousedown', (event) => {
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

    View.sinumerikView.contourEditMainWindow.canvas.addEventListener('mousemove', event => {
        setCursorPosition(event)
        checkCanvasPoint()
        checkCanvasArea()
        if (
            View.sinumerikView.contourEditData.eventData.action.type ||
            View.sinumerikView.contourEditData.points.inFocus.length ||
            View.sinumerikView.contourEditData.points.burned.length ||
            View.sinumerikView.contourEditData.visibleActions
        ) {
            draw(event)
        }
    });
    View.sinumerikView.contourEditMainWindow.canvas.addEventListener('click', clickHandler)
    View.sinumerikView.contourEditMainWindow.canvas.addEventListener('mousedown', mouseDownHandler)

    return eventRequire

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
                distance: getDistance(el.start)
            })
            returnPoints.push({
                idx,
                type: 'point',
                subType: 'end',
                coords: el.end,
                distance: getDistance(el.end)
            })

            if (el.type === 'arc') {
                returnPoints.push({
                    idx,
                    type: 'point',
                    subType: 'middle',
                    coords: el.middle,
                    distance: getDistance(el.middle)
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

export const getDistance = (p1, p2) => {
    if (p2 === undefined) {
        p2 = View.sinumerikView.contourEditData.cursorPosition
    }

    return Math.sqrt((Object.values(p1)[0] - Object.values(p2)[0]) ** 2 + (Object.values(p1)[1] - Object.values(p2)[1]) ** 2) *
        View.sinumerikView.contourEditData.canvasFrame.scale
}

export const getAssociatedContours = () => {
    // console.log(getBlankContour())
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

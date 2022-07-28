'use babel'

import View from "../sinumerik";
import {changeLinePoint, elementProperties} from "./footer/elementProperties";
import {newCreatingElement} from "./contourEdit";
import {updateIntersections} from "./intersections";
import {createTurning} from "./tools/turning";

export const clickHandler = (event) => {
    const action = View.sinumerikView.contourEditData.eventData.action
    if (action.type === 'create') {
        if (action.name === 'line') {
            createLine(event)
        }
        if (action.name === 'arc') {
            createArc(event)
        }
    }
    if (action.type === 'turning') {
        if (action.name === 'selectPoint') {
            createTurning()
        }
    }

}

export const mouseDownHandler = () => {
    if (View.sinumerikView.contourEditData.eventData.action.type !== null) return

    if (View.sinumerikView.contourEditData.points.inFocus.length) {
        View.sinumerikView.contourEditMainWindow.canvas.addEventListener('mouseup', mouseUpHandler)
        View.sinumerikView.contourEditData.points.dragging = View.sinumerikView.contourEditData.points.inFocus
        View.sinumerikView.contourEditMainWindow.canvas.addEventListener('mousemove', dragPointHandler)
        View.sinumerikView.contourEditData.eventData.action.type = 'drag'
    }
}

const dragPointHandler = () => {
    View.sinumerikView.contourEditData.points.dragging.forEach((point, idx, dragPoints) => {
        const elements = View.sinumerikView.contourEditData.editContour
        const {x, y} = getFrame()
        let coords = {...View.sinumerikView.contourEditData.cursorPosition}

        if (point.coords[x] === coords[x] && point.coords[y] === coords[y]) {
            return
        }

        const lineDragPoints = dragPoints.filter(point => {
            return View.sinumerikView.contourEditData.editContour[point.idx].type === 'line'
        })

        if (lineDragPoints.filter(point => point.subType === 'end' && elements[point.idx].angBlocked).length) {
            const el = elements[lineDragPoints.find(point => point.subType === 'end' && elements[point.idx].angBlocked).idx]

            if (Math.abs(el.ang) % 90 < 1e-4) {
                if (Math.abs(el.ang) % 180 < 1e-4) {
                    coords[y] = el.start[y]
                } else {
                    coords[x] = el.start[x]
                }
            } else {
                const distanceByX = Math.abs(coords[x] - el.start[x]) / Math.cos(el.ang * Math.PI / 180)
                const distanceByY = Math.abs(coords[y] - el.start[y]) / Math.sin(el.ang * Math.PI / 180)
                if (distanceByX > distanceByY) {
                    const newYValue = parseFloat(el.start[y]) + (coords[x] - el.start[x]) * Math.tan(el.ang * Math.PI / 180)
                    if (!isFinite(newYValue)) return
                    coords[y] = newYValue
                } else {
                    const newXValue = parseFloat(el.start[x]) + (coords[y] - el.start[y]) / Math.tan(el.ang * Math.PI / 180)
                    if (!isFinite(newXValue)) return
                    coords[x] = newXValue
                }
            }
        }

        if (lineDragPoints.filter(point => point.subType === 'start' && elements[point.idx].angBlocked).length) {
            const el = elements[lineDragPoints.find(point => point.subType === 'start' && elements[point.idx].angBlocked).idx]
            changeLinePoint(el, 'start', x, coords)
        }

        point.coords = coords
        View.sinumerikView.contourEditData.editContour[point.idx][point.subType] =
            point.coords
        if (!elements[point.idx].angBlocked || point.subType === 'start') {
            setAng(View.sinumerikView.contourEditData.editContour[point.idx])
        } else {
            const el = elements[point.idx]
            if (Math.abs(Math.abs(el.ang - Math.atan2((el.end[y] - el.start[y]), (el.end[x] - el.start[x])) / Math.PI * 180) - 180) < 1e-4) {
                setAng(View.sinumerikView.contourEditData.editContour[point.idx])
            }
        }

        // console.log(View.sinumerikView.contourEditData.editContour[point.idx])

        if (View.sinumerikView.contourEditFootContainer.querySelector('.contourEditElementProperties') &&
            View.sinumerikView.contourEditFootContainer.querySelector('.contourEditElementProperties_id').innerText === '' + (point.idx + 1)) {
            elementProperties(View.sinumerikView.contourEditData.editContour[point.idx], point.idx)
        }
    })
    updateIntersections()
}
const mouseUpHandler = () => {
    const points = View.sinumerikView.contourEditData.points
    if (points.inFocus.length) {
        const p = points.dragging[0]
        View.sinumerikView.contourEditData.editContour[p.idx][p.subType] =
            points.inFocus[0].coords
    }

    points.dragging = []
    View.sinumerikView.contourEditMainWindow.canvas.removeEventListener('mousemove', dragPointHandler)
    View.sinumerikView.contourEditMainWindow.canvas.removeEventListener('mouseup', mouseUpHandler)
    View.sinumerikView.contourEditData.eventData.action.reset()
    draw()
}

export const scrollCanvas = (event, deltaY) => {
    const delta = event !== null ? event.deltaY : deltaY

    if (delta) {
        if (event === null) {
            event = {
                offsetX: (View.sinumerikView.contourEditData.canvasFrame.trans[0]),
                offsetY: (View.sinumerikView.contourEditData.canvasFrame.trans[1])
            }
        }

        const distanceX = (View.sinumerikView.contourEditData.canvasFrame.trans[0] - event.offsetX)
        const distanceY = (View.sinumerikView.contourEditData.canvasFrame.trans[1] - event.offsetY)

        const scale = View.sinumerikView.contourEditData.canvasFrame.scale

        View.sinumerikView.contourEditData.canvasFrame.scale += delta * -0.001 * View.sinumerikView.contourEditData.canvasFrame.scale
        if (View.sinumerikView.contourEditData.canvasFrame.scale > 1e5) {
            View.sinumerikView.contourEditData.canvasFrame.scale = 1.e5
            console.log('max scale: 1e5')
        }
        if (View.sinumerikView.contourEditData.canvasFrame.scale < 1e-2) {
            View.sinumerikView.contourEditData.canvasFrame.scale = 1e-2
            console.log('min scale: 1e-2')
        }

        View.sinumerikView.contourEditData.canvasFrame.trans[0] -= (distanceX * ((scale - View.sinumerikView.contourEditData.canvasFrame.scale) / scale))
        View.sinumerikView.contourEditData.canvasFrame.trans[1] -= (distanceY * ((scale - View.sinumerikView.contourEditData.canvasFrame.scale) / scale))

    }
    draw()
}

export const moveCanvas = (event, offsetObj) => {
    if (View.sinumerikView.contourEditData.points.dragging.length) return
    let offset = {
        X: 0,
        Y: 0
    }

    if (event !== null) {
        offset.X = (event.offsetX - View.sinumerikView.contourEditData.eventData.mouseDown.X)
        offset.Y = (event.offsetY - View.sinumerikView.contourEditData.eventData.mouseDown.Y)
    } else {
        offset.X = offsetObj.X
        offset.Y = offsetObj.Y
    }

    View.sinumerikView.contourEditData.canvasFrame.trans[0] += offset.X
    View.sinumerikView.contourEditData.canvasFrame.trans[1] += offset.Y

    if (event !== null) {
        View.sinumerikView.contourEditData.eventData.mouseDown.X = event.offsetX
        View.sinumerikView.contourEditData.eventData.mouseDown.Y = event.offsetY
    }

    draw()
}

export const createArc = () => {
    const cursorPosition = View.sinumerikView.contourEditData.cursorPosition
    if (!Object.keys(cursorPosition).length) return
    const creatingElement = View.sinumerikView.contourEditData.eventData.creatingElement

    if (creatingElement.type === undefined) {
        creatingElement.type = 'arc'
        creatingElementPoint(creatingElement, 'start', cursorPosition)
        return
    }

    if (creatingElement.middle === undefined) {
        creatingElement.middle = JSON.parse(JSON.stringify(cursorPosition))
        return
    }

    if (creatingElement.start && creatingElement.middle) {
        creatingElementPoint(creatingElement, 'end', cursorPosition)
        // creatingElement.middle = {}
    }

}

export const createLine = () => {
    const cursorPosition = View.sinumerikView.contourEditData.cursorPosition
    if (!Object.keys(cursorPosition).length) return
    const creatingElement = View.sinumerikView.contourEditData.eventData.creatingElement
    if (creatingElement.type === undefined) {
        creatingElement.type = 'line'
        creatingElementPoint(creatingElement, 'start', cursorPosition)
        creatingElement.angBlocked = false
        return
    }

    if (creatingElement.start) {
        creatingElementPoint(creatingElement, 'end', cursorPosition)

    }
}
export const creatingElementPoint = (creatingElement, pointType, cursorPosition) => {
    if (pointType === 'start') {
        creatingElement.start =
            View.sinumerikView.contourEditData.points.inFocus.length ?
                View.sinumerikView.contourEditData.points.inFocus[0].coords :
                JSON.parse(JSON.stringify(cursorPosition))
    }

    if (pointType === 'end') {
        creatingElement.end =
            View.sinumerikView.contourEditData.points.inFocus.length ?
                View.sinumerikView.contourEditData.points.inFocus[0].coords :
                JSON.parse(JSON.stringify(cursorPosition))

        setAng(creatingElement)

        View.sinumerikView.contourEditData.editContour.push(creatingElement)
        const lastElement = JSON.parse(JSON.stringify(creatingElement))
        View.sinumerikView.contourEditData.eventData.creatingElement = newCreatingElement()
        View.sinumerikView.contourEditData.eventData.creatingElement.type = lastElement.type
        View.sinumerikView.contourEditData.eventData.creatingElement.start = lastElement.end
        if (lastElement.type === 'arc') {
            View.sinumerikView.contourEditData.eventData.creatingElement.middle = undefined
        }

        View.sinumerikView.contourEditData.eventData.action.confines = []
        if (View.sinumerikView.contourEditData.points.inFocus.length) {
            View.sinumerikView.contourEditData.eventData.action.reset()
            Array.from(View.sinumerikView.contourEditRightContainer.tools.contourTools.querySelectorAll('button'))
                .filter(btn => btn.innerText === creatingElement.type)[0].click()
        }
        updateIntersections()
    }
}


export const setAng = (el) => {
    if (el.type === 'line') {
        const {x, y} = getFrame()
        el.ang = (Math.atan2((el.end[y] - el.start[y]), (el.end[x] - el.start[x])) / Math.PI * 180).toFixed(4)
    }
}

export const draw = (event) => {
    if (event) {
        View.sinumerikView.contourEditData.eventData.lastCanvasMouseMoveEvent = event
    }
    if (!event && View.sinumerikView.contourEditData.eventData.lastCanvasMouseMoveEvent !== null) {
        event = View.sinumerikView.contourEditData.eventData.lastCanvasMouseMoveEvent
    }

    View.sinumerikView.contourEditData.visibleActions = false

    const canvas = View.sinumerikView.contourEditMainWindow.canvas
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    drawWorkpiece(ctx, 'blank')
    drawWorkpiece(ctx, 'contour')
    changeCursor()

    if (View.sinumerikView.contourEditData.editContour.length) {
        const elements_Ol = View.sinumerikView.contourEditRightContainer.tools.contourTools.querySelector('.editContour_elementsOl')
        const elements = elements_Ol.querySelectorAll('.editContourElement')

        View.sinumerikView.contourEditData.editContour.forEach((el, idx) => {
            let weight = 'normal'
            if (elements[idx].classList.contains('editContourElement_highlight')) {
                weight = 'bold'
            }

            if (View.sinumerikView.contourEditFootContainer.querySelector('.contourEditElementProperties_id') &&
                View.sinumerikView.contourEditFootContainer.querySelector('.contourEditElementProperties_id').innerText === '' + (idx + 1)
            ) {
                weight = 'bold'
            }

            drawElement(ctx, el, color('temp'), weight)

            drawElement(ctx, {type: 'point', coords: el.start}, color('temp'), 'medium')
            drawElement(ctx, {type: 'point', coords: el.end}, color('temp'), 'medium')
        })
    }

    const element = View.sinumerikView.contourEditData.eventData.creatingElement

    if (element.type) {
        if (element.type === 'line') {
            drawElement(
                ctx,
                {
                    ...element,
                    end: View.sinumerikView.contourEditData.cursorPosition
                },
                color('temp'))
        }
        if (element.type === 'arc') {
            drawElement(
                ctx,
                {
                    ...element,
                    type: element.middle ? 'arc' : 'line',
                    end: View.sinumerikView.contourEditData.cursorPosition
                },
                color('temp'))
        }
    }

    if (View.sinumerikView.contourEditData.points.inFocus.length) {
        drawElement(ctx, View.sinumerikView.contourEditData.points.inFocus[0], color('focus'), 'bold')
    }

    if (View.sinumerikView.contourEditData.points.dragging.length) {
        drawElement(ctx, View.sinumerikView.contourEditData.points.dragging[0], color('drag'), 'bold')
    }

    if (View.sinumerikView.contourEditData.points.intersection.length) {
        View.sinumerikView.contourEditData.points.intersection.forEach(point => {
            // if (!checkPointInElements(point)) {
            drawElement(ctx, point, color('intersection'), 'normal')
            // }
        })
    }

    if (event && event.type === 'mousemove') {
        if (View.sinumerikView.contourEditData.eventData.action.type !== null) {
            drawCursorPosition(ctx, event)
            drawElementSymbol(View.sinumerikView.contourEditData.eventData.action.name, ctx, event)
        }
    }
    //
    // if (View.sinumerikView.contourEditData.points.rounded.length) {
    //     View.sinumerikView.contourEditData.points.rounded.forEach(p => {
    //         drawElement(ctx, {...p, type: 'point'}, 'green', 'normal')
    //     })
    // }

    // if (View.sinumerikView.contourEditData.points.burned.length) {
    //     View.sinumerikView.contourEditData.points.burned.forEach(p => {
    //         drawElement(ctx, {...p, type: 'point'}, 'orange')
    //     })
    // }

    if (View.sinumerikView.contourEditData.processingData.startPoint) {
        drawElement(ctx, {type: 'point', coords: View.sinumerikView.contourEditData.processingData.startPoint}, 'orange', 'normal')
    }


    if (View.sinumerikView.contourEditData.burnedContour.length) {
        View.sinumerikView.contourEditData.visibleActions = true
        const {x, y} = getFrame()
        const contour = View.sinumerikView.contourEditData.burnedContour

        ctx.fillStyle = 'rgba(66,245,176,0.33)'
        ctx.beginPath()

        ctxMove(ctx, [contour[0].start[x], contour[0].start[y]])

        contour.forEach(el => {
            if (el.type === 'line') {
                ctxLine(ctx, [el.end[x], el.end[y]])
            } else {
                ctxArc(ctx, el.center, el.radius, el.startAng, el.endAng, el.ccw)
            }
        })
        ctx.fill()
    }

}

const drawElementSymbol = (symbol, ctx, event) => {

    ctx.strokeStyle = color('temp')
    ctx.beginPath()

    if (symbol === 'line') {
        ctx.moveTo(event.offsetX + 20, event.offsetY + 20)
        ctx.lineTo(event.offsetX + 35, event.offsetY + 10)
    }

    if (symbol === 'arc') {
        ctx.arc(event.offsetX + 20, event.offsetY + 8, 12, -10 / 180 * Math.PI, 130 / 180 * Math.PI)
    }

    ctx.stroke()

}


export const drawElement = (ctx, element, color, weight) => {

    if (element.type === 'line') {
        drawLine(ctx, {
            start: element.start,
            end: element.end,
            color,
            weight
        })
    }

    if (element.type === 'arc') {
        // console.log(element)
        drawArc(ctx, {
            start: element.start,
            middle: element.middle,
            end: element.end,
            color,
            weight
        }, element)

        drawMiddlePoint(ctx, {
            coords: element.middle,
            color: 'olive'
        }, 'medium')
    }

    if (element.type === 'point') {
        if (element.subType === 'middle') {
            drawMiddlePoint(ctx, {
                ...element,
                color
            }, weight)
            return
        }

        drawPoint(ctx, {
            ...element,
            color
        }, weight)
    }


}

const color = (type) => {
    if (type === 'temp') {
        return 'blue'
    }

    if (type === 'focus') {
        return 'darkblue'
    }

    if (type === 'drag') {
        return 'DodgerBlue'
    }

    if (type === 'middlePoint') {
        return 'olive'
    }

    if (type === 'intersection') 'red'

    return 'red'
}

const drawMiddlePoint = (ctx, point, weight) => {
    const {x, y, x_scale} = getFrame()
    if (!isNumber(point.coords[x], point.coords[y])) {
        return
    }

    const width = 6
    ctx.beginPath()
    ctx.lineWidth = weightPx(weight)
    ctx.strokeStyle = point.color
    ctxMove(ctx, [point.coords[x] - width / x_scale, point.coords[y]])
    ctxLine(ctx, [point.coords[x] + width / x_scale, point.coords[y]])
    ctxMove(ctx, [point.coords[x], point.coords[y] + width / x_scale])
    ctxLine(ctx, [point.coords[x], point.coords[y] - width / x_scale])
    ctx.stroke()
}

const drawPoint = (ctx, point, weight) => {
    const {x, y, x_scale, x_trans, y_scale, y_trans} = getFrame()
    if (!isNumber(point.coords[x], point.coords[y])) {
        return
    }

    const radius = weightPx(weight) * 1.6

    ctx.beginPath()
    ctx.fillStyle = point.color
    ctxMove(ctx, [point.coords[x] + radius / x_scale, point.coords[y]])
    ctx.arc(
        point.coords[x] * x_scale + x_trans,
        point.coords[y] * y_scale + y_trans,
        radius,
        0,
        2 * Math.PI,
    )
    ctx.fill()
}

const weightPx = (value) => {
    if (!value) return 1
    if (value === 'bold') return 3
    if (value === 'medium') return 2
    if (value === 'normal') return 2
    return 1
}

const drawArc = (ctx, arc, element) => {

    updateArcProperties(element)

    //Если дуга стала прямой
    if (!element.center) {
        console.log('Arc => line')
        drawLine(ctx, {
            start: element.start,
            end: element.end,
            color,
            weight: arc.weight
        })
        return
    }
    ctx.strokeStyle = arc.color
    if (arc.weight) {
        ctx.lineWidth = weightPx(arc.weight)
    }
    ctx.beginPath()

    const {plane} = getFrame()
    let startAng = element.startAng
    let endAng = element.endAng
    let ccw = element.ccw
    if (plane.ordinate.reverse) {
        startAng = -1 * startAng
        endAng = -1 * endAng
        ccw = !ccw
    }
    if (plane.abscissa.reverse) {
        startAng = Math.PI - startAng
        endAng = Math.PI - endAng
        ccw = !ccw
    }

    ctxArc(ctx, element.center, element.radius, startAng, endAng, ccw)

    ctx.stroke()

}

export const updateArcProperties = (element) => {
    const {x, y} = getFrame()
    if (!isNumber(element.start[x], element.end[x], element.middle[x],
        element.middle[y], element.start[y], element.end[y])
    ) {
        return
    }

    const center = {}
    const x1 = element.start[x]
    const x2 = element.middle[x]
    const x3 = element.end[x]
    const y1 = element.start[y]
    const y2 = element.middle[y]
    const y3 = element.end[y]

    const a = x2 - x1
    const b = y2 - y1
    const c = x3 - x1
    const d = y3 - y1
    const e = a * (x1 + x2) + b * (y1 + y2)
    const f = c * (x1 + x3) + d * (y1 + y3)
    const g = 2 * (a * (y3 - y2) - b * (x3 - x2))
    if (g === 0) return
    center[x] = (d * e - b * f) / g;
    center[y] = (a * f - c * e) / g;

    element.startAng = Math.atan2(element.start[y] - center[y], element.start[x] - center[x])
    element.endAng = Math.atan2(element.end[y] - center[y], element.end[x] - center[x])
    element.radius = Math.sqrt((element.start[y] - center[y]) ** 2 + (element.start[x] - center[x]) ** 2)

    let startToMiddleAngle = Math.atan2(element.middle[y] - element.start[y], element.middle[x] - element.start[x])
    let middleToEndAngle = Math.atan2(element.end[y] - element.middle[y], element.end[x] - element.middle[x])

    let ccw = (middleToEndAngle - startToMiddleAngle) > 0
    if (Math.min(Math.abs(startToMiddleAngle - middleToEndAngle), Math.abs(middleToEndAngle - startToMiddleAngle)) > Math.PI) {
        ccw = !ccw
    }

    element.center = {
        [x]: center[x],
        [y]: center[y]
    }

    element.ccw = ccw
}


const drawLine = (ctx, line) => {
    const {x, y} = getFrame()
    if (!isNumber(line.start[x], line.end[x], line.start[y], line.end[y])) {
        return
    }

    ctx.strokeStyle = line.color
    if (line.weight) {
        ctx.lineWidth = weightPx(line.weight)
    }
    ctx.beginPath()
    ctxMove(ctx, [line.start[x], line.start[y]])
    ctxLine(ctx, [line.end[x], line.end[y]])
    ctx.stroke()
}

export const isNumber = (...args) => {
    return !args.filter(value => {
        return (value.isNaN || typeof value !== 'number')
    }).length > 0
}


export const drawWorkpiece = (ctx, type) => {
    if (!View.sinumerikView.contourEditData[type] || View.sinumerikView.contourEditData[type].length < 3) return

    const workpiece = View.sinumerikView.contourEditData[type]

    const {x, y} = getFrame()

    ctx.fillStyle = type === 'blank' ? 'lightgray' : 'darkgray';
    ctx.beginPath()
    ctxMove(ctx, [workpiece[0].start[x], workpiece[0].start[y]])
    workpiece.forEach(line => {
            ctxLine(ctx, [line.end[x], line.end[y]])
        }
    )
    ctx.fill();
}

export const getFrame = () => {
    const plane = View.sinumerikView.contourEditData.plane
    const x = plane.abscissa.name
    const x_scale = (plane.abscissa.reverse ? -1 : 1) * View.sinumerikView.contourEditData.canvasFrame.scale
    const x_trans = View.sinumerikView.contourEditData.canvasFrame.trans[0]

    const y = plane.ordinate.name
    const y_scale = (plane.ordinate.reverse ? 1 : -1) * View.sinumerikView.contourEditData.canvasFrame.scale
    const y_trans = View.sinumerikView.contourEditData.canvasFrame.trans[1]

    let diamonAx = null
    try {
        const Editor = atom.workspace.getActiveTextEditor()
        const fileName = Editor.getTitle().replace(/\./g, '_').toUpperCase()
        if (View.sinumerikView.programmData[fileName].machine.machineType === 'Lathe') {
            if (x === 'X') {
                diamonAx = x
            }
            if (y === 'X') {
                diamonAx = y
            }
        }
    } catch (e) {
        console.log('Error loading machine type')
    }

    return {plane, x, x_scale, x_trans, y, y_scale, y_trans, diamonAx}
}

export const setCursorPosition = (event) => {
    if (Date.now() < View.sinumerikView.contourEditData.cursorPositionTimestamp + 10) return
    View.sinumerikView.contourEditData.cursorPositionTimestamp = Date.now()
    const cursorPosition = View.sinumerikView.contourEditData.cursorPosition
    const {plane, x, y} = getFrame()
    const frame = View.sinumerikView.contourEditData.canvasFrame

    const round = (number) => {
        const precision = View.sinumerikView.contourEditData.precision
        // console.log(Math.log10(precision))
        return (Math.round(number / precision) * precision).toFixed((precision >= 1 ? 0 : -1 * Math.log10(precision)))
    }

    cursorPosition[x] = round(((event.offsetX - frame.trans[0]) / frame.scale) *
        (plane.abscissa.reverse ? -1 : 1))
    cursorPosition[y] = round(((frame.trans[1] - event.offsetY) / frame.scale) *
        (plane.ordinate.reverse ? -1 : 1))

    if (View.sinumerikView.contourEditData.eventData.action.type === 'create' &&
        View.sinumerikView.contourEditData.eventData.action.confines.length) {
        handleConfines(cursorPosition, x, y)
    }

}

const drawCursorPosition = (ctx, event) => {
    const cursorPosition = View.sinumerikView.contourEditData.cursorPosition
    const {x, y, diamonAx} = getFrame()

    ctx.strokeStyle = 'black'
    ctx.font = "14px lighter"
    ctx.lineWidth = 1

    ctx.strokeText(`${x}: ${(x === diamonAx) ? 'Ø' : ''} ${cursorPosition[x] * ((x === diamonAx) ? 2 : 1)}`, event.offsetX + 10, event.offsetY - 30)
    ctx.strokeText(`${y}: ${(y === diamonAx) ? 'Ø' : ''} ${cursorPosition[y] * ((y === diamonAx) ? 2 : 1)}`, event.offsetX + 10, event.offsetY - 10)

    drawCursorConfines(event, ctx)
}

const drawCursorConfines = (event, ctx) => {
    let confinesText = ''
    View.sinumerikView.contourEditData.eventData.action.confines.forEach(confine => {
        confinesText = `${confinesText} ${confine[0]}`
    })
    ctx.strokeText(confinesText.toUpperCase(), event.offsetX + 10, event.offsetY + 30)
}

const handleConfines = (cursorPosition, x, y) => {
    if (View.sinumerikView.contourEditData.eventData.action.confines.includes('horizontal')) {
        cursorPosition[y] = View.sinumerikView.contourEditData.eventData.creatingElement.start[y]
    }
    if (View.sinumerikView.contourEditData.eventData.action.confines.includes('vertical')) {
        cursorPosition[x] = View.sinumerikView.contourEditData.eventData.creatingElement.start[x]
    }
}

export const changeCursor = () => {
    if (View.sinumerikView.contourEditData.eventData.action.type === 'create') {
        View.sinumerikView.contourEditMainWindow.canvas.style.cursor = 'crosshair'
    }
    if (View.sinumerikView.contourEditData.eventData.action.type === null) {
        if (View.sinumerikView.contourEditMainWindow.canvas.style.cursor === 'grabbing') return
        View.sinumerikView.contourEditMainWindow.canvas.style.cursor = 'default'
    }
}

const ctxMove = (ctx, point) => {
    const {x_scale, x_trans, y_scale, y_trans} = getFrame()
    ctx.moveTo(point[0] * x_scale + x_trans, point[1] * y_scale + y_trans)
}

const ctxLine = (ctx, point) => {
    const {x_scale, x_trans, y_scale, y_trans} = getFrame()
    ctx.lineTo(point[0] * x_scale + x_trans, point[1] * y_scale + y_trans)
}

const ctxArc = (ctx, center, radius, startAng, endAng, ccw) => {
    const {x, y, x_scale, x_trans, y_scale, y_trans} = getFrame()

    ctx.arc(
        center[x] * x_scale + x_trans,
        center[y] * y_scale + y_trans,
        Math.abs(radius * x_scale),
        -startAng,
        -endAng,
        ccw
    )

}
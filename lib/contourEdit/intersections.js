'use babel'

import View from '../sinumerik'
import {getFrame, isNumber, updateArcProperties} from "./canvas";
import {getDistance} from "./contourEditMain";

export const updateIntersections = () => {
    const contour = View.sinumerikView.contourEditData.editContour
    View.sinumerikView.contourEditData.points.intersection = []

    if (contour.length < 2) return


    contour
        .slice(0, -1)
        .forEach((el, idx) => {
            contour
                .slice(idx + 1)
                .forEach(el2 => {
                    const elTypesString = Array.from(new Set([el.type, el2.type].sort())).join('')
                    if (elTypesString === 'line') findLinesIntersection(el, el2)
                    if (elTypesString === 'arc') findArcsIntersection(el, el2)
                    if (elTypesString === 'arcline') findArcLineIntersection(el, el2)
                })
        })

}

const findLinesIntersection = (el1, el2) => {
    const eq1 = getEquationOfLine(el1)
    const eq2 = getEquationOfLine(el2)
    const {x} = getFrame()

    const xIntersection = -(eq1.c * eq2.b - eq2.c * eq1.b) / (eq1.a * eq2.b - eq2.a * eq1.b)
    const yIntersection = -(eq1.a * eq2.c - eq2.a * eq1.c) / (eq1.a * eq2.b - eq2.a * eq1.b)

    if (isNumber(xIntersection, yIntersection)) {
        if (xIntersection <= Math.max(el1.start[x], el1.end[x]) && xIntersection >= Math.min(el1.start[x], el1.end[x]) &&
            xIntersection <= Math.max(el2.start[x], el2.end[x]) && xIntersection >= Math.min(el2.start[x], el2.end[x])
        ) {
            addIntersectionPoint({xIntersection, yIntersection, el1, el2})
        }
    }
}

const findArcsIntersection = (el1, el2) => {
    const {x, y} = getFrame()
    const points = []
    if (!el1.radius) {
        updateArcProperties(el1)
    }
    if (!el2.radius) {
        updateArcProperties(el2)
    }

    const distance = Math.sqrt((el1.center[x] - el2.center[x]) ** 2 + (el1.center[y] - el2.center[y]) ** 2)
    if (distance > (el1.radius + el2.radius)) {
        return
    }

    const a = (el1.radius ** 2 - el2.radius ** 2 + distance ** 2) / (2 * distance)
    const h = Math.sqrt(el1.radius ** 2 - a ** 2)

    const x0 = el1.center[x] + a * (el2.center[x] - el1.center[x]) / distance
    const y0 = el1.center[y] + a * (el2.center[y] - el1.center[y]) / distance

    points.push({
        [x]: x0 + h * (el2.center[y] - el1.center[y]) / distance,
        [y]: y0 - h * (el2.center[x] - el1.center[x]) / distance
    })

    if (a !== el1.radius) {
        points.push({
            [x]: x0 - h * (el2.center[y] - el1.center[y]) / distance,
            [y]: y0 + h * (el2.center[x] - el1.center[x]) / distance
        })
    }

    points.forEach(p => {
        if (checkPointBelongsArc(el1, p) && checkPointBelongsArc(el2, p)) {
            addIntersectionPoint({xIntersection: p[x], yIntersection: p[y], el1, el2})
        }
    })

}

const findArcLineIntersection = (el1, el2) => {
    const line = [el1, el2].filter(el => el.type === 'line')[0]
    const arc = [el1, el2].filter(el => el.type === 'arc')[0]

    if (!arc.radius) {
        updateArcProperties(arc)
    }

    const {x, y} = getFrame()
    let intersectionPoints = []

    const lineEq = getEquationOfLine(line)
    const a = -lineEq.a / lineEq.b
    const b = -lineEq.c / lineEq.b
    const x0 = arc.center[x]
    const y0 = arc.center[y]
    const r0 = arc.radius
    const k = a ** 2 + 1
    const l = 2 * a * (b - y0) - 2 * x0
    const m = x0 ** 2 - r0 ** 2 + (b - y0) ** 2
    const D = l ** 2 - 4 * k * m
    if (D >= 0) {
        intersectionPoints.push(
            {
                [x]: (-l + Math.sqrt(D)) / (2 * k),
                [y]: a * (-l + Math.sqrt(D)) / (2 * k) + b
            },
            {
                [x]: (-l - Math.sqrt(D)) / (2 * k),
                [y]: a * (-l - Math.sqrt(D)) / (2 * k) + b
            }
        )
    }
    intersectionPoints = Array.from(new Set(intersectionPoints))

    if (intersectionPoints.length) {
        intersectionPoints.forEach(p => {
            if (checkPointBelongsArc(arc, p) &&
                checkPointXBelongsLine(line, p)
            ) {
                addIntersectionPoint({xIntersection: p[x], yIntersection: p[y], el1, el2})
            }
        })
    }
}

export const checkPointXBelongsLine = (line, p) => {
    const {x, y} = getFrame()
    return ((p[x] <= Math.max(line.start[x], line.end[x]) && p[x] >= Math.min(line.start[x], line.end[x])) ||
        (getDistance(p, line.start) <= 5e-2 || getDistance(p, line.end) <= 5e-2))
}

export const checkPointBelongsArc = (arc, p) => {
    const {x, y} = getFrame()
    const startAng = round(arc.ccw ? arc.endAng : arc.startAng)
    const endAng = round(arc.ccw ? arc.startAng : arc.endAng)
    const pAng = round(Math.atan2((p[y] - arc.center[y]), (p[x] - arc.center[x])))

    if (getDistance(arc.end, p) < 1e-2 || getDistance(arc.start, p) < 1e-2) {
        return true
    }

    if ((startAng >= 0 && endAng >= 0) || (startAng <=0 && endAng <= 0)) {
        if (startAng < endAng) {
            return (pAng >= endAng || pAng <= startAng)
        }
        return (pAng >= endAng && pAng <= startAng)
    }

    if (startAng >=0 && endAng <= 0) {
        return (pAng <= startAng && pAng >= endAng)
    }

    if (startAng <=0 && endAng >=0) {
        return (pAng <= startAng || pAng >= endAng)
    }

    return false
}

export const round = (value, fractionDigits) => {
    if (fractionDigits === undefined) {
        fractionDigits = 5
    }
    return Math.round(value * Math.pow(10,fractionDigits)) / Math.pow(10,fractionDigits )
}

const addIntersectionPoint = ({xIntersection, yIntersection, el1, el2}) => {
    const intersectionPoints = View.sinumerikView.contourEditData.points.intersection

    const {x, y} = getFrame()
    intersectionPoints.push({
        type: 'point',
        subType: 'intersection',
        parentElementsIds: [el1.id, el2.id],
        coords: {
            [`${x}`]: xIntersection,
            [`${y}`]: yIntersection
        }
    })
}

export const getEquationOfLine = (el) => {
    const {x, y} = getFrame()

    if (el.start[x] === el.end[x]) {
        return {a: 1, b: 0, c: -el.start[x]}
    }

    if (el.start[y] === el.end[y]) {
        return {a: 0, b: 1, c: -el.start[y]}
    }

    let a, b, c
    a = (el.end[y] - el.start[y])
    b = -(el.end[x] - el.start[x])
    c = -el.start[x] * a - el.start[y] * b

    return {a, b, c}
}
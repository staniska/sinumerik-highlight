'use babel'

import View from '../sinumerik'
import {getFrame, isNumber, updateArcProperties} from "./canvas";
import {getDistance} from "./contourEditMain";

const ACCURACY = 1e-5

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
                    const intersections = findIntersection(el, el2)
                    if (intersections.length > 0) {
                        intersections.forEach(p => {
                            addIntersectionPoint(p)
                        })
                    }
                })
        })

}

export const findIntersection = (el1, el2) => {
    const elTypesString = Array.from(new Set([el1.type, el2.type].sort())).join('')
    let intersections = []
    if (elTypesString === 'line') intersections = findLinesIntersection(el1, el2)
    if (elTypesString === 'arc') intersections = findArcsIntersection(el1, el2)
    if (elTypesString === 'arcline') intersections = findArcLineIntersection(el1, el2)
    return intersections
}

const findLinesIntersection = (el1, el2) => {
    const intersections = []
    const eq1 = getEquationOfLine(el1)
    const eq2 = getEquationOfLine(el2)
    const {x, y} = getFrame()

    if (eq1.b === 0 || eq2.b === 0) {
        if (eq1.b === 0 && eq2.b === 0) {
            if (el1.start[x] === el2.start[x]) {
                const intersections = []
                if (checkPointBelongsLine(el2, el1.start)) intersections.push(el1.start)
                if (checkPointBelongsLine(el2, el1.end)) intersections.push(el1.end)
                if (checkPointBelongsLine(el1, el2.start)) intersections.push(el2.start)
                if (checkPointBelongsLine(el1, el2.end)) intersections.push(el2.end)
                return intersections.map(p => {
                    return {
                        xIntersection: p[x],
                        yIntersection: p[y],
                        el1: el1,
                        el2: el2
                    }
                })
            }
        }
        let v_line
        let line
        if (eq1.b === 0) {
            v_line = el1
            line = el2
        } else {
            v_line = el2
            line = el1
        }
        if (v_line.start[x] >= Math.min(line.start[x], line.end[x]) && v_line.start[x] <= Math.max(line.start[x], line.end[x])) {
            const yValue = line.start[y] + (line.end[y] - line.start[y]) * ((v_line.start[x] - line.start[x]) / (line.end[x] - line.start[x]))
            if (yValue >= Math.min(v_line.start[y], v_line.end[y]) && yValue <= Math.max(v_line.start[y], v_line.end[y])) {
                return [{xIntersection: v_line.start[x], yIntersection: yValue, el1: line, el2: v_line}]
            }
        }
    }

    const xIntersection = -(eq1.c * eq2.b - eq2.c * eq1.b) / (eq1.a * eq2.b - eq2.a * eq1.b)
    const yIntersection = -(eq1.a * eq2.c - eq2.a * eq1.c) / (eq1.a * eq2.b - eq2.a * eq1.b)

    if (isNumber(xIntersection, yIntersection)) {
        const p = {[x]: xIntersection, [y]: yIntersection}
        if (((
                xIntersection <= Math.max(el1.start[x], el1.end[x]) + ACCURACY && xIntersection >= Math.min(el1.start[x], el1.end[x]) - ACCURACY &&
                xIntersection <= Math.max(el2.start[x], el2.end[x]) + ACCURACY && xIntersection >= Math.min(el2.start[x], el2.end[x]) - ACCURACY
            ) &&
            (
                yIntersection <= Math.max(el1.start[y], el1.end[y]) + ACCURACY && yIntersection >= Math.min(el1.start[y], el1.end[y]) - ACCURACY &&
                yIntersection <= Math.max(el2.start[y], el2.end[y]) + ACCURACY && yIntersection >= Math.min(el2.start[y], el2.end[y]) - ACCURACY
            )) ||
            (
                Math.min(getDistance(el1.start, p), getDistance(el1.end,p)) < 1e-2 &&
                Math.min(getDistance(el2.start, p), getDistance(el2.end,p)) < 1e-2
            )
        ) {
            intersections.push({xIntersection, yIntersection, el1, el2})
        }
    }
    return intersections
}

const findArcsIntersection = (el1, el2) => {
    const intersections = []
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
        return intersections
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
            intersections.push({xIntersection: p[x], yIntersection: p[y], el1, el2})
        }
    })
    return intersections
}

const findArcLineIntersection = (el1, el2) => {
    const intersections = []
    const line = [el1, el2].filter(el => el.type === 'line')[0]
    const arc = [el1, el2].filter(el => el.type === 'arc')[0]

    if (!arc.radius) {
        console.log(arc.middle)
        updateArcProperties(arc)
    }

    const {x, y} = getFrame()
    let intersectionPoints = []

    const lineEq = getEquationOfLine(line)
    if (lineEq.b === 0) {
        return findArcVerticalLineIntersection(line, arc)
    }

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
                checkPointBelongsLine(line, p)
            ) {
                intersections.push({xIntersection: p[x], yIntersection: p[y], el1, el2})
            }
        })
    }
    return intersections
}

const findArcVerticalLineIntersection = (line, arc) => {
    const intersections = []
    const {x, y} = getFrame()
    if (Math.abs(line.start[x] - arc.center[x]) > arc.radius) return intersections
    try {
        if (Math.abs(Math.abs(line.start[x] - arc.center[x]) - arc.radius) < 1e-2) {
            intersections.push({xIntersection: line.start[x], yIntersection: arc.center[y], el1: line, el2: arc})
        } else {
            intersections.push({
                xIntersection: line.start[x],
                yIntersection: arc.center[y] + Math.sqrt(arc.radius ** 2 - (arc.center[x] - line.start[x]) ** 2),
                el1: line,
                el2: arc
            })
            intersections.push({
                xIntersection: line.start[x],
                yIntersection: arc.center[y] - Math.sqrt(arc.radius ** 2 - (arc.center[x] - line.start[x]) ** 2),
                el1: line,
                el2: arc
            })
        }
    } catch (e) {
        console.log(e)
    }

    return intersections.filter(p => {
        return (
            checkPointBelongsArc(arc, {[x]: p.xIntersection, [y]: p.yIntersection}) &&
            checkPointBelongsLine(line, {[x]: p.xIntersection, [y]: p.yIntersection})
        )
    })
}

export const checkPointBelongsLine = (line, p) => {
    const {x, y} = getFrame()
    return (
        (
            p[x] <= Math.max(line.start[x], line.end[x]) &&
            p[x] >= Math.min(line.start[x], line.end[x]) &&
            p[y] <= Math.max(line.start[y], line.end[y]) &&
            p[y] >= Math.min(line.start[y], line.end[y])
        ) ||
        (getDistance(p, line.start) <= 1e-1 || getDistance(p, line.end) <= 1e-1))
}

export const checkPointBelongsArc = (arc, p) => {
    if (arc.middle) updateArcProperties(arc)

    const {x, y} = getFrame()
    let ccw = arc.ccw

    const startAng = round(ccw ? arc.endAng : arc.startAng)
    const endAng = round(ccw ? arc.startAng : arc.endAng)

    const pAng = round(Math.atan2((p[y] - arc.center[y]), (p[x] - arc.center[x])))

    if (getDistance(arc.end, p) < 1e-2 || getDistance(arc.start, p) < 1e-2) {
        return true
    }

    if ((startAng >= 0 && endAng >= 0) || (startAng <= 0 && endAng <= 0)) {
        if (startAng < endAng) {
            return (pAng >= endAng || pAng <= startAng)
        }
        return ((pAng >= endAng) && (pAng <= startAng))
    }

    if (startAng >= 0 && endAng <= 0) {
        return (pAng <= startAng && pAng >= endAng)
    }

    if (startAng <= 0 && endAng >= 0) {
        return (pAng <= startAng || pAng >= endAng)
    }

    return false
}

export const round = (value, fractionDigits) => {
    if (fractionDigits === undefined) {
        fractionDigits = 5
    }
    return Math.round(value * Math.pow(10, fractionDigits)) / Math.pow(10, fractionDigits)
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
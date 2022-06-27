'use babel'

import View from '../sinumerik'
import {getFrame, isNumber} from "./canvas";

export const updateCrossPoints = () => {
    const contour = View.sinumerikView.contourEditData.editContour
    if (contour.length < 2) return

    contour
        .slice(0, -1)
        .forEach((el, idx) => {
            contour
                .slice(idx + 1)
                .forEach(el2 => {
                    const elTypesString = Array.from(new Set([el.type, el2.type].sort())).join('')
                    if (elTypesString === 'line') findLinesCross(el, el2)
                    if (elTypesString === 'arc') findArcsCross(el, el2)
                    if (elTypesString === 'arcline') findArcLineCross(el, el2)
                })
        })

}

const findLinesCross = (el1, el2) => {
    const eq1 = getEquationOfLine(el1)
    const eq2 = getEquationOfLine(el2)
    const {x, y} = getFrame()

    const xCross = -(eq1.c * eq2.b - eq2.c * eq1.b) / (eq1.a * eq2.b - eq2.a * eq1.b)
    const yCross = -(eq1.a * eq2.c - eq2.a * eq1.c) / (eq1.a * eq2.b - eq2.a * eq1.b)

    if (isNumber(xCross, yCross)) {
        if (xCross <= Math.max(el1.start[x], el1.end[x]) && xCross >= Math.min(el1.start[x], el1.end[x]) &&
            xCross <= Math.max(el2.start[x], el2.end[x]) && xCross >= Math.min(el2.start[x], el2.end[x])
        ) {
            console.log({xCross, yCross})
        }
    }
}

const findArcsCross = (el1, el2) => {
    console.log('checkArcsCross')
}

const findArcLineCross = (el1, el2) => {
    console.log('checkLineArcCross')
}

const getEquationOfLine = (el) => {
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
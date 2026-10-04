'use babel'

import View from '../../sinumerik'
import {confirmDialog} from "../../dialog/confirm";
import {draw, getFrame} from "../canvas";
import {create_element} from "../../createElement";
import {checkPointBelongsArc, findIntersection, getEquationOfLine} from "../intersections";
import {getDistance} from "../contourEditMain";

const DETECTION_LINES_NUM = 1000
const DEAD_CENTERS = {
    top: [0, 1],
    bottom: [0, -1],
    right: [1, 0],
    left: [-1, 0]
}
const PRECISION = 3e-3
// Bisection tolerance for the ax2 (pass-stepping) coordinate of an
// element-change point. Thresholds are emitted with toFixed(3), so this sits
// three orders below the printed resolution and costs ~16 bisection steps from
// the detection pitch. Do not tighten it much further: across a step the
// candidate filter in clarifyElementsChangePoint compares 2D distances that
// differ only in the ax2 interval while being dominated by the jump along `ax`
// (85 mm on the JOPA step), so below ~1e-7 those comparisons lose resolution
// and the change point would be dropped instead of refined.
const CHANGE_POINT_PRECISION = 1e-6
// Two tiers for the generated-cycle self-check: every probe deviating by more
// than PRECISION is collected and logged, but the user is only asked about the
// cycle when the worst deviation reaches this much, or is not a number at all.
// The errors worth stopping for are zone-wide and measure millimetres (the
// step-anchor bug was 16 and 85 mm); below this the likely source is noise in
// the detected profile, and a question about microns would only train the user
// to click through it.
const SELF_CHECK_ALERT_DEVIATION = 0.1

export const createTurning = () => {
    const {x, y, plane} = getFrame()
    const processingData = View.sinumerikView.contourEditData.processingData
    let closedContourTurning = false
    const verticalLathe = `${getFrame().plane.abscissa.name}${getFrame().plane.ordinate.name}` === 'XZ'
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
    View.sinumerikView.modalWindow.header = create_element(['contourEdit_modalWindowHeader'], View.sinumerikView.modalWindow, 'div', 'Select machining direction')
    const burnedContourRange = getContourRange(View.sinumerikView.contourEditData.burnedContour)
    const {top, right, bottom, left} = burnedContourRange
    View.sinumerikView.modalWindow.directions = create_element(['contourEdit_modalWindowDirections'], View.sinumerikView.modalWindow)
    const create_btn = (id, direction) => {
        const btn = create_element(['contourEdit_modalWindow_Button', 'contourEdit_modalWindow_Direction'], View.sinumerikView.modalWindow.directions, 'button')
        if (verticalLathe) {
            id = ['vertical', 'horizontal'].filter(d => d !== id)[0]
        }
        btn.id = id.toString()
        btn.value = direction.toString()
        const {plane} = getFrame()
        let arrowDirection = direction
        if (id === 'horizontal') {
            if (plane.abscissa.reverse) arrowDirection = -1 * arrowDirection
            btn.classList.add(arrowDirection === 1 ? 'icon-arrow-right' : 'icon-arrow-left')
        }
        if (id === 'vertical') {
            if (plane.ordinate.reverse) arrowDirection = -1 * arrowDirection
            btn.classList.add(arrowDirection === 1 ? 'icon-arrow-up' : 'icon-arrow-down')
        }
    }
    if (processingData.startPoint[x] > right) create_btn('horizontal', -1)
    if (processingData.startPoint[x] < left) create_btn('horizontal', 1)
    if (processingData.startPoint[y] > top) create_btn('vertical', -1)
    if (processingData.startPoint[y] < bottom) create_btn('vertical', 1)

    if (View.sinumerikView.modalWindow.directions.children.length < 2) {
        while (View.sinumerikView.modalWindow.directions.children.length) {
            View.sinumerikView.modalWindow.directions.removeChild(View.sinumerikView.modalWindow.directions.lastChild)
        }
        if (confirmDialog('Directions can\'t be determined for open corner turning. Create closed contour turing cycle?')) {
            closedContourTurning = true
            if (processingData.startPoint[x] > left && processingData.startPoint[x] < right) {

                create_btn('horizontal', -1)
                create_btn('horizontal', 1)
            }
            if (processingData.startPoint[y] > bottom && processingData.startPoint[y] < top) {
                create_btn('vertical', -1)
                create_btn('vertical', 1)
            }
        } else {
            return
        }
    }
    View.sinumerikView.modalWindow.cycleName = create_element(['contourEdit_modalWindow_cycleName'], View.sinumerikView.modalWindow)
    View.sinumerikView.modalWindow.cycleName.text = create_element(['contourEdit_modalWindow_cycleName_header'], View.sinumerikView.modalWindow.cycleName, 'div', 'cycleName:')
    View.sinumerikView.modalWindow.cycleName.input = create_element(['native-key-bindings'], View.sinumerikView.modalWindow.cycleName, 'input')
    View.sinumerikView.modalWindow.cycleName.input.value = 'JOPA'

    View.sinumerikView.modalWindow.directions.addEventListener('click', (event) => {
        if (event.target.tagName !== 'BUTTON') return
        processingData.direction = {
            axis: event.target.id,
            direction: event.target.value
        }
        View.sinumerikView.modalWindowPanel.destroy()
        const direction = View.sinumerikView.contourEditData.processingData.direction
        const contour = View.sinumerikView.contourEditData.burnedContour

        let ax = direction.axis === 'horizontal' ? x : y
        if ([x, y].sort().toString() === 'X,Z' && plane.abscissa.name === 'X' && plane.ordinate.name === 'Z') {
            ax = [x, y].filter(axis => axis !== ax)[0]
        }

        if (detectArcsDeadCentersNotEndPoint(ax).length) {
            if (confirmDialog(`Dead centers presents on the following arcs: ${detectArcsDeadCentersNotEndPoint(ax).map(id => id + 1).join(', ')}. Abort?`)) {
                return
            }
        }

        detectProcessingPoints(burnedContourRange, direction, ax, contour)
        const problems = []
        const programText = generateProgramText(direction, ax, burnedContourRange, contour, x, y, View.sinumerikView.modalWindow.cycleName.input.value, closedContourTurning, problems)

        // Self-check: the cycle is replayed against the detected profile before
        // it reaches the editor, so a cycle that does not follow the contour is
        // the user's decision rather than a silent insert.
        if (problems.length) {
            console.log('turning cycle self-check', problems)
            const worst = problems.reduce((a, b) => (Math.abs(b.delta) > Math.abs(a.delta) ? b : a))
            const alarming = !Number.isFinite(worst.delta) || Math.abs(worst.delta) > SELF_CHECK_ALERT_DEVIATION
            const deviation = Number.isFinite(worst.delta) ? `${worst.delta.toFixed(3)} mm` : 'an undefined value'
            if (alarming && confirmDialog(
                `Generated cycle does not follow the contour: ${problems.length} probe(s) deviate, ` +
                `up to ${deviation} on ${ax} on the ${worst.side} side, at ${ax2Name(x, y, ax)}=${worst.at.toFixed(3)}. Abort?`
            )) {
                return
            }
        }

        const Editor = atom.workspace.getActiveTextEditor()
        View.sinumerikView.contourEditData.inserter = Editor.onDidChangeCursorPosition(() => {
            View.sinumerikView.contourEditData.inserter.dispose()
            Editor.insertText(programText.join('\n'))

        })

    })

    View.sinumerikView.modalWindow.closeBtn = create_element(['contourEdit_modalWindow_Button', 'contourEdit_modalWindow_Close'], View.sinumerikView.modalWindow, 'button', 'Close')
    View.sinumerikView.modalWindowPanel = atom.workspace.addModalPanel({item: View.sinumerikView.modalWindow})
    View.sinumerikView.modalWindowPanel.show()
    View.sinumerikView.modalWindow.closeBtn.addEventListener('click', () => {
        View.sinumerikView.contourEditData.processingData.reset()
        View.sinumerikView.modalWindowPanel.destroy()
    })
}

const ax2Name = (x, y, ax) => [x, y].filter(axis => axis !== ax)[0]

const detectArcsDeadCentersNotEndPoint = (ax) => {
    const {x, y} = getFrame()
    const contour = View.sinumerikView.contourEditData.burnedContour
    const idsArcsWithDeadCenters = []
    const deadCentersFoxAxes = {
        [x]: ['bottom', 'top'],
        [y]: ['left', 'right']
    }
    contour
        .filter(el => el.type === 'arc')
        .forEach(el => {
            const deadCenters = checkDeadCenters(el)
            deadCentersFoxAxes[ax].forEach(direction => {
                if (deadCenters[direction] &&
                    (
                        getDistance(el.start, {
                            [x]: el.center[x] + DEAD_CENTERS[direction][0] * el.radius,
                            [y]: el.center[y] + DEAD_CENTERS[direction][1] * el.radius
                        }) > 1e-10 ||
                        getDistance(el.end, {
                            [x]: el.center[x] + DEAD_CENTERS[direction][0] * el.radius,
                            [y]: el.center[y] + DEAD_CENTERS[direction][1] * el.radius
                        }) > 1e-10
                    )
                ) {
                    idsArcsWithDeadCenters.push(el.id)
                }
            })
        })

    return idsArcsWithDeadCenters
}

export const detectProcessingPoints = (cRange, direction, ax, contour) => {
    const {x, y} = getFrame()

    const startPoints = []
    const endPoints = []
    for (let i = 0; i <= DETECTION_LINES_NUM; i++) {
        const pts = []

        const el2 = {
            type: 'line',
            start: {
                [x]: ax === x ? cRange.left : cRange.left + (cRange.right - cRange.left) * (i / DETECTION_LINES_NUM),
                [y]: ax === y ? cRange.bottom : cRange.bottom + (cRange.top - cRange.bottom) * (i / DETECTION_LINES_NUM)
            },
            end: {
                [x]: ax === x ? cRange.right : cRange.left + (cRange.right - cRange.left) * (i / DETECTION_LINES_NUM),
                [y]: ax === y ? cRange.top : cRange.bottom + (cRange.top - cRange.bottom) * (i / DETECTION_LINES_NUM)
            },
        }

        contour.forEach(el => {
            const intersections = findIntersection(el, el2)
            intersections.forEach(iP => {
                pts.push({
                    type: 'point',
                    coords: {
                        [x]: iP.xIntersection,
                        [y]: iP.yIntersection
                    },
                    parentId: el.id
                })
            })
        })

        pts.sort((a, b) => {
            return (a.coords[ax] - b.coords[ax]) * direction.direction
        })

        if (pts[0] !== undefined) {
            startPoints.push(pts[0])
        }
        if (pts[1] !== undefined) {
            if (getDistance(pts[0].coords, pts[1].coords) < PRECISION &&
                pts[2] !== undefined
            ) {
                let i = 1
                while (pts[i + 1] !== undefined && getDistance(pts[i].coords, pts[i + 1].coords) < PRECISION) {
                    i++
                }
                endPoints.push(pts[i + 1])
            } else {
                endPoints.push(pts[1])
            }
        }
    }

    // const startElementsIds = Array.from(new Set(startPoints.map(p => p.parentId)))
    // const endElementsIds = Array.from(new Set(endPoints.map(p => p.parentId)))

    View.sinumerikView.contourEditData.points.processingStart = startPoints
    View.sinumerikView.contourEditData.points.processingEnd = endPoints

    let startElementsChangePoints = []
    let endElementsChangePoints = []
    // startElementsChangePoints.push({...startPoints[0], parentPointId: 0});
    // endElementsChangePoints.push({...endPoints[0], parentPointId: 0});
    startElementsChangePoints.push(...findChangePoints(startPoints, direction, contour, ax, x, y, cRange))
    endElementsChangePoints.push(...findChangePoints(endPoints, direction, contour, ax, x, y, cRange))

    View.sinumerikView.contourEditData.points.processingChangeStart = startElementsChangePoints
    View.sinumerikView.contourEditData.points.processingChangeEnd = endElementsChangePoints

}

const findChangePoints = (points, direction, contour, ax, x, y, cRange) => {
    let changePoints = []
    points.forEach((p, idx) => {
        if (idx === points.length - 1 || idx === 0) {
            changePoints.push({...p, parentPointId: idx})
            return
        }

        if (p.parentId !== points[idx + 1].parentId) {
            const clarifiedP = clarifyElementsChangePoint(p, points[idx + 1], direction, contour, ax, [x, y].filter(axis => axis !== ax)[0], x, y, cRange)
            if (clarifiedP !== null) {
                changePoints.push({...clarifiedP, parentPointId: idx})
                if (clarifiedP.break) {
                    changePoints.push({...clarifiedP.secondP, parentPointId: idx})
                }
            } else {
                console.log('JOPISCHA!!!!')
            }
        }
    })

    while (changePoints.find((p, idx) => {
        return (idx !== changePoints.length - 1 && (getDistance(p.coords, changePoints[idx + 1]) < 2 * PRECISION))
    })) {
        changePoints = changePoints.map((p, idx) => {
            if (idx === 0 || idx === changePoints.length - 1) return p

            const prevP = changePoints[idx - 1]

            if (Math.abs(p.coords[x] - prevP.coords[x]) < 2 * PRECISION ||
                Math.abs(p.coords[y] - prevP.coords[y]) < 2 * PRECISION
            ) {
                return null
            }

            if (idx === changePoints.length - 2) {
                const nextP = changePoints[idx + 1]
                if (Math.abs(p.coords[x] - nextP.coords[x]) < 2 * PRECISION ||
                    Math.abs(p.coords[y] - nextP.coords[y]) < 2 * PRECISION
                ) {
                    return null
                }
            }
            return p
        }).filter(p => p !== null)
    }
    return changePoints
}

// Internal geometry is always mm; the generated cycle text must be in
// whatever unit system the program itself will run under (G70/G71), so
// every literal length written out is scaled by this multiplier. Angles
// are never scaled.
const getUnitMult = () => View.sinumerikView.contourEditData.units === 'inch' ? 1 / 25.4 : 1

export const generateProgramText = (direction, ax, cRange, contour, x, y, cycleName, closedContour, problems) => {
    const {diamonAx} = getFrame()
    const uMult = getUnitMult()
    const ax2 = [x, y].filter(axis => axis !== ax)[0]
    const startVarNum = 1
    const targetVarNum = 2
    const depthVarNum = 3
    const depthValue = 2
    const safetyVarNum = 4
    const averageDepthVarNum = 5
    // const startPoints = View.sinumerikView.contourEditData.points.processingStart

    const processing = View.sinumerikView.contourEditData.processingData
    const points = View.sinumerikView.contourEditData.points
    const contourName = View.sinumerikView.contourEditRightContainer.querySelector('.contourEditInput').value
    const programText = ['\n']
    programText.push(`;----  generated cycle ${contourName.length ? (' from contour ' + contourName) : ''} -----`)

    let values

    if (ax === y) {
        values = [cRange.left, cRange.right]
    } else {
        values = [cRange.bottom, cRange.top]
    }
    const reverse = processing.startPoint[ax2] > Math.max(...values)

    if (reverse) values = values.reverse()

    programText.push(`R${startVarNum}=${(values[0] * (diamonAx === ax2 ? 2 : 1) * uMult).toFixed(3)}   ; start`)
    programText.push(`R${targetVarNum}=${(values[1] * (diamonAx === ax2 ? 2 : 1) * uMult).toFixed(3)}   ; end`)
    programText.push(`R${depthVarNum}=${(depthValue * uMult).toFixed(3)}   ; depth`)
    programText.push(`R${safetyVarNum}=${(1 * uMult).toFixed(3)}   ;safety distance`)
    programText.push(`R${averageDepthVarNum}=ABS(R${startVarNum}-R${targetVarNum})/(TRUNC(ABS((R${startVarNum}-R${targetVarNum})${diamonAx === ax2 ? '/2' : ''})/(R${depthVarNum}*1.03))+1)-1/10000`)
    programText.push('')
    programText.push(`R${startVarNum}=R${startVarNum}${reverse ? '-' : '+'}R${averageDepthVarNum}`)
    programText.push('')
    programText.push(`${cycleName}:`)

    programText.push(`G0 ${x}=${(processing.startPoint[x] * uMult).toFixed(3)} ${y}=${(processing.startPoint[y] * (diamonAx === y ? 2 : 1) * uMult).toFixed(3)}`)

    //START points

    let PArr = JSON.parse(JSON.stringify(points.processingChangeStart))
    if (reverse) PArr = PArr.reverse()
    let insert_1 = closedContour ? `${direction.direction === 1 ? '-' : '+'}(R${averageDepthVarNum}+R${safetyVarNum}*2)` : ''
    let insert_2 = closedContour ? `${direction.direction === 1 ? '-' : '+'}R${averageDepthVarNum}+R${safetyVarNum}` : ''

    const startZones = collectZones(PArr, points.processingStart, ax, ax2, values)

    startZones.forEach(zone => {
        const conditional = zone.threshold !== null
        if (conditional) {
            programText.push(`IF R${startVarNum}${reverse ? '>' : '<'}${(zone.threshold * (diamonAx === ax2 ? 2 : 1) * uMult).toFixed(3)}`)
        }

        programText.push(`${conditional ? '  ' : ''}G0 ${ax2}=R${startVarNum}${insert_1} ` + getEquationByAx(
            zone.geometry,
            ax, ax2, startVarNum, closedContour, direction, averageDepthVarNum, safetyVarNum) + (closedContour ? '' : `${(direction.direction === '1') ? '-' : '+'}R${safetyVarNum}${diamonAx === ax ? '*2' : ''}`))
        if (closedContour) {
            programText.push(`  G1 ${ax2}=R${startVarNum}${insert_2}`)
            programText.push(`  G1 ${ax2}=R${startVarNum} ` + getEquationByAx(
                zone.geometry,
                ax, ax2, startVarNum))
            // + `${(direction.direction === '1') ? '-' : '+'}R${safetyVarNum}${diamonAx === ax ? '*2' : ''}`
        }

        if (conditional) {
            programText.push(`  GOTOF ${cycleName}_START`)
            programText.push(`ENDIF`)
        }
    })

    programText.push(`${cycleName}_START:`)

    //END points
    PArr = JSON.parse(JSON.stringify(points.processingChangeEnd))
    if (reverse) PArr = PArr.reverse()

    const endZones = collectZones(PArr, points.processingEnd, ax, ax2, values)

    endZones.forEach(zone => {
        const conditional = zone.threshold !== null
        if (conditional) {
            programText.push(`IF R${startVarNum}${reverse ? '>' : '<'}${(zone.threshold * (diamonAx === ax2 ? 2 : 1) * uMult).toFixed(3)}`)
        }

        programText.push(`${conditional ? '  ' : ''}G1 ` + getEquationByAx(
            zone.geometry,
            ax, ax2, startVarNum))

        if (conditional) {
            programText.push(`  GOTOF ${cycleName}_END`)
            programText.push(`ENDIF`)
        }
    })

    programText.push(`${cycleName}_END:`)

    programText.push(`R${startVarNum}=R${startVarNum}${reverse ? '-' : '+'}R${averageDepthVarNum}`)
    programText.push(`IF R${startVarNum}${reverse ? '<' : '>'}R${targetVarNum}`)
    programText.push(`  ;--- last cycle pass ---`)
    programText.push(`ENDIF`)

    programText.push(`G1 ${ax}=IC(${direction.direction === '1' ? '-' : ''}R${safetyVarNum}) ${ax2}=IC(${reverse ? '' : '-'}R${safetyVarNum})`)
    programText.push(`G0 ${x}=${(processing.startPoint[x] * uMult).toFixed(3)} ${y}=${(processing.startPoint[y] * (diamonAx === y ? 2 : 1) * uMult).toFixed(3)}`)

    programText.push(`IF R${startVarNum}${reverse ? '>=' : '<='}R${targetVarNum} GOTOB ${cycleName}`)
    // programText.push(`G0 ${ax2}=R${startVarNum}`)

    programText.push(`;---  end  ---`)

    if (problems !== undefined) {
        problems.push(
            ...validateZones(startZones, points.processingStart, 'approach', ax, ax2, reverse),
            ...validateZones(endZones, points.processingEnd, 'cut', ax, ax2, reverse),
        )
    }

    return filterProgramText(programText)
}

const filterProgramText = (programText) => {
    //TODO что-то сделать с тангенсом 90. Надо фильтровать весь член

    //replase -- => +
    programText = programText.map(line => (line.trim()[0] === ';' ? line : line.replace(/--/g, '+')))

    //filter horizontal lines (tan(0))
    programText = programText.map(line => {
        if (!line.match(/\*TAN\(0\.000\)/)) return line
        const match = line.match(/\(\w+[+-]\w+\.\w+\)\*TAN\(0\.000\)\*?2?/)
        return line.substring(0, match.index - 1) + line.substring(match.index + match[0].length)
    })

    //filter vertical lines (tan(90))
    programText = programText.map(line => {
        if (!line.match(/\/TAN\(-?90\.000\)/)) return line
        const match = line.match(/\(\w+[+-]\d+.\d+\)\/?2?\/TAN\(-?90\.000\)/)
        return line.substring(0, match.index - 1) + line.substring(match.index + match[0].length)
    })

    //filter .000
    programText = programText.map(line => line.replace(/\.000/g, ''))

    //filter recurring conditions
    const stringsForDelete = []
    const conditions = programText
        .map((line, idx) => {
            return {
                idx: idx,
                text: (line.match('IF ') ? line : ''),
                endIfIdx: (line.match('IF ') ? programText.findIndex((str, i) => (i > idx && str.match('ENDIF'))) : null)
            }
        })
        .filter(line => line.text.length)

    conditions.forEach((line, id) => {
        if (id === 0) return
        if (conditions[id - 1].text === line.text && programText[conditions[id - 1].endIfIdx - 1] === programText[line.endIfIdx - 1]) {
            const arrayForDelete = new Array(line.endIfIdx - line.idx + 1).fill(1).map((e, i) => line.idx + i)
            stringsForDelete.push(...arrayForDelete)
        }
    })

    programText = (programText.filter((str, idx) => !stringsForDelete.includes(idx)))

    return programText
}

const getElBetweenPoints = (pointsArr, allPointsArr, id1, id2) => {
    if (id2 === undefined) id2 = id1 + 1
    const contour = View.sinumerikView.contourEditData.burnedContour
    return contour.find(el => el.id === allPointsArr[
        Math.trunc((pointsArr[id1].parentPointId + pointsArr[id2].parentPointId) / 2)
        ].parentId)
}

// The geometry an emitted move encodes, in internal mm — the single place that
// decides it. getEquationByAx formats this into program text and
// evaluateGeometry computes its value, so the two can never drift apart: the
// self-check validates what the control will actually run, not a parallel
// re-derivation of what it was meant to run.
//
// `anchor` only has to LIE ON the element: the emitted expression is the
// element's equation evaluated at R<rNum>, so any point of it yields the same
// expression. The detected change point must NOT be used for it — across a step
// parallel to the cut axis the profile jumps, so that point carries the ax
// coordinate of one side of the jump only, and with a reversed pass order that
// is the side of the next, deeper zone. That is what made every approach branch
// come out one step too deep. The change point is used for the `IF` threshold
// only, where just its ax2 coordinate matters and both sides of a step agree.
// Element coordinates are exact too, while a detected intersection is not
// (hence the old `X=992.002` / `(R1-7.999)` noise).
export const equationGeometry = (el, ax, ax2) => {
    const {x, y} = getFrame()
    if (el === undefined || el === null) return null

    if (el.type === 'line') {
        const {a, b} = getEquationOfLine(el)
        return {
            type: 'line',
            anchor: el.start,
            angle: -Math.atan2(a / b, 1) / Math.PI * 180,
            // The emitter divides by TAN on this axis instead of multiplying,
            // and spells the arc factor COS(ASIN) instead of SIN(ACOS).
            inverted: ax === x,
        }
    }

    if (el.type === 'arc') {
        const range = getArcRange(el)
        let sign = 1
        if (ax === x && range.left < el.center[x]) sign = -1
        if (ax === y && range.bottom < el.center[y]) sign = -1
        return {
            type: 'arc',
            center: el.center,
            radius: el.radius,
            sign,
            inverted: ax === x,
        }
    }

    return null
}

const getEquationByAx = (geometry, ax, ax2, rNum, closedContour, direction, averageDepthVarNum, safetyVarNum) => {
    const {diamonAx} = getFrame()
    const uMult = getUnitMult()
    // Geometry that could not be resolved must never leave here as an
    // executable coordinate: `${ax}=0` would be a rapid to zero, which on a
    // lathe holding a 1 m part means the chuck. This spelling is a syntax error
    // the control refuses on load, and the self-check reports the zone as an
    // undefined value, so the user is asked before it ever gets that far.
    if (geometry === null || geometry === undefined) return `${ax}=?`

    if (geometry.type === 'line') {
        const coords = geometry.anchor
        let insert_1 = closedContour ? `${direction.direction === 1 ? '-' : '+'}(R${averageDepthVarNum}+R${safetyVarNum})` : ''

        return `${ax}=${(coords[ax] * (diamonAx === ax ? 2 : 1) * uMult).toFixed(3)}+(R${rNum}${insert_1}-${(coords[ax2] * (diamonAx === ax2 ? 2 : 1) * uMult).toFixed(3)})${diamonAx === ax2 ? '/2' : ''}${(geometry.inverted ? '/' : '*')}TAN(${geometry.angle.toFixed(3)})${diamonAx === ax ? '*2' : ''}`
    }

    if (geometry.type === 'arc') {
        const {center, radius} = geometry
        const sign = geometry.sign < 0 ? '-' : '+'

        return `${ax}=${(diamonAx === ax ? '2*' : '')}(${(center[ax] * uMult).toFixed(3)}${sign}${(radius * uMult).toFixed(3)}*${geometry.inverted ? 'COS(ASIN' : 'SIN(ACOS'}((R${rNum}${diamonAx === ax2 ? '/2' : ''}-${(center[ax2] * uMult).toFixed(3)})/${(radius * uMult).toFixed(3)})))`
    }
}

// Value of the same geometry at ax2 = value, in internal mm. Presentation lives
// in getEquationByAx alone: no diameter doubling, no unit multiplier, and the
// safety / closed-contour offsets are left out because they are symbolic
// R-parameters added on top of this geometry.
export const evaluateGeometry = (geometry, ax, ax2, value) => {
    if (geometry === null || geometry === undefined) return NaN

    if (geometry.type === 'line') {
        const tangent = Math.tan(geometry.angle * Math.PI / 180)
        const offset = value - geometry.anchor[ax2]
        return geometry.anchor[ax] + (geometry.inverted ? offset / tangent : offset * tangent)
    }

    if (geometry.type === 'arc') {
        // COS(ASIN(u)) and SIN(ACOS(u)) are both sqrt(1 - u^2); the emitter
        // picks the spelling by axis, the value is the same.
        const u = (value - geometry.center[ax2]) / geometry.radius
        return geometry.center[ax] + geometry.sign * geometry.radius * Math.sqrt(1 - u * u)
    }

    return NaN
}

// The branch chain of one section, as data: one zone per branch in the order
// the control reads them, the last one carrying threshold null for the
// fall-through. getEquationByAx formats these into program text and
// validateZones replays them, so both speak of the same branches.
const collectZones = (PArr, samples, ax, ax2, values) => {
    const zones = []

    const zoneAt = (i, threshold) => {
        const el = getElBetweenPoints(PArr, samples, i)
        return {
            threshold,
            geometry: equationGeometry(el, ax, ax2),
            elementId: el === undefined ? undefined : el.id,
        }
    }

    if (PArr.length > 2) {
        for (let i = 0; i < PArr.length - 2; i++) {
            if (Math.min(...values.map(value => Math.abs(value - PArr[i + 1].coords[ax2]))) < 1e-2) {
                continue
            }
            zones.push(zoneAt(i, PArr[i + 1].coords[ax2]))
        }
    }
    zones.push(zoneAt(PArr.length - 2, null))

    return dropRedundantZones(zones, ax, ax2)
}

// A branch that moves exactly where the next branch would is dead weight: every
// pass plane it catches also satisfies the next condition, because the
// thresholds relax in the direction the passes step. Dropping it is what keeps a
// chain from carrying the same move twice — the shape the step-anchor bug used
// to produce, and the shape a contour whose elements overshoot their stitches
// produces legitimately. A run of equal branches collapses in this single pass,
// since each is compared with its immediate successor.
const dropRedundantZones = (zones, ax, ax2) => zones.filter((zone, idx) => {
    if (idx === zones.length - 1) return true
    return !sameGeometry(zone.geometry, zones[idx + 1].geometry, ax, ax2)
})

// Whether two branches would drive the axis along the same curve — not whether
// they were built from the same element. Two collinear elements, or one element
// split in two, describe one line and deserve one branch.
const sameGeometry = (a, b, ax, ax2) => {
    if (!a || !b || a.type !== b.type || a.inverted !== b.inverted) return false

    if (a.type === 'line') {
        if (Math.abs(a.angle - b.angle) > 1e-6) return false
        // Same direction; the two anchors have to be on one line as well. A
        // non-finite result (an element that cannot drive ax as a function of
        // ax2 at all) fails the comparison and keeps both branches.
        return Math.abs(evaluateGeometry(a, ax, ax2, b.anchor[ax2]) - b.anchor[ax]) < PRECISION
    }

    if (a.type === 'arc') {
        return a.sign === b.sign
            && Math.abs(a.radius - b.radius) < PRECISION
            && Math.abs(a.center[ax] - b.center[ax]) < PRECISION
            && Math.abs(a.center[ax2] - b.center[ax2]) < PRECISION
    }

    return false
}

// Replays an emitted branch chain against the profile the detection actually
// found, and reports every probe where the cycle would not follow the contour.
// The detected samples are the ground truth: they are intersections of the real
// elements with the scan lines, so a zone paired with the wrong element, a
// threshold off by more than float noise, an arc with the wrong sign or an
// element that cannot drive ax as a function of ax2 all show up here as a
// deviation — the step-anchor bug showed up as 16 mm and 85 mm.
//
// Its resolution is the detection pitch: an error that misroutes a band
// narrower than the spacing between scan lines (the old `IF R1>8.010` against a
// step at 8 was 0.01 wide) can fall between two probes and go unseen. What it
// does catch is every error that is wrong across a whole zone.
export const validateZones = (zones, samples, side, ax, ax2, reverse) => {
    const problems = []
    if (!Array.isArray(samples)) return problems

    const pickZone = (value) => zones.find(zone => zone.threshold !== null &&
            (reverse ? value > zone.threshold : value < zone.threshold))
        || zones.find(zone => zone.threshold === null)

    samples.forEach(sample => {
        const value = sample.coords[ax2]

        // A threshold sits on a discontinuity: right at it both sides of the
        // jump are legitimate, so a probe that close carries no information.
        if (zones.some(zone => zone.threshold !== null &&
            Math.abs(value - zone.threshold) < 10 * CHANGE_POINT_PRECISION)) return

        const zone = pickZone(value)
        const expected = zone === undefined ? NaN : evaluateGeometry(zone.geometry, ax, ax2, value)
        const delta = expected - sample.coords[ax]

        if (Number.isFinite(delta) && Math.abs(delta) <= PRECISION) return

        problems.push({
            side,
            at: value,
            expected,
            got: sample.coords[ax],
            delta,
            elementId: zone === undefined || zone.elementId === undefined ? null : zone.elementId,
        })
    })

    return problems
}

const clarifyElementsChangePoint = (p1, p2, direction, contour, ax, ax2, x, y, cRange) => {
    const elements = contour.filter(el => (el.id === p1.parentId || el.id === p2.parentId))
    const PDistance = getDistance(p1.coords, p2.coords)

    if (Math.abs(p1.coords[ax2] - p2.coords[ax2]) < 1e-11) {
        if (Math.abs(p1.coords[ax] - p2.coords[ax]) > 1) {
            return {
                ...p1,
                break: true,
                secondP: p2
            }
        }
        return p1
    }

    // The unknown being bisected is the ax2 coordinate of the transition, so
    // termination and progress are measured on ax2 alone. A 2D distance cannot
    // serve for that: across a discontinuity it stays pinned at the jump along
    // `ax` (85 mm on the JOPA step) and never shrinks at all, while on a
    // continuous transition it used to stop the recursion a whole 3e-3 short.
    // Either way the error went straight into the emitted `IF` threshold. The
    // `break` pair above keeps its own, much tighter tolerance and so stays
    // unreachable from here, exactly as before.
    const ax2Interval = Math.abs(p1.coords[ax2] - p2.coords[ax2])
    if (ax2Interval < CHANGE_POINT_PRECISION) return p1

    const line = {
        type: 'line',
        start: {
            [x]: ax === x ? cRange.left : (p1.coords[x] + p2.coords[x]) / 2,
            [y]: ax === y ? cRange.bottom : (p1.coords[y] + p2.coords[y]) / 2
        },
        end: {
            [x]: ax === x ? cRange.right : (p1.coords[x] + p2.coords[x]) / 2,
            [y]: ax === y ? cRange.top : (p1.coords[y] + p2.coords[y]) / 2
        },
    }

    const candidates = elements
        .map(el => {
            const intersections = findIntersection(el, line)
            return intersections
                .map(iP => {
                    return {
                        type: 'point',
                        coords: {
                            [x]: iP.xIntersection,
                            [y]: iP.yIntersection
                        },
                        parentId: el.id
                    }
                })
                .flat()
        })
        .filter(el => el.length)
        .flat()
        .filter(p => getDistance(p.coords, p1.coords) < PDistance || getDistance(p.coords, p2.coords) < PDistance)

    // `findIntersection` also accepts a point up to 1e-2 OUTSIDE an element when
    // it sits next to the endpoints of both elements. That tolerance is what
    // stitches a hand-drawn contour together, but here it lets the element that
    // does not actually reach the scan line win the vote below, and the
    // bisection then converges on the edge of that tolerance instead of on the
    // real transition — the JOPA step at Z=8 came out as 8.010, i.e. 8 + 1e-2.
    // Keep only candidates lying within their own element's ax2 span, falling
    // back to the raw list so that a change point is never lost.
    const onElement = candidates.filter(p => {
        const el = elements.find(e => e.id === p.parentId)
        if (el === undefined) return false
        const {top, right, bottom, left} = getElementRange(el)
        const [min, max] = ax2 === x ? [left, right] : [bottom, top]
        return p.coords[ax2] >= min && p.coords[ax2] <= max
    })

    const middlePoint = (onElement.length ? onElement : candidates)
        .sort((a, b) => {
            return (a.coords[ax] - b.coords[ax]) * direction.direction
        })[0]
    if (middlePoint === undefined) {
        console.log('jjoooPPPPaaAa!!')
        return null
    }

    // Guard: if middlePoint doesn't reduce the interval (e.g. collinear branch returned p2
    // itself), the recursion makes no progress — return current best approximation.
    const newAx2Interval = middlePoint.parentId === p1.parentId
        ? Math.abs(middlePoint.coords[ax2] - p2.coords[ax2])
        : Math.abs(p1.coords[ax2] - middlePoint.coords[ax2])
    if (newAx2Interval >= ax2Interval) return p1

    if (middlePoint.parentId === p1.parentId) {
        return clarifyElementsChangePoint(middlePoint, p2, direction, contour, ax, ax2, x, y, cRange)
    } else {
        return clarifyElementsChangePoint(p1, middlePoint, direction, contour, ax, ax2, x, y, cRange)
    }

}

export const getContourRange = (contour) => {
    let range

    contour.forEach((el, idx) => {
        if (idx === 0) {
            range = getElementRange(el)
            return
        }
        const {top, right, bottom, left} = getElementRange(el)
        if (top > range.top) range.top = top
        if (right > range.right) range.right = right
        if (bottom < range.bottom) range.bottom = bottom
        if (left < range.left) {
            range.left = left
        }
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
    const {x, y} = getFrame()
    const top = checkDeadCenter(DEAD_CENTERS.top, el) ? el.center[y] + el.radius : Math.max(el.start[y], el.end[y])
    const bottom = checkDeadCenter(DEAD_CENTERS.bottom, el) ? el.center[y] - el.radius : Math.min(el.start[y], el.end[y])
    const right = checkDeadCenter(DEAD_CENTERS.right, el) ? el.center[x] + el.radius : Math.max(el.start[x], el.end[x])
    const left = checkDeadCenter(DEAD_CENTERS.left, el) ? el.center[x] - el.radius : Math.min(el.start[x], el.end[x])
    return {top, right, bottom, left}
}

export const checkDeadCenters = (arc) => {
    const deadCenters = Object.values(DEAD_CENTERS).map(matrix => checkDeadCenter(matrix, arc))
    const resp = {}
    Object.keys(DEAD_CENTERS).forEach((key, idx) => {
        resp[key] = deadCenters[idx]
    })
    return resp
}

export const checkDeadCenter = (directionMatrix, arc) => {
    const {x, y} = getFrame()
    const p = {
        [x]: arc.center[x] + directionMatrix[0] * arc.radius,
        [y]: arc.center[y] + directionMatrix[1] * arc.radius
    }
    return checkPointBelongsArc(arc, p)
}

const getLineRange = (el) => {
    const {x, y} = getFrame()
    const horizontal = [el.start[x], el.end[x]].sort((a, b) => a - b)
    const vertical = [el.start[y], el.end[y]].sort((a, b) => a - b)
    return {top: vertical[1], bottom: vertical[0], left: horizontal[0], right: horizontal[1]}
}
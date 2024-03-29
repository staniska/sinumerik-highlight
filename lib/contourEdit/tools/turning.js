'use babel'

import View from '../../sinumerik'
import {confirmDialog} from "../../dialog/confirm";
import {draw, getFrame} from "../canvas";
import {create_element} from "../createElement";
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
    View.sinumerikView.modalWindow.header = create_element(['contourEdit_modalWindowHeader'], View.sinumerikView.modalWindow, 'Select machining direction')
    const burnedContourRange = getContourRange(View.sinumerikView.contourEditData.burnedContour)
    const {top, right, bottom, left} = burnedContourRange
    View.sinumerikView.modalWindow.directions = create_element(['contourEdit_modalWindowDirections'], View.sinumerikView.modalWindow)
    const create_btn = (id, direction) => {
        const btn = create_element(['contourEdit_modalWindow_Button', 'contourEdit_modalWindow_Direction'], View.sinumerikView.modalWindow.directions, '', 'button')
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
    View.sinumerikView.modalWindow.cycleName.text = create_element(['contourEdit_modalWindow_cycleName_header'], View.sinumerikView.modalWindow.cycleName, 'cycleName:')
    View.sinumerikView.modalWindow.cycleName.input = create_element(['native-key-bindings'], View.sinumerikView.modalWindow.cycleName, '', 'input')
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
        const programText = generateProgramText(direction, ax, burnedContourRange, contour, x, y, View.sinumerikView.modalWindow.cycleName.input.value, closedContourTurning)

        const Editor = atom.workspace.getActiveTextEditor()
        View.sinumerikView.contourEditData.inserter = Editor.onDidChangeCursorPosition(() => {
            View.sinumerikView.contourEditData.inserter.dispose()
            Editor.insertText(programText.join('\n'))
            // console.log(programText)

        })


    })


    View.sinumerikView.modalWindow.closeBtn = create_element(['contourEdit_modalWindow_Button', 'contourEdit_modalWindow_Close'], View.sinumerikView.modalWindow, 'Close', 'button')
    View.sinumerikView.modalWindowPanel = atom.workspace.addModalPanel({item: View.sinumerikView.modalWindow})
    View.sinumerikView.modalWindowPanel.show()
    View.sinumerikView.modalWindow.closeBtn.addEventListener('click', () => {
        View.sinumerikView.contourEditData.processingData.reset()
        View.sinumerikView.modalWindowPanel.destroy()
    })
}

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

const detectProcessingPoints = (cRange, direction, ax, contour) => {
    // console.log('detect processing points...')
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

    // console.log('log1')
}

const findChangePoints = (points, direction, contour, ax, x, y, cRange) => {
    // console.log('find change points')
    let changePoints = []
    points.forEach((p, idx) => {
        // console.log(idx)
        if (idx === points.length - 1 || idx === 0) {
            changePoints.push({...p, parentPointId: idx})
            // console.log('last P: ', JSON.stringify(p.coords))
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

    // console.log(changePoints)

    while (changePoints.find((p, idx) => {
        return (idx !== changePoints.length - 1 && (getDistance(p.coords, changePoints[idx + 1]) < 2 * PRECISION))
    })) {
        changePoints = changePoints.map((p, idx) => {
            if (idx === 0 || idx === changePoints.length - 1) return p

            const prevP = changePoints[idx - 1]

            if (Math.abs(p.coords[x] - prevP.coords[x]) < 2 * PRECISION ||
                Math.abs(p.coords[y] - prevP.coords[y]) < 2 * PRECISION
            ) {
                // console.log('prevP')
                return null
            }

            if (idx === changePoints.length - 2) {
                const nextP = changePoints[idx + 1]
                if (Math.abs(p.coords[x] - nextP.coords[x]) < 2 * PRECISION ||
                    Math.abs(p.coords[y] - nextP.coords[y]) < 2 * PRECISION
                ) {
                    // console.log('nextP')
                    return null
                }
            }
            return p
        }).filter(p => p !== null)
    }
    return changePoints
}

const generateProgramText = (direction, ax, cRange, contour, x, y, cycleName, closedContour) => {
    // console.log('generate program text')
    // console.log(direction.direction, typeof direction.direction)
    const {diamonAx} = getFrame()
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

    programText.push(`R${startVarNum}=${(values[0] * (diamonAx === ax2 ? 2 : 1)).toFixed(3)}   ; start`)
    programText.push(`R${targetVarNum}=${(values[1] * (diamonAx === ax2 ? 2 : 1)).toFixed(3)}   ; end`)
    programText.push(`R${depthVarNum}=${depthValue}   ; depth`)
    programText.push(`R${safetyVarNum}=1   ;safety distance`)
    programText.push(`R${averageDepthVarNum}=ABS(R${startVarNum}-R${targetVarNum})/(TRUNC(ABS((R${startVarNum}-R${targetVarNum})${diamonAx === ax2 ? '/2' : ''})/(R${depthVarNum}*1.03))+1)-1/10000`)
    programText.push('')
    programText.push(`R${startVarNum}=R${startVarNum}${reverse ? '-' : '+'}R${averageDepthVarNum}`)
    programText.push('')
    programText.push(`${cycleName}:`)

    programText.push(`G0 ${x}=${processing.startPoint[x].toFixed(3)} ${y}=${processing.startPoint[y] * (diamonAx === y ? 2 : 1).toFixed(3)}`)


    //START points

    let PArr = JSON.parse(JSON.stringify(points.processingChangeStart))
    if (reverse) PArr = PArr.reverse()
    let insert_1 = closedContour ? `${direction.direction === 1 ? '-' : '+'}(R${averageDepthVarNum}+R${safetyVarNum}*2)` : ''
    let insert_2 = closedContour ? `${direction.direction === 1 ? '-' : '+'}R${averageDepthVarNum}+R${safetyVarNum}` : ''

    if (PArr.length > 2) {
        for (let i = 0; i < PArr.length - 2; i++) {
            if (Math.min(...values.map(value => Math.abs(value - PArr[i + 1].coords[ax2]))) < 1e-2) {
                continue
            }
            programText.push(`IF R${startVarNum}${reverse ? '>' : '<'}${(PArr[i + 1].coords[ax2] * (diamonAx === ax2 ? 2 : 1)).toFixed(3)}`)

            programText.push(`  G0 ${ax2}=R${startVarNum}${insert_1} ` + getEquationByAx(
                getElBetweenPoints(PArr, points.processingStart, i),
                ax, ax2, PArr[i + 1], startVarNum, reverse, closedContour, direction, averageDepthVarNum, safetyVarNum) + (closedContour ? '' : `${(direction.direction === '1') ? '-' : '+'}R${safetyVarNum}${diamonAx === ax ? '*2' : ''}`))
            if (closedContour) {
                programText.push(`  G1 ${ax2}=R${startVarNum}${insert_2}`)
                programText.push(`  G1 ${ax2}=R${startVarNum} ` + getEquationByAx(
                    getElBetweenPoints(PArr, points.processingStart, i),
                    ax, ax2, PArr[i + 1], startVarNum, reverse))
                // + `${(direction.direction === '1') ? '-' : '+'}R${safetyVarNum}${diamonAx === ax ? '*2' : ''}`
            }
            programText.push(`  GOTOF ${cycleName}_START`)
            programText.push(`ENDIF`)
        }
    }
    programText.push(`G0 ${ax2}=R${startVarNum}${insert_1} ` + getEquationByAx(
        getElBetweenPoints(PArr, points.processingStart, PArr.length - 2),
        ax, ax2, PArr[PArr.length - 1], startVarNum, reverse, closedContour, direction, averageDepthVarNum, safetyVarNum) + (closedContour ? '' : `${(direction.direction === '1') ? '-' : '+'}R${safetyVarNum}${diamonAx === ax ? '*2' : ''}`))
    if (closedContour) {
        programText.push(`  G1 ${ax2}=R${startVarNum}${insert_2}`)
        programText.push(`  G1 ${ax2}=R${startVarNum} ` + getEquationByAx(
            getElBetweenPoints(PArr, points.processingStart, PArr.length - 2),
            ax, ax2, PArr[PArr.length - 1], startVarNum, reverse))
        // + `${(direction.direction === '1') ? '-' : '+'}R${safetyVarNum}${diamonAx === ax ? '*2' : ''}`)
    }

    programText.push(`${cycleName}_START:`)


    //END points
    PArr = JSON.parse(JSON.stringify(points.processingChangeEnd))
    if (reverse) PArr = PArr.reverse()
    // console.log(PArr)

    if (PArr.length > 2) {
        for (let i = 0; i < PArr.length - 2; i++) {
            if (Math.min(...values.map(value => Math.abs(value - PArr[i + 1].coords[ax2]))) < 1e-2) {
                continue
            }
            programText.push(`IF R${startVarNum}${reverse ? '>' : '<'}${(PArr[i + 1].coords[ax2] * (diamonAx === ax2 ? 2 : 1)).toFixed(3)}`)
            programText.push(`  G1 ` + getEquationByAx(
                getElBetweenPoints(PArr, points.processingEnd, i),
                ax, ax2, PArr[i + 1], startVarNum, reverse))
            programText.push(`  GOTOF ${cycleName}_END`)
            programText.push(`ENDIF`)
        }
    }
    programText.push(`G1 ` + getEquationByAx(
        getElBetweenPoints(PArr, points.processingEnd, PArr.length - 2),
        ax, ax2, PArr[PArr.length - 1], startVarNum, reverse))

    programText.push(`${cycleName}_END:`)

    programText.push(`R${startVarNum}=R${startVarNum}${reverse ? '-' : '+'}R${averageDepthVarNum}`)
    programText.push(`IF R${startVarNum}${reverse ? '<' : '>'}R${targetVarNum}`)
    programText.push(`  ;--- last cycle pass ---`)
    programText.push(`ENDIF`)

    programText.push(`G1 ${ax}=IC(${direction.direction === '1' ? '-' : ''}R${safetyVarNum}) ${ax2}=IC(${reverse ? '' : '-'}R${safetyVarNum})`)
    programText.push(`G0 ${x}=${processing.startPoint[x].toFixed(3)} ${y}=${processing.startPoint[y] * (diamonAx === y ? 2 : 1).toFixed(3)}`)

    programText.push(`IF R${startVarNum}${reverse ? '>=' : '<='}R${targetVarNum} GOTOB ${cycleName}`)
    // programText.push(`G0 ${ax2}=R${startVarNum}`)


    programText.push(`;---  end  ---`)

    // console.log('log2')

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
        // console.log(line)
        // console.log(line.substring(0, line.match(/\(\w+[+-]\d+.\d+\)\/?2?\/TAN\(-?90\.000\)/).index - 1))
        const match = line.match(/\(\w+[+-]\d+.\d+\)\/?2?\/TAN\(-?90\.000\)/)
        // console.log(match)
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

    // console.log(conditions)

    conditions.forEach((line, id) => {
        if (id === 0) return
        if (conditions[id - 1].text === line.text && programText[conditions[id - 1].endIfIdx - 1] === programText[line.endIfIdx - 1]) {
            // console.log(line)
            const arrayForDelete = new Array(line.endIfIdx - line.idx + 1).fill(1).map((e, i) => line.idx + i)
            // console.log(arrayForDelete)
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

const getEquationByAx = (el, ax, ax2, p, rNum, reverse, closedContour, direction, averageDepthVarNum, safetyVarNum) => {
    const {diamonAx, x, y} = getFrame()
    if (el.type === 'line') {
        const {a, b} = getEquationOfLine(el)
        let coords = p.coords
        let insert_1 = closedContour ? `${direction.direction === 1 ? '-' : '+'}(R${averageDepthVarNum}+R${safetyVarNum})` : ''
        // if (p.break) {
        //     // console.log('jopa!!!')
        //     coords = p.secondP.coords
        // }

        return `${ax}=${(coords[ax] * (diamonAx === ax ? 2 : 1)).toFixed(3)}+(R${rNum}${insert_1}-${(coords[ax2] * (diamonAx === ax2 ? 2 : 1)).toFixed(3)})${diamonAx === ax2 ? '/2' : ''}${(ax === x ? '/' : '*')}TAN(${(-Math.atan2(a / b, 1) / Math.PI * 180).toFixed(3)})${diamonAx === ax ? '*2' : ''}`
    }
    if (el.type === 'arc') {

        const range = getArcRange(el)
        let sign = '+'
        if (ax === x && range.left < el.center[x]) sign = '-'
        if (ax === y && range.bottom < el.center[y]) sign = '-'

        return `${ax}=${(diamonAx === ax ? '2*' : '')}(${(el.center[ax]).toFixed(3)}${sign}${el.radius.toFixed(3)}*${ax === x ? 'COS(ASIN' : 'SIN(ACOS'}((R${rNum}${diamonAx === ax2 ? '/2' : ''}-${el.center[ax2].toFixed(3)})/${el.radius.toFixed(3)})))`
    }
}

const clarifyElementsChangePoint = (p1, p2, direction, contour, ax, ax2, x, y, cRange) => {
    // console.log('clarify elements change points')
    const elements = contour.filter(el => (el.id === p1.parentId || el.id === p2.parentId))
    const PDistance = getDistance(p1.coords, p2.coords)
    if (PDistance < PRECISION) return p1

    // console.log(PDistance, Math.abs(p1.coords[ax2] - p2.coords[ax2]))

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

    const middlePoint =
        elements
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
            .sort((a, b) => {
                return (a.coords[ax] - b.coords[ax]) * direction.direction
            })[0]
    if (middlePoint === undefined) {
        console.log('jjoooPPPPaaAa!!')
        return null
    }

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
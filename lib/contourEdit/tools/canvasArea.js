'use babel'

import {getFrame} from "../canvas";
import View from '../../sinumerik'
import {getEquationOfLine} from "../intersections";

export const checkCanvasArea = () => {
    if (View.sinumerikView.contourEditData.eventData.action.type !== 'selectArea') return
    if (Date.now() < View.sinumerikView.contourEditData.checkAreaTimestamp + 100) return
    View.sinumerikView.contourEditData.checkAreaTimestamp = Date.now()
    const cursorPosition = View.sinumerikView.contourEditData.cursorPosition
    burnForest(cursorPosition)
}

const burnForest = (cursorPosition) => {
    const {x, y} = getFrame()
    const burnedPoints = View.sinumerikView.contourEditData.points.burned
    burnedPoints.length = 0
    let firstElPoint = null
    for (let i = 0; i < 5000; i++) {
        const founded = getRoundedPoints({
                coords:
                    {
                        ...cursorPosition,
                        [x]: cursorPosition[x] + i
                    }
            }, x, y
        )

        if (founded.length === 1) {
            if (i < 2) return
            firstElPoint = founded[0]
            break
        }
    }

    if (firstElPoint === null) return

    burnedPoints.push(firstElPoint)

    let searching = true
    let prevMatrix = [-1, 0]
    let targetP = firstElPoint
    let max = 2000


    while (searching && max) {
        const {nextP, prevM} = findNextPoint(targetP, prevMatrix, x, y)
        if (nextP[0].coords[x] === firstElPoint.coords[x] && nextP[0].coords[y] === firstElPoint.coords[y]) {
            searching = false
            break
        }
        burnedPoints.push(nextP[0])
        if (nextP.length === 1 && nextP[0].endPoint) {
            searching = false
            burnedPoints.length = 0
        }

        if (nextP.length > 1 && nextP[0].parentId !== nextP[1].parentId) {
            console.log('jopa')
            targetP = nextP.filter(p => {
                return p.parentId !== targetP.parentId
            })[0]
        } else {
            targetP = nextP[0]
        }

        prevMatrix = prevM
        max--
    }

    if (burnedPoints.filter(p => {
        return (
            p.coords[y] === firstElPoint.coords[y] &&
            p.coords[x] > firstElPoint.coords[x]
        )
    }).length % 2 !== 0) {
        burnedPoints.length = 0
    }
    // ЗАжигаем токи пересечений
    if (burnedPoints.length) {
        const intersectionPoints = View.sinumerikView.contourEditData.points.intersection
        const burnedIntersectionPoints = []
        burnedPoints.forEach((p, idx) => {
            if (idx === 0) return
            if (p.parentId !== burnedPoints[idx - 1].parentId) {
                try {
                    let intersectionPointsWithIds =
                        intersectionPoints.filter(iP => {
                            return iP.parentElementsIds.filter(id => {
                                return id === p.parentId || id === burnedPoints[idx - 1].parentId
                            }).length === 2
                        })
                    if (intersectionPointsWithIds.length > 1) {
                        intersectionPointsWithIds.sort((a, b) => {
                            const distanceA = Math.sqrt((a.coords[x] - p.coords[x]) ** 2 + (a.coords[y] - p.coords[y]) ** 2)
                            const distanceB = Math.sqrt((b.coords[x] - p.coords[x]) ** 2 + (b.coords[y] - p.coords[y]) ** 2)
                            return distanceA - distanceB
                        })
                    }
                    burnedIntersectionPoints.push(intersectionPointsWithIds[0])
                } catch (e) {
                    console.log(e)
                }
            }
        })
        burnedPoints.length = 0
        burnedPoints.push(...burnedIntersectionPoints)
    }
}

const findNextPoint = (point, prevMatrix, x, y) => {

    // console.log(point)
    let nextM = prevMatrix
    let foundedP = []
    while (!foundedP.length) {
        nextM = nextMatrix(nextM)

        const founded = getRoundedPoints({
            ...point,
            coords: {
                [x]: point.coords[x] + nextM[0],
                [y]: point.coords[y] + nextM[1]
            }
        }, x, y)

        if (founded.length) {
            foundedP = founded
        }
    }
    return {nextP: foundedP, prevM: [-1 * nextM[0], -1 * nextM[1]]}
}

const nextMatrix = (pM) => {
    if (pM[0] === 1 && pM[1] === 0) {
        return [1, -1]
    }
    if (pM[0] === 1 && pM[1] === -1) {
        return [0, -1]
    }
    if (pM[0] === 0 && pM[1] === -1) {
        return [-1, -1]
    }
    if (pM[0] === -1 && pM[1] === -1) {
        return [-1, 0]
    }
    if (pM[0] === -1 && pM[1] === 0) {
        return [-1, 1]
    }
    if (pM[0] === -1 && pM[1] === 1) {
        return [0, 1]
    }
    if (pM[0] === 0 && pM[1] === 1) {
        return [1, 1]
    }
    if (pM[0] === 1 && pM[1] === 1) {
        return [1, 0]
    }
}

const getRoundedPoints = (p, x, y) => {
    const elementsPoints = View.sinumerikView.contourEditData.points.rounded
    return elementsPoints.filter(point => {
        return ((point.coords[x] === p.coords[x]) && (point.coords[y] === p.coords[y]))
    })
}

export const getElementPart = () => {
    const {x, y} = getFrame()
    //TODO вот тут сделать функцию получения части элемента
}

export const generateRoundedPoints = () => {
    const {x, y} = getFrame()
    const contour = View.sinumerikView.contourEditData.editContour
    const points = []


    contour.forEach(el => {
        if (el.type === 'line') {
            const {a, b, c} = getEquationOfLine(el)
            if (b !== 0) {
                if (Math.abs(a / b) < 1) {
                    for (let i = Math.round(Math.min(el.start[x], el.end[x])); i <= Math.round(Math.max(el.start[x], el.end[x])); i++) {
                        points.push({
                            id: points.length,
                            coords: {[x]: i, [y]: Math.round(-(a / b) * i - c / b)},
                            parentId: el.id,
                            endPoint: (i === Math.round(el.start[x]) || i === Math.round(el.end[x]))
                        })

                    }
                } else {
                    for (let i = Math.round(Math.min(el.start[y], el.end[y])); i <= Math.round(Math.max(el.start[y], el.end[y])); i++) {
                        points.push({
                            id: points.length,
                            coords: {[x]: Math.round(-(b / a) * i - c / a), [y]: i},
                            parentId: el.id,
                            endPoint: (i === Math.round(el.start[y]) || i === Math.round(el.end[y]))
                        })
                    }
                }
            } else {
                for (let i = Math.round(Math.min(el.start[y], el.end[y])); i <= Math.round(Math.max(el.start[y], el.end[y])); i++) {
                    const x0 = Math.round(-c / a)
                    points.push({
                        id: points.length,
                        coords: {[x]: x0, [y]: i},
                        parentId: el.id,
                        endPoint: (i === Math.round(el.start[y]) || i === Math.round(el.end[y]))
                    })
                }
            }
        }
        if (el.type === 'arc') {
            let startAng = el.ccw ? el.endAng : el.startAng
            let endAng = el.ccw ? el.startAng : el.endAng
            if (startAng < 0) {
                startAng += 2 * Math.PI
            }
            if (endAng < 0) {
                endAng += 2 * Math.PI
            }

            let arcAng
            if (startAng > endAng) {
                arcAng = startAng - endAng
            } else {
                arcAng = 2 * Math.PI - (endAng - startAng)
            }

            const length = el.radius * arcAng

            for (let i = 0; i <= length; i++) {
                let ang = startAng - arcAng * (i / length)
                if (ang <= -Math.PI) {
                    ang += 2 * Math.PI
                }
                points.push({
                    id: points.length,
                    coords: {
                        [x]: Math.round(el.center[x] + (el.radius * Math.cos(ang))),
                        [y]: Math.round(el.center[y] + (el.radius * Math.sin(ang)))
                    },
                    parentId: el.id,
                    endPoint: (i === 0 || i === length)
                })
            }
        }

    })

    return points
}
'use babel'

import {getFrame} from "../canvas";
import View from '../../sinumerik'
import {checkPointBelongsArc, getEquationOfLine} from "../intersections";
import {getDistance} from "../contourEditMain";

export const checkCanvasArea = () => {
    if (View.sinumerikView.contourEditData.eventData.action.name !== 'selectArea') return
    if (Date.now() < View.sinumerikView.contourEditData.checkAreaTimestamp + View.sinumerikView.contourEditData.checkAreaDelay) return
    View.sinumerikView.contourEditData.checkAreaDelay = 30
    View.sinumerikView.contourEditData.checkAreaTimestamp = Date.now()
    const cursorPosition = View.sinumerikView.contourEditData.cursorPosition
    burnForest(cursorPosition)
}

const burnForest = (cursorPosition) => {
    // console.log('burnForest')
    const {x, y} = getFrame()
    const burnedPoints = View.sinumerikView.contourEditData.points.burned
    burnedPoints.length = 0
    View.sinumerikView.contourEditData.points.processingStart.length = 0
    View.sinumerikView.contourEditData.points.processingEnd.length = 0
    const burnedElementsParts = View.sinumerikView.contourEditData.burnedContour
    burnedElementsParts.length = 0
    let firstElPoint = null
    for (let i = 0; i < 5000; i++) {
        const founded = getRoundedPoints({
                coords:
                    {
                        [x]: Math.round(cursorPosition[x]) + i,
                        [y]: Math.round(cursorPosition[y])
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
    // console.log('firstPoint not null')

    burnedPoints.push(firstElPoint)

    let searching = true
    let prevMatrix = [-1, 0]
    let targetP = firstElPoint
    let max = 50000


    while (searching && max) {
        const {nextP, prevM} = findNextPoint(targetP, prevMatrix, x, y)
        if (nextP[0].coords[x] === firstElPoint.coords[x] && nextP[0].coords[y] === firstElPoint.coords[y]) {
            searching = false
            break
        }
        burnedPoints.push(nextP[0])
        if (nextP.length === 1 && nextP[0].endPoint) {
            const roundedIntersections = View.sinumerikView.contourEditData.points.intersection.map(p => {
                return {...p,
                    coords: Object.fromEntries(Object.entries(p.coords).map(e => [e[0], Math.round(e[1])]))
                }
            })
            if (!roundedIntersections.filter(i => i.coords[x] === nextP[0].coords[x] && i.coords[y] === nextP[0].coords[y]).length) {
                console.log('burned points chain interrupted at endPoint')
                searching = false
                burnedPoints.length = 0
            }
        }

        targetP = nextP[0]
        prevMatrix = prevM
        max--
    }

    if (burnedPoints.filter(p => {
        return (
            p.coords[y] === firstElPoint.coords[y] &&
            p.coords[x] > firstElPoint.coords[x]
        )
    }).length % 2 !== 0) {
        console.log('Cursor in outside shape')
        burnedPoints.length = 0
    }

    // ЗАжигаем токи пересечений
    const burnedIntersectionPoints = []
    if (burnedPoints.length) {
        const intersectionPoints = View.sinumerikView.contourEditData.points.intersection
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
                            const distanceA = getDistance(a.coords, p.coords)
                            const distanceB = getDistance(b.coords, p.coords)
                            return distanceA - distanceB
                        })
                    }
                    if (intersectionPointsWithIds[0] !== undefined) {
                        burnedIntersectionPoints.push(intersectionPointsWithIds[0])
                    }
                } catch (e) {
                    console.log(e)
                }
            }
        })
    }

    const sortedIds = Array.from(new Set(burnedPoints.map(p => p.parentId)))
    if (burnedIntersectionPoints.length) {
        const burnedElementsPartsIds = Array.from(
            new Set(
                burnedIntersectionPoints.map(p => {
                    return p.parentElementsIds
                }).flat()
            )
        )
        burnedElementsPartsIds.forEach(id => {
            const el = View.sinumerikView.contourEditData.editContour.filter(el => el.id === id)[0]
            const points = burnedIntersectionPoints.filter(p => {
                return p.parentElementsIds.includes(id)
            })
            if (points.length < 2) return
            points.sort((a, b) => {
                const distanceA = getDistance(a.coords, el.start)
                const distanceB = getDistance(b.coords, el.start)
                return distanceA - distanceB
            })

            const elPart = {
                id: el.id,
                type: el.type,
                start: points[0].coords,
                end: points[1].coords
            }

            if (el.type === 'arc') {
                updateArc(elPart,el, x, y)
            }
            // burnedElementsParts.push({type: 'line', start: elPart.start, end: elPart.end})
            burnedElementsParts.push(elPart)
        })
    }
    burnedElementsParts.sort((a, b) => {
        return sortedIds.indexOf(a.id) - sortedIds.indexOf(b.id)
    })

    if (burnedElementsParts.length < 2) {
        burnedElementsParts.length = 0
    }

    burnedElementsParts.forEach((el, idx) => {
        let nextIdx = idx + 1
        if (nextIdx === burnedElementsParts.length) {
            nextIdx = 0
        }
        if (getDistance(el.start, burnedElementsParts[nextIdx].start) < 1e-2 || getDistance(el.start, burnedElementsParts[nextIdx].end) < 1e-2) {
            burnedElementsParts[idx] = reverseEl(el, x, y)
        }
    })
    if (burnedElementsParts.length) {
        View.sinumerikView.contourEditData.checkAreaDelay = 700
    }
}

export const updateArc = (elPart, el, x, y) => {
    elPart.center = el.center
    elPart.radius = el.radius
    elPart.startAng = Math.atan2((elPart.start[y] - elPart.center[y]), (elPart.start[x] - elPart.center[x]))
    elPart.endAng = Math.atan2((elPart.end[y] - elPart.center[y]), (elPart.end[x] - elPart.center[x]))
    elPart.ccw = el.ccw

    // const {plane} = getFrame()

    const positiveStartAng = (elPart.startAng > 0 ? elPart.startAng : elPart.startAng + 2 * Math.PI)
    const positiveEndAng = (elPart.endAng > 0 ? elPart.endAng : elPart.endAng + 2 * Math.PI)
    const middleAng1 = (positiveEndAng + positiveStartAng) / 2
    const middleAng2 = middleAng1 - Math.PI
    let middlePoint = {
        [x]: elPart.center[x] + Math.cos(middleAng1) * elPart.radius,
        [y]: elPart.center[y] + Math.sin(middleAng1) * elPart.radius
    }
    if (!checkPointBelongsArc(elPart, middlePoint)) {
        middlePoint = {
            [x]: elPart.center[x] + Math.cos(middleAng2) * elPart.radius,
            [y]: elPart.center[y] + Math.sin(middleAng2) * elPart.radius
        }
    }
    elPart.middle = middlePoint
}

const reverseEl = (el, x, y) => {
    if (el.type === 'line') {
        return {
            id: el.id,
            start: el.end,
            end: el.start,
            type: el.type,
            ang: Math.atan2((el.start[y] - el.end[y]), (el.start[x] - el.end[x]))
        }
    }
    if (el.type === 'arc') {
        return {
            ...el,
            ccw: !el.ccw,
            start: el.end,
            startAng: el.endAng,
            end: el.start,
            endAng: el.startAng,
        }
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

export const generateRoundedPoints = () => {
    const {x, y} = getFrame()
    const contour = View.sinumerikView.contourEditData.editContour
    const points = []


    contour.forEach(el => {
        if (el.type === 'line') {
            const {a, b, c} = getEquationOfLine(el)
            if (b !== 0) {
                if (Math.abs(a / b) < 1) {
                    for (let i = Math.floor(Math.min(el.start[x], el.end[x])); i <= Math.ceil(Math.max(el.start[x], el.end[x])); i++) {
                        points.push({
                            id: points.length,
                            coords: {[x]: i, [y]: Math.round(-(a / b) * i - c / b)},
                            parentId: el.id,
                            endPoint: (i === Math.round(el.start[x]) || i === Math.round(el.end[x]))
                        })

                    }
                } else {
                    for (let i = Math.floor(Math.min(el.start[y], el.end[y])); i <= Math.ceil(Math.max(el.start[y], el.end[y])); i++) {
                        points.push({
                            id: points.length,
                            coords: {[x]: Math.round(-(b / a) * i - c / a), [y]: i},
                            parentId: el.id,
                            endPoint: (i === Math.round(el.start[y]) || i === Math.round(el.end[y]))
                        })
                    }
                }
            } else {
                for (let i = Math.floor(Math.min(el.start[y], el.end[y])); i <= Math.ceil(Math.max(el.start[y], el.end[y])); i++) {
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

            for (let i = 0; i <= Math.ceil(length); i++) {
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
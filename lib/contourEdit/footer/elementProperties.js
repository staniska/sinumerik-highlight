'use babel'

import View from '../../sinumerik';
import {create_element} from "../createElement";
import {draw, setAng, updateArcProperties} from "../canvas";
import {getFrame} from "../canvas"
import {getDistance} from "../contourEditMain";
import {updateIntersections} from "../intersections";
import {alertDialog} from "../../dialog/alert";

export const elementProperties = (el, idx) => {

    const container = View.sinumerikView.contourEditFootContainer
    if (!container.elementProperties) {
        container.elementProperties = create_element(['contourEditElementProperties'], container)
        container.elementProperties.header = create_element(['contourEditElementProperties_header'], container.elementProperties,)
        container.elementProperties.header.text = create_element(['contourEditElementProperties_header_text'], container.elementProperties.header, 'ElementProperties')

        container.elementProperties.header.escButton = create_element(['contourEditElementProperties_header_esc', 'icon-x'], container.elementProperties.header, '', 'button')
        container.elementProperties.header.escButton.addEventListener('click', () => {
            elementProperties()
            View.sinumerikView.contourEditRightContainer.tools.contourTools
                .querySelector('.editContour_elementsOl')
                .querySelector('.editContourElement_selected')
                .classList.remove('editContourElement_selected')
            draw()
        })
        container.elementProperties.detailsDiv = create_element(['contourEditElementProperties_details'], container.elementProperties)
        container.elementProperties.detailsDiv.idDiv = create_element(['contourEditElementProperties_id'], container.elementProperties.detailsDiv)
        container.elementProperties.detailsDiv.type = create_element(['contourEditElementProperties_type'], container.elementProperties.detailsDiv)
        container.elementProperties.properties = create_element(['contourEditElementProperties_properties'], container.elementProperties)
    }

    if (!el) {
        container.removeChild(container.elementProperties)
        delete container.elementProperties
        return
    }

    container.elementProperties.detailsDiv.idDiv.innerText = (idx + 1).toString()
    container.elementProperties.detailsDiv.type.innerText = el.type.toUpperCase()

    while (container.elementProperties.properties.children.length) {
        container.elementProperties.properties.removeChild(container.elementProperties.properties.lastChild)
    }

    point(el, 'start', container.elementProperties.properties, idx)
    point(el, 'end', container.elementProperties.properties, idx)
    if (el.type === 'line') {
        ang(el, container.elementProperties.properties, idx)
    }
    if (el.type === 'arc') {
        radius(el, container.elementProperties.properties, idx)
    }
}

const radius = (el, container, idx) => {
    const radiusDiv = create_element(['contourEditElementProperties_angle'], container)
    radiusDiv.header = create_element(['contourEditElementProperties_angleHeader'], radiusDiv, 'Radius:')
    radiusDiv.value = create_element(['contourEditElementProperties_radiusValue', 'native-key-bindings'], radiusDiv, '', 'input')
    radiusDiv.value.value = el.radius.toFixed(3)
    radiusDiv.value.addEventListener('change', (event) => {
        const newValue = parseFloat(radiusDiv.value.value)
        if (getDistance(el.start, el.end) > newValue * 2) {
            alertDialog('Radius too small')
            radiusDiv.value.value = el.radius.toFixed(3)
            return
        }
        changeRadius(el, newValue)
    })

}

export const changeRadius = (el, radius, returnFlag) => {
    const {x, y} = getFrame()
    const ang = Math.PI / 2 * (el.ccw ? -1 : 1) + Math.atan2(el.end[y] - el.start[y], el.end[x] - el.start[x])
    const middleP = {[x]: (el.start[x] + el.end[x]) / 2, [y]: (el.start[y] + el.end[y]) / 2}
    const cathetus = radius - Math.sqrt(radius ** 2 - (getDistance(el.start, el.end) / 2) ** 2)
    const angToRndCenter = Math.atan2(el.center[y] - middleP[y], el.center[x] - middleP[x])
    const GT180 = Math.abs(angToRndCenter - ang) < 1e-6
    el.middle = {
        [x]: middleP[x] + cathetus * Math.cos(ang) * (GT180 ? -1 : 1) + (GT180 ? 2 * Math.cos(ang) * radius : 0),
        [y]: middleP[y] + cathetus * Math.sin(ang) * (GT180 ? -1 : 1) + (GT180 ? 2 * Math.sin(ang) * radius : 0)
    }
    if (returnFlag) {
        return el
    } else {
        updateArcProperties(el)
        draw()
    }
}

const ang = (el, container, idx) => {
    const angDiv = create_element(['contourEditElementProperties_angle'], container)
    angDiv.header = create_element(['contourEditElementProperties_angleHeader'], angDiv, 'Ang:')
    angDiv.value = create_element(['contourEditElementProperties_angleValue', 'native-key-bindings'], angDiv, '', 'input')
    const {x, y} = getFrame()
    angDiv.value.value = parseFloat(el.ang).toFixed(4)
    angDiv.value.addEventListener('change', (event) => {
        changeAng(event, el, idx, x, y)
    })
    angDiv.block = create_element(['contourEditElementProperties_angleFix', 'icon-lock'], angDiv, '', 'button')
    if (el.angBlocked) {
        angDiv.block.classList.add('contourEditElementProperties_angleFix__checked')
    }
    angDiv.block.addEventListener('click', () => {
        angBlockButton('toggle', el)
    })
}

const angBlockButton = (action, el) => {
    const angDiv = View.sinumerikView.contourEditFootContainer.querySelector('.contourEditElementProperties_angleFix')
    if (action === 'block') {
        if (angDiv.classList.contains('contourEditElementProperties_angleFix__checked')) return
        angDiv.classList.add('contourEditElementProperties_angleFix__checked')
        el.angBlocked = true
        return
    }
    if (action === 'unblock') {
        if (!angDiv.classList.contains('contourEditElementProperties_angleFix__checked')) return
        angDiv.classList.remove('contourEditElementProperties_angleFix__checked')
        el.angBlocked = false
        return
    }
    if (action === 'toggle') {
        angBlockButton(
            angDiv.classList.contains('contourEditElementProperties_angleFix__checked') ? 'unblock' : 'block', el
        )
    }
}

const changeAng = (event, el, idx, x, y) => {
    let newAng = parseFloat(event.target.value)

    while (newAng <= -180) {
        newAng += 360
    }

    while (newAng > 180) {
        newAng -= 360
    }

    event.target.value = newAng

    // getAxesPriority(newAng, el, x, y)
    const lineLength = Math.sqrt((el.start[x] - el.end[x]) ** 2 + (el.start[y] - el.end[y]) ** 2)
    el.end[x] = parseFloat(el.start[x]) + lineLength * Math.cos(newAng * Math.PI / 180)
    el.end[y] = parseFloat(el.start[y]) + lineLength * Math.sin(newAng * Math.PI / 180)
    setAng(el)
    updateIntersections()
    elementProperties(el, idx)

    draw()
    angBlockButton('block', el)
}

// const getQuarter = (ang) => {
//     const quarters = [[0, 90], [90, 180], [-180, -90], [-90, 0]]
//     let angQuarter = 0
//     quarters.forEach((quarter, idx) => {
//         if (ang >= quarter[0] && ang < quarter[1]) {
//             angQuarter = idx + 1
//         }
//     })
//     return angQuarter
// }


const point = (el, pointType, container, idx) => {
    const pointDiv = create_element(['contourEditElementProperties_point'], container)
    pointDiv.header = create_element(['contourEditElementProperties_pointHeader'], pointDiv, pointType)
    pointDiv.coords = create_element(['contourEditElementProperties_coords'], pointDiv)
    Object.keys(el[pointType]).sort().forEach(coord => {
        const diamon_K = coord === getFrame().diamonAx ? 2 : 1
        const coordDiv = create_element(['contourEditElementProperties_coord'], pointDiv.coords)
        coordDiv.axis = create_element(['contourEditElementProperties_coordName'], coordDiv, `${diamon_K === 2 ? 'Ø' : ''}${coord}`)
        coordDiv.value = create_element(['contourEditElementProperties_coordValue', 'native-key-bindings'], coordDiv, '', 'input')


        coordDiv.value.value = el[pointType][coord] * diamon_K
        coordDiv.value.addEventListener('change', () => {
            const newCoords = JSON.parse(JSON.stringify(el[pointType]))
            newCoords[coord] = parseFloat(coordDiv.value.value) / diamon_K

            if (el.type === 'line') changeLinePoint(el, pointType, coord, newCoords)

            el[pointType] = newCoords
            setAng(el)
            updateIntersections()
            elementProperties(el, idx)
            draw()
        })

        coordDiv.value.addEventListener('focus', () => {
            View.sinumerikView.contourEditData.points.inFocus = []
            View.sinumerikView.contourEditData.points.inFocus.push(
                {
                    idx,
                    type: 'point',
                    subType: pointType,
                    coords: el[pointType],
                    distance: 0
                }
            )
            draw()
        })
    })
}

export const changeLinePoint = (el, pointType, coord, newCoords) => {
    if (el.angBlocked) {
        const secondPointType = pointType === 'start' ? 'end' : 'start'
        const secondCoord = Object.keys(el[pointType]).filter(ax => ax !== coord)[0]
        const {x, y} = getFrame()

        //Проверка на реверс угла
        if (
            Math.abs(Math.abs(el[secondPointType][coord] - newCoords[coord]) +
                Math.abs(el[secondPointType][coord] - el[pointType][coord]) -
                Math.abs(el[pointType][coord] - newCoords[coord]) < 1e-5)
        ) {
            el.ang = el.ang + 180
            if (el.ang > 180) {
            }
            el.ang -= 360
        }
        const distance = (newCoords[coord] - el[secondPointType][coord])
        if (pointType === 'end') {
            newCoords[secondCoord] = el[secondPointType][secondCoord] + distance * Math.pow(Math.tan(el.ang * Math.PI / 180), x === coord ? 1 : -1)
        }

        if (pointType === 'start') {
            const length = getDistance(el.start, el.end)

            el[secondPointType][x] = newCoords[x] + length * Math.cos(el.ang * Math.PI / 180)
            el[secondPointType][y] = newCoords[y] + length * Math.sin(el.ang * Math.PI / 180)
        }
    }
    setAng(el)
    updateIntersections()
}
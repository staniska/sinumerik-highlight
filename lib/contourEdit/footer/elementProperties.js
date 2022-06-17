'use babel'

import View from '../../sinumerik';
import {create_element} from "../createElement";
import {draw, setAng} from "../canvas";
import {getFrame} from "../canvas"

export const elementProperties = (el, idx) => {

    const container = View.sinumerikView.contourEditFootContainer
    if (!container.elementProperties) {
        container.elementProperties = create_element(['contourEditElementProperties'], container)
        container.elementProperties.header = create_element(['contourEditElementProperties_header'], container.elementProperties, 'ElementProperties')
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
}
const ang = (el, container, idx) => {
    const angDiv = create_element(['contourEditElementProperties_angle'], container)
    angDiv.header = create_element(['contourEditElementProperties_angleHeader'], angDiv, 'Ang:')
    angDiv.value = create_element(['contourEditElementProperties_angleValue', 'native-key-bindings'], angDiv, '', 'input')
    const {x, y} = getFrame()
    angDiv.value.value = el.ang
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
    Object.keys(el[pointType]).forEach(coord => {
        const coordDiv = create_element(['contourEditElementProperties_coord'], pointDiv.coords)
        coordDiv.axis = create_element(['contourEditElementProperties_coordName'], coordDiv, coord)
        coordDiv.value = create_element(['contourEditElementProperties_coordValue', 'native-key-bindings'], coordDiv, '', 'input')
        coordDiv.value.value = el[pointType][coord]
        coordDiv.value.addEventListener('change', () => {
            const newCoords = JSON.parse(JSON.stringify(el[pointType]))
            newCoords[coord] = parseFloat(coordDiv.value.value)

            if (el.type === 'line') changeLinePoint(el, pointType, coord, newCoords)

            el[pointType] = newCoords
            setAng(el)
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

const changeLinePoint = (el, pointType, coord, newCoords) => {
    if (el.angBlocked) {
        const secondPointType = pointType === 'start' ? 'end' : 'start'
        const secondCoord = Object.keys(el[pointType]).filter(ax => ax !== coord)[0]
        const {x} = getFrame()

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
        newCoords[secondCoord] = el[secondPointType][secondCoord] + distance * Math.pow(Math.tan(el.ang * Math.PI / 180), x === coord ? 1 : -1)

        if (pointType === 'start') {
            console.log('ddd')
        }
    }
    setAng(el)
}
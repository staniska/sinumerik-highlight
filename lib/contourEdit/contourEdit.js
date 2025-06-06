'use babel'
import {create_element} from "./createElement";
import View from '../sinumerik'
import {generateCanvas, getDistance} from "./contourEditMain";
import {generatePlanes} from "./contourEditRight";
import {generateTools} from "./tools/tools";
import {draw, updateDiamonAx} from "./canvas";
import {viewTools} from "./tools/viewTools";
import {elementProperties} from "./footer/elementProperties";
import {updateContourEditData} from "./tools/fs";
import {updateIntersections} from "./intersections";
import {generateRoundedPoints} from "./tools/canvasArea";

export const generateContourEditContainers = (view) => {
    view.contourEditFootContainer = create_element(['sinumerikContourEditFoot'], view.foot)
    view.contourEditFootContainer.style.visibility = view.contourEditVisibility

    view.contourEditMainWindow = create_element(['sinumerikContourEditMain'], view.main)
    view.contourEditMainWindow.style.visibility = view.contourEditVisibility

    view.contourEditRightContainer = create_element(['sinumerikContourEditRight'], view.right)
    view.contourEditRightContainer.style.visibility = view.contourEditVisibility

    //Create data obj
    view.contourEditData = {
        canvasFrame: {
            scale: 1,
            trans: [0, 0]
        },
        savedFrames: [],
        diamonAx: null,
        eventData: {
            action: {
                type: null,
                name: '',
                confines: [],
                reset: () => {
                    const action = View.sinumerikView.contourEditData.eventData.action
                    const buttons = Array.from(View.sinumerikView.contourEditRightContainer.querySelectorAll('button'))
                    if (action.name === 'line') {
                        buttons.filter(btn => btn.innerText === 'line')[0].click()
                    }
                    if (action.name === 'arc') {
                        buttons.filter(btn => btn.innerText === 'arc')[0].click()
                    }
                    if (action.name === 'selectArea') {
                        View.sinumerikView.contourEditRightContainer.processing.selectArea.click()
                    }

                    action.type = null
                    action.name = ''
                    action.confines = []
                    view.contourEditData.cursorPosition = elPoint()
                    view.contourEditData.eventData.creatingElement = newCreatingElement()
                }
            },
            creatingElement: newCreatingElement(),
            lastCanvasMouseMoveEvent: null
        },
        cursorPosition: elPoint(),
        cursorPositionTimestamp: 0,
        checkAreaTimestamp: 0,
        checkAreaDelay: 30,
        checkPointsTimestamp: 0,
        editContour: new CEditContour(),
        elements: {nearCursor: -1, propertyEdit: -1},
        burnedContour: [],
        points: {
            inFocus: [],
            dragging: [],
            intersection: [],
            intersectionInFocus: null,
            intersectionSelected: [],
            intersectionsAtElement: [],
            rounded: [],
            burned: [],
            processingStart: [],
            processingEnd: [],
            processingChangeStart: [],
            processingChangeEnd: [],
            reset: () => {
                const points = View.sinumerikView.contourEditData.points
                Object.keys(points).forEach(key => {
                    // console.log(key)
                    if (key === 'reset') return
                    points.key = []
                })
            }
        },
        contours: [],
        precision: 1,
        visibleActions: false,
        processingData: {
            type: null,
            startPoint: null,
            direction: null,
            reset: () => {
                const processingData = View.sinumerikView.contourEditData.processingData
                if (View.sinumerikView.contourEditData.inserter) {
                    View.sinumerikView.contourEditData.inserter.dispose()
                }
                Object.keys(processingData).forEach(key => {
                    if (key === 'reset') return
                    processingData[key] = null
                })
            }
        },
    }
}

export const newCreatingElement = () => {
    let el = {}
    el = new Proxy(el, {
        set(target, property, value) {
            const points = ['start', 'end', 'middle']
            if (points.includes(property)) {
                target[property] = elPoint()
                if (typeof value === 'object') {
                    Object.keys(value).forEach(key => {
                        target[property][key] = value[key]
                    })
                } else {
                    target[property] = value
                }
                return true
            }
            if (parseFloat(value) == value) {
                target[property] = parseFloat(value)
            } else {
                target[property] = value
            }
            return true
        }
    })
    return el

}
const elPoint = () => {
    let point = {}
    point = new Proxy(point, {
        set(target, property, value) {
            if (typeof value === 'string') {
                try {
                    if (parseFloat(value) == value) {
                        value = parseFloat(value)
                    }
                } catch (e) {

                }
            }
            target[property] = value
            return true
        }
    })
    return point
}

export class CEditContour extends Array {

    constructor(items) {
        super()
        if (items !== undefined) {
            items.forEach(item => {
                Array.prototype.push.call(this, item)
            })
        }
    }
    //region crutches for Pulsar, not calling new CEditContour with number argument
    map(f) {
        return Array.prototype.map.call(Array.from(this), f)
    }

    slice(...args) {
        return Array.prototype.slice.call(Array.from(this), ...args)
    }

    forEach(f) {
        Array.prototype.forEach.call(Array.from(this), f)
    }

    filter(f) {
        return Array.prototype.filter.call(Array.from(this), f)
    }
    //endregion

    push(item) {
        item.id = this.length
        Array.prototype.push.call(this, item)
        updateElementsIds()
        updateElementsOl()
    }

    reset() {
        while (this.length) {
            this.pop()
        }
        updateElementsOl()
    }

    del(idx) {
        //crutch for Pulsar, replacing splice
        for (let i = idx; i < (this.length - 1); i++) {
            this[i] = this[i + 1]
        }
        Array.prototype.pop.call(this)
        updateElementsIds()
        updateElementsOl()
    }
}

export const updateElementsIds = () => {
    const elements = View.sinumerikView.contourEditData.editContour
    elements.forEach((el, idx) => {
        el.id = idx
    })
}

export const updateElementsOl = () => {
    const elements_ol = document.querySelector('.editContour_elementsOl')
    while (elements_ol.children.length) {
        elements_ol.removeChild(elements_ol.lastChild)
    }
    View.sinumerikView.contourEditData.editContour.forEach((el, idx) => {
        const element_li = create_element(['editContourElement'], elements_ol, '', 'li')
        if (getDistance(el.start, el.end) < 1) {
            element_li.classList.add('editContourElement_short')
            element_li.title = 'Length less than 1'
        }

        const element_li_num = create_element(['editContourElement_num'], element_li, `${idx + 1}.`)
        const element_li_text = create_element(['editContourElement_text'], element_li, el.type)
        const element_li_remove = create_element(['contourEditButton', 'icon-trashcan', 'exclude', 'contourEditButton_small'], element_li, '', 'button')
        element_li_remove.addEventListener('click', (event) => {
            event.stopPropagation()
            elementProperties()
            View.sinumerikView.contourEditData.editContour.del(idx)
            updateIntersections()
            draw()
        })
        element_li.addEventListener('mouseenter', elementMouseEnter)
        element_li.addEventListener('click', () => {
            elements_ol.querySelectorAll('.editContourElement').forEach(el => {
                if (el.classList.contains('editContourElement_selected')) {
                    el.classList.remove('editContourElement_selected')
                }
            })
            element_li.classList.add('editContourElement_selected')
            elementProperties(el, idx)
        })
    })
}

const elementMouseEnter = (event) => {
    const el = event.target.closest('.editContourElement')
    el.addEventListener('mouseleave', elementMouseLeave)
    el.classList.add('editContourElement_highlight')
    draw()
}
const elementMouseLeave = (event) => {
    const el = event.target.closest('.editContourElement')
    el.removeEventListener('mouseleave', elementMouseLeave)
    el.classList.remove('editContourElement_highlight')
    draw()
}


export const contourEditElements = () => {

    //Canvas in main container
    const eventsRequire = generateCanvas()

    //Plane buttons
    generatePlanes()
    //Toolbar in right container
    generateTools()
    updateDiamonAx()
    viewTools()

    updateContourEditData()

    if (eventsRequire) {
        View.sinumerikView.contourEditRightContainer.addEventListener('click', event => {
            if (!event.target.classList.contains('contourEditContainerHeader')) return
            View.sinumerikView.contourEditData.eventData.action.reset()
            draw()
            Array.from(View.sinumerikView.contourEditRightContainer.querySelectorAll('.contourEditContainer'))
                .filter(container => !container.isEqualNode(event.target.closest('.contourEditContainer')))
                .forEach(container => {
                    Array.from(container.children)
                        .filter(el => !el.classList.contains('contourEditContainerHeader'))
                        .forEach(el => {
                            if (!el.classList.contains('d_none')) {
                                el.classList.add('d_none')
                            }
                        })
                })
            Array.from(
                event.target.closest('.contourEditContainer').children
            )
                .filter(el => !el.classList.contains('contourEditContainerHeader'))
                .forEach(el => el.classList.toggle('d_none'))
        })

    }
    draw()
}

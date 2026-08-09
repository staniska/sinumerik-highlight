'use babel'

import {create_element} from "../../createElement";
import View from '../../sinumerik'
import {draw} from "../canvas";
import {remove_contour, save_contours} from "./fs";
import {confirmDialog} from "../../dialog/confirm";
import {CEditContour, updateElementsOl} from "../contourEdit";
import {updateIntersections} from "../intersections";

// Grid step shown to the user per unit system. contourEditData.precision
// itself is always stored in mm (internal geometry is unit-agnostic mm),
// so inch options are converted to their mm equivalent on selection.
const PRECISION_OPTIONS = {
    metric: [1, 0.5, 0.1, 0.01],
    inch: [0.1, 0.05, 0.01, 0.001],
}

// Rebuilds the precision radio group for the active unit system. Called once
// at creation (with the element passed directly — contourTools() builds its
// DOM detached and only appends it after returning, so a querySelector from
// contourEditRightContainer would find nothing yet) and again whenever the
// contourEdit units toggle changes (no arg — by then it's attached).
export const updatePrecisionButtons = (precisionEl) => {
    const precision = precisionEl || (View.sinumerikView.contourEditRightContainer &&
        View.sinumerikView.contourEditRightContainer.querySelector('.contourEditPrecision'))
    if (!precision) return

    precision.querySelectorAll('input, label').forEach(el => el.remove())

    const units = View.sinumerikView.contourEditData.units
    const unitMult = units === 'inch' ? 25.4 : 1
    const options = units === 'inch' ? PRECISION_OPTIONS.inch : PRECISION_OPTIONS.metric

    options.forEach((value, idx) => {
        const label = `${value}${units === 'inch' ? '"' : ''}`
        const el = create_element(['contourEditRadio'], precision, 'input', label)
        el.id = label
        el.name = 'precision'
        el.label = create_element(['contourEditRadioLabel'], null, 'label', label)
        el.after(el.label)
        el.label.setAttribute('for', el.id)
        el.type = 'radio'
        if (idx === 0) {
            el.checked = true
            View.sinumerikView.contourEditData.precision = value * unitMult
        }
        el.label.addEventListener('click', () => {
            View.sinumerikView.contourEditData.precision = value * unitMult
        })
    })
}

export const contourTools = () => {
    const contourEditToolsContainer = create_element(['contourEditContainer'])
    const header = create_element(['contourEditContainerHeader'], contourEditToolsContainer, 'div', 'Contour tools')
    const editHeader = create_element(['contourEditContainer_contoursHeader'], contourEditToolsContainer)
    editHeader.innerHTML = '&#9650 Edit tools:'
    const editContainer = create_element(['contourEditContainer_edit'],contourEditToolsContainer)
    editHeader.addEventListener('click', () => {
        editContainer.classList.toggle('d_none')
        editHeader.innerHTML = editContainer.classList.contains('d_none') ? '&#9660 Edit tools:' : '&#9650 Edit tools:'
    })
    const buttonsContainer = create_element([], editContainer)
    const line = create_element(['contourEditButton'], buttonsContainer, 'button', 'line')
    const arc = create_element(['contourEditButton'], buttonsContainer, 'button', 'arc');
    const contour_name = create_element(['contourEditInput', 'native-key-bindings', 'contourName'], editContainer, 'input');
    contour_name.placeholder = 'Contour name'

    const elements = create_element(['editContour_elementsOl'], editContainer, 'ol')

    const precision = create_element(['contourEditPrecision', 'contourEditSection'], editContainer);
    precision.label = create_element(['sinumerikMachineManagerHead'], precision, 'div', 'Precision:')

    updatePrecisionButtons(precision)

    const buttons = create_element([], editContainer)
    buttons.save = create_element(['contourEditButton', 'icon-check', 'exclude'], buttons, 'button')
    buttons.save.title = 'Save contour'
    buttons.clear = create_element(['contourEditButton', 'icon-x', 'exclude'], buttons, 'button')
    buttons.clear.title = 'Clear contour'
    buttons.remove = create_element(['contourEditButton', 'icon-trashcan', 'exclude'], buttons, 'button')
    buttons.remove.title = 'Remove contour'

    buttons.save.addEventListener('click', save_contours)
    buttons.remove.addEventListener('click', () => {
        const contourName = View.sinumerikView.contourEditRightContainer.tools.contourTools.querySelector('.contourEditInput').value
        if (confirmDialog('Clear/remove contour?')) {
            View.sinumerikView.contourEditData.editContour = new CEditContour()
            View.sinumerikView.contourEditRightContainer.tools.contourTools.querySelector('.contourEditInput').value = ''
            updateElementsOl()
            remove_contour(contourName)
        }
    })
    buttons.clear.addEventListener('click', () => {
        clear_contour()
    });

    [editContainer, editHeader].forEach(el => el.classList.add('d_none'))

    line.addEventListener('click', (event) => {
        const action = View.sinumerikView.contourEditData.eventData.action
        if (action.name === 'line') {
            action.name = ''
            action.reset()
            return
        }
        action.name = 'line'
        action.type = 'create'
        if (View.sinumerikView.contourEditData.eventData.creatingElement.type === 'arc') {
            View.sinumerikView.contourEditData.eventData.creatingElement.type = 'line'
            delete View.sinumerikView.contourEditData.eventData.creatingElement.middle
        }
    });

    arc.addEventListener('click', () => {
        const action = View.sinumerikView.contourEditData.eventData.action
        if (action.name === 'arc') {
            action.name = ''
            action.reset()
            return
        }
        action.name = 'arc'
        action.type = 'create'
        if (View.sinumerikView.contourEditData.eventData.creatingElement.type === 'line') {
            View.sinumerikView.contourEditData.eventData.creatingElement.type = 'arc'
        }
    })

    //Click мимо contourEdit
    document.addEventListener('click', (event) => {
        if (View.sinumerikView.contourEditData.eventData.action.type !== null &&
            !event.target.closest('.sinumerikContourEditMain') &&
            !event.target.closest('.sinumerikContourEditRight') &&
            !event.target.closest('.sinumerikContourEditFoot')) {
            View.sinumerikView.contourEditData.eventData.action.reset()
            View.sinumerikView.contourEditRightContainer.tools.querySelectorAll('button').forEach(btn => {
                if (btn.classList.contains('btn_selected')) {
                    btn.classList.remove('btn_selected')
                }
            })

            draw()
        }
    })

    keyboardEvents(line, arc)
    return contourEditToolsContainer
}

export const clear_contour = () => {
    View.sinumerikView.contourEditData.editContour = new CEditContour()
    View.sinumerikView.contourEditRightContainer.tools.contourTools.querySelector('.contourName').value = ''
    // contour_name.value = ''
    updateElementsOl()
    draw()
}

const keyboardEvents = (line, arc) => {
    const canvas = View.sinumerikView.contourEditMainWindow.canvas

    canvas.addEventListener('mouseleave', () => {
        canvas.addEventListener('mouseenter', handleMouseEnter)
    })

    const handleMouseEnter = () => {
        canvas.removeEventListener('mouseenter', handleMouseEnter)
        canvas.focus()
    }

    canvas.addEventListener('keydown', (event) => {
        const action = View.sinumerikView.contourEditData.eventData.action
        if (event.code === 'KeyL') {
            if (action.name !== 'line') {
                line.click()
                draw()
            }
        }

        if (event.code === 'KeyA') {
            if (action.name !== 'arc') {
                arc.click()
                draw()
            }
        }

        if (event.code === 'Escape') {
            action.reset()
            View.sinumerikView.contourEditData.visibleActions = true
            updateIntersections()
            draw()
        }

        if (action.name === 'line') {
            if (event.code === 'KeyH') {
                if (action.confines.includes('horizontal')) {
                    action.confines = action.confines.filter(confine => confine !== 'horizontal')
                } else {
                    if (action.confines.includes('vertical')) {
                        action.confines = action.confines.filter(confine => confine !== 'vertical')
                    }
                    action.confines.push('horizontal')
                }
            }
            if (event.code === 'KeyV') {
                if (action.confines.includes('vertical')) {
                    action.confines = action.confines.filter(confine => confine !== 'vertical')
                } else {
                    if (action.confines.includes('horizontal')) {
                        action.confines = action.confines.filter(confine => confine !== 'horizontal')
                    }
                    action.confines.push('vertical')
                }
            }

        }
    })
}
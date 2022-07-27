'use babel'

import {create_element} from "../createElement";
import View from '../../sinumerik'
import {draw} from "../canvas";
import {remove_contour, save_contours} from "./fs";
import {confirmDialog} from "../../dialog/confirm";
import {CEditContour, updateElementsOl} from "../contourEdit";
import {updateIntersections} from "../intersections";

export const contourTools = () => {
    const contourEditToolsContainer = create_element(['contourEditContainer'])
    const header = create_element(['contourEditContainerHeader'], contourEditToolsContainer, 'Contour tools')

    const buttonsContainer = create_element([], contourEditToolsContainer)
    const line = create_element(['contourEditButton'], buttonsContainer, 'line', 'button')
    const arc = create_element(['contourEditButton'], buttonsContainer, 'arc', 'button');
    const contour_name = create_element(['contourEditInput', 'native-key-bindings'], contourEditToolsContainer, '', 'input');
    contour_name.placeholder = 'Contour name'

    const elements = create_element(['editContour_elementsOl'], contourEditToolsContainer, '', 'ol')

    const precision = create_element(['contourEditPrecision', 'contourEditSection'], contourEditToolsContainer);
    precision.label = create_element(['sinumerikMachineManagerHead'], precision, 'Precision:')

    precision.x10000 = create_element(['contourEditRadio'], precision, '10', 'input');
    precision.x1000 = create_element(['contourEditRadio'], precision, '1', 'input');
    precision.x100 = create_element(['contourEditRadio'], precision, '0.1', 'input');
    precision.x10 = create_element(['contourEditRadio'], precision, '0.01', 'input');

    precision.querySelectorAll('input').forEach((el, idx) => {
        el.id = el.textContent
        el.name = 'precision'
        el.label = create_element(['contourEditRadioLabel'], null, el.textContent, 'label')
        el.after(el.label)
        el.label.setAttribute('for', el.id)
        el.type = 'radio'
        if (idx === 1) {
            el.checked = true
            // View.sinumerikView.contourEditData.precision = 1
        }
        el.label.addEventListener('click', (event) => {
            View.sinumerikView.contourEditData.precision = parseFloat(event.target.innerText)
        })
    })

    const buttons = create_element([], contourEditToolsContainer)
    buttons.save = create_element(['contourEditButton', 'icon-check', 'exclude'], buttons, '', 'button')
    buttons.save.title = 'Save contour'
    buttons.clear = create_element(['contourEditButton', 'icon-x', 'exclude'], buttons, '', 'button')
    buttons.clear.title = 'Clear contour'
    buttons.remove = create_element(['contourEditButton', 'icon-trashcan', 'exclude'], buttons, '', 'button')
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
        View.sinumerikView.contourEditData.editContour = new CEditContour()
        contour_name.value = ''
        updateElementsOl()
        draw()
    });

    [buttonsContainer, buttons, precision, contour_name, elements].forEach(el => el.classList.add('d_none'))

    line.addEventListener('click', () => {
        View.sinumerikView.contourEditData.eventData.action.name = 'line'
        View.sinumerikView.contourEditData.eventData.action.type = 'create'
        if (View.sinumerikView.contourEditData.eventData.creatingElement.type === 'arc') {
            View.sinumerikView.contourEditData.eventData.creatingElement.type = 'line'
            delete View.sinumerikView.contourEditData.eventData.creatingElement.middle
        }
    });

    arc.addEventListener('click', () => {
        View.sinumerikView.contourEditData.eventData.action.name = 'arc'
        View.sinumerikView.contourEditData.eventData.action.type = 'create'
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
        // console.log(event.code)
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
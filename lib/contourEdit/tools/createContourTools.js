'use babel'

import {create_element} from "../../createElement";
import View from '../../sinumerik'
import {draw} from "../canvas";
import {remove_contour, save_contours} from "./fs";
import {confirmDialog} from "../../dialog/confirm";
import {alertDialog} from "../../dialog/alert";
import {
    applyFillet,
    FILLET_ACTION,
    FILLET_BUTTON_TEXT,
    registerFilletValueInput,
} from "../filletInsert";
import {CEditContour, updateElementsOl} from "../contourEdit";
import {updateIntersections} from "../intersections";
import {pushUndoSnapshot, undoContourEdit} from "../undo";

const unitMult = () => View.sinumerikView.contourEditData.units === 'inch' ? 25.4 : 1

// Trims insignificant trailing zeros, as the element properties panel does.
const formatValue = (value) => value.toFixed(4).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')

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

// The rnd/chr panel: how big, and which of the two. Hidden until the mode is
// armed, so the edit tools do not grow a field that does nothing.
//
// The value input deliberately does **not** carry the `contourEditInput` class:
// `save_contours` and the remove button read the contour name with
// `querySelector('.contourEditInput')`, which takes the first one in the panel,
// and a second holder of that class would quietly become the contour's name.
const filletPanel = (parent) => {
    const panel = create_element(['contourEditFillet', 'contourEditSection', 'd_none'], parent)
    panel.label = create_element(['sinumerikMachineManagerHead'], panel, 'div', 'Corner:')

    const modes = create_element(['contourEditFilletMode'], panel);
    [['rnd', 'RND'], ['chr', 'CHR']].forEach(([mode, label], idx) => {
        const el = create_element(['contourEditRadio'], modes, 'input')
        el.id = `filletMode_${mode}`
        el.name = 'filletMode'
        el.type = 'radio'
        el.label = create_element(['contourEditRadioLabel'], null, 'label', label)
        el.after(el.label)
        el.label.setAttribute('for', el.id)
        if (idx === 0) el.checked = true
        el.label.addEventListener('click', () => {
            View.sinumerikView.contourEditData.filletData.mode = mode
            updateFilletUnits()
        })
    })

    panel.value = create_element(['contourEditFilletValue', 'native-key-bindings'], panel, 'input')
    registerFilletValueInput(panel.value)
    panel.value.addEventListener('change', () => readFilletValue())
    panel.value.addEventListener('keydown', (event) => {
        // Nothing else in the panel answers these two, and letting them through
        // would reach Pulsar's own bindings for whatever has focus behind the
        // panel. Escape is here as well as on the canvas because the field
        // takes the focus when the mode is armed — without it, leaving the mode
        // would mean reaching for the mouse.
        if (event.key === 'Enter') {
            event.preventDefault()
            event.stopPropagation()
            panel.insert.click()
            return
        }
        if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            View.sinumerikView.contourEditData.eventData.action.reset()
            draw()
        }
    })

    panel.insert = create_element(['contourEditButton', 'exclude'], panel, 'button', 'insert')
    panel.insert.addEventListener('click', () => insertFillet())

    return panel
}

const filletElements = () => {
    const container = View.sinumerikView.contourEditRightContainer
    const panel = container && container.querySelector('.contourEditFillet')
    if (!panel) return null
    return {panel, value: panel.querySelector('.contourEditFilletValue')}
}

const showFilletPanel = (visible) => {
    const els = filletElements()
    if (!els) return
    els.panel.classList.toggle('d_none', !visible)

    // The element list goes away for as long as the mode is armed: the edit
    // tools column is narrow, and the list is the one thing in it that has no
    // part in putting a corner in. Hiding it leaves its items in the DOM, which
    // `draw()` and the list-click in `clickHandler` both read by index, so
    // neither notices. It has no collapsed state of its own to preserve.
    const elements = View.sinumerikView.contourEditRightContainer
        .querySelector('.editContour_elementsOl')
    if (elements) elements.classList.toggle('d_none', visible)

    if (visible) updateFilletUnits()
}

// Reads the size out of the input and stores it in millimetres, which is what
// the rest of contourEdit keeps its geometry in. Returns the value in mm, or
// null when the field is empty or does not hold a positive number — with the
// text left as typed, so a slip is visible rather than silently rounded away.
export const readFilletValue = () => {
    const els = filletElements()
    if (!els) return null
    const filletData = View.sinumerikView.contourEditData.filletData
    const text = els.value.value.trim()

    if (!text.length) {
        filletData.value = null
        return null
    }
    const typed = parseFloat(text.replace(',', '.'))
    if (!Number.isFinite(typed) || typed <= 0) {
        filletData.value = null
        return null
    }
    filletData.value = typed * unitMult()
    return filletData.value
}

// Called when the units toggle changes and whenever the panel is shown: the
// stored value stays the same physical size, so the text is rewritten rather
// than reinterpreted — the same rule the element properties panel follows.
export const updateFilletUnits = () => {
    const els = filletElements()
    if (!els) return
    const filletData = View.sinumerikView.contourEditData.filletData
    const units = View.sinumerikView.contourEditData.units
    els.value.placeholder =
        `${filletData.mode === 'chr' ? 'Chamfer CHR' : 'Radius'}, ${units === 'inch' ? '"' : 'mm'}`
    if (filletData.value !== null) {
        els.value.value = formatValue(filletData.value / unitMult())
    }
}

const insertFillet = () => {
    const value = readFilletValue()
    if (value === null) {
        alertDialog('Enter a positive radius or chamfer size.')
        return
    }
    applyFillet(value)
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
    const fillet_btn = create_element(['contourEditButton'], buttonsContainer, 'button', FILLET_BUTTON_TEXT)
    fillet_btn.title = 'Round or chamfer the corner between two lines'

    const fillet = filletPanel(editContainer)
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
            pushUndoSnapshot()
            View.sinumerikView.contourEditData.editContour = new CEditContour()
            View.sinumerikView.contourEditRightContainer.tools.contourTools.querySelector('.contourEditInput').value = ''
            updateElementsOl()
            remove_contour(contourName)
        }
    })
    buttons.clear.addEventListener('click', () => {
        clear_contour()
    });

    // Left open, together with the contours list below (see generateTools):
    // entering contourEdit to do nothing but open the tools was one click every
    // session. The 'Contour tools' header toggles each of its sections blindly,
    // so they all have to start in the same state or the first click on it
    // would close one and open another. Both headers already carry the
    // expanded arrow.

    line.addEventListener('click', (event) => {
        const action = View.sinumerikView.contourEditData.eventData.action
        if (action.name === 'line') {
            action.name = ''
            action.reset()
            return
        }
        action.name = 'line'
        action.type = 'create'
        showFilletPanel(false)
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
        showFilletPanel(false)
        if (View.sinumerikView.contourEditData.eventData.creatingElement.type === 'line') {
            View.sinumerikView.contourEditData.eventData.creatingElement.type = 'arc'
        }
    })

    fillet_btn.addEventListener('click', () => {
        const action = View.sinumerikView.contourEditData.eventData.action
        if (action.name === FILLET_ACTION) {
            action.name = ''
            action.reset()
            showFilletPanel(false)
            return
        }
        action.name = FILLET_ACTION
        action.type = 'create'
        // The value and the rnd/chr choice are kept between uses; only which
        // lines were picked is per-insertion.
        View.sinumerikView.contourEditData.filletData.reset()
        showFilletPanel(true)
        fillet.value.focus()
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

    keyboardEvents(line, arc, fillet_btn)
    return contourEditToolsContainer
}

export const clear_contour = () => {
    pushUndoSnapshot()
    View.sinumerikView.contourEditData.editContour = new CEditContour()
    View.sinumerikView.contourEditRightContainer.tools.contourTools.querySelector('.contourName').value = ''
    // contour_name.value = ''
    updateElementsOl()
    draw()
}

const keyboardEvents = (line, arc, fillet_btn) => {
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

        // Handled here rather than through a keymap: the canvas listener fires
        // before Pulsar's document-level one, so stopPropagation keeps ctrl-z
        // away from core:undo in the text editor. ctrl-alt-z (sinumerik.json)
        // is the fallback for when focus has left the canvas.
        if (event.ctrlKey && event.code === 'KeyZ') {
            event.preventDefault()
            event.stopPropagation()
            undoContourEdit()
            return
        }
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

        if (event.code === 'KeyR') {
            if (action.name !== FILLET_ACTION) {
                fillet_btn.click()
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
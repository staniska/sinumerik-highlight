'use babel'

import View from "../../sinumerik";
import {create_element} from "../createElement";
import {contourTools} from "./createContourTools";

export const generateTools = () => {
    if (!View.sinumerikView.contourEditRightContainer.tools) {
        View.sinumerikView.contourEditRightContainer.tools = create_element([], View.sinumerikView.contourEditRightContainer)

        View.sinumerikView.contourEditRightContainer.tools.contourTools = contourTools()
        View.sinumerikView.contourEditRightContainer.tools.appendChild(View.sinumerikView.contourEditRightContainer.tools.contourTools)
        View.sinumerikView.contourEditRightContainer.tools.querySelectorAll('button').forEach(button => {
            if (button.classList.contains('exclude')) return
            button.addEventListener('click', (event) => {
                View.sinumerikView.contourEditRightContainer.tools.querySelectorAll('button').forEach(btn => {
                    if (btn.classList.contains('btn_selected') && btn.innerText !== event.target.innerText) {
                        btn.classList.remove('btn_selected')
                    }
                    if (btn.innerText === event.target.innerText) {
                        if (btn.classList.contains('btn_selected')) {
                            btn.classList.remove('btn_selected')
                            View.sinumerikView.contourEditData.eventData.action.reset()
                        } else {
                            btn.classList.add('btn_selected')
                        }
                    }
                })
            })
        })
        View.sinumerikView.contourEditRightContainer.contoursContainer = create_element(['contourEditContainer'],View.sinumerikView.contourEditRightContainer)
        View.sinumerikView.contourEditRightContainer.contoursContainer.header = create_element(['contourEditContainerHeader'],View.sinumerikView.contourEditRightContainer.contoursContainer, 'Contours:')
        View.sinumerikView.contourEditRightContainer.contoursContainer.contours = create_element(['editContour_contoursOl'],  View.sinumerikView.contourEditRightContainer.contoursContainer, '','ol')

        View.sinumerikView.contourEditRightContainer.contoursContainer.header.addEventListener('click', () => {
            Array.from(View.sinumerikView.contourEditRightContainer.contoursContainer.header.closest('.contourEditContainer').children).forEach(el => {
                if (!el.classList.contains('contourEditContainerHeader')) {
                    el.classList.toggle('d_none')

                }
            })
        })

        View.sinumerikView.contourEditRightContainer.processing = create_element(['contourEditContainer'],View.sinumerikView.contourEditRightContainer, '')
        View.sinumerikView.contourEditRightContainer.processing.header = create_element(['contourEditContainerHeader'],View.sinumerikView.contourEditRightContainer.processing, 'Processing')
        View.sinumerikView.contourEditRightContainer.processing.header.addEventListener('click', () => {
            Array.from(View.sinumerikView.contourEditRightContainer.processing.header.closest('.contourEditContainer').children).forEach(el => {
                if (!el.classList.contains('contourEditContainerHeader')) {
                    el.classList.toggle('d_none')
                }
            })
        })
        View.sinumerikView.contourEditRightContainer.processing.selectArea = create_element(['contourEditButton'], View.sinumerikView.contourEditRightContainer.processing, 'select', 'button')
        View.sinumerikView.contourEditRightContainer.processing.selectArea.addEventListener('click', () => {
            const classList =View.sinumerikView.contourEditRightContainer.processing.selectArea.classList
            if (View.sinumerikView.contourEditData.eventData.action.type !== 'selectArea') {
                View.sinumerikView.contourEditData.eventData.action.type = 'selectArea'
                if (!classList.contains('btn_selected')) {
                    classList.add('btn_selected')
                }
                View.sinumerikView.contourEditMainWindow.canvas.addEventListener('click', selectArea)
            } else {
                View.sinumerikView.contourEditData.eventData.action.reset()
                if (classList.contains('btn_selected')) {
                    classList.remove('btn_selected')
                }
            }

        })

        const selectArea = () => {
            View.sinumerikView.contourEditRightContainer.processing.selectArea.click()
            View.sinumerikView.contourEditMainWindow.canvas.removeEventListener('click', selectArea)
            console.log(View.sinumerikView.contourEditData.points.burned)
        }

        View.sinumerikView.contourEditRightContainer.processing.ol = create_element(['editContour_contoursOl'],View.sinumerikView.contourEditRightContainer.processing, '', 'ol')
        View.sinumerikView.contourEditRightContainer.processing.ol.jopa = create_element(['editContour_contoursLi'],View.sinumerikView.contourEditRightContainer.processing.ol, 'jopa', 'li')
    }
}


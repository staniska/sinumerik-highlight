'use babel'

import View from "../../sinumerik";
import {create_element} from "../createElement";
import {contourTools} from "./createContourTools";
import {updateIntersections} from "../intersections";
import {generateRoundedPoints} from "./canvasArea";
import {createTurning} from "./turning";
import {draw} from "../canvas";

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
        View.sinumerikView.contourEditRightContainer.contoursContainer = create_element(['contourEditContainer_contours', 'd_none'], View.sinumerikView.contourEditRightContainer.tools.contourTools)
        View.sinumerikView.contourEditRightContainer.contoursContainer.header = create_element(['contourEditContainer_contoursHeader'], View.sinumerikView.contourEditRightContainer.contoursContainer)
        View.sinumerikView.contourEditRightContainer.contoursContainer.header.innerHTML = '&#9650 Contours list: '
        View.sinumerikView.contourEditRightContainer.contoursContainer.header.addEventListener('click', () => {
            Array.from(View.sinumerikView.contourEditRightContainer.contoursContainer.children).forEach(el => {
                if (el.classList.contains('contourEditContainer_contoursHeader')) return
                el.classList.toggle('d_none')
                View.sinumerikView.contourEditRightContainer.contoursContainer.header.innerHTML = el.classList.contains('d_none') ? '&#9660 Contours list: ' : '&#9650 Contours list: '
            })
        })


        View.sinumerikView.contourEditRightContainer.contoursContainer.contours = create_element(['editContour_contoursOl'], View.sinumerikView.contourEditRightContainer.contoursContainer, '', 'ol')

        View.sinumerikView.contourEditRightContainer.contoursContainer.getContours = create_element(['editContour_contoursOl'], View.sinumerikView.contourEditRightContainer.contoursContainer, 'Get elements from:', 'ol')

        View.sinumerikView.contourEditRightContainer.processing = create_element(['contourEditContainer'], View.sinumerikView.contourEditRightContainer, '')
        View.sinumerikView.contourEditRightContainer.processing.header = create_element(['contourEditContainerHeader'], View.sinumerikView.contourEditRightContainer.processing, 'Processing')

        View.sinumerikView.contourEditRightContainer.processing.selectArea = create_element(['contourEditButton', 'd_none'], View.sinumerikView.contourEditRightContainer.processing, 'select area', 'button')
        View.sinumerikView.contourEditRightContainer.processing.selectArea.addEventListener('click', () => {
            const classList = View.sinumerikView.contourEditRightContainer.processing.selectArea.classList
            if (View.sinumerikView.contourEditData.eventData.action.name !== 'selectArea') {
                View.sinumerikView.contourEditData.eventData.action.name = 'selectArea'
                View.sinumerikView.contourEditData.eventData.action.type = 'select'
                Array.from(
                    View.sinumerikView.contourEditRightContainer.processing.ol.querySelectorAll('button')
                ).forEach(btn => {
                    btn.disabled = true
                })

                if (!classList.contains('btn_selected')) {
                    classList.add('btn_selected')
                }
                View.sinumerikView.contourEditData.processingData.reset()
                View.sinumerikView.contourEditData.burnedContour.length = 0
                generateRoundedPoints()
                updateIntersections()
                draw()
                View.sinumerikView.contourEditMainWindow.canvas.addEventListener('click', selectArea)
            } else {
                View.sinumerikView.contourEditData.eventData.action.reset()
                if (classList.contains('btn_selected')) {
                    classList.remove('btn_selected')
                }
                View.sinumerikView.contourEditMainWindow.canvas.removeEventListener('click', selectArea)
            }

        })

        const selectArea = () => {
            View.sinumerikView.contourEditRightContainer.processing.selectArea.click()
            View.sinumerikView.contourEditMainWindow.canvas.removeEventListener('click', selectArea)
            if (View.sinumerikView.contourEditData.burnedContour.length) {
                Array.from(
                    View.sinumerikView.contourEditRightContainer.processing.ol.querySelectorAll('button')
                ).forEach(btn => {
                    btn.disabled = false
                })
            }

        }

        View.sinumerikView.contourEditRightContainer.processing.ol = create_element(['editContour_contoursOl', 'd_none'], View.sinumerikView.contourEditRightContainer.processing, '', 'ol')
        View.sinumerikView.contourEditRightContainer.processing.ol.turning = create_element(['processing_Li'], View.sinumerikView.contourEditRightContainer.processing.ol, '', 'li')
        View.sinumerikView.contourEditRightContainer.processing.ol.turning.btn = create_element(['contourEditButton'], View.sinumerikView.contourEditRightContainer.processing.ol.turning, 'turning', 'button')
        View.sinumerikView.contourEditRightContainer.processing.ol.turning.btn.disabled = true
        View.sinumerikView.contourEditRightContainer.processing.ol.turning.btn.addEventListener('click', () => {
            View.sinumerikView.contourEditData.processingData.reset()
            View.sinumerikView.contourEditData.points.processingStart.length = 0
            View.sinumerikView.contourEditData.points.processingEnd.length = 0
            createTurning()
        })
        View.sinumerikView.contourEditRightContainer.processing.reset = create_element(['contourEditButton', 'icon-x', 'd_none'], View.sinumerikView.contourEditRightContainer.processing, '', 'button')
        View.sinumerikView.contourEditRightContainer.processing.reset.title = 'Remove processing data from canvas'
        View.sinumerikView.contourEditRightContainer.processing.reset.addEventListener('click', () => {
            View.sinumerikView.contourEditData.processingData.reset()
            const points = View.sinumerikView.contourEditData.points
            points.processingEnd.length = 0
            points.processingStart.length = 0
            points.processingChangeStart.length = 0
            points.processingChangeEnd.length = 0

            View.sinumerikView.contourEditData.burnedContour = []
        })
    }
}


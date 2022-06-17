'use babel'

import View from "../../sinumerik";
import {create_element} from "../createElement";
import {contourTools} from "./createContourTools";
import {changeCursor} from "../canvas";
import {viewTools} from "./viewTools";

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

        View.sinumerikView.contourEditRightContainer.contoursContainer.header.addEventListener('click', event => {
            Array.from(View.sinumerikView.contourEditRightContainer.contoursContainer.header.closest('.contourEditContainer').children).forEach(el => {
                if (!el.classList.contains('contourEditContainerHeader')) {
                    el.classList.toggle('d_none')

                }
            })
        });
    }
}


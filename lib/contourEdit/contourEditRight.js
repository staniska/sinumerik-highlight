'use babel'
import View from '../sinumerik'
import {create_element} from "./createElement";
import {alertDialog} from "../dialog/alert";
import {draw, updateDiamonAx} from "./canvas";
import {CEditContour, updateElementsOl} from "./contourEdit";
import {updateIntersections} from "./intersections";



export const generatePlanes = () => {
    if (View.sinumerikView.contourEditRightContainer.planes) return
    View.sinumerikView.contourEditRightContainer.planes = create_element(['contourEditPlane'], View.sinumerikView.contourEditRightContainer);
    ['G17', 'G18', 'G19'].forEach(plane => {
        View.sinumerikView.contourEditRightContainer.planes[plane] = create_element(
            ['contourEditPlaneButton'],
            View.sinumerikView.contourEditRightContainer.planes,
            plane,
            'button')
        View.sinumerikView.contourEditRightContainer.planes[plane].addEventListener('click', (event) => {
            View.sinumerikView.contourEditData.plane = selectPlane(event.target.innerText)
            updateDiamonAx()
            View.sinumerikView.contourEditData.eventData.action.reset()
            View.sinumerikView.contourEditData.editContour = new CEditContour()
            updateElementsOl()
            View.sinumerikView.contourEditData.points.reset()
            updateIntersections()
            draw()
        })
    })
    View.sinumerikView.contourEditData.plane = selectPlane()
    updateDiamonAx()
}

export const selectPlane = (plane) => {
    const planes = {G17: ['X', 'Y'], G18: ['Z', 'X'], G19: ['Y', 'Z']}
    let reverse = false
    let verticalOrientation = false
    const Editor = atom.workspace.getActiveTextEditor()
    const fileName = Editor.getTitle().replace(/\./g,'_').toUpperCase()

    if (!plane) {

        try {
            if (View.sinumerikView.programmData[fileName].machine.machineType === 'Lathe') {
                plane = 'G18'
            } else {
                plane = 'G17'
            }
        } catch (e) {
            alertDialog(`No machine tool found in the program "${Editor.getTitle()}"`)
            plane = 'G18'
        }
    }

    if (plane === 'G18') {
        try {
            if (View.sinumerikView.programmData[fileName].machine.machineType === 'Lathe') {
                if (View.sinumerikView.programmData[fileName].machine.subType === 'Horizontal' &&
                    View.sinumerikView.programmData[fileName].machine.firstCarriage.position === 'Front'
                ) {
                    reverse = true
                }
                if (View.sinumerikView.programmData[fileName].machine.subType === 'Vertical') {
                    verticalOrientation = true
                    if (View.sinumerikView.programmData[fileName].machine.firstCarriage.position === 'Rear') {
                        reverse = true
                    }
                }
            }
        } catch (e) {

        }

    }



    Object.keys(planes).forEach(button => {
        const buttonEl = View.sinumerikView.contourEditRightContainer.planes[button]
        if (buttonEl.classList.contains('contourEditPlaneButtonSelected')) {
            buttonEl.classList.remove('contourEditPlaneButtonSelected')
        }
        if (plane === button) {
            buttonEl.classList.add('contourEditPlaneButtonSelected')
        }
    })


    const axes = planes[plane]

    if (['["X","Y"]', '["Y","Z"]'].includes(JSON.stringify(axes))) {
        return {
            abscissa: {
                name: axes[0],
                reverse: false
            },
            ordinate: {
                name: axes[1],
                reverse: false
            }
        }
    }
    if (JSON.stringify(axes) === '["Z","X"]') {
        return {
            abscissa: {
                name: verticalOrientation ? 'X' : 'Z',
                reverse: verticalOrientation ? (reverse) : false
            },
            ordinate: {
                name: verticalOrientation ? 'Z' : 'X',
                reverse: verticalOrientation ? false : (reverse)
            }
        }
    }
}
'use babel'
import View from '../sinumerik'
import {create_element} from "../createElement";
import {alertDialog} from "../dialog/alert";
import {draw, updateDiamonAx} from "./canvas";
import {CEditContour, updateElementsOl} from "./contourEdit";
import {updateIntersections} from "./intersections";
import {normalizeFileName} from "../utils";
import {updatePrecisionButtons} from "./tools/createContourTools";



export const generatePlanes = () => {
    if (View.sinumerikView.contourEditRightContainer.planes) return
    View.sinumerikView.contourEditRightContainer.planes = create_element(['contourEditPlane'], View.sinumerikView.contourEditRightContainer);

    View.sinumerikView.contourEditRightContainer.planes.select = document.createElement('select');
    ['G17', 'G18', 'G19'].forEach(plane => {
        const option = document.createElement('option');
        option.value = plane;
        option.text = plane;
        View.sinumerikView.contourEditRightContainer.planes.select.appendChild(option);
    })
    View.sinumerikView.contourEditRightContainer.planes.select.addEventListener('change', (event) => {
        View.sinumerikView.contourEditData.plane = selectPlane(event.target.value)
        updateDiamonAx()
        View.sinumerikView.contourEditData.eventData.action.reset()
        View.sinumerikView.contourEditData.editContour = new CEditContour()
        updateElementsOl()
        View.sinumerikView.contourEditData.points.reset()
        updateIntersections()
        draw()
    })
    View.sinumerikView.contourEditRightContainer.planes.appendChild(View.sinumerikView.contourEditRightContainer.planes.select)

    View.sinumerikView.contourEditRightContainer.planes.unitsSelect = document.createElement('select');
    ['metric', 'inch'].forEach(unit => {
        const option = document.createElement('option');
        option.value = unit;
        option.text = unit;
        View.sinumerikView.contourEditRightContainer.planes.unitsSelect.appendChild(option);
    })
    View.sinumerikView.contourEditRightContainer.planes.unitsSelect.addEventListener('change', (event) => {
        View.sinumerikView.contourEditData.units = selectUnits(event.target.value)
        updatePrecisionButtons()
        draw()
    })
    View.sinumerikView.contourEditRightContainer.planes.appendChild(View.sinumerikView.contourEditRightContainer.planes.unitsSelect)

    View.sinumerikView.contourEditData.plane = selectPlane()
    View.sinumerikView.contourEditData.units = selectUnits()
    updateDiamonAx()
}

// Mirrors selectPlane(): with no argument, defaults from the active
// file's machine (fallback metric); with an argument, just applies it.
// Called again on every editor switch (see sinumerik-view.js) so the
// toggle re-syncs with whichever machine the newly active file uses.
export const selectUnits = (units) => {
    if (!units) {
        const Editor = atom.workspace.getActiveTextEditor()
        const fileName = Editor && Editor.getPath()
        try {
            units = View.sinumerikView.programmData[fileName].machine.units === 'inch' ? 'inch' : 'metric'
        } catch (e) {
            units = 'metric'
        }
    }
    View.sinumerikView.contourEditRightContainer.planes.unitsSelect.value = units
    return units
}

export const selectPlane = (plane) => {
    const planes = {G17: ['X', 'Y'], G18: ['Z', 'X'], G19: ['Y', 'Z']}
    let reverse = false
    let verticalOrientation = false
    const Editor = atom.workspace.getActiveTextEditor()
    const fileName = Editor.getPath()

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



    View.sinumerikView.contourEditRightContainer.planes.select.value = plane


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
'use babel'

import View from '../../sinumerik'
import {CEditContour, updateElementsOl} from "../contourEdit";
import {alertDialog} from "../../dialog/alert";
import {confirmDialog} from "../../dialog/confirm";
import {create_element} from "../createElement";
import {draw} from "../canvas";
import {updateIntersections} from "../intersections";

const fs = require('fs')
const fsPromises = fs.promises

export const updateContourEditData = () => {
    if (View.sinumerikView.contourEditData) {
        View.sinumerikView.contourEditData.contours = load_contours()
    }

    const contoursOl = View.sinumerikView.contourEditRightContainer.contoursContainer.contours
    while (contoursOl.children.length) {
        contoursOl.removeChild(contoursOl.lastChild)
    }
    View.sinumerikView.contourEditData.contours.forEach(contour => {

        const el = create_element(['editContour_contoursLi'], contoursOl, contour.name, 'li')
        el.addEventListener('click', () => {
            contoursOl.querySelectorAll('.editContour_contoursLi').forEach(li => {
                if (li.classList.contains('editContour_contoursLi__selected')) {
                    li.classList.remove('editContour_contoursLi__selected')
                }
            })
            el.classList.add('editContour_contoursLi__selected')
            Array.from(View.sinumerikView.contourEditRightContainer.planes
                .querySelectorAll('.contourEditPlaneButton'))
                .filter(button => button.innerText === contour.plane)[0].click()
            View.sinumerikView.contourEditData.editContour = new CEditContour(JSON.parse(JSON.stringify(Array.from(contour.elements))))
            updateIntersections()
            View.sinumerikView.contourEditRightContainer.tools.contourTools.querySelector('.contourEditInput').value = contour.name
            updateElementsOl()
            draw()
        })
    })

}

export const load_contours = () => {
    const Editor = atom.workspace.getActiveTextEditor()
    const {contoursPath} = getPath()

    const fileName = Editor.getTitle().replace(/\./g, '_').toUpperCase()

    if (!fs.existsSync(contoursPath) ||
        !fs.readFileSync(contoursPath, 'utf8').length ||
        JSON.parse(fs.readFileSync(contoursPath, 'utf8'))[fileName] === undefined
    ) return []

    return JSON.parse(fs.readFileSync(contoursPath, 'utf8'))[fileName]
        .map(contour => {
            return {
                ...contour,
                elements: new CEditContour(contour.elements)
            }
        })
}

const getPath = () => {
    const Editor = atom.workspace.getActiveTextEditor()
    let dirPath = Editor.getPath()
    let pathSeparator = '/'
    if (dirPath.match(':')) {
        pathSeparator = '\\'
    }
    dirPath = dirPath.substring(0, dirPath.lastIndexOf('/'))
    const contoursPath = dirPath + pathSeparator + 'contours.json'
    return {dirPath, contoursPath, pathSeparator}
}

export const save_contours = () => {
    const contourName = View.sinumerikView.contourEditRightContainer.tools.contourTools.querySelector('.contourEditInput').value

    if (!contourName.length) {
        alertDialog('Contour name is empty!')
        return
    }

    const contourEditData = View.sinumerikView.contourEditData

    if (contourEditData.contours.filter(contour => contour.name === contourName).length) {
        if (!confirmDialog(`Contour '${contourName}' already exists. Replace it?`)) {
            return
        }
    }

    contourEditData.contours = [
        ...contourEditData.contours
            .filter(cont => cont.name !== contourName)
            .map(cont => {
                return {
                    ...cont,
                    elements: Array.from(cont.elements)
                }
            }),
        {
            name: contourName,
            plane: View.sinumerikView.contourEditRightContainer.planes.querySelector('.contourEditPlaneButtonSelected').innerText,
            elements: Array.from(contourEditData.editContour)
        }
    ]

    save()
}

export const remove_contour = (contourName) => {
    const contourEditData = View.sinumerikView.contourEditData
    contourEditData.contours = [
        ...contourEditData.contours
            .filter(cont => cont.name !== contourName)
            .map(cont => {
                return {
                    ...cont,
                    elements: Array.from(cont.elements)
                }
            })
    ]

    save()
}

const save = () => {
    const Editor = atom.workspace.getActiveTextEditor()
    const fileName = Editor.getTitle().replace(/\./g, '_').toUpperCase()

    const contourEditData = View.sinumerikView.contourEditData
    const {contoursPath} = getPath()
    let savedContours = {}
    if (fs.existsSync(contoursPath) && fs.readFileSync(contoursPath, 'utf8').length) {
        savedContours = JSON.parse(fs.readFileSync(contoursPath, 'utf8'))
    }

    savedContours = {
        ...savedContours,
        [fileName]: contourEditData.contours
    }

    fsPromises
        .writeFile(contoursPath, JSON.stringify(savedContours))
        .then(() => {
            load_contours()
            updateContourEditData()
        })
        .catch(e => {
            console.log(e)
        })

}

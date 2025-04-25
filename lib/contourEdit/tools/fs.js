'use babel'

import View from '../../sinumerik'
import {CEditContour, updateElementsOl} from "../contourEdit";
import {alertDialog} from "../../dialog/alert";
import {confirmDialog} from "../../dialog/confirm";
import {create_element} from "../createElement";
import {draw, getFrame, setAng} from "../canvas";
import {updateIntersections} from "../intersections";
import {handleNormalize} from "./viewTools";
import {changeRadius} from "../footer/elementProperties";
import {getDistance} from "../contourEditMain";

const fs = require('fs')
const fsPromises = fs.promises
const {dialog} = require("electron").remote;


export const updateContourEditData = () => {
    const fileName = atom.workspace.getActiveTextEditor().getTitle().replace(/\./g, '_').toUpperCase()

    if (View.sinumerikView.contourEditData) {
        View.sinumerikView.contourEditData.contours = load_contours()
    }
    const blankName = View.sinumerikView.programmData[fileName].blank.name
    const contourName = View.sinumerikView.programmData[fileName].contour.name
    while (View.sinumerikView.contourEditRightContainer.contoursContainer.getContours.children.length) {
        View.sinumerikView.contourEditRightContainer.contoursContainer.getContours.lastChild.remove()
    }
    Object.keys(View.sinumerikView.parseData.contourElements).filter(k => k === (blankName + '_MPF') || k === (contourName + '_MPF')).forEach(k => {
        View.sinumerikView.contourEditRightContainer.contoursContainer.getContours[k] =
            create_element(
                ['editContour_foldersLi'],
                View.sinumerikView.contourEditRightContainer.contoursContainer.getContours,
                k,
                'li'
            )
        View.sinumerikView.contourEditRightContainer.contoursContainer.getContours[k].addEventListener('click', (e) => {
            const contour = View.sinumerikView.parseData.contourElements[k]
            if (View.sinumerikView.contourEditData.editContour.filter(el => el?.sourceFile === k).length) {
                while (View.sinumerikView.contourEditData.editContour.filter(el => el?.sourceFile === k).length) {
                    View.sinumerikView.contourEditData.editContour.del(View.sinumerikView.contourEditData.editContour.findIndex(el => el?.sourceFile === k))
                }
            } else {
                contour.slice(1).forEach(el => {
                    const element = elementsProcess(el, k)
                    if (getDistance(element.end, element.start) !== 0) {
                        View.sinumerikView.contourEditData.editContour.push(element)
                    }
                })
            }
            updateIntersections()
            handleNormalize()
            draw()
        })
    })

    if (View.sinumerikView.contourEditRightContainer.contoursContainer === undefined) return

    const contoursOl = View.sinumerikView.contourEditRightContainer.contoursContainer.contours
    while (contoursOl.children.length) {
        contoursOl.removeChild(contoursOl.lastChild)
    }

    if (!View.sinumerikView.contourEditData.contours.filter(c => c.filename === fileName).length) {
        View.sinumerikView.contourEditData.contours.push({filename: fileName, contours: []})
    }
    View.sinumerikView.contourEditData.contours.forEach(contours => {
        const folderLi = create_element(['editContour_foldersLi'], contoursOl, contours.filename.slice(0, contours.filename.length - 4), 'li')
        const foldersLiIcon = create_element(['icon-plus'], folderLi, '', 'div')
        foldersLiIcon.id = 'folderIcon'
        foldersLiIcon.style.position = 'absolute'
        foldersLiIcon.style.right = 0
        foldersLiIcon.style.top = '4px'


        const folderOl = create_element(['editContour_foldersOl'], folderLi, '', 'ol')
        folderOl.style.display = fileName === contours.filename ? 'block' : 'none'
        foldersLiIcon.className = folderOl.style.display === 'none' ? 'icon-plus' : 'icon-dash'

        folderLi.addEventListener('click', (e) => {
            if (e.target.classList.contains('editContour_foldersLi')) {
                folderOl.style.display = ['none', 'block'].filter(d => d !== folderOl.style.display)[0]
                foldersLiIcon.className = folderOl.style.display === 'none' ? 'icon-plus' : 'icon-dash'
            }
        })


        contours.contours.forEach(contour => {
            const el = create_element(['editContour_contoursLi'], folderOl, contour.name, 'li')
            el.filename = contours.filename
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
                handleNormalize()
                draw()
            })
        })
    })
}

const elementsProcess = (el, sourceFile) => {
    if (el.type === 'arc') {
        const respEl = {
            type: 'arc',
            start: {X: el.start[0], Y: el.start[1], Z: el.start[2]},
            center: {X: el.center[0], Y: el.center[1], Z: el.center[2]},
            end: {X: el.end[0], Y: el.end[1], Z: el.end[2]},
            radius: el.radius,
            ccw: el.ccw,
            sourceFile
        }
        return changeRadius(respEl, respEl.radius, true)
    }
    if (el.type === 'line') {
        const respEl = {
            type: 'line',
            start: {X: el.start[0], Y: el.start[1], Z: el.start[2]},
            end: {X: el.end[0], Y: el.end[1], Z: el.end[2]},
            angBlocked: false,
            sourceFile
        }
        setAng(respEl)
        return respEl
    }
}

export const load_contours = () => {
    const Editor = atom.workspace.getActiveTextEditor()
    const {contoursPath} = getPath()

    const fileName = Editor.getTitle().replace(/\./g, '_').toUpperCase()

    if (!fs.existsSync(contoursPath) ||
        !fs.readFileSync(contoursPath, 'utf8').length
        // || JSON.parse(fs.readFileSync(contoursPath, 'utf8'))[fileName] === undefined
    ) return []


    const json = JSON.parse(fs.readFileSync(contoursPath, 'utf8'))
    const contours = Object.keys(json).map(f => ({
        filename: f,
        contours: json[f].map(c => ({...c, elements: new CEditContour(c.elements)}))
    })).flat()
    return contours

    // return JSON.parse(fs.readFileSync(contoursPath, 'utf8'))[fileName]
    //     .map(contour => {
    //         return {
    //             ...contour,
    //             elements: new CEditContour(contour.elements)
    //         }
    //     })
}

export const getPath = (filename) => {
    if (!filename) {
        filename = 'contours.json'
    }
    const Editor = atom.workspace.getActiveTextEditor()
    let dirPath = Editor.getPath()
    let pathSeparator = '/'
    if (dirPath.match(':')) {
        pathSeparator = '\\'
    }
    dirPath = dirPath.substring(0, dirPath.lastIndexOf(pathSeparator))
    const contoursPath = dirPath + pathSeparator + filename
    return {dirPath, contoursPath, pathSeparator}
}

export const save_contours = () => {
    let fileName = atom.workspace.getActiveTextEditor().getTitle().replace(/\./g, '_').toUpperCase()
    const contourName = View.sinumerikView.contourEditRightContainer.tools.contourTools.querySelector('.contourEditInput').value
    const selectedContour = View.sinumerikView.contourEditRightContainer.contoursContainer.contours.querySelector('.editContour_contoursLi__selected')
    const selectedContourFileName = selectedContour ? selectedContour.filename : null
    const selectedContourName = selectedContour ? selectedContour.innerText : null

    if (selectedContourFileName !== fileName && contourName === selectedContourName) {
        if (confirmDialog(`Replace contour '${contourName}' for ${selectedContourFileName} ?`)) {
            fileName = selectedContourFileName
        }
    }

    if (!contourName.length) {
        alertDialog('Contour name is empty!')
        return
    }

    const contourEditData = View.sinumerikView.contourEditData
    // if (contourEditData.contours.filter) {}

    if (contourEditData.contours
        .filter(c => c.filename === fileName)[0].contours
        .filter(contour => contour.name === contourName).length) {
        if (!confirmDialog(`Contour '${contourName}' already exists. Replace it?`)) {
            return
        }
    }

    contourEditData.contours = [
        ...contourEditData.contours
            .filter(c => c.filename !== fileName),
        {
            filename: fileName,
            contours: [
                ...contourEditData.contours
                    .filter(c => c.filename === fileName)[0].contours
                    .filter(c => c.name !== contourName),
                {
                    name: contourName,
                    plane: View.sinumerikView.contourEditRightContainer.planes.querySelector('.contourEditPlaneButtonSelected').innerText,
                    elements: Array.from(contourEditData.editContour)
                }
            ]
        }
    ]

    save()
}

export const remove_contour = (contourName) => {
    let fileName = atom.workspace.getActiveTextEditor().getTitle().replace(/\./g, '_').toUpperCase()
    const selectedContour = View.sinumerikView.contourEditRightContainer.contoursContainer.contours.querySelector('.editContour_contoursLi__selected')
    const selectedContourFileName = selectedContour ? selectedContour.filename : null

    if (fileName !== selectedContourFileName) {
        if (!confirmDialog(`Remove contour ${contourName} from ${selectedContourFileName} ?`)) return
    }

    const contourEditData = View.sinumerikView.contourEditData
    contourEditData.contours = [
        ...contourEditData.contours.filter(c => c.filename !== selectedContourFileName),
        {
            filename: selectedContourFileName,
            contours: [
                ...contourEditData.contours
                    .filter(c => c.filename === selectedContourFileName)[0].contours
                    .filter(c => c.name !== contourName),
            ]
        }
    ].filter(c => c.contours.length)
    // contourEditData.contours = [
    //     ...contourEditData.contours
    //         .filter(cont => cont.name !== contourName)
    //         .map(cont => {
    //             return {
    //                 ...cont,
    //                 elements: Array.from(cont.elements)
    //             }
    //         })
    // ]

    save()
}

const save = () => {
    // const Editor = atom.workspace.getActiveTextEditor()
    // const fileName = Editor.getTitle().replace(/\./g, '_').toUpperCase()
    //
    // const contourEditData = View.sinumerikView.contourEditData
    const {contoursPath} = getPath()
    // let savedContours = {}
    // if (fs.existsSync(contoursPath) && fs.readFileSync(contoursPath, 'utf8').length) {
    //     savedContours = JSON.parse(fs.readFileSync(contoursPath, 'utf8'))
    // }
    //
    // savedContours = {
    //     ...savedContours,
    //     [fileName]: contourEditData.contours
    // }
    const formattedContours = Object.fromEntries(View.sinumerikView.contourEditData.contours.map(c => [c.filename, c.contours]))

    fsPromises
        .writeFile(contoursPath, JSON.stringify(formattedContours))
        .then(() => {
            load_contours()
            updateContourEditData()
        })
        .catch(e => {
            console.log(e)
        })

}

export const createFileFromArea = () => {

    // console.log('createFileFrom Area')
    // console.log(View.sinumerikView.contourEditData.burnedContour)
    const {dirPath, pathSeparator} = getPath()
    const dialogOptions = {title: 'Create file from selected area', defaultPath: dirPath}
    let path
    try {
        path = dialog.showSaveDialogSync(dialogOptions)
    } catch (e) {
        path = dialog.showSaveDialog(dialogOptions)
    }
    if (path) {
        if (path.indexOf('.', path.lastIndexOf(pathSeparator)) < 1) {
            path += '.MPF'
        }
        const {x, y} = getFrame()
        const fileText = []

        const contour = View.sinumerikView.contourEditData.burnedContour

        const firstEl = contour[0]
        let lastPoint = firstEl.start
        fileText.push(`G0 ${x}${coordMult(lastPoint, x)} ${y}${coordMult(lastPoint, y)}`)
        contour.forEach((el, idx) => {
            if (el.type === 'line') {
                const point = getDistance(el.end, lastPoint) < 1e-5 ? el.start : el.end
                fileText.push(`G1 ${x}${coordMult(point, x)} ${y}${coordMult(point, y)}`)
                lastPoint = point
            } else {
                const point = getDistance(el.end, lastPoint) < 1e-5 ? el.start : el.end
                const reverse = getDistance(el.end, lastPoint) < 1e-5 ? 1 : 0
                fileText.push(`G${el.ccw ? 3 - reverse : 2 + reverse} ${x}${coordMult(point, x)} ${y}${coordMult(point, y)} CR=${fixFlat(el.radius)}`)
                lastPoint = point
            }
        })
        fileText.push('M30')
        fsPromises
            .writeFile(path, fileText.join('\n'))
            .then(() => {
                alertDialog(`Area contour saved as ${path.slice(path.lastIndexOf(pathSeparator) + 1)}`)
            })
            .catch(e => {
                console.log(e)
            })
    }
}

const coordMult = (p, axis) => {
    let value = p[axis]
    if (View.sinumerikView.parseData.diamon === 1 && axis === 'X') {
        value *= 2
    }
    return fixFlat(value)
}

const fixFlat = (num) => {
    return parseFloat(
        num
            .toFixed(3)
            .toString()
            .replaceAll(/0+(?=\s)/g, "")
            .replaceAll(/\.(?=\s)/g, "")
    )
}
'use babel';

import View from './sinumerik'
import sinumerikMath from "./degreesMath";
import {replacements} from "./replacements";
import {insertRnd, insertChr} from './element-insert';

const myMath = new sinumerikMath();
const axes = {
    'G17': ['X', 'Y'],
    'G18': ['Z', 'X'],
    'G19': ['Y', 'Z']
}

export default function offn() {
    console.log('OFFN')

    //TODO сделать эквидистанту из элементов.
    const CanvasArray = View.sinumerikView.parseData.canvas

    let NewElements = []

    CanvasArray.forEach((element,index) => {
        if (!element.type.match(/G[01]/)) {
            return
        }
        if (index > 0) {
            if (element.toolRadiusCompensation.match(/G4[12]/)) {
                if (CanvasArray[index - 1].toolRadiusCompensation === 'G40') {
                    element.toolRadiusCompensation = 'Approach'
                }
            } else {
                if (CanvasArray[index - 1].toolRadiusCompensation.match(/G4[12]/)) {
                    element.toolRadiusCompensation = 'Departure'
                }
            }
        }

        element.offn_enable = element.toolRadiusCompensation.match(/G4[12]/) ? true : false

        if (element.offn_enable && element.offn !== 0) {
            let element_ang = myMath.atan2((element[axes[element.workPlane][1]] - element[`${axes[element.workPlane][1]}_start`]),
                (element[axes[element.workPlane][0]] - element[`${axes[element.workPlane][0]}_start`]))
            let offset_ang = element_ang + 90 * (element.toolRadiusCompensation === 'G41' ? 1 : -1)

            element[axes[element.workPlane][0]] += element.offn * myMath.cos(offset_ang)
            element[axes[element.workPlane][1]] += element.offn * myMath.sin(offset_ang)
            element[`${axes[element.workPlane][0]}_start`] += element.offn * myMath.cos(offset_ang)
            element[`${axes[element.workPlane][1]}_start`] += element.offn * myMath.sin(offset_ang)

            const prev_element = CanvasArray[index - 1]
            if (prev_element.workPlane === element.workPlane && prev_element.toolRadiusCompensation.match(/G4[12]/)) {

                //Проверка пересечения предыдущего элемента
                let prev_element_ang = myMath.atan2((prev_element[axes[element.workPlane][1]] - prev_element[`${axes[element.workPlane][1]}_start`]),
                    (prev_element[axes[element.workPlane][0]] - prev_element[`${axes[element.workPlane][0]}_start`]))

                //y-y1 = tan1 * (x-x1)
                //y-y2 = tan2 * (x-x2)
                //y2-y1 = tan1*x-tan1*x1 - tan2*x + tan2 * x2
                //x = (y2-y1+tan1*x1 - tan2*x2) / (tan1 - tan2)



                // console.log(element_ang , prev_element_ang)
                if (element_ang !== prev_element_ang) {

                    let intersection = (element[axes[element.workPlane][1]] -
                        prev_element[axes[element.workPlane][1]] +
                        myMath.tan(prev_element_ang) * prev_element[axes[element.workPlane][0]] -
                        myMath.tan(element_ang) * element[axes[element.workPlane][0]]) /
                        (myMath.tan(prev_element_ang) - myMath.tan(element_ang))

                    let intersection2
                    if (Math.abs(myMath.tan(element_ang)) < 1e10 ) {
                        intersection2 = element[`${axes[element.workPlane][1]}_start`] +
                            myMath.tan(element_ang) * (intersection - element[`${axes[element.workPlane][0]}_start`])
                    } else {
                        intersection2 = prev_element[`${axes[element.workPlane][1]}_start`] +
                            myMath.tan(prev_element_ang) * (intersection - prev_element[`${axes[element.workPlane][0]}_start`])
                    }

                    if (
                        (intersection > Math.min(element[axes[element.workPlane][0]], element[`${axes[element.workPlane][0]}_start`]) &&
                            intersection < Math.max(element[axes[element.workPlane][0]], element[`${axes[element.workPlane][0]}_start`])) ||
                        (
                            intersection2 > Math.min(element[axes[element.workPlane][1]], element[`${axes[element.workPlane][1]}_start`]) &&
                            intersection2 < Math.max(element[axes[element.workPlane][1]], element[`${axes[element.workPlane][1]}_start`])
                        )
                    ) {

                        // y-y1 = tan * (x-X1)
                        // y = tan*(x-X1) + y1

                        element[`${axes[element.workPlane][0]}_start`] = intersection
                        element[`${axes[element.workPlane][1]}_start`] = intersection2

                        prev_element[axes[element.workPlane][0]] = intersection
                        prev_element[axes[element.workPlane][1]] = intersection2

                        // let new_element_ang = myMath.atan2((element[axes[element.workPlane][1]] - element[`${axes[element.workPlane][1]}_start`]),
                        //     (element[axes[element.workPlane][0]] - element[`${axes[element.workPlane][0]}_start`]))

                    }
                }

                //Проверка сопряджения лини с предыдущим элементом

                const distance = Math.sqrt((element[`${axes[element.workPlane][0]}_start`] - prev_element[axes[element.workPlane][0]]) ** 2 +
                    (element[`${axes[element.workPlane][1]}_start`] - prev_element[axes[element.workPlane][1]]) ** 2)

                if (distance > 1e-5) {

                    let insert_element = {...element}
                    axes[insert_element.workPlane].forEach((axis) => {
                        insert_element[axis] = insert_element[`${axis}_start`]
                        insert_element[`${axis}_start`] = prev_element[axis]
                    })
                    insert_element.toolRadiusCompensation = 'AutoInsert'
                    NewElements.push({'index': index, element: insert_element})

                }

                //Выявление петли

                if (prev_element.offn_enable) {
                    let prev_index = index - 2
                    let prev2_element = CanvasArray[prev_index]
                    while (prev_index > 0 && prev2_element.toolRadiusCompensation !== 'Approach') {

                        if (prev2_element.type === 'G1' && prev2_element.offn_enable) {
                            let prev2_element_ang = myMath.atan2((prev2_element[axes[element.workPlane][1]] - prev2_element[`${axes[element.workPlane][1]}_start`]),
                                (prev2_element[axes[element.workPlane][0]] - prev2_element[`${axes[element.workPlane][0]}_start`]))
                            let prev_intersection = (element[axes[element.workPlane][1]] -
                                prev2_element[axes[element.workPlane][1]] +
                                myMath.tan(prev2_element_ang) * prev2_element[axes[element.workPlane][0]] -
                                myMath.tan(element_ang) * element[axes[element.workPlane][0]]) /
                                (myMath.tan(prev2_element_ang) - myMath.tan(element_ang))

                            let prev_intersection2
                            if (Math.abs(myMath.tan(element_ang)) < 1e10 ) {
                                prev_intersection2 = element[`${axes[element.workPlane][1]}_start`] +
                                    myMath.tan(element_ang) * (prev_intersection - element[`${axes[element.workPlane][0]}_start`])
                            } else {
                                prev_intersection2 = prev2_element[`${axes[element.workPlane][1]}_start`] +
                                    myMath.tan(prev2_element_ang) * (prev_intersection - prev2_element[`${axes[element.workPlane][0]}_start`])
                            }

                            if (((prev_intersection > Math.min(element[axes[element.workPlane][0]], element[`${axes[element.workPlane][0]}_start`]) &&
                                prev_intersection < Math.max(element[axes[element.workPlane][0]], element[`${axes[element.workPlane][0]}_start`])) ||
                                (prev_intersection2 > Math.min(element[axes[element.workPlane][1]], element[`${axes[element.workPlane][1]}_start`]) &&
                                prev_intersection2 < Math.max(element[axes[element.workPlane][1]], element[`${axes[element.workPlane][1]}_start`]))) &&

                                ((prev_intersection > Math.min(prev2_element[axes[element.workPlane][0]], prev2_element[`${axes[element.workPlane][0]}_start`]) &&
                                prev_intersection < Math.max(prev2_element[axes[element.workPlane][0]], prev2_element[`${axes[element.workPlane][0]}_start`])) ||
                                (prev_intersection2 > Math.min(prev2_element[axes[element.workPlane][1]], prev2_element[`${axes[element.workPlane][1]}_start`]) &&
                                    prev_intersection2 < Math.max(prev2_element[axes[element.workPlane][1]], prev2_element[`${axes[element.workPlane][1]}_start`])))
                            ) {
                                element[`${axes[element.workPlane][0]}_start`] = prev_intersection
                                element[`${axes[element.workPlane][1]}_start`] = prev_intersection2

                                prev2_element[axes[element.workPlane][0]] = prev_intersection
                                prev2_element[axes[element.workPlane][1]] = prev_intersection2

                                for (let i = prev_index + 1; i < index; i++) {
                                    let el = CanvasArray[i]
                                    if (el.type === 'G1') {
                                        el.toolRadiusCompensation = 'offn_loop'
                                    }
                                    NewElements = NewElements.filter(el => el.index !== i)
                                }
                            }

                            prev_index--
                            prev2_element = CanvasArray[prev_index]
                        }
                    }
                }
            }
        }
    })

    //Вставка новых элементов
    while (NewElements.length) {
        let element = NewElements.pop()
        CanvasArray.splice(element.index, 0 , element.element)
    }

    CanvasArray.forEach((element, index) => {
        const prev_element = CanvasArray[index - 1]
        const next_element = CanvasArray[index + 1]


        if (!element.type.match(/G[01]/)) {
            return
        }
        if (element.toolRadiusCompensation === 'Approach') {
            axes[element.workPlane].forEach((axis) => {
                element[axis] = next_element[`${axis}_start`]
            })
        }
        if (element.toolRadiusCompensation === 'Departure') {
            axes[element.workPlane].forEach((axis) => {
                element[`${axis}_start`] = prev_element[axis]
            })
        }
    })
}
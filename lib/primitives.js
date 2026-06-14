'use babel';

const fs = require("fs-extra");
const fsPromises = fs.promises;

import View from './sinumerik';
import sinumerikMath from './degreesMath';
import {normalizeFileName} from './utils';
import {mathParse} from './mathParser';
import {getCoordinatesInFrame, getCoordinatesInBase, generateFrame} from './coordinates';
import {insertChr, insertRnd} from './element-insert';
import stringParse from './stringParse';

const myMath = new sinumerikMath();

const DEG_FULL = 360;
const DEG_HALF = 180;
const CR_EPSILON = 1e-4;

export const addY_for_C_rot = (primitives) => {
    //Add Y0 for lathes without active transformation
    const machine = View.sinumerikView.programmData[atom.workspace.getActiveTextEditor().getPath()].machine
    if (!primitives.operators.filter((o) => o.type === 'coordinate' && o.name === 'Y').length &&
        machine.machineType === 'Lathe' && !View.sinumerikView.parseData.transformation) {
        primitives.operators.push(
            {
                type: 'coordinate',
                name: 'Y',
                value: 0
            }
        )
    }
}

//generate canvas element
export function generateCanvasPrimitives(primitives, programName, row) {
    const elementId = View.sinumerikView.parseData.elementIdCounter++;

    const vectorInFrame = getCoordinatesInFrame({
        X: View.sinumerikView.parseData.axesPos.X,
        Y: View.sinumerikView.parseData.axesPos.Y,
        Z: View.sinumerikView.parseData.axesPos.Z
    });
    const coordsInFrame = {X: vectorInFrame[0], Y: vectorInFrame[1], Z: vectorInFrame[2]};

    let plane_Axes = View.sinumerikView.parseData.planeFirstAxes

    //region pole
    const pole = {};
    //check G111-112 (Pole)
    primitives.operators.forEach(function (operator) {
        if (operator.type === 'Pole') {
            pole.type = operator.value;
            primitives.operators.forEach(function (operator) {
                if (operator.type === 'coordinate') {
                    pole[operator.name] = parseFloat(operator.value);
                }
            });
        }
    });
    if (pole.type) {
        if (pole.X && View.sinumerikView.parseData.diamon) {
            pole.X *= 2
        }
        if (pole.type == 'G110') {
            if (pole.X != undefined) {
                View.sinumerikView.parseData.pole.X = coordsInFrame.X + pole.X;
            }
            if (pole.Y != undefined) {
                View.sinumerikView.parseData.pole.X = coordsInFrame.Y + pole.Y;
            }
            if (pole.Z != undefined) {
                View.sinumerikView.parseData.pole.Z = coordsInFrame.Z + pole.Z;
            }
        }
        if (pole.type == 'G111') {
            if (pole.X != undefined) {
                View.sinumerikView.parseData.pole.X = pole.X;
            }
            if (pole.Y != undefined) {
                View.sinumerikView.parseData.pole.Y = pole.Y;
            }
            if (pole.Z != undefined) {
                View.sinumerikView.parseData.pole.Z = pole.Z;
            }
        }
        if (pole.type == 'G112') {
            if (pole.X != undefined) {
                View.sinumerikView.parseData.pole.X = View.sinumerikView.parseData.pole.X + pole.X;
            }
            if (pole.Y != undefined) {
                View.sinumerikView.parseData.pole.Y = View.sinumerikView.parseData.pole.Y + pole.Y;
            }
            if (pole.Z != undefined) {
                View.sinumerikView.parseData.pole.Z = View.sinumerikView.parseData.pole.Z + pole.Z;
            }
        }

        View.sinumerikView.parseData.pole.AP = myMath.atan2((coordsInFrame[plane_Axes[1]] - View.sinumerikView.parseData.pole[plane_Axes[1]]), (coordsInFrame[plane_Axes[0]] - View.sinumerikView.parseData.pole[plane_Axes[0]]));
        View.sinumerikView.parseData.pole.RP = Math.sqrt((coordsInFrame[plane_Axes[1]] - View.sinumerikView.parseData.pole[plane_Axes[1]]) ** 2 + (coordsInFrame[plane_Axes[0]] - View.sinumerikView.parseData.pole[plane_Axes[0]]) ** 2);
        return;
    }
    //endregion

    const move = {};
    primitives.operators.forEach(function (operator) {
        //if !moveGroup & operator type == 'coordinates' => generate error
        if (!View.sinumerikView.parseData.moveGroup && operator.type === 'coordinate') {
            View.sinumerikView.parseData.errors.push({
                text: `coordinate ${operator.name} without move (eg G1, G2).  prog ${programName} row ${row + 1}`,
                row: row
            });
        }
        if (operator.type === 'Plane') {
            View.sinumerikView.parseData.plane = operator.value;
        }

        if (operator.type === 'moveGroup') {
            View.sinumerikView.parseData.moveGroup = operator.value;

            //Обработка зекральности
            if (View.sinumerikView.parseData.moveGroup.match(/G[23]$/) &&
                View.sinumerikView.parseData.frame.mirror[plane_Axes[0]] * View.sinumerikView.parseData.frame.mirror[plane_Axes[1]] === -1) {
                View.sinumerikView.parseData.moveGroup =
                    View.sinumerikView.parseData.moveGroup === 'G2' ? 'G3' : 'G2'
            }

        }

        if (operator.type === 'coordinate') {
            if (!operator.subtype) {
                move[operator.name] = parseFloat(operator.value);
            } else {
                if (operator.subtype === 'IC') {
                    if (View.sinumerikView.parseData.diamon && View.sinumerikView.parseData.diam90 && operator.name === 'X') {
                        operator.value *= 2;
                    }
                    move[operator.name] = coordsInFrame[operator.name] + parseFloat(operator.value);
                } else if (operator.subtype === 'AP' || operator.subtype === 'RP') {
                    move[operator.subtype] = parseFloat(operator.value);
                } else if (operator.subtype === 'RND') {
                    move[operator.subtype] = parseFloat(operator.value);
                } else if (operator.subtype === 'CHR') {
                    move[operator.subtype] = parseFloat(operator.value);
                } else {
                    View.sinumerikView.parseData.errors.push({
                        text: `Сoordinate modifier ${operator.subtype} not supported.  prog ${programName} row ${row + 1}`,
                        row: row
                    });
                }
            }
            if (operator.modificator && operator.modificator.ang) {
                let axes = View.sinumerikView.parseData.planeFirstAxes;

                //Mirror (обработка зеркальности)
                operator.modificator.ang *= View.sinumerikView.parseData.frame.mirror[axes[1]]
                if (View.sinumerikView.parseData.frame.mirror[axes[0]] === -1) {
                    operator.modificator.ang = DEG_HALF - operator.modificator.ang
                }

                if (operator.name == axes[1]) {
                    const distance = move[axes[1]] - coordsInFrame[axes[1]];
                    while (operator.modificator.ang < 0) {
                        operator.modificator.ang += DEG_FULL;
                    }
                    while (operator.modificator.ang >= DEG_FULL) {
                        operator.modificator.ang -= DEG_FULL;
                    }
                    if ((operator.modificator.ang < DEG_HALF && distance > 0) || (operator.modificator.ang > DEG_HALF && distance < 0)) {
                        if (move[axes[0]] && move[axes[1]]) {
                            View.sinumerikView.parseData.errors.push({
                                text: `ANG & 2 axes in one command.  prog ${programName} row ${row + 1}`,
                                row: row
                            });
                        }

                        move[axes[0]] = coordsInFrame[axes[0]] + distance / Math.tan(((operator.modificator.ang % DEG_HALF) / DEG_HALF) * Math.PI);
                    } else {
                        View.sinumerikView.parseData.errors.push({
                            text: `ANG direction error.  prog ${programName} row ${row + 1}`,
                            row: row
                        });
                    }
                }
                if (operator.name == axes[0]) {
                    const distance = move[axes[0]] - coordsInFrame[axes[0]];
                    while (operator.modificator.ang < 0) {
                        operator.modificator.ang += DEG_FULL;
                    }
                    while (operator.modificator.ang >= DEG_FULL) {
                        operator.modificator.ang -= DEG_FULL;
                    }
                    if ((operator.modificator.ang > 90 && operator.modificator.ang < 270 && distance < 0) || ((operator.modificator.ang < 90 || operator.modificator.ang > 270) && distance > 0)) {
                        if (move[axes[0]] && move[axes[1]]) {
                            View.sinumerikView.parseData.errors.push({
                                text: `ANG & 2 axes in one command.  prog ${programName} row ${row + 1}`,
                                row: row
                            });
                        }
                        move[axes[1]] = coordsInFrame[axes[1]] + distance * Math.tan(((operator.modificator.ang % DEG_HALF) / DEG_HALF) * Math.PI);
                    } else {
                        View.sinumerikView.parseData.errors.push({
                            text: `ANG direction error.  prog ${programName} row ${row + 1}`,
                            row: row
                        });
                    }
                }

            }
        }

        if (operator.type == 'circleCenter') {
            let axis;
            if (operator.name == 'I') {
                axis = 'X'
            }
            if (operator.name == 'J') {
                axis = 'Y'
            }
            if (operator.name == 'K') {
                axis = 'Z'
            }

            if (!operator.subtype || operator.subtype == 'IC') {
                move[operator.name] = coordsInFrame[axis] + parseFloat(operator.value) * View.sinumerikView.parseData.frame.mirror[axis];
            } else if (operator.subtype == 'AC') {
                move[operator.name] = parseFloat(operator.value) * View.sinumerikView.parseData.frame.mirror[axis]
            } else {
                View.sinumerikView.parseData.errors.push({
                    text: `Сircle center syntax error.  prog ${programName} row ${row + 1}`,
                    row: row
                });
            }
        }
        if (operator.type == 'circle_AR') {
            move.circle_AR = operator.value;
        }
        if (operator.type == 'circle_CR') {
            move.circle_CR = operator.value;
        }
        if (operator.type == 'TURN') {
            move.Turn = operator.value;
        }
    })

    if (move.AP != undefined || move.RP != undefined) {
        if (move.AP == undefined) {
            move.AP = View.sinumerikView.parseData.pole.AP;
        }
        if (move.RP == undefined) {
            move.RP = View.sinumerikView.parseData.pole.RP;
        }
        let axes = View.sinumerikView.parseData.planeFirstAxes;
        move[axes[0]] = move.RP * myMath.cos(move.AP) + View.sinumerikView.parseData.pole[axes[0]];
        move[axes[1]] = move.RP * myMath.sin(move.AP) + View.sinumerikView.parseData.pole[axes[1]];

    }

    if (Object.keys(move).length) {
        const canvasElement = {
            X_start: View.sinumerikView.parseData.axesPos.X,
            Y_start: View.sinumerikView.parseData.axesPos.Y,
            Z_start: View.sinumerikView.parseData.axesPos.Z,
            row: row,
            elementId,
            sourceFile: programName
        };
        if (View.sinumerikView.parseData.moveGroup.match(/G1|G2|G3|G0|G33|transform/)) {
            canvasElement.type = View.sinumerikView.parseData.moveGroup;

            if (move.X != undefined) {
                canvasElement.X = move.X;
            } else {
                canvasElement.X = coordsInFrame.X;
            }
            if (move.Y != undefined) {
                canvasElement.Y = move.Y;
            } else {
                canvasElement.Y = coordsInFrame.Y;
            }
            if (move.Z != undefined) {
                canvasElement.Z = move.Z;
            } else {
                canvasElement.Z = coordsInFrame.Z;
            }
        }

        if (View.sinumerikView.parseData.moveGroup == 'G2' ||
            View.sinumerikView.parseData.moveGroup == 'G3') {
            let circleAxes = View.sinumerikView.parseData.planeAxes;
            let circleCenterAxes = View.sinumerikView.parseData.planeCircleAxes;

            let circleError = 0;

            if (move.circle_AR && move.circle_CR) {
                View.sinumerikView.parseData.errors.push({
                    text: `Circle AR & CR together.  prog ${programName} row ${row + 1}`,
                    row: row
                });
                circleError = 1;
            }

            if (move.AP != View.sinumerikView.parseData.pole.AP && move.RP == View.sinumerikView.parseData.pole.RP) {
                move[circleCenterAxes[0]] = View.sinumerikView.parseData.pole[circleAxes[0]];
                move[circleCenterAxes[1]] = View.sinumerikView.parseData.pole[circleAxes[1]];
            }

            if (move.circle_AR != undefined) {
                if (move[circleAxes[0]] != undefined && move[circleAxes[1]] != undefined) {
                    const distance = Math.sqrt((canvasElement[circleAxes[0]] - coordsInFrame[circleAxes[0]]) ** 2 + (canvasElement[circleAxes[1]] - coordsInFrame[circleAxes[1]]) ** 2);
                    move.circle_CR = (distance / 2) / myMath.sin(move.circle_AR / 2);
                    if (move.circle_AR > DEG_HALF) {
                        move.circle_CR *= -1;
                    }
                } else if (move[circleCenterAxes[0]] != undefined && move[circleCenterAxes[1]] != undefined) {
                    const vectorStartAng = myMath.atan2(coordsInFrame[circleAxes[1]] - move[circleCenterAxes[1]], coordsInFrame[circleAxes[0]] - move[circleCenterAxes[0]]);
                    const circleRadius = Math.sqrt((coordsInFrame[circleAxes[0]] - move[circleCenterAxes[0]]) ** 2 + (coordsInFrame[circleAxes[1]] - move[circleCenterAxes[1]]) ** 2)
                    let G2_factor = 1;
                    if (View.sinumerikView.parseData.moveGroup == 'G2') {
                        G2_factor = -1;
                    }
                    const vectorEndAng = vectorStartAng + G2_factor * move.circle_AR;

                    canvasElement[circleAxes[0]] = myMath.cos(vectorEndAng) * circleRadius + move[circleCenterAxes[0]];
                    canvasElement[circleAxes[1]] = myMath.sin(vectorEndAng) * circleRadius + move[circleCenterAxes[1]];
                }

            }

            if (move.circle_CR != undefined) {
                const distance = Math.sqrt((canvasElement[circleAxes[0]] - coordsInFrame[circleAxes[0]]) ** 2 + (canvasElement[circleAxes[1]] - coordsInFrame[circleAxes[1]]) ** 2);
                if (Math.abs(Math.abs(distance - 2 * Math.abs(move.circle_CR)) < CR_EPSILON)) {
                    move.circle_CR += CR_EPSILON
                }

                if (distance > Math.abs(move.circle_CR) * 2) {

                    View.sinumerikView.parseData.errors.push({
                        text: `Circle CR too small.  prog ${programName} row ${row + 1}`,
                        row: row
                    });
                    circleError = 1;
                }
                if (!circleError) {
                    const G3_center = [];
                    const G2_center = [];

                    const d = distance;
                    const h = Math.sqrt(move.circle_CR ** 2 - (d / 2) ** 2);

                    G2_center[0] = coordsInFrame[circleAxes[0]] + (canvasElement[circleAxes[0]] - coordsInFrame[circleAxes[0]]) / 2 + h * (canvasElement[circleAxes[1]] - coordsInFrame[circleAxes[1]]) / d
                    G2_center[1] = coordsInFrame[circleAxes[1]] + (canvasElement[circleAxes[1]] - coordsInFrame[circleAxes[1]]) / 2 - h * (canvasElement[circleAxes[0]] - coordsInFrame[circleAxes[0]]) / d

                    G3_center[0] = coordsInFrame[circleAxes[0]] + (canvasElement[circleAxes[0]] - coordsInFrame[circleAxes[0]]) / 2 - h * (canvasElement[circleAxes[1]] - coordsInFrame[circleAxes[1]]) / d
                    G3_center[1] = coordsInFrame[circleAxes[1]] + (canvasElement[circleAxes[1]] - coordsInFrame[circleAxes[1]]) / 2 + h * (canvasElement[circleAxes[0]] - coordsInFrame[circleAxes[0]]) / d

                    if ((View.sinumerikView.parseData.moveGroup.match(/G3/) && move.circle_CR > 0) || (View.sinumerikView.parseData.moveGroup.match(/G2/) && move.circle_CR < 0)) {
                        move[circleCenterAxes[0]] = G3_center[0];
                        move[circleCenterAxes[1]] = G3_center[1];
                    } else {
                        move[circleCenterAxes[0]] = G2_center[0];
                        move[circleCenterAxes[1]] = G2_center[1];
                    }
                }
            }

            for (let i = 0; i < 2; i++) {
                if (move[circleCenterAxes[i]] == undefined) {
                    View.sinumerikView.parseData.errors.push({
                        text: `Circle center axis ${circleCenterAxes[i]} not found .  prog ${programName} row ${row + 1}`,
                        row: row
                    });
                    circleError = 1;
                }
            }

            const vectorStart = (coordsInFrame[circleAxes[0]] - move[circleCenterAxes[0]]) ** 2 + (coordsInFrame[circleAxes[1]] - move[circleCenterAxes[1]]) ** 2;
            const vectorEnd = (canvasElement[circleAxes[0]] - move[circleCenterAxes[0]]) ** 2 + (canvasElement[circleAxes[1]] - move[circleCenterAxes[1]]) ** 2;
            if (Math.abs(Math.sqrt(vectorEnd) - Math.sqrt(vectorStart)) > 3e-2) {
                View.sinumerikView.parseData.errors.push({
                    text: `Circle end point error.  prog ${programName} row ${row + 1}`,
                    row: row
                });
                circleError = 1;
            }

            if (!circleError) {

                let vectorStartAng = myMath.atan2(coordsInFrame[circleAxes[1]] - move[circleCenterAxes[1]], coordsInFrame[circleAxes[0]] - move[circleCenterAxes[0]]);
                const vectorEndAng = myMath.atan2(canvasElement[circleAxes[1]] - move[circleCenterAxes[1]], canvasElement[circleAxes[0]] - move[circleCenterAxes[0]]);

                if (View.sinumerikView.parseData.prevMove.length) {
                    if (View.sinumerikView.parseData.prevMove[0].type === 'G2' || View.sinumerikView.parseData.prevMove[0].type === 'G3') {
                        generateCirclePrimitives(programName);
                    }

                    if (View.sinumerikView.parseData.prevMove[0].type.match(/G1|G33/)) {

                        canvasElement[circleCenterAxes[0]] = move[circleCenterAxes[0]];
                        canvasElement[circleCenterAxes[1]] = move[circleCenterAxes[1]];

                        const elements = insertRnd(View.sinumerikView.parseData.prevMove[0], canvasElement, programName, 0);

                        const startInBase = getCoordinatesInBase({
                            X: canvasElement.X_start,
                            Y: canvasElement.Y_start,
                            Z: canvasElement.Z_start
                        });
                        canvasElement.X_start = startInBase[0];
                        canvasElement.Y_start = startInBase[1];
                        canvasElement.Z_start = startInBase[2];

                        vectorStartAng = myMath.atan2(elements[1][`${circleAxes[1]}_start`] - elements[1][circleCenterAxes[1]], elements[1][`${circleAxes[0]}_start`] - elements[1][circleCenterAxes[0]]);
                    }
                    View.sinumerikView.parseData.prevMove.shift();
                }

                if (move.RND != undefined) {

                    const startInFrame = getCoordinatesInFrame({
                        X: canvasElement.X_start,
                        Y: canvasElement.Y_start,
                        Z: canvasElement.Z_start
                    });
                    canvasElement.X_start = startInFrame[0];
                    canvasElement.Y_start = startInFrame[1];
                    canvasElement.Z_start = startInFrame[2];
                    canvasElement.RND = move.RND;
                    canvasElement[circleCenterAxes[0]] = move[circleCenterAxes[0]];
                    canvasElement[circleCenterAxes[1]] = move[circleCenterAxes[1]];
                    View.sinumerikView.parseData.prevMove.push(canvasElement);

                    const canvasElementInBase = getCoordinatesInBase({
                        X: canvasElement.X,
                        Y: canvasElement.Y,
                        Z: canvasElement.Z
                    });

                    const canvasCircleElement = {};
                    canvasCircleElement.X = canvasElementInBase[0];
                    canvasCircleElement.Y = canvasElementInBase[1];
                    canvasCircleElement.Z = canvasElementInBase[2];

                    View.sinumerikView.parseData.axesPos.X = canvasCircleElement.X;
                    View.sinumerikView.parseData.axesPos.Y = canvasCircleElement.Y;
                    View.sinumerikView.parseData.axesPos.Z = canvasCircleElement.Z;

                    return;
                }

                let arcAng = vectorEndAng - vectorStartAng;
                let arcFactor = 1;
                if (View.sinumerikView.parseData.moveGroup.match(/G2/)) {
                    arcFactor = -1;
                }
                arcAng *= arcFactor;
                if (arcAng <= 0) {
                    arcAng += DEG_FULL;
                }
                arcAng *= arcFactor;
                if (move.Turn != undefined) {
                    arcAng += move.Turn * arcFactor * DEG_FULL;
                }

                const circleRadius = Math.sqrt((vectorStart + vectorEnd) / 2);
                let pointsNum = Math.round((circleRadius * Math.PI) * (Math.abs(arcAng) / DEG_HALF));
                if (pointsNum < 30) {
                    pointsNum = 30;
                }
                if (pointsNum > 300) {
                    pointsNum = 300;
                }
                if (move.Turn != undefined && pointsNum == 300) {
                    pointsNum *= move.Turn;
                    if (pointsNum > 1500) {
                        pointsNum = 1500;
                    }
                }

                const centerCoords = {
                    [circleAxes[0]]: move[circleCenterAxes[0]],
                    [circleAxes[1]]: move[circleCenterAxes[1]],
                    [circleAxes[2]]: (View.sinumerikView.parseData.axesPos[circleAxes[2]] + canvasElement[circleAxes[2]]) / 2
                }

                const contour_element = {
                    type: 'arc',
                    start: getCoordinatesInBase(View.sinumerikView.parseData.axesPos),
                    end: getCoordinatesInBase(canvasElement),
                    center: getCoordinatesInBase(centerCoords),
                    ccw: arcFactor > 0,
                    radius: circleRadius,
                    source: 'G2/G3',
                    planeAxes: [circleAxes]
                }
                View.sinumerikView.parseData.contourElements[programName].push(contour_element)

                for (let i = 0; i < pointsNum; i++) {

                    const canvasCircleElement = {
                        X_start: View.sinumerikView.parseData.axesPos.X,
                        Y_start: View.sinumerikView.parseData.axesPos.Y,
                        Z_start: View.sinumerikView.parseData.axesPos.Z,
                        row: row,
                        type: 'G1',
                        elementId,
                        sourceFile: programName
                    }
                    const thisPointAng = vectorStartAng + (arcAng / pointsNum) * (i + 1);
                    const thisPoint = {};
                    let circleElementAxesInFrame = {};
                    for (let i = 0; i < 3; i++) {
                        circleElementAxesInFrame[circleAxes[i]] = canvasElement[`${circleAxes[i]}_start`];
                    }

                    circleElementAxesInFrame = getCoordinatesInFrame(circleElementAxesInFrame);
                    circleElementAxesInFrame = {
                        X: circleElementAxesInFrame[0],
                        Y: circleElementAxesInFrame[1],
                        Z: circleElementAxesInFrame[2]
                    };

                    thisPoint[circleAxes[0]] = parseFloat(myMath.cos(thisPointAng) * circleRadius + move[circleCenterAxes[0]]);
                    thisPoint[circleAxes[1]] = parseFloat(myMath.sin(thisPointAng) * circleRadius + move[circleCenterAxes[1]]);
                    thisPoint[circleAxes[2]] = circleElementAxesInFrame[circleAxes[2]] + (canvasElement[circleAxes[2]] - circleElementAxesInFrame[circleAxes[2]]) * ((i + 1) / pointsNum);

                    const canvasElementInBase = getCoordinatesInBase(thisPoint);

                    canvasCircleElement.X = canvasElementInBase[0];
                    canvasCircleElement.Y = canvasElementInBase[1];
                    canvasCircleElement.Z = canvasElementInBase[2];

                    View.sinumerikView.parseData.axesPos.X = canvasCircleElement.X;
                    View.sinumerikView.parseData.axesPos.Y = canvasCircleElement.Y;
                    View.sinumerikView.parseData.axesPos.Z = canvasCircleElement.Z;

                    View.sinumerikView.parseData.canvas.push(canvasCircleElement);
                }

            }

        }

        if (View.sinumerikView.parseData.moveGroup.match(/G0|G1|G33|transform/)) {
            const canvasElementByFrame = getCoordinatesInBase(canvasElement);

            canvasElement.X = canvasElementByFrame[0];
            canvasElement.Y = canvasElementByFrame[1];
            canvasElement.Z = canvasElementByFrame[2];


            if (View.sinumerikView.parseData.prevMove.length && View.sinumerikView.parseData.prevMove[0].RND) {
                if (View.sinumerikView.parseData.prevMove[0].type.match(/G[1-3]/)) {
                    const elements = insertRnd(View.sinumerikView.parseData.prevMove[0], canvasElement, programName, 0);
                    View.sinumerikView.parseData.prevMove.shift();
                }
            }

            if (View.sinumerikView.parseData.prevMove.length && View.sinumerikView.parseData.prevMove[0].CHR) {
                if (View.sinumerikView.parseData.prevMove[0].type.match(/G[1-3]/)) {
                    const elements = insertChr(View.sinumerikView.parseData.prevMove[0], canvasElement, programName);
                    View.sinumerikView.parseData.prevMove.shift();
                }
            }

            View.sinumerikView.parseData.axesPos.X = canvasElement.X;
            View.sinumerikView.parseData.axesPos.Y = canvasElement.Y;
            View.sinumerikView.parseData.axesPos.Z = canvasElement.Z;

            if (move.RND != undefined) {
                canvasElement.RND = move.RND;
                View.sinumerikView.parseData.prevMove.push(canvasElement);
                return;
            } else {
                View.sinumerikView.parseData.prevMove = [];
            }
            if (move.CHR != undefined) {
                canvasElement.CHR = move.CHR;
                View.sinumerikView.parseData.prevMove.push(canvasElement);
                return;
            } else {
                View.sinumerikView.parseData.prevMove = [];
            }
            View.sinumerikView.parseData.canvas.push(canvasElement);

            View.sinumerikView.parseData.contourElements[programName].push({
                type: 'line',
                start: Object.keys(canvasElement).filter(k => ['X', 'Y', 'Z'].map(ax => ax + '_start').indexOf(k) > -1).map(k => canvasElement[k]),
                end: Object.keys(canvasElement).filter(k => ['X', 'Y', 'Z'].indexOf(k) > -1).map(k => canvasElement[k])
            })
        }

        if (move.AP != undefined) {
            View.sinumerikView.parseData.pole.AP = move.AP;
            View.sinumerikView.parseData.pole.RP = move.RP;
        }
    }
}

export function generateCirclePrimitives(programName) {
    let circleAxes = View.sinumerikView.parseData.planeAxes;
    let circleCenterAxes = View.sinumerikView.parseData.planeCircleAxes;

    const element_prev = View.sinumerikView.parseData.prevMove[0];
    const row = element_prev.row;

    const vectorStartAng_prev = myMath.atan2(element_prev[`${circleAxes[1]}_start`] - element_prev[circleCenterAxes[1]], element_prev[`${circleAxes[0]}_start`] - element_prev[circleCenterAxes[0]]);
    const vectorEndAng_prev = myMath.atan2(element_prev[circleAxes[1]] - element_prev[circleCenterAxes[1]], element_prev[circleAxes[0]] - element_prev[circleCenterAxes[0]]);

    let arcAng_prev = vectorEndAng_prev - vectorStartAng_prev;
    let arcFactor_prev = 1;
    if (element_prev.type.match(/G2/)) {
        arcFactor_prev = -1;
    }
    arcAng_prev *= arcFactor_prev;
    if (arcAng_prev <= 0) {
        arcAng_prev += DEG_FULL;
    }
    arcAng_prev *= arcFactor_prev;
    if (element_prev.Turn != undefined) {
        arcAng_prev += element_prev.Turn * arcFactor_prev * DEG_FULL;
    }

    const circleRadius_prev = Math.sqrt(((element_prev[`${circleAxes[0]}_start`] - element_prev[circleCenterAxes[0]]) ** 2 + (element_prev[`${circleAxes[1]}_start`] - element_prev[circleCenterAxes[1]]) ** 2));
    let pointsNum = Math.round((circleRadius_prev * Math.PI) * (Math.abs(arcAng_prev) / DEG_HALF));
    if (pointsNum < 30) {
        pointsNum = 30;
    }
    if (pointsNum > 300) {
        pointsNum = 300;
    }
    if (element_prev.Turn != undefined && pointsNum == 300) {
        pointsNum *= element_prev.Turn;
        if (pointsNum > 1500) {
            pointsNum = 1500;
        }
    }

    const coordsInBase_prev = getCoordinatesInBase({
        X: element_prev.X_start,
        Y: element_prev.Y_start,
        Z: element_prev.Z_start
    });
    View.sinumerikView.parseData.axesPos.X = coordsInBase_prev[0];
    View.sinumerikView.parseData.axesPos.Y = coordsInBase_prev[1];
    View.sinumerikView.parseData.axesPos.Z = coordsInBase_prev[2];

    for (let i = 0; i < pointsNum; i++) {

        const canvasCircleElement = {
            X_start: View.sinumerikView.parseData.axesPos.X,
            Y_start: View.sinumerikView.parseData.axesPos.Y,
            Z_start: View.sinumerikView.parseData.axesPos.Z,
            row: row,
            type: 'G1',
            elementId,
            sourceFile: programName
        }
        const thisPointAng = vectorStartAng_prev + (arcAng_prev / pointsNum) * (i + 1);
        const thisPoint = {};
        const circleElementAxesInFrame_prev = {};
        for (let i = 0; i < 3; i++) {
            circleElementAxesInFrame_prev[circleAxes[i]] = element_prev[`${circleAxes[i]}_start`];
        }

        thisPoint[circleAxes[0]] = parseFloat(myMath.cos(thisPointAng) * circleRadius_prev + element_prev[circleCenterAxes[0]]);
        thisPoint[circleAxes[1]] = parseFloat(myMath.sin(thisPointAng) * circleRadius_prev + element_prev[circleCenterAxes[1]]);
        thisPoint[circleAxes[2]] = circleElementAxesInFrame_prev[circleAxes[2]] + (element_prev[circleAxes[2]] - circleElementAxesInFrame_prev[circleAxes[2]]) * ((i + 1) / pointsNum);

        const canvasElementInBase = getCoordinatesInBase(thisPoint);

        canvasCircleElement.X = canvasElementInBase[0];
        canvasCircleElement.Y = canvasElementInBase[1];
        canvasCircleElement.Z = canvasElementInBase[2];

        View.sinumerikView.parseData.axesPos.X = canvasCircleElement.X;
        View.sinumerikView.parseData.axesPos.Y = canvasCircleElement.Y;
        View.sinumerikView.parseData.axesPos.Z = canvasCircleElement.Z;

        View.sinumerikView.parseData.canvas.push(canvasCircleElement);
    }

}

// parseRowsFn is passed to break the circular dependency with interpretator.js
export async function generatePrimitives(rowText, programName, progRowNum, programText, parseRowsFn) {
    const primitive = {};
    let programRow = rowText.trim();
    const splitRow = programRow.split(' ');
    let regEx;
    //delete empty parts
    for (let index = 0; index < splitRow.length; index++) {
        splitRow[index] = splitRow[index].trim();
        if (splitRow[index] == 0) {
            splitRow.splice(index, 1);
            index--;
        }
    }

    primitive.operators = [];

    let spindleAxis = '';
    if (View.sinumerikView.singleLineDebugData.machine.firstSpindle) {
        spindleAxis = View.sinumerikView.singleLineDebugData.machine.firstSpindle.name;
    }

    //region Check call
    //check call
    View.sinumerikView.parseData.subroutines.forEach(function (subroutine) {
        const regExp = new RegExp(`(?<=^)${subroutine.name}(?=(\\s|\\(|$))`);
        if (programRow.match(regExp)) {
            programRow = 'CALL ' + programRow;
            splitRow.unshift('CALL');
        }
    })

    if (splitRow[0] == 'CALL') {
        const subroutineWithVariables = programRow.slice(5);
        let subroutineName = '';
        let subroutineVariables = [];
        if (subroutineWithVariables.indexOf('(') && subroutineWithVariables.lastIndexOf(')')) {
            subroutineName = subroutineWithVariables.slice(0, subroutineWithVariables.indexOf('('));
            subroutineVariables = subroutineWithVariables.slice(subroutineWithVariables.indexOf('(') + 1, subroutineWithVariables.lastIndexOf(')')).split(',');
        }
        subroutineVariables = subroutineVariables.map((variable => {
            return mathParse(variable, programName, progRowNum) != null ? mathParse(variable, programName, progRowNum).toString() : variable
        }))

        if (subroutineWithVariables.match(/\w*/)[0] == subroutineWithVariables) {
            subroutineName = subroutineWithVariables;
        }
        if (subroutineName == '') {
            primitive.operators[0] = {};
            primitive.operators[0].type = 'parseError_004';
            return primitive;
        }

        if (View.sinumerikView.programmData[programName]?.contour?.name === subroutineName &&
            !View.sinumerikView.singleLineDebugContourDiv.contourDuplicate.checked) {
            primitive.operators[0] = {};
            return primitive;
        }

        for (const subroutine of View.sinumerikView.parseData.subroutines) {
            if (subroutineName == subroutine.name) {
                const programmText = (await fsPromises.readFile(`${subroutine.path}`, 'utf8')).split('\n');
                const programmName = subroutine.path.slice(subroutine.path.lastIndexOf('/') + 1).replace('.', '_').toUpperCase();
                //КОСТЫЛЬ для рекурсивного вызова
                let recursProgName = "" + programmName;
                while (View.sinumerikView.parseData.variables[recursProgName]) {
                    recursProgName = recursProgName + '_r';
                }
                const canvasLengthBefore = View.sinumerikView.parseData.canvas.length;
                await parseRowsFn(programmText, recursProgName, subroutineVariables, false);
                for (let i = canvasLengthBefore; i < View.sinumerikView.parseData.canvas.length; i++) {
                    if (View.sinumerikView.parseData.canvas[i].mainRow === undefined) {
                        View.sinumerikView.parseData.canvas[i].mainRow = progRowNum;
                    }
                }
                delete View.sinumerikView.parseData.variables[recursProgName]
            }
        }
        return false;
    }
    //endregion

    //region MCALL
    if (splitRow[0] == 'MCALL') {
        if (programRow.trim() === 'MCALL') {
            View.sinumerikView.parseData.mcall[programName] = undefined
        } else {
            View.sinumerikView.parseData.mcall[programName] = programRow.trim().substring(1)
        }
    }
    //endregion

    //region Frame
    regEx = /(?<!\w)A?(TRANS|MIRROR|ROT|SCALE)(?!\w)/;
    if (programRow.match(regEx)) {
        let additive = 0;
        let value = [];
        let type = programRow.match(regEx)[0].match(/TRANS|MIRROR|ROT|SCALE/)[0];
        if (!programRow.match(/(?<!\w)(TRANS|MIRROR|ROT|SCALE)(?!\w)/)) {
            additive = 1;
        }
        const frameRow = programRow.split(' ').slice(1);
        frameRow.forEach(function (str) {
            const returnVal = checkCoordinates(str);
            if (returnVal) {
                returnVal.value *= View.sinumerikView.parseData.frame.mirror[returnVal.name]
                value.push(returnVal)
            } else {
                View.sinumerikView.parseData.errors.push({
                    text: `Error in ${programRow.match(regEx)[0]}.  prog ${programName} row ${progRowNum + 1}`,
                    row: progRowNum
                });
                primitive.operators[0] = {};
                primitive.operators[0].type = 'parseError';
                return primitive;
            }
        })
        generateFrame(additive, type, value, programName, progRowNum);
        primitive.operators[0] = {};
        primitive.operators[0].type = 'Frame';
        return primitive;
    }
    //endregion

    //region MSG
    if (programRow.substring(0, 3) == 'MSG') {
        primitive.operators[0] = {};
        primitive.operators[0].type = 'MSG';
        if (programRow.indexOf('(') && programRow.lastIndexOf(')')) {
            primitive.operators[0].value = stringParse(programRow.substring(programRow.indexOf('(') + 1, programRow.lastIndexOf(')')), programName, progRowNum);
        }
        return primitive;
    }
    //endregion

    if (programRow.match(/STOPRE($|\s)/)) {
        primitive.operators[0] = {
            type: 'MSG',
            value: 'STOPRE'
        }
        return primitive
    }

    //region transformation
    if (programRow.match(/(?<!\w)TRANSMIT/)) {
        primitive.operators[0] = {
            type: 'transformation',
            value: 'TRANSMIT'
        }
        return primitive
    }

    if (programRow.match(/(?<!\w)TRACYL/)) {
        primitive.operators[0] = {
            type: 'transformation',
            value: 'TRACYL'
        }
        return primitive
    }

    if (programRow.match(/(?<!\w)TRAFOOF/)) {
        primitive.operators[0] = {
            type: 'transformation',
            value: 'TRAFOOF'
        }
        return primitive
    }
    //endregion

    //region G4
    regEx = /(?<!\w)G4(?!\w)/;
    if (regEx.exec(programRow)) {
        primitive.operators[0] = {};
        primitive.operators[0].type = 'Delay';
        return primitive;
    }
    //endregion

    //region OFFN
    regEx = /(?<!\w)(OFFN=\S+)/;
    if (regEx.exec(programRow)) {
        primitive.operators[0] = {};
        primitive.operators[0].type = 'OFFN';
        let mathVal = mathParse(regEx.exec(programRow)[0].slice(5), programName, progRowNum)
        primitive.operators[0].value = mathVal !== null ? mathVal : 0;
        if (mathVal === null) {
            View.sinumerikView.parseData.errors.push({
                text: `Right part of OFFN assignment error. prog ${programName} row ${progRowNum + 1}`,
                row: progRowNum
            })
        }

        return primitive;
    }
    //endregion

    //region SPCO[NF]
    regEx = /(?<!\w)SPCO[NF](?!\w)/;
    if (regEx.exec(programRow)) {
        primitive.operators[0] = {
            type: 'SPCON',
        }
        if (View.sinumerikView.singleLineDebugHelpDiv.C_As_Rot.input.checked) {
            generateFrame(0, 'ROT', [{name: 'Z', value: 0}], progRowNum)
            addY_for_C_rot(primitive)
            const {X, Y} = View.sinumerikView.parseData.axesPos
            primitive.operators.push(
                {
                    type: 'coordinate',
                    name: 'X',
                    value: Math.sqrt(X ** 2 + Y ** 2)
                }
            )

        }
        return primitive;
    }
    //endregion

    for (let i = 0; i < splitRow.length; i++) {
        primitive.operators[i] = {};

        //
        while (true) {
            //region only for 1st operator check rowNum
            if (!i && checkRowNum(splitRow[i])) {
                primitive.operators[i].type = 'rowNum';
                primitive.operators[i].value = splitRow[i];
                break;
            }
            //endregion

            //region G64
            regEx = /(?<!\w)G64[1234]?(?!\w)/;
            if (regEx.exec(programRow)) {
                primitive.operators[i] = {type: 'pos_type'}
                break
            }
            //endregion

            //region M-func
            regEx = /(?<!\w)M(?=\d+)/;
            if (regEx.exec(splitRow[i])) {
                primitive.operators[i].type = 'M_func';
                primitive.operators[i].value = splitRow[i].substring(1);
                break;
            }
            //endregion

            //region SOFT
            regEx = /(?<!\w)SOFT(?!\w)/;
            if (regEx.exec(splitRow[i])) {
                primitive.operators[i].type = 'SOFT';
                break;
            }
            //endregion

            //region LIMS
            regEx = /(?<!\w)LIMS(?!\w)/;
            if (regEx.exec(splitRow[i])) {
                primitive.operators[i] = {type: 'LIMS', value: splitRow[i].substring(4)};
                break
            }
            //endregion

            //region T-name
            regEx = /(?<!\w)T(?=[=\d])/;
            if (regEx.exec(splitRow[i])) {
                primitive.operators[i].type = 'T_name';
                if (progRowNum && programText[progRowNum - 1].match(/;T10\d/)) {
                    primitive.operators[i].value = programText[progRowNum - 1].match(/;T10\d/)[0].substring(2)
                    let rMatch = programText[progRowNum - 1].match(/R\d.?\d*/)
                    if (rMatch) {
                        primitive.operators[i].toolr = rMatch[0].substring(1)
                    }
                    break
                }

                regEx = /(?<!\w)T(?=[\d])/;
                if (regEx.exec(splitRow[i])) {
                    primitive.operators[i].value = splitRow[i].substring(1);
                } else {
                    primitive.operators[i].value = 100;
                }
                break;
            }
            //endregion

            //region D-Num
            regEx = /(?<!\w)D(?=[\=\d])/;
            if (regEx.exec(splitRow[i])) {
                primitive.operators[i].type = 'D_num';
                primitive.operators[i].value = splitRow[i].substring(1);
                break;
            }
            //endregion

            //region spindle speed
            regEx = /(?<!\w)S(?=[\=\d])/;
            if (regEx.exec(splitRow[i])) {
                primitive.operators[i].type = 'S_speed';
                primitive.operators[i].value = splitRow[i].substring(1);
                break;
            }
            //endregion

            //region feed
            regEx = /(?<!\w)F(?=[\=\d])/;
            if (regEx.exec(splitRow[i])) {
                primitive.operators[i].type = 'F_feed';
                primitive.operators[i].value = splitRow[i].substring(1);
                break;
            }
            regEx = /(?<!\w)FB=/;
            if (regEx.exec(splitRow[i])) {
                primitive.operators[i].type = 'FB_feed';
                break;
            }
            //endregion

            //region SUPA
            if (splitRow[i] == 'SUPA') {
                primitive.operators[i].type = 'supa';
                break;
            }
            //endregion

            //region G93 - G97
            regEx = /(?<!\w)G9[3-6](?!\w)/;
            if (regEx.exec(splitRow[i])) {
                primitive.operators[i].type = 'generalGroup15';
                primitive.operators[i].value = splitRow[i];
                break;
            }

            //endregion

            //region G40 - G42
            //tool radius compensation
            regEx = /(?<!\w)G4[0-2](?!\w)/;
            if (regEx.exec(splitRow[i])) {
                primitive.operators[i].type = 'toolRadiusCompensation';
                primitive.operators[i].value = splitRow[i];

                if (primitive.operators[i].value.match(/G4[12]/) &&
                    View.sinumerikView.parseData.frame.mirror[View.sinumerikView.parseData.planeAxes[0]] * View.sinumerikView.parseData.frame.mirror[View.sinumerikView.parseData.planeAxes[1]] === -1) {
                    primitive.operators[i].value =
                        primitive.operators[i].value === 'G41' ? 'G42' : 'G41'
                }

                break;
            }
            //endregion

            //region G17 - G19
            regEx = /(?<!\w)G1[7-9](?!\w)/;
            if (regEx.exec(splitRow[i])) {
                primitive.operators[i].type = 'Plane';
                primitive.operators[i].value = splitRow[i];
                break;
            }
            //endregion

            //region G110 - G112  pole
            regEx = /(?<!\w)G11[0-2](?!\w)/;
            if (regEx.exec(splitRow[i])) {
                primitive.operators[i].type = 'Pole';
                primitive.operators[i].value = splitRow[i];
                break;
            }
            //endregion

            //region check Marker
            if (checkMark(splitRow[i])) {
                primitive.operators[i].type = 'Marker';
                primitive.operators[i].value = splitRow[i];
                break;
            }
            //endregion
            //region check move group operator
            if (checkMoveGroup(splitRow[i])) {
                primitive.operators[i].type = 'moveGroup';
                primitive.operators[i].value = splitRow[i];
                break;
            }
            //endregion
            //region check coordinates
            let returnVal = checkCoordinates(splitRow[i]);
            if (returnVal) {
                if (returnVal.type && returnVal.type.match('parseError')) {
                    primitive.operators[i].type = returnVal.type;
                    View.sinumerikView.parseData.errors.push({
                        text: `Coordinate parse error "${returnVal.type}".  prog ${programName} row ${progRowNum + 1}`,
                        row: progRowNum
                    });
                    break;
                }
                if (i) {
                    primitive.operators.forEach(function (operator, index) {
                        if (operator.type == 'coordinate' && returnVal.name == operator.name) {
                            View.sinumerikView.parseData.errors.push({
                                text: `"${returnVal.name}" axis name is used more than once.  prog ${programName} row ${progRowNum + 1}`,
                                row: progRowNum
                            });
                        }
                    });
                }
                primitive.operators[i].type = `coordinate`;
                if (returnVal.type) {
                    primitive.operators[i].subtype = returnVal.type;
                }
                primitive.operators[i].name = returnVal.name;

                if (View.sinumerikView.parseData.diamon && returnVal.name == 'X') {
                    primitive.operators[i].value = returnVal.value / 2;
                } else {
                    primitive.operators[i].value = returnVal.value;
                }
                if (returnVal.modificator) {
                    primitive.operators[i].modificator = returnVal.modificator;
                }

                //check the same coordinate names
                break;
            }
            //endregion

            //region check circle_Center_axes
            returnVal = checkCircleCenterAxes(splitRow[i]);
            if (returnVal) {
                if (returnVal.type && returnVal.type.match('parseError')) {
                    primitive.operators[i].type = returnVal.type;
                    View.sinumerikView.parseData.errors.push({
                        text: `Circle center parse error "${returnVal.type}".  prog ${programName} row ${progRowNum + 1}`,
                        row: progRowNum
                    });
                    break;
                }
                if (i) {
                    primitive.operators.forEach(function (operator, index) {
                        if (operator.type == 'circleCenter' && returnVal.name == operator.name) {
                            View.sinumerikView.parseData.errors.push({
                                text: `"${returnVal.name}" axis name is used more than once.  prog ${programName} row ${progRowNum + 1}`,
                                row: progRowNum
                            });
                        }
                    });
                }
                primitive.operators[i].type = `circleCenter`;
                if (returnVal.type) {
                    primitive.operators[i].subtype = returnVal.type;
                }
                primitive.operators[i].name = returnVal.name;

                if (returnVal.type && returnVal.type == 'AC' && returnVal.name == 'I' && View.sinumerikView.parseData.diamon) {
                    primitive.operators[i].value = (returnVal.value) / 2;
                } else {
                    primitive.operators[i].value = (returnVal.value);
                }
                //check the same coordinate names
                break;
            }
            //endregion

            //region TURN
            if (splitRow[i].match(/(?<!\w)TURN\=/)) {
                primitive.operators[i].type = 'TURN';
                const mathVal = mathParse(splitRow[i].slice(3), programName, progRowNum);
                if (mathVal != null) {
                    if (mathVal % 1 == 0) {
                        primitive.operators[i].value = mathVal;
                    } else {
                        View.sinumerikView.parseData.errors.push({
                            text: `Right part of TURN assignment not integer ${mathVal}. prog ${programName} row ${progRowNum + 1}`,
                            row: progRowNum
                        })
                    }
                } else {
                    View.sinumerikView.parseData.errors.push({
                        text: `Right part of TURN assignment error. prog ${programName} row ${progRowNum + 1}`,
                        row: progRowNum
                    })
                }
                break;
            }
            //endregion

            //region circle AR CR
            if (splitRow[i].match(/(?<!\w)AR\=/)) {
                primitive.operators[i].type = 'circle_AR';
                const mathVal = mathParse(splitRow[i].slice(3), programName, progRowNum);
                if (mathVal != null) {
                    primitive.operators[i].value = mathVal;
                } else {
                    View.sinumerikView.parseData.errors.push({
                        text: `Right part of AR assignment error. prog ${programName} row ${progRowNum + 1}`,
                        row: progRowNum
                    })
                }
                break;
            }

            if (splitRow[i].match(/(?<!\w)CR\=/)) {
                primitive.operators[i].type = 'circle_CR';
                const mathVal = mathParse(splitRow[i].slice(3), programName, progRowNum);
                if (mathVal != null) {
                    primitive.operators[i].value = mathVal;
                } else {
                    View.sinumerikView.parseData.errors.push({
                        text: `Right part of CR assignment error. prog ${programName} row ${progRowNum + 1}`,
                        row: progRowNum
                    })
                }
                break;
            }
            //endregion

            //region polar AP RP
            if (splitRow[i].match(/(?<!\w)AP\=/)) {
                primitive.operators[i].type = 'coordinate';
                primitive.operators[i].subtype = 'AP';
                if (splitRow[i].match(/(?<!\w)IC\(/)) {
                    let mathVal = mathParse(splitRow[i].substring(splitRow[i].match(/(?<!\w)IC\(/).index + 3, splitRow[i].length - 1), programName, progRowNum);
                    if (mathVal != null) {
                        primitive.operators[i].value = mathVal + View.sinumerikView.parseData.pole.AP;
                    } else {
                        View.sinumerikView.parseData.errors.push({
                            text: `Right part of AP assignment error (${splitRow[i].substring(splitRow[i].match(/(?<!\w)IC\(/).index + 3, splitRow[i].length - 1)}). prog ${programName} row ${progRowNum + 1}`,
                            row: progRowNum
                        })
                    }
                } else {
                    const mathVal = mathParse(splitRow[i].slice(3), programName, progRowNum);
                    if (mathVal != null) {
                        primitive.operators[i].value = mathVal;
                    } else {
                        View.sinumerikView.parseData.errors.push({
                            text: `Right part of AP assignment error. prog ${programName} row ${progRowNum + 1}`,
                            row: progRowNum
                        })
                    }
                }
                break;
            }

            if (splitRow[i].match(/(?<!\w)RP\=/)) {
                primitive.operators[i].type = 'coordinate';
                primitive.operators[i].subtype = 'RP';
                if (splitRow[i].match(/(?<!\w)IC\(/)) {
                    let mathVal = mathParse(splitRow[i].substring(splitRow[i].match(/(?<!\w)IC\(/).index + 3, splitRow[i].length - 1), programName, progRowNum);
                    if (mathVal != null) {
                        primitive.operators[i].value = mathVal + View.sinumerikView.parseData.pole.RP;
                    } else {
                        View.sinumerikView.parseData.errors.push({
                            text: `Right part of PR assignment error (${splitRow[i].substring(splitRow[i].match(/(?<!\w)IC\(/).index + 3, splitRow[i].length - 1)}). prog ${programName} row ${progRowNum + 1}`,
                            row: progRowNum
                        })
                    }
                } else {
                    const mathVal = mathParse(splitRow[i].slice(3), programName, progRowNum);
                    if (mathVal != null) {
                        primitive.operators[i].value = mathVal;
                    } else {
                        View.sinumerikView.parseData.errors.push({
                            text: `Right part of RP assignment error. prog ${programName} row ${progRowNum + 1}`,
                            row: progRowNum
                        })
                    }
                }
                break;
            }
            //endregion

            // region ANG etc modificators
            if (splitRow[i].match(/(?<!\w)(ANG|CHF|RNDM)(?=[\=])/)) {
                primitive.operators[i].type = 'Move modificator';
                primitive.operators[i].value = splitRow[i].match(/(?<!\w)ANG|CHF|RNDM(?=[\=])/)[0];
                break;
            }
            // endregion

            //region RND
            if (splitRow[i].match(/(?<!\w)RND\=/)) {
                primitive.operators[i].type = 'coordinate';
                primitive.operators[i].subtype = 'RND';
                const mathVal = mathParse(splitRow[i].slice(4), programName, progRowNum);
                if (mathVal != null) {
                    primitive.operators[i].value = mathVal;
                } else {
                    View.sinumerikView.parseData.errors.push({
                        text: `Right part of RND assignment error. prog ${programName} row ${progRowNum + 1}`,
                        row: progRowNum
                    })
                }
                break;
            }
            //endregion

            //region CHR
            if (splitRow[i].match(/(?<!\w)CHR\=/)) {
                primitive.operators[i].type = 'coordinate';
                primitive.operators[i].subtype = 'CHR';
                const mathVal = mathParse(splitRow[i].slice(4), programName, progRowNum);
                if (mathVal != null) {
                    primitive.operators[i].value = mathVal;
                } else {
                    View.sinumerikView.parseData.errors.push({
                        text: `Right part of CHR assignment error. prog ${programName} row ${progRowNum + 1}`,
                        row: progRowNum
                    })
                }
                break;
            }
            //endregion

            returnVal = checkAssignment(splitRow[i], programName);
            if (returnVal) {
                if (returnVal.type) {
                    primitive.operators[i].type = returnVal.type;
                    View.sinumerikView.parseData.errors.push({
                        text: `${returnVal.type}.  prog ${programName} row ${progRowNum + 1}`,
                        row: progRowNum
                    });
                    break;
                } else {
                    primitive.operators[i].type = 'assignment';
                    primitive.operators[i].name = returnVal.name;
                    primitive.operators[i].value = returnVal.value;
                }

                break;
            }

            //region DIAMON
            if (splitRow[i] == 'DIAMON') {
                primitive.operators[i].type = 'diamon';
                break;
            }
            if (splitRow[i] == 'DIAM90') {
                primitive.operators[i].type = 'diam90';
                break;
            }
            if (splitRow[i] == 'DIAMOF') {
                primitive.operators[i].type = 'diamof';
                break;
            }

            //endregion

            //If can not parse

            primitive.operators[i].type = 'parseError';
            View.sinumerikView.parseData.errors.push({
                text: `${splitRow[i]}. Not one parser worked. prog ${programName} row ${progRowNum + 1}`,
                row: progRowNum
            });
            break;
            //check math
        }
    }

    return primitive;

    function checkCircleCenterAxes(str) {
        const returnVal = {};
        const regEx = /(?<!\w)([IJK])(?=[\d\=\-\+])/;

        const regExExec = regEx.exec(str);
        if (regExExec) {
            returnVal.name = regExExec[0];
            if (str.substring(regExExec[0].length, regExExec[0].length + 1) != '=') {
                const regExLocal = /^[\-\+]?\d+[\.]?\d*/;
                const regExExecLocal = regExLocal.exec(str.substring(regExExec[0].length));
                if (regExExecLocal && regExExecLocal.input && regExExecLocal[0] == regExExecLocal.input) {
                    returnVal.value = regExExecLocal[0];
                } else {
                    returnVal.type = 'parseError_001';
                }
            } else {
                let mathVal;
                if (str.substring(regExExec[0].length + 1, regExExec[0].length + 3).match(/IC|AC/)) {
                    mathVal = mathParse(str.substring(str.indexOf('(') + 1, str.lastIndexOf(')')), programName, progRowNum);
                    returnVal.type = str.substring(regExExec[0].length + 1, regExExec[0].length + 3);
                } else {
                    mathVal = mathParse(str.substring(regExExec[0].length + 1), programName, progRowNum);
                }
                if (mathVal != null) {
                    returnVal.value = mathVal;
                } else {
                    returnVal.type = 'parseError_002';
                }
            }
            return returnVal;
        }
        return false;
    }

    function checkCoordinates(str) {
        const returnVal = {};
        let regEx = /(?<!\w)([XYZABC])(?=[\d\=\-\+])/;
        if (spindleAxis != '' && spindleAxis != 'C') {
            regEx = new RegExp(`(?<!\\w)((${spindleAxis})|([XYZABC]))(?=[\\d\\=\\-\\+])`);
        }

        const regExExec = regEx.exec(str);
        if (regExExec) {
            returnVal.name = regExExec[0];
            if (str.substring(regExExec[0].length, regExExec[0].length + 1) != '=') {
                const regExLocal = /^[\-\+]?\d+[\.]?\d*/;
                const regExExecLocal = regExLocal.exec(str.substring(regExExec[0].length));
                if (regExExecLocal && regExExecLocal.input && regExExecLocal[0] == regExExecLocal.input) {
                    returnVal.value = regExExecLocal[0];
                } else {
                    returnVal.type = 'parseError_001';
                }
            } else {
                let mathVal;
                if (str.substring(regExExec[0].length + 1, regExExec[0].length + 3).match(/IC|AC/)) {
                    mathVal = mathParse(str.substring(str.indexOf('(') + 1, str.lastIndexOf(')')), programName, progRowNum);
                    returnVal.type = str.substring(regExExec[0].length + 1, regExExec[0].length + 3);
                } else if (str.substring(regExExec[0].length + 1, regExExec[0].length + 4).match(/DC|ACN|ACP/)) {
                    mathVal = mathParse(str.substring(str.indexOf('(') + 1, str.lastIndexOf(')')), programName, progRowNum);
                } else {
                    mathVal = mathParse(str.substring(regExExec[0].length + 1), programName, progRowNum);
                }
                if (mathVal != null) {
                    returnVal.value = mathVal;
                } else {
                    returnVal.type = 'parseError_002';
                }
            }
            if (programRow.match(/(?<!\w)ANG(?=[\=])/)) {
                if (!returnVal.modificator) {
                    returnVal.modificator = {};
                }
                const endAngIndex = programRow.indexOf(' ', programRow.indexOf('ANG') + 4);
                const mathVal = mathParse(programRow.substring(programRow.indexOf('ANG') + 4).split(' ')[0], programName, progRowNum);
                if (mathVal != null) {
                    returnVal.modificator.ang = mathVal;
                } else {
                    View.sinumerikView.parseData.errors.push({
                        text: `Right part of ANG assignment error. prog ${programName} row ${progRowNum + 1}`,
                        row: progRowNum
                    })
                }
            }

            return returnVal;
        }
        return false;
    }

    function checkMoveGroup(str) {
        let regEx = /G33|G[0-3]/;
        let regExExec = regEx.exec(str);
        if (regExExec && regExExec[0] == regExExec.input) {
            return true;
        }
        regEx = /G[23]/;
        regExExec = regEx.exec(str);
        if (regExExec && regExExec[0] == regExExec.input) {
            return true;
        }

        return false;
    }

    function checkRowNum(str) {
        const regEx = /N\d+/;
        const regExExec = regEx.exec(str);
        if (regExExec && regExExec[0] == regExExec.input) {
            return true;
        }
        return false;
    }

    function checkMark(str) {
        const regEx = /[A-Z_][A-Z_]\S*\:/;
        const regExExec = regEx.exec(str);
        if (regExExec && regExExec[0] == regExExec.input) {
            return true;
        }
        return false;
    }

    function checkAssignment(str, programName) {
        const returnVal = {};
        if (Object.keys(View.sinumerikView.parseData.variables[`${programName}`]).length) {
            for (const variable in View.sinumerikView.parseData.variables[`${programName}`]) {
                let regEx = new RegExp(`(?<=\\W|^)${View.sinumerikView.parseData.variables[`${programName}`][variable].name}(?=[\\=])`);
                if (regEx.exec(str)) {
                    returnVal.name = View.sinumerikView.parseData.variables[`${programName}`][variable].name;
                    returnVal.nameLength = regEx.exec(str)[0].length;
                }
            }
        }

        const regEx = /(?<!\w)R\d+(?=[\=])/;

        const regExExec = regEx.exec(str);
        if (regExExec) {
            returnVal.name = regExExec[0];
            returnVal.nameLength = regExExec[0].length;
        }

        if (returnVal.name === undefined && Object.keys(View.sinumerikView.parseData.variables.firstChannelVariables).length) {
            const name = str.split('=')[0]
            if (View.sinumerikView.parseData.variables.firstChannelVariables[name] !== undefined) {
                returnVal.name = name
                returnVal.nameLength = name.length
            }
        }
        const definedVars = Object.assign({}, View.sinumerikView.parseData.variables[programName], View.sinumerikView.parseData.variables.firstChannelVariables)

        if (returnVal.name != undefined &&
            definedVars[returnVal.name] &&
            definedVars[returnVal.name].type.substring(0, 6) == 'string') {
            returnVal.value = stringParse(str.substring(returnVal.nameLength + 1), programName, programRow)
            return returnVal
        }

        if (returnVal.name != undefined) {
            const splitStr = str.split('=');
            if (splitStr.length != 2) {
                returnVal.type = `Error in assignment ${str}`;
            }

            const mathVal = mathParse(str.substring(returnVal.nameLength + 1), programName, progRowNum);
            if (mathVal != null) {
                returnVal.value = mathVal;
            } else {
                returnVal.type = `Error in right part ${str}`;
            }
            return returnVal;
        }

        return false;
    }

}

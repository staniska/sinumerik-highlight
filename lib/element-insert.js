'use babel';

import View from "./sinumerik";
import sinumerikMath from "./degreesMath";
import {getCoordinatesInBase, getCoordinatesInFrame} from "./interpretator";

const myMath = new sinumerikMath();


export function insertRnd(element_1, element_2, programName) {
    // console.log(element_1);
    // console.log(element_2);
    if (element_1.type == 'G1' && element_2.type == 'G1') {
        var axes = [];
        if (View.sinumerikView.parseData.plane == 'G17') {
            axes = ['X', 'Y', 'Z'];
        } else if (View.sinumerikView.parseData.plane == 'G18') {
            axes = ['Z', 'X', 'Y'];
        } else {
            axes = ['Y', 'Z', 'X'];
        }

        var startCoordsInFrame = [];
        var endCoordsInFrame = []

        startCoordsInFrame[0] = getCoordinatesInFrame({X:element_1.X_start, Y:element_1.Y_start,Z:element_1.Z_start});
        endCoordsInFrame[0] = getCoordinatesInFrame({X:element_1.X, Y:element_1.Y,Z:element_1.Z});
        startCoordsInFrame[0] = {X:startCoordsInFrame[0][0], Y:startCoordsInFrame[0][1],Z:startCoordsInFrame[0][2]};
        endCoordsInFrame[0] = {X:endCoordsInFrame[0][0], Y:endCoordsInFrame[0][1],Z:endCoordsInFrame[0][2]};

        var ang_1 = myMath.atan2((endCoordsInFrame[0][axes[1]] - startCoordsInFrame[0][axes[1]]), (endCoordsInFrame[0][axes[0]] - startCoordsInFrame[0][axes[0]]));
        if (ang_1 < 0) {
            ang_1 += 360;
        }

        var length_1 = Math.sqrt((startCoordsInFrame[0][axes[1]] - endCoordsInFrame[0][axes[1]])**2 + (startCoordsInFrame[0][axes[0]] - endCoordsInFrame[0][axes[0]])**2);

        startCoordsInFrame[1] = getCoordinatesInFrame({X:element_2.X_start, Y:element_2.Y_start,Z:element_2.Z_start});
        endCoordsInFrame[1] = getCoordinatesInFrame({X:element_2.X, Y:element_2.Y,Z:element_2.Z});
        startCoordsInFrame[1] = {X:startCoordsInFrame[1][0], Y:startCoordsInFrame[1][1],Z:startCoordsInFrame[1][2]};
        endCoordsInFrame[1] = {X:endCoordsInFrame[1][0], Y:endCoordsInFrame[1][1],Z:endCoordsInFrame[1][2]};

        var ang_2 = myMath.atan2((endCoordsInFrame[1][axes[1]] - startCoordsInFrame[1][axes[1]]), (endCoordsInFrame[1][axes[0]] - startCoordsInFrame[1][axes[0]]));
        if (ang_2 < 0) {
            ang_2 += 360;
        }
        var length_2 = Math.sqrt((startCoordsInFrame[1][axes[1]] - endCoordsInFrame[1][axes[1]])**2 + (startCoordsInFrame[1][axes[0]] - endCoordsInFrame[1][axes[0]])**2);

        if (ang_1 == ang_2) {
            return ([element_1, element_2]);
        }

        var ang = Math.abs(ang_2 - ang_1 + 180);
        if (ang > 360) {
            ang -= 360;
        }
        if (ang > 180) {
            ang = 360 - ang;
        }

        var maxRnd = (myMath.sin(ang / 2) * Math.min(length_1,length_2)) / myMath.cos(ang / 2);

        if (maxRnd < element_1.RND) {
            View.sinumerikView.parseData.errors.push({text:`RND value too large. ${programName} row ${element_1.row + 1}`, row: element_1.row});
            element_1.RND = maxRnd;
        }

        var katet = element_1.RND / myMath.tan(ang / 2);

        if (ang>90) {
            ang-=90;
        } else {
            ang +=90;
        }
        if (ang == 180) {
            ang -= 90;
        }

        element_1[axes[0]] = endCoordsInFrame[0][axes[0]] - katet * myMath.cos(ang_1);
        element_1[axes[1]] = endCoordsInFrame[0][axes[1]] - katet * myMath.sin(ang_1);
        element_1[axes[2]] = endCoordsInFrame[0][axes[2]] - (endCoordsInFrame[0][axes[2]] - startCoordsInFrame[0][axes[2]]) * (Math.abs(katet) / length_1);

        element_2[`${axes[0]}_start`] = startCoordsInFrame[1][axes[0]] + katet * myMath.cos(ang_2);
        element_2[`${axes[1]}_start`] = startCoordsInFrame[1][axes[1]] + katet * myMath.sin(ang_2);
        element_2[`${axes[2]}_start`] = startCoordsInFrame[1][axes[2]] + (endCoordsInFrame[1][axes[2]] - startCoordsInFrame[1][axes[2]]) * (Math.abs(katet) / length_1);

        if (ang>90) {
            ang = 270 - ang;
        }
        if (ang < 90) {
            ang = 90 - ang;
        }

        var circleCenter = [];

        if (ang_2 - ang_1 > 180 || (ang_2 - ang_1 < 0 && ang_2 - ang_1 > -180)) {
            var centerAng = ang_1 - 90;
            ang *= -1;
        } else {
            var centerAng = ang_1 + 90;
        }
        circleCenter[0] = element_1[axes[0]] + myMath.cos(centerAng) * element_1.RND;
        circleCenter[1] = element_1[axes[1]] + myMath.sin(centerAng) * element_1.RND;

        var vectorStartAng = centerAng + 180;
        var vectorEndAng = vectorStartAng + ang;

        var pointsNum = Math.round((element_1.RND * Math.PI) * (Math.abs(ang) / 180));
        if (pointsNum < 30) {
            pointsNum = 30;
        }
        if (pointsNum > 200) {
            pointsNum = 200;
        }
        for (let i = 0; i < pointsNum; i++) {

            var canvasCircleElement = {
                row: element_1.row,
                type: 'G1'
            }
            canvasCircleElement[`${axes[0]}_start`] = myMath.cos(vectorStartAng + ang * (i/pointsNum)) * element_1.RND + circleCenter[0];
            canvasCircleElement[`${axes[1]}_start`] = myMath.sin(vectorStartAng + ang * (i/pointsNum)) * element_1.RND + circleCenter[1];
            canvasCircleElement[`${axes[2]}_start`] = (element_2[`${axes[2]}_start`] - element_1[axes[2]]) * (i/pointsNum);
            canvasCircleElement[axes[0]] = myMath.cos(vectorStartAng + ang * ((i + 1)/pointsNum)) * element_1.RND + circleCenter[0];
            canvasCircleElement[axes[1]] = myMath.sin(vectorStartAng + ang * ((i + 1)/pointsNum)) * element_1.RND + circleCenter[1];
            canvasCircleElement[axes[2]] = (element_2[`${axes[2]}_start`] - element_1[axes[2]]) * ((i+1)/pointsNum);

            var circleElementStart = getCoordinatesInBase({X:canvasCircleElement.X_start, Y:canvasCircleElement.Y_start,Z:canvasCircleElement.Z_start});
            var circleElementEnd = getCoordinatesInBase({X: canvasCircleElement.X, Y: canvasCircleElement.Y, Z: canvasCircleElement.Z});
            circleElementStart = {X:circleElementStart[0], Y: circleElementStart[1], Z: circleElementStart[2]};
            circleElementEnd = {X:circleElementEnd[0], Y: circleElementEnd[1], Z: circleElementEnd[2]};


            for (let i=0; i<3; i++) {
                canvasCircleElement[`${axes[i]}_start`] = circleElementStart[axes[i]];
                canvasCircleElement[axes[i]] = circleElementEnd[axes[i]];
            }

            // console.log(JSON.stringify(canvasCircleElement));
            View.sinumerikView.parseData.canvas.push(canvasCircleElement);
        }

        var coordsInBasis = getCoordinatesInBase({X:element_1.X, Y:element_1.Y,Z:element_1.Z});
        coordsInBasis = {X:coordsInBasis[0], Y:coordsInBasis[1], Z:coordsInBasis[2]};
        element_1[axes[0]] = coordsInBasis[axes[0]];
        element_1[axes[1]] = coordsInBasis[axes[1]];
        element_1[axes[2]] = coordsInBasis[axes[2]];

        coordsInBasis = getCoordinatesInBase({X:element_2.X_start, Y:element_2.Y_start,Z:element_2.Z_start});
        coordsInBasis = {X:coordsInBasis[0], Y:coordsInBasis[1], Z:coordsInBasis[2]};
        element_2[`${axes[0]}_start`] = coordsInBasis[axes[0]];
        element_2[`${axes[1]}_start`] = coordsInBasis[axes[1]];
        element_2[`${axes[2]}_start`] = coordsInBasis[axes[2]];

        return ([element_1, element_2]);
    }
    // if (element_1.type.match(/G[23]/) && element_2.type == 'G1') {
    //     var axes = [];
    //     var circleCenterAxes = [];
    //     if (View.sinumerikView.parseData.plane == 'G17') {
    //         axes = ['X', 'Y', 'Z'];
    //         circleCenterAxes = ['I', 'J'];
    //     } else if (View.sinumerikView.parseData.plane == 'G18') {
    //         axes = ['Z', 'X', 'Y'];
    //         circleCenterAxes = ['K', 'I'];
    //     } else {
    //         axes = ['Y', 'Z', 'X'];
    //         circleCenterAxes = ['J', 'K'];
    //     }
    //
    //     var element_2_startInFrame = getCoordinatesInFrame({X:element_2.X_start, Y:element_2.Y_start, Z:element_2.Z_start});
    //     var element_2_endInFrame = getCoordinatesInFrame({X:element_2.X, Y:element_2.Y, Z:element_2.Z});
    //     element_2_startInFrame = {X:element_2_startInFrame[0], Y: element_2_startInFrame[1], Z: element_2_startInFrame[2]};
    //     element_2_endInFrame = {X:element_2_endInFrame[0], Y: element_2_endInFrame[1], Z: element_2_endInFrame[2]};
    //
    //     var line_ang = myMath.atan2((element_2_endInFrame[axes[1]] - element_2_startInFrame[axes[1]]),(element_2_endInFrame[axes[0]] - element_2_startInFrame[axes[0]]));
    //     if (line_ang < 20) {
    //         line_ang += 360;
    //     }
    //     var circleCenter_ang = myMath.atan2((element_1[circleCenterAxes[1]] - element_2_startInFrame[axes[1]]),(element_1[circleCenterAxes[0]] - element_2_startInFrame[axes[0]]));
    //     if (circleCenter_ang < 0) {
    //         circleCenter_ang += 360;
    //     }
    //     var circleRadius = Math.sqrt((element_1[circleCenterAxes[1]] - element_2_startInFrame[axes[1]])**2 + (element_1[circleCenterAxes[0]] - element_2_startInFrame[axes[0]])**2)
    //
    //     console.log('line_ang: ' + line_ang);
    //     console.log('circle_center_ang:' + circleCenter_ang);
    //
    //     if (Math.abs(Math.abs(circleCenter_ang - line_ang) - 90) < 1e-6 ) {
    //         console.log('Касательная');
    //     }
    //
    //     var RND_center = {};
    //     var ang_circleCenter_lineStart_lineEnd = myMath.atan2((element_1[circleCenterAxes[1]] - element_1[axes[1]]), (element_1[circleCenterAxes[0]] - element_1[axes[0]])) -
    //                                              myMath.atan2((element_2_endInFrame[axes[1]] - element_2_startInFrame[axes[1]]), (element_2_endInFrame[axes[0]] - element_2_startInFrame[axes[0]]));
    //
    //     var RND_radius_factor = 1;
    //     if (Math.abs(ang_circleCenter_lineStart_lineEnd) < 90) {
    //         RND_radius_factor = -1;
    //         console.log('RND minus');
    //     }
    //     console.log(ang_circleCenter_lineStart_lineEnd);
    //     var RND_center_radius = circleRadius + element_1.RND * RND_radius_factor;
    //     console.log('RND center radius: ' + RND_center_radius);
    //
    //     //line func
    //     var A = element_2_startInFrame[axes[1]] - element_2_endInFrame[axes[1]];
    //     var B = element_2_endInFrame[axes[0]] - element_2_startInFrame[axes[0]];
    //     var C = -1 * element_2_endInFrame[axes[0]] * (element_2_startInFrame[axes[1]] - element_2_endInFrame[axes[1]]) + element_2_endInFrame[axes[1]] * (element_2_startInFrame[axes[0]] - element_2_endInFrame[axes[0]]);
    //
    //
    //     if (A != 0) {
    //         B /= A;
    //         C /= A;
    //         A = 1;
    //     } else {
    //         A=0;
    //         C /= B;
    //         B=1;
    //     }
    //         // console.log(A +`${axes[0].toLowerCase()} + ` + B + `${axes[1].toLowerCase()} + ` + C + ' = 0');
    //
    //     var distance_From_CircleCenter_To_RND_Line = Math.abs((A * element_1[circleCenterAxes[0]] + B * element_1[circleCenterAxes[1]] + C)/Math.sqrt(A**2 + B**2) + element_1.RND * RND_radius_factor);
    //     console.log('Distance: ' + distance_From_CircleCenter_To_RND_Line);
    //
    //     var ang_factor = (distance_From_CircleCenter_To_RND_Line / Math.abs(distance_From_CircleCenter_To_RND_Line))
    //     var ang_norm = line_ang +  ang_factor * 90;
    //
    //     console.log('Угол перпендикуляра к прямой: ' + ang_norm);
    //
    //     var ang_To_RND_center = ang_norm - RND_radius_factor * myMath.acos(distance_From_CircleCenter_To_RND_Line / RND_center_radius);
    //     console.log(ang_To_RND_center);
    //
    //     RND_center[axes[0]] = myMath.cos(ang_To_RND_center) * RND_center_radius + element_1[circleCenterAxes[0]];
    //     RND_center[axes[1]] = myMath.sin(ang_To_RND_center) * RND_center_radius + element_1[circleCenterAxes[1]];
    //
    //     for (let i = 0; i < 36; i++) {
    //         var canvasCircleElement = {
    //             row: element_1.row,
    //             type: 'G1'
    //         }
    //         canvasCircleElement[`${axes[0]}_start`] = myMath.cos(10 * i) * element_1.RND + RND_center[axes[0]];
    //         canvasCircleElement[`${axes[1]}_start`] = myMath.sin(10 * i) * element_1.RND + RND_center[axes[1]];
    //         canvasCircleElement[`${axes[2]}_start`] = element_2_startInFrame[axes[2]];
    //         canvasCircleElement[axes[0]] = myMath.cos(10 * (i + 1)) * element_1.RND + RND_center[axes[0]];
    //         canvasCircleElement[axes[1]] = myMath.sin(10 * (i + 1)) * element_1.RND + RND_center[axes[1]];
    //         canvasCircleElement[axes[2]] = element_2_startInFrame[axes[2]];
    //
    //         var circleElementStart = getCoordinatesInBase({X:canvasCircleElement.X_start, Y:canvasCircleElement.Y_start,Z:canvasCircleElement.Z_start});
    //         var circleElementEnd = getCoordinatesInBase({X: canvasCircleElement.X, Y: canvasCircleElement.Y, Z: canvasCircleElement.Z});
    //         circleElementStart = {X:circleElementStart[0], Y: circleElementStart[1], Z: circleElementStart[2]};
    //         circleElementEnd = {X:circleElementEnd[0], Y: circleElementEnd[1], Z: circleElementEnd[2]};
    //
    //
    //         for (let i=0; i<3; i++) {
    //             canvasCircleElement[`${axes[i]}_start`] = circleElementStart[axes[i]];
    //             canvasCircleElement[axes[i]] = circleElementEnd[axes[i]];
    //         }
    //         View.sinumerikView.parseData.canvas.push(canvasCircleElement);
    //     }
    // }
    // return ([element_1, element_2]);
}

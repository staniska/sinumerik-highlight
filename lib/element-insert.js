'use babel';

import View from "./sinumerik";
import sinumerikMath from "./degreesMath";
import {getCoordinatesInBase, getCoordinatesInFrame} from "./coordinates";

const myMath = new sinumerikMath();

//TODO переделать вставку элементов на обработку массива элементов целиком перед генерацией элементов для canvas

export function insertRnd(element_1, element_2, programName, recursion) {

    if (element_1.type == 'G1' && element_2.type == 'G1') {
        let axes = [];
        if (View.sinumerikView.parseData.plane == 'G17') {
            axes = ['X', 'Y', 'Z'];
        } else if (View.sinumerikView.parseData.plane == 'G18') {
            axes = ['Z', 'X', 'Y'];
        } else {
            axes = ['Y', 'Z', 'X'];
        }

        const startCoordsInFrame = [];
        const endCoordsInFrame = []

        startCoordsInFrame[0] = getCoordinatesInFrame({X:element_1.X_start, Y:element_1.Y_start,Z:element_1.Z_start});
        endCoordsInFrame[0] = getCoordinatesInFrame({X:element_1.X, Y:element_1.Y,Z:element_1.Z});
        startCoordsInFrame[0] = {X:startCoordsInFrame[0][0], Y:startCoordsInFrame[0][1],Z:startCoordsInFrame[0][2]};
        endCoordsInFrame[0] = {X:endCoordsInFrame[0][0], Y:endCoordsInFrame[0][1],Z:endCoordsInFrame[0][2]};

        let ang_1 = myMath.atan2((endCoordsInFrame[0][axes[1]] - startCoordsInFrame[0][axes[1]]), (endCoordsInFrame[0][axes[0]] - startCoordsInFrame[0][axes[0]]));
        if (ang_1 < 0) {
            ang_1 += 360;
        }

        const length_1 = Math.sqrt((startCoordsInFrame[0][axes[1]] - endCoordsInFrame[0][axes[1]])**2 + (startCoordsInFrame[0][axes[0]] - endCoordsInFrame[0][axes[0]])**2);

        startCoordsInFrame[1] = getCoordinatesInFrame({X:element_2.X_start, Y:element_2.Y_start,Z:element_2.Z_start});
        endCoordsInFrame[1] = getCoordinatesInFrame({X:element_2.X, Y:element_2.Y,Z:element_2.Z});
        startCoordsInFrame[1] = {X:startCoordsInFrame[1][0], Y:startCoordsInFrame[1][1],Z:startCoordsInFrame[1][2]};
        endCoordsInFrame[1] = {X:endCoordsInFrame[1][0], Y:endCoordsInFrame[1][1],Z:endCoordsInFrame[1][2]};

        let ang_2 = myMath.atan2((endCoordsInFrame[1][axes[1]] - startCoordsInFrame[1][axes[1]]), (endCoordsInFrame[1][axes[0]] - startCoordsInFrame[1][axes[0]]));
        if (ang_2 < 0) {
            ang_2 += 360;
        }
        const length_2 = Math.sqrt((startCoordsInFrame[1][axes[1]] - endCoordsInFrame[1][axes[1]])**2 + (startCoordsInFrame[1][axes[0]] - endCoordsInFrame[1][axes[0]])**2);

        if (ang_1 == ang_2) {
            return ([element_1, element_2]);
        }

        if (Math.abs(ang_1-ang_2) === 180) {
            return ([element_1, element_2]);
        }

        let ang = Math.abs(ang_2 - ang_1 + 180);
        if (ang > 360) {
            ang -= 360;
        }
        if (ang > 180) {
            ang = 360 - ang;
        }

        const maxRnd = (myMath.sin(ang / 2) * Math.min(length_1,length_2)) / myMath.cos(ang / 2);

        if (maxRnd < element_1.RND) {

            if (Math.abs(maxRnd - element_2.RND) > 1e-10) {
                View.sinumerikView.parseData.errors.push({
                    text: `RND value too large. ${programName} row ${element_1.row + 1}`,
                    row: element_1.row
                });
            }
            element_1.RND = maxRnd;
        }

        const katet = element_1.RND / myMath.tan(ang / 2);

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

        const circleCenter = [];

        if (ang_2 - ang_1 > 180 || (ang_2 - ang_1 < 0 && ang_2 - ang_1 > -180)) {
            var centerAng = ang_1 - 90;
            ang *= -1;
        } else {
            var centerAng = ang_1 + 90;
        }
        circleCenter[0] = element_1[axes[0]] + myMath.cos(centerAng) * element_1.RND;
        circleCenter[1] = element_1[axes[1]] + myMath.sin(centerAng) * element_1.RND;

        const vectorStartAng = centerAng + 180;
        const vectorEndAng = vectorStartAng + ang;

        let pointsNum = Math.round((element_1.RND * Math.PI) * (Math.abs(ang) / 180));
        if (pointsNum < 30) {
            pointsNum = 30;
        }
        if (pointsNum > 200) {
            pointsNum = 200;
        }

        let coordsInBasis = getCoordinatesInBase({X:element_1.X, Y:element_1.Y,Z:element_1.Z});
        coordsInBasis = {X:coordsInBasis[0], Y:coordsInBasis[1], Z:coordsInBasis[2]};
        element_1[axes[0]] = coordsInBasis[axes[0]];
        element_1[axes[1]] = coordsInBasis[axes[1]];
        element_1[axes[2]] = coordsInBasis[axes[2]];

        coordsInBasis = getCoordinatesInBase({X:element_2.X_start, Y:element_2.Y_start,Z:element_2.Z_start});
        coordsInBasis = {X:coordsInBasis[0], Y:coordsInBasis[1], Z:coordsInBasis[2]};
        element_2[`${axes[0]}_start`] = coordsInBasis[axes[0]];
        element_2[`${axes[1]}_start`] = coordsInBasis[axes[1]];
        element_2[`${axes[2]}_start`] = coordsInBasis[axes[2]];

        //ВОт тут рисуем первую линию
        View.sinumerikView.parseData.canvas.push(element_1);

        if (View.sinumerikView.parseData.currentBucket) {
            View.sinumerikView.parseData.contourElements[View.sinumerikView.parseData.currentBucket].push({
                type: 'line',
                start: Object.keys(element_1).filter(k => ['X','Y','Z'].map(ax => ax + '_start').indexOf(k) > -1).map(k => element_1[k]),
                end: Object.keys(element_1).filter(k => ['X','Y','Z'].indexOf(k) > -1).map(k => element_1[k])
            })
        }

        const centerCoordsArray = []
        centerCoordsArray[0] = axes.indexOf('X') < 2 ? circleCenter[axes.indexOf('X')] : (element_1.X + element_2.X_start)/2
        centerCoordsArray[1] = axes.indexOf('Y') < 2 ? circleCenter[axes.indexOf('Y')] : (element_1.Y + element_2.Y_start)/2
        centerCoordsArray[2] = axes.indexOf('Z') < 2 ? circleCenter[axes.indexOf('Z')] : (element_1.Z + element_2.Z_start)/2

        const contour_element = {
            type: 'arc',
            start: [element_1.X,element_1.Y, element_1.Z],
            end: [element_2.X_start,element_2.Y_start, element_2.Z_start],
            center: centerCoordsArray,
            ccw: ang > 0,
            radius: element_1.RND,
            source: 'RND G1-G1',
            planeAxes: [axes[0], axes[1]],
        }
        if (View.sinumerikView.parseData.currentBucket) {
            View.sinumerikView.parseData.contourElements[View.sinumerikView.parseData.currentBucket].push(contour_element)
        }

        for (let i = 0; i < pointsNum; i++) {

            const canvasCircleElement = {
                row: element_1.row,
                type: 'G1',
                elementId: element_1.elementId,
                sourceFile: element_1.sourceFile
            }
            canvasCircleElement[`${axes[0]}_start`] = myMath.cos(vectorStartAng + ang * (i/pointsNum)) * element_1.RND + circleCenter[0];
            canvasCircleElement[`${axes[1]}_start`] = myMath.sin(vectorStartAng + ang * (i/pointsNum)) * element_1.RND + circleCenter[1];
            canvasCircleElement[`${axes[2]}_start`] = (element_2[`${axes[2]}_start`] - element_1[axes[2]]) * (i/pointsNum);
            canvasCircleElement[axes[0]] = myMath.cos(vectorStartAng + ang * ((i + 1)/pointsNum)) * element_1.RND + circleCenter[0];
            canvasCircleElement[axes[1]] = myMath.sin(vectorStartAng + ang * ((i + 1)/pointsNum)) * element_1.RND + circleCenter[1];
            canvasCircleElement[axes[2]] = element_1[axes[2]] + (element_2[`${axes[2]}_start`] - element_1[axes[2]]) * ((i+1)/pointsNum);

            let circleElementStart = getCoordinatesInBase({X:canvasCircleElement.X_start, Y:canvasCircleElement.Y_start,Z:canvasCircleElement.Z_start});
            let circleElementEnd = getCoordinatesInBase({X: canvasCircleElement.X, Y: canvasCircleElement.Y, Z: canvasCircleElement.Z});
            circleElementStart = {X:circleElementStart[0], Y: circleElementStart[1], Z: circleElementStart[2]};
            circleElementEnd = {X:circleElementEnd[0], Y: circleElementEnd[1], Z: circleElementEnd[2]};

            for (let i=0; i<3; i++) {
                canvasCircleElement[`${axes[i]}_start`] = circleElementStart[axes[i]];
                canvasCircleElement[axes[i]] = circleElementEnd[axes[i]];
            }

            View.sinumerikView.parseData.canvas.push(canvasCircleElement);
        }

        return ([element_1, element_2]);
    }

    if (element_2.type.match(/G[23]/) && element_1.type == 'G1') {
        let circleCenterAxes = [];
        if (View.sinumerikView.parseData.plane == 'G17') {
            circleCenterAxes = ['I', 'J'];
        } else if (View.sinumerikView.parseData.plane == 'G18') {
            circleCenterAxes = ['K', 'I'];
        } else {
            circleCenterAxes = ['J', 'K'];
        }

        const startInFrame = getCoordinatesInFrame({
            X: element_2.X_start,
            Y: element_2.Y_start,
            Z: element_2.Z_start
        })

        const test = true

        const exch_element_1 = {
            row: element_2.row,
            X: test ? startInFrame[0] : element_2.X_start,
            Y: test ? startInFrame[1] : element_2.Y_start,
            Z: test ? startInFrame[2] : element_2.Z_start,
            X_start: element_2.X,
            Y_start: element_2.Y,
            Z_start: element_2.Z,
            RND: element_1.RND
        }
        if (element_2.type == 'G2') {
            exch_element_1.type = 'G3';
        } else {
            exch_element_1.type = 'G2';
        }
        exch_element_1[circleCenterAxes[0]] = element_2[circleCenterAxes[0]];
        exch_element_1[circleCenterAxes[1]] = element_2[circleCenterAxes[1]];

        const exch_element_2 = {
            row: element_1.row,
            type: element_1.type,
            X: element_1.X_start,
            Y: element_1.Y_start,
            Z: element_1.Z_start,
            X_start: element_1.X,
            Y_start: element_1.Y,
            Z_start: element_1.Z,
        }

        const elements = insertRnd(exch_element_1, exch_element_2, programName, 1);
        delete element_1.RND;
        element_1.X = elements[1].X_start;
        element_1.Y = elements[1].Y_start;
        element_1.Z = elements[1].Z_start;

        element_2.X_start = elements[0].X;
        element_2.Y_start = elements[0].Y;
        element_2.Z_start = elements[0].Z;

        const startInBase = getCoordinatesInBase({X:element_2.X_start, Y:element_2.Y_start,Z:element_2.Z_start});

        View.sinumerikView.parseData.axesPos.X = startInBase[0];
        View.sinumerikView.parseData.axesPos.Y = startInBase[1];
        View.sinumerikView.parseData.axesPos.Z = startInBase[2];

        // View.sinumerikView.parseData.axesPos.X = element_2.X_start;
        // View.sinumerikView.parseData.axesPos.Y = element_2.Y_start;
        // View.sinumerikView.parseData.axesPos.Z = element_2.Z_start;

    }

    if (element_1.type.match(/G[23]/) && element_2.type == 'G1') {

        //TODO : Третья ось не просчитывается совсем. Не срочно

        let axes = [];
        let circleCenterAxes = [];
        if (View.sinumerikView.parseData.plane == 'G17') {
            axes = ['X', 'Y', 'Z'];
            circleCenterAxes = ['I', 'J'];
        } else if (View.sinumerikView.parseData.plane == 'G18') {
            axes = ['Z', 'X', 'Y'];
            circleCenterAxes = ['K', 'I'];
        } else {
            axes = ['Y', 'Z', 'X'];
            circleCenterAxes = ['J', 'K'];
        }

        let element_2_startInFrame = getCoordinatesInFrame({X:element_2.X_start, Y:element_2.Y_start, Z:element_2.Z_start});
        let element_2_endInFrame = getCoordinatesInFrame({X:element_2.X, Y:element_2.Y, Z:element_2.Z});
        element_2_startInFrame = {X:element_2_startInFrame[0], Y: element_2_startInFrame[1], Z: element_2_startInFrame[2]};
        element_2_endInFrame = {X:element_2_endInFrame[0], Y: element_2_endInFrame[1], Z: element_2_endInFrame[2]};

        let ang_intersection_circleCenter = myMath.atan2(element_1[circleCenterAxes[1]] - element_2_startInFrame[axes[1]], element_1[circleCenterAxes[0]] - element_2_startInFrame[axes[0]]);
        if (ang_intersection_circleCenter < 0) {
            ang_intersection_circleCenter += 360;
        }
        let line_ang = myMath.atan2((element_2_endInFrame[axes[1]] - element_2_startInFrame[axes[1]]),(element_2_endInFrame[axes[0]] - element_2_startInFrame[axes[0]]));
        if (line_ang < 0) {
            line_ang += 360;
        }

        let ang_tangent = ang_intersection_circleCenter + 90;
        if (element_1.type == 'G3') {
            ang_tangent +=180;
        }
        if (ang_tangent > 360) {
            ang_tangent -=360;
        }

        let RND_center_radius_factor = 1;
        let ang_difference = ang_tangent - line_ang;
        if (ang_difference < 0) {
            ang_difference += 360;
        }
        if ((element_1.type == 'G2' && ang_difference < 180) || (element_1.type == 'G3' && ang_difference > 180)) {
            RND_center_radius_factor = -1;
        }

        const circleRadius = Math.sqrt((element_1[circleCenterAxes[1]] - element_2_startInFrame[axes[1]])**2 + (element_1[circleCenterAxes[0]] - element_2_startInFrame[axes[0]])**2)
        const RND_center_radius = circleRadius + element_1.RND * RND_center_radius_factor;

        //line func
        let A = element_2_startInFrame[axes[1]] - element_2_endInFrame[axes[1]];
        let B = element_2_endInFrame[axes[0]] - element_2_startInFrame[axes[0]];
        let C = -1 * element_2_endInFrame[axes[0]] * (element_2_startInFrame[axes[1]] - element_2_endInFrame[axes[1]]) + element_2_endInFrame[axes[1]] * (element_2_startInFrame[axes[0]] - element_2_endInFrame[axes[0]]);

        if (A != 0) {
            B /= A;
            C /= A;
            A = 1;
        } else {
            A=0;
            C /= B;
            B=1;
        }

        let ang_to_circleCenter = myMath.atan2((element_1[circleCenterAxes[1]] - element_1[axes[1]]),(element_1[circleCenterAxes[0]] - element_1[axes[0]]));
        if (ang_to_circleCenter < 0) {
            ang_to_circleCenter += 360;
        }
        let distance_factor = 1;
        ang_difference = line_ang - ang_to_circleCenter;

        if (ang_difference < 0) {
            ang_difference += 360;
        }
        if (element_1.type == 'G2') {
            if (ang_difference > 180) {
                distance_factor = -1;
            }
        }
        if (element_1.type == 'G3') {
            if (ang_difference < 180) {
                distance_factor = -1;
            }
        }

        const distance_From_CircleCenter_To_RND_Line = distance_factor * Math.abs((A * element_1[circleCenterAxes[0]] + B * element_1[circleCenterAxes[1]] + C)/Math.sqrt(A**2 + B**2)) + element_1.RND * RND_center_radius_factor;

        const ang_factor = (distance_From_CircleCenter_To_RND_Line / Math.abs(distance_From_CircleCenter_To_RND_Line))
        let ang_norm = line_ang +  ang_factor * 90;
        if (element_1.type == 'G3') {
            ang_norm -= 180;
        }
        if (ang_norm > 360) {
            ang_norm -=360;
        }
        if (ang_norm < 0) {
            ang_norm +=360;
        }
        //Начальный угол RND
        let RND_end_ang;
        if ((distance_From_CircleCenter_To_RND_Line <= 0 && element_1.type == 'G3') ||
            (distance_From_CircleCenter_To_RND_Line < 0 && element_1.type == 'G2')) {
            RND_end_ang = ang_norm + 180;
        } else {
            RND_end_ang = ang_norm;
        }
        if (RND_end_ang >= 360) {
            RND_end_ang -= 360;
        }
        if (RND_center_radius_factor > 0 ) {
            RND_end_ang -=180;
        }

        const RND_center = {}
        if (element_1.type == 'G2') {
            if (RND_center_radius_factor < 0 ) {
                const katet_2 = RND_center_radius * myMath.cos(myMath.asin(Math.abs(distance_From_CircleCenter_To_RND_Line)/RND_center_radius))
                RND_center[axes[0]] = Math.abs(distance_From_CircleCenter_To_RND_Line) * myMath.cos(ang_norm) + katet_2 * myMath.cos(line_ang + 180) + element_1[circleCenterAxes[0]];
                RND_center[axes[1]] = Math.abs(distance_From_CircleCenter_To_RND_Line) * myMath.sin(ang_norm) + katet_2 * myMath.sin(line_ang + 180) + element_1[circleCenterAxes[1]];
                if (Number.isNaN(RND_center[axes[0]])) {
                    View.sinumerikView.parseData.errors.push({text: `RND too large "${element_1.RND}"  prog ${programName} row ${element_1.row + 1}`, row: element_1.row});
                    return;
                }
            }
            if (RND_center_radius_factor > 0 ) {
                const katet_2 = RND_center_radius * myMath.cos(myMath.asin(Math.abs(distance_From_CircleCenter_To_RND_Line)/RND_center_radius))
                RND_center[axes[0]] = Math.abs(distance_From_CircleCenter_To_RND_Line) * myMath.cos(ang_norm) + katet_2 * myMath.cos(line_ang) + element_1[circleCenterAxes[0]];
                RND_center[axes[1]] = Math.abs(distance_From_CircleCenter_To_RND_Line) * myMath.sin(ang_norm) + katet_2 * myMath.sin(line_ang) + element_1[circleCenterAxes[1]];
                if (Number.isNaN(RND_center[axes[0]])) {
                    View.sinumerikView.parseData.errors.push({text: `RND too large "${element_1.RND}"  prog ${programName} row ${element_1.row + 1}`, row: element_1.row});
                    return;
                }

            }

        }

        if (element_1.type == 'G3') {
            if (RND_center_radius_factor < 0 ) {
                const katet_2 = RND_center_radius * myMath.cos(myMath.asin(Math.abs(distance_From_CircleCenter_To_RND_Line)/RND_center_radius))
                RND_center[axes[0]] = Math.abs(distance_From_CircleCenter_To_RND_Line) * myMath.cos(ang_norm) + katet_2 * myMath.cos(line_ang + 180) + element_1[circleCenterAxes[0]];
                RND_center[axes[1]] = Math.abs(distance_From_CircleCenter_To_RND_Line) * myMath.sin(ang_norm) + katet_2 * myMath.sin(line_ang + 180) + element_1[circleCenterAxes[1]];
                if (Number.isNaN(RND_center[axes[0]])) {
                    View.sinumerikView.parseData.errors.push({text: `RND too large "${element_1.RND}"  prog ${programName} row ${element_1.row + 1}`, row: element_1.row});
                    return;
                }

            }
            if (RND_center_radius_factor > 0 ) {
                const katet_2 = RND_center_radius * myMath.cos(myMath.asin(Math.abs(distance_From_CircleCenter_To_RND_Line)/RND_center_radius))
                RND_center[axes[0]] = Math.abs(distance_From_CircleCenter_To_RND_Line) * myMath.cos(ang_norm) + katet_2 * myMath.cos(line_ang) + element_1[circleCenterAxes[0]];
                RND_center[axes[1]] = Math.abs(distance_From_CircleCenter_To_RND_Line) * myMath.sin(ang_norm) + katet_2 * myMath.sin(line_ang) + element_1[circleCenterAxes[1]];
                if (Number.isNaN(RND_center[axes[0]])) {
                    View.sinumerikView.parseData.errors.push({text: `RND too large "${element_1.RND}"  prog ${programName} row ${element_1.row + 1}`, row: element_1.row});
                    return;
                }
            }
        }

        const ang_To_RND_center = myMath.atan2((RND_center[axes[1]] - element_1[circleCenterAxes[1]]),(RND_center[axes[0]] - element_1[circleCenterAxes[0]]))

        let RND_start_ang;
        if (RND_center_radius_factor < 0) {
            RND_start_ang = ang_To_RND_center;
        } else {
            RND_start_ang = ang_To_RND_center + 180;
        }
        if (RND_start_ang < 0) {
            RND_start_ang += 360;
        }

        //Угол раскрытия RND
        let RND_ang = Math.max(RND_start_ang, RND_end_ang) - Math.min(RND_start_ang, RND_end_ang)
        if (RND_ang > 180) {
            RND_ang = 360 - RND_ang;
        }

        let RND_pointsNum = Math.round((element_1.RND * Math.PI) * RND_ang / 180);
        if (RND_pointsNum < 30) {
            RND_pointsNum = 30;
        }
        if (RND_pointsNum > 300) {
            RND_pointsNum = 300;
        }
        let RND_ang_factor = 1;
        if ((RND_start_ang > RND_end_ang && RND_start_ang - RND_end_ang < 180) ||
            (RND_start_ang < RND_end_ang && RND_start_ang - RND_end_ang < -180)) {
            RND_ang_factor = -1;
        }

        //---------------

        //region Тут правим входящую линию
        const LineStartInFrame = {};
        LineStartInFrame[axes[0]] = RND_center[axes[0]] + myMath.cos(RND_end_ang) * element_1.RND;
        LineStartInFrame[axes[1]] = RND_center[axes[1]] + myMath.sin(RND_end_ang) * element_1.RND;
        LineStartInFrame[axes[2]] = element_2[`${axes[2]}_start`];
        const startInBase_line = getCoordinatesInBase({X:LineStartInFrame.X, Y:LineStartInFrame.Y,Z:LineStartInFrame.Z});
        const LineStartInFrameFinal = {X:startInBase_line[0], Y:startInBase_line[1], Z:startInBase_line[2]};

        element_2[`${axes[0]}_start`] = LineStartInFrameFinal[axes[0]];
        element_2[`${axes[1]}_start`] = LineStartInFrameFinal[axes[1]];
        //endregion

        element_1[axes[0]] = element_1[circleCenterAxes[0]] + circleRadius * myMath.cos(ang_To_RND_center);
        element_1[axes[1]] = element_1[circleCenterAxes[1]] + circleRadius * myMath.sin(ang_To_RND_center);

        const vectorStartAng = myMath.atan2(element_1[`${axes[1]}_start`] - element_1[circleCenterAxes[1]], element_1[`${axes[0]}_start`] - element_1[circleCenterAxes[0]]);
        const vectorEndAng = ang_To_RND_center;

        if (!recursion) {
            let arcAng = vectorEndAng - vectorStartAng;
            let arcFactor = 1;
            if (element_1.type == 'G2') {
                arcFactor = -1;
            }
            arcAng *= arcFactor;
            if (arcAng <= 0) {
                arcAng += 360;
            }
            arcAng *= arcFactor;
            if (element_1.Turn != undefined) {
                arcAng += element_1.Turn * arcFactor * 360;
            }

            let pointsNum = Math.round((circleRadius * Math.PI) * (Math.abs(arcAng) / 180));
            if (pointsNum < 15) {
                pointsNum = 15;
            }
            if (pointsNum > 300) {
                pointsNum = 300;
            }
            if (element_1.Turn != undefined && pointsNum == 300) {
                pointsNum *= move.Turn;
                if (pointsNum > 1000) {
                    pointsNum = 1000;
                }
            }

            const startInBase = getCoordinatesInBase({X:element_1.X_start, Y:element_1.Y_start,Z:element_1.Z_start});

            View.sinumerikView.parseData.axesPos.X = startInBase[0];
            View.sinumerikView.parseData.axesPos.Y = startInBase[1];
            View.sinumerikView.parseData.axesPos.Z = startInBase[2];

            for (let i = 0; i < pointsNum; i++) {

                const canvasCircleElement = {
                    X_start: View.sinumerikView.parseData.axesPos.X,
                    Y_start: View.sinumerikView.parseData.axesPos.Y,
                    Z_start: View.sinumerikView.parseData.axesPos.Z,
                    row: element_1.row,
                    type: 'G1',
                    elementId: element_1.elementId,
                    sourceFile: element_1.sourceFile
                }
                const thisPointAng = vectorStartAng + (arcAng / pointsNum) * (i + 1);
                const thisPoint = {};

                thisPoint[axes[0]] = parseFloat(myMath.cos(thisPointAng) * circleRadius + element_1[circleCenterAxes[0]]);
                thisPoint[axes[1]] = parseFloat(myMath.sin(thisPointAng) * circleRadius + element_1[circleCenterAxes[1]]);
                thisPoint[axes[2]] = element_1[`${axes[2]}_start`] + (element_1[axes[2]] - element_1[`${axes[2]}_start`]) * ((i+1)/pointsNum);

                const canvasElementInBase = getCoordinatesInBase(thisPoint);

                canvasCircleElement.X = canvasElementInBase[0];
                canvasCircleElement.Y = canvasElementInBase[1];
                canvasCircleElement.Z = canvasElementInBase[2];

                View.sinumerikView.parseData.axesPos.X = canvasCircleElement.X;
                View.sinumerikView.parseData.axesPos.Y = canvasCircleElement.Y;
                View.sinumerikView.parseData.axesPos.Z = canvasCircleElement.Z;

                View.sinumerikView.parseData.canvas.push(canvasCircleElement);
            }
            for (let i = 0; i < RND_pointsNum; i++) {
                const canvasCircleElement = {
                    row: element_1.row,
                    type: 'G1',
                    elementId: element_1.elementId,
                    sourceFile: element_1.sourceFile
                }
                canvasCircleElement[`${axes[0]}_start`] = myMath.cos(RND_start_ang + RND_ang_factor * (RND_ang) * (i / RND_pointsNum)) * element_1.RND + RND_center[axes[0]];
                canvasCircleElement[`${axes[1]}_start`] = myMath.sin(RND_start_ang + RND_ang_factor * (RND_ang) * (i / RND_pointsNum)) * element_1.RND + RND_center[axes[1]];
                canvasCircleElement[`${axes[2]}_start`] = element_2_startInFrame[axes[2]];
                canvasCircleElement[axes[0]] = myMath.cos(RND_start_ang + RND_ang_factor * (RND_ang) * ((i + 1) / RND_pointsNum)) * element_1.RND + RND_center[axes[0]];
                canvasCircleElement[axes[1]] = myMath.sin(RND_start_ang + RND_ang_factor * (RND_ang) * ((i + 1) / RND_pointsNum)) * element_1.RND + RND_center[axes[1]];
                canvasCircleElement[axes[2]] = element_2_startInFrame[axes[2]];

                var circleElementStart = getCoordinatesInBase({X:canvasCircleElement.X_start, Y:canvasCircleElement.Y_start,Z:canvasCircleElement.Z_start});
                var circleElementEnd = getCoordinatesInBase({X: canvasCircleElement.X, Y: canvasCircleElement.Y, Z: canvasCircleElement.Z});
                circleElementStart = {X:circleElementStart[0], Y: circleElementStart[1], Z: circleElementStart[2]};
                circleElementEnd = {X:circleElementEnd[0], Y: circleElementEnd[1], Z: circleElementEnd[2]};

                for (let i=0; i<3; i++) {
                    canvasCircleElement[`${axes[i]}_start`] = circleElementStart[axes[i]];
                    canvasCircleElement[axes[i]] = circleElementEnd[axes[i]];
                }
                View.sinumerikView.parseData.canvas.push(canvasCircleElement);
            }
        }  else {
            let el_2_reverse = {...element_2,
                                ...{'X_start':element_2.X, 'Y_start':element_2.Y, 'Z_start':element_2.Z,
                                    'X':element_2.X_start, 'Y':element_2.Y_start, 'Z':element_2.Z_start}
            }
            View.sinumerikView.parseData.canvas.push(el_2_reverse)
            for (let i = 0; i < RND_pointsNum; i++) {
                const canvasCircleElement = {
                    row: element_1.row,
                    type: 'G1',
                    elementId: element_1.elementId,
                    sourceFile: element_1.sourceFile
                }
                canvasCircleElement[`${axes[0]}_start`] = myMath.cos(RND_end_ang - RND_ang_factor * (RND_ang) * (i / RND_pointsNum)) * element_1.RND + RND_center[axes[0]];
                canvasCircleElement[`${axes[1]}_start`] = myMath.sin(RND_end_ang - RND_ang_factor * (RND_ang) * (i / RND_pointsNum)) * element_1.RND + RND_center[axes[1]];
                canvasCircleElement[`${axes[2]}_start`] = element_2_startInFrame[axes[2]];
                canvasCircleElement[axes[0]] = myMath.cos(RND_end_ang - RND_ang_factor * (RND_ang) * ((i + 1) / RND_pointsNum)) * element_1.RND + RND_center[axes[0]];
                canvasCircleElement[axes[1]] = myMath.sin(RND_end_ang - RND_ang_factor * (RND_ang) * ((i + 1) / RND_pointsNum)) * element_1.RND + RND_center[axes[1]];
                canvasCircleElement[axes[2]] = element_2_startInFrame[axes[2]];

                circleElementStart = getCoordinatesInBase({X:canvasCircleElement.X_start, Y:canvasCircleElement.Y_start,Z:canvasCircleElement.Z_start});
                circleElementEnd = getCoordinatesInBase({X: canvasCircleElement.X, Y: canvasCircleElement.Y, Z: canvasCircleElement.Z});
                circleElementStart = {X:circleElementStart[0], Y: circleElementStart[1], Z: circleElementStart[2]};
                circleElementEnd = {X:circleElementEnd[0], Y: circleElementEnd[1], Z: circleElementEnd[2]};

                for (let i=0; i<3; i++) {
                    canvasCircleElement[`${axes[i]}_start`] = circleElementStart[axes[i]];
                    canvasCircleElement[axes[i]] = circleElementEnd[axes[i]];
                }
                View.sinumerikView.parseData.canvas.push(canvasCircleElement);
            }
        }

        //---------------
    }
    return ([element_1, element_2]);
}

export function insertChr(element_1, element_2, programName) {

    if (element_1.type == 'G1' && element_2.type == 'G1') {

        let axes = [];
        if (View.sinumerikView.parseData.plane == 'G17') {
            axes = ['X', 'Y', 'Z'];
        } else if (View.sinumerikView.parseData.plane == 'G18') {
            axes = ['Z', 'X', 'Y'];
        } else {
            axes = ['Y', 'Z', 'X'];
        }

        const startCoordsInFrame = [];
        const endCoordsInFrame = []

        startCoordsInFrame[0] = getCoordinatesInFrame({
            X: element_1.X_start,
            Y: element_1.Y_start,
            Z: element_1.Z_start
        });
        endCoordsInFrame[0] = getCoordinatesInFrame({X: element_1.X, Y: element_1.Y, Z: element_1.Z});
        startCoordsInFrame[0] = {X: startCoordsInFrame[0][0], Y: startCoordsInFrame[0][1], Z: startCoordsInFrame[0][2]};
        endCoordsInFrame[0] = {X: endCoordsInFrame[0][0], Y: endCoordsInFrame[0][1], Z: endCoordsInFrame[0][2]};

        let ang_1 = myMath.atan2((endCoordsInFrame[0][axes[1]] - startCoordsInFrame[0][axes[1]]), (endCoordsInFrame[0][axes[0]] - startCoordsInFrame[0][axes[0]]));
        if (ang_1 < 0) {
            ang_1 += 360;
        }

        const length_1 = Math.sqrt((startCoordsInFrame[0][axes[1]] - endCoordsInFrame[0][axes[1]]) ** 2 + (startCoordsInFrame[0][axes[0]] - endCoordsInFrame[0][axes[0]]) ** 2);

        startCoordsInFrame[1] = getCoordinatesInFrame({
            X: element_2.X_start,
            Y: element_2.Y_start,
            Z: element_2.Z_start
        });
        endCoordsInFrame[1] = getCoordinatesInFrame({X: element_2.X, Y: element_2.Y, Z: element_2.Z});
        startCoordsInFrame[1] = {X: startCoordsInFrame[1][0], Y: startCoordsInFrame[1][1], Z: startCoordsInFrame[1][2]};
        endCoordsInFrame[1] = {X: endCoordsInFrame[1][0], Y: endCoordsInFrame[1][1], Z: endCoordsInFrame[1][2]};

        let ang_2 = myMath.atan2((endCoordsInFrame[1][axes[1]] - startCoordsInFrame[1][axes[1]]), (endCoordsInFrame[1][axes[0]] - startCoordsInFrame[1][axes[0]]));
        if (ang_2 < 0) {
            ang_2 += 360;
        }
        const length_2 = Math.sqrt((startCoordsInFrame[1][axes[1]] - endCoordsInFrame[1][axes[1]]) ** 2 + (startCoordsInFrame[1][axes[0]] - endCoordsInFrame[1][axes[0]]) ** 2);

        if (ang_1 == ang_2) {
            return ([element_1, element_2]);
        }
        const maxChr = Math.max(length_1, length_2);

        if (maxChr < element_1.CHR) {

            if (Math.abs(maxChr - element_2.CHR) > 1e-10) {
                View.sinumerikView.parseData.errors.push({
                    text: `CHR value too large. ${programName} row ${element_1.row + 1}`,
                    row: element_1.row
                });
            }
            element_1.CHR = maxChr;
        }

        element_1[axes[0]] = endCoordsInFrame[0][axes[0]] - element_1.CHR * myMath.cos(ang_1);
        element_1[axes[1]] = endCoordsInFrame[0][axes[1]] - element_1.CHR * myMath.sin(ang_1);
        element_1[axes[2]] = endCoordsInFrame[0][axes[2]] - (endCoordsInFrame[0][axes[2]] - startCoordsInFrame[0][axes[2]]) * (Math.abs(element_1.CHR) / length_1);
        //TODO проверить 3ю ось CHR!!!
        element_2[`${axes[0]}_start`] = startCoordsInFrame[1][axes[0]] + element_1.CHR * myMath.cos(ang_2);
        element_2[`${axes[1]}_start`] = startCoordsInFrame[1][axes[1]] + element_1.CHR * myMath.sin(ang_2);
        element_2[`${axes[2]}_start`] = startCoordsInFrame[1][axes[2]] + (endCoordsInFrame[1][axes[2]] - startCoordsInFrame[1][axes[2]]) * (Math.abs(element_1.CHR) / length_1);

        const canvasElement = {
            row: element_1.row,
            type: 'G1',
            elementId: element_1.elementId,
            sourceFile: element_1.sourceFile
        }
        canvasElement[`${axes[0]}_start`] = element_1[axes[0]];
        canvasElement[`${axes[1]}_start`] = element_1[axes[1]];
        canvasElement[`${axes[2]}_start`] = element_1[axes[2]];
        canvasElement[axes[0]] = element_2[`${axes[0]}_start`];
        canvasElement[axes[1]] = element_2[`${axes[1]}_start`];
        canvasElement[axes[2]] = element_2[`${axes[2]}_start`];

        //
        let elementStart = getCoordinatesInBase({
            X: canvasElement.X_start,
            Y: canvasElement.Y_start,
            Z: canvasElement.Z_start
        });
        let elementEnd = getCoordinatesInBase({
            X: canvasElement.X,
            Y: canvasElement.Y,
            Z: canvasElement.Z
        });
        elementStart = {X: elementStart[0], Y: elementStart[1], Z: elementStart[2]};
        elementEnd = {X: elementEnd[0], Y: elementEnd[1], Z: elementEnd[2]};

        for (let i = 0; i < 3; i++) {
            canvasElement[`${axes[i]}_start`] = elementStart[axes[i]];
            canvasElement[axes[i]] = elementEnd[axes[i]];
        }

        View.sinumerikView.parseData.canvas.push(element_1)
        View.sinumerikView.parseData.canvas.push(canvasElement);

        let coordsInBasis = getCoordinatesInBase({X: element_1.X, Y: element_1.Y, Z: element_1.Z});
        coordsInBasis = {X: coordsInBasis[0], Y: coordsInBasis[1], Z: coordsInBasis[2]};
        element_1[axes[0]] = coordsInBasis[axes[0]];
        element_1[axes[1]] = coordsInBasis[axes[1]];
        element_1[axes[2]] = coordsInBasis[axes[2]];

        coordsInBasis = getCoordinatesInBase({X: element_2.X_start, Y: element_2.Y_start, Z: element_2.Z_start});
        coordsInBasis = {X: coordsInBasis[0], Y: coordsInBasis[1], Z: coordsInBasis[2]};
        element_2[`${axes[0]}_start`] = coordsInBasis[axes[0]];
        element_2[`${axes[1]}_start`] = coordsInBasis[axes[1]];
        element_2[`${axes[2]}_start`] = coordsInBasis[axes[2]];

        if (View.sinumerikView.parseData.currentBucket) {
            View.sinumerikView.parseData.contourElements[View.sinumerikView.parseData.currentBucket].push({
                type: 'line',
                start: [element_1.X_start, element_1.Y_start, element_1.Z_start],
                end: [element_1.X, element_1.Y, element_1.Z]
            })

            View.sinumerikView.parseData.contourElements[View.sinumerikView.parseData.currentBucket].push({
                type: 'line',
                start: [canvasElement.X_start, canvasElement.Y_start, canvasElement.Z_start],
                end: [canvasElement.X, canvasElement.Y, canvasElement.Z]
            })
        }

        return ([element_1, element_2]);
    }
}
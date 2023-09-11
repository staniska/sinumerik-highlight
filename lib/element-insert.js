'use babel';

import View from "./sinumerik";
import sinumerikMath from "./degreesMath";
import {getCoordinatesInBase, getCoordinatesInFrame} from "./interpretator";

const myMath = new sinumerikMath();

//TODO переделать вставку элементов на обработку массива элементов целиком перед генерацией элементов для canvas

export function insertRnd(element_1, element_2, programName, recursion) {

    // console.log(JSON.stringify(element_1));
    // console.log(JSON.stringify(element_2));


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
            // console.log(maxRnd);
            // console.log(element_1.RND);

            if (Math.abs(maxRnd - element_2.RND) > 1e-10) {
                View.sinumerikView.parseData.errors.push({
                    text: `RND value too large. ${programName} row ${element_1.row + 1}`,
                    row: element_1.row
                });
            }
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

        //ВОт тут рисуем первую линию
        View.sinumerikView.parseData.canvas.push(element_1);

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

        return ([element_1, element_2]);
    }

    if (element_2.type.match(/G[23]/) && element_1.type == 'G1') {
        // console.log(JSON.stringify(element_2));
        // console.log(element_2);
        var circleCenterAxes = [];
        if (View.sinumerikView.parseData.plane == 'G17') {
            circleCenterAxes = ['I', 'J'];
        } else if (View.sinumerikView.parseData.plane == 'G18') {
            circleCenterAxes = ['K', 'I'];
        } else {
            circleCenterAxes = ['J', 'K'];
        }
        var exch_element_1 = {
            row: element_2.row,
            X: element_2.X_start,
            Y: element_2.Y_start,
            Z: element_2.Z_start,
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
        // console.log(exch_element_1);

        var exch_element_2 = {
            row: element_1.row,
            type: element_1.type,
            X: element_1.X_start,
            Y: element_1.Y_start,
            Z: element_1.Z_start,
            X_start: element_1.X,
            Y_start: element_1.Y,
            Z_start: element_1.Z,
        }

        var elements = insertRnd(exch_element_1, exch_element_2, programName, 1);
        // console.log(elements);
        delete element_1.RND;
        element_1.X = elements[1].X_start;
        element_1.Y = elements[1].Y_start;
        element_1.Z = elements[1].Z_start;

        element_2.X_start = elements[0].X;
        element_2.Y_start = elements[0].Y;
        element_2.Z_start = elements[0].Z;

        var startInBase = getCoordinatesInBase({X:element_2.X_start, Y:element_2.Y_start,Z:element_2.Z_start});

        View.sinumerikView.parseData.axesPos.X = startInBase[0];
        View.sinumerikView.parseData.axesPos.Y = startInBase[1];
        View.sinumerikView.parseData.axesPos.Z = startInBase[2];

        // View.sinumerikView.parseData.axesPos.X = element_2.X_start;
        // View.sinumerikView.parseData.axesPos.Y = element_2.Y_start;
        // View.sinumerikView.parseData.axesPos.Z = element_2.Z_start;

    }

    if (element_1.type.match(/G[23]/) && element_2.type == 'G1') {

        //TODO : Третья ось не просчитывается совсем. Не срочно


        var axes = [];
        var circleCenterAxes = [];
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

        var element_2_startInFrame = getCoordinatesInFrame({X:element_2.X_start, Y:element_2.Y_start, Z:element_2.Z_start});
        var element_2_endInFrame = getCoordinatesInFrame({X:element_2.X, Y:element_2.Y, Z:element_2.Z});
        element_2_startInFrame = {X:element_2_startInFrame[0], Y: element_2_startInFrame[1], Z: element_2_startInFrame[2]};
        element_2_endInFrame = {X:element_2_endInFrame[0], Y: element_2_endInFrame[1], Z: element_2_endInFrame[2]};

        var ang_intersection_circleCenter = myMath.atan2(element_1[circleCenterAxes[1]] - element_2_startInFrame[axes[1]], element_1[circleCenterAxes[0]] - element_2_startInFrame[axes[0]]);
        if (ang_intersection_circleCenter < 0) {
            ang_intersection_circleCenter += 360;
        }
        var line_ang = myMath.atan2((element_2_endInFrame[axes[1]] - element_2_startInFrame[axes[1]]),(element_2_endInFrame[axes[0]] - element_2_startInFrame[axes[0]]));
        if (line_ang < 0) {
            line_ang += 360;
        }
        // console.log('Intersection_circleCenter: ' + ang_intersection_circleCenter);
        // console.log('Line_ang: ' + line_ang);

        var ang_tangent = ang_intersection_circleCenter + 90;
        if (element_1.type == 'G3') {
            ang_tangent +=180;
        }
        if (ang_tangent > 360) {
            ang_tangent -=360;
        }
        // console.log('Tangent ang: ' + ang_tangent);

        var RND_center_radius_factor = 1;
        var ang_difference = ang_tangent - line_ang;
        if (ang_difference < 0) {
            ang_difference += 360;
        }
        if ((element_1.type == 'G2' && ang_difference < 180) || (element_1.type == 'G3' && ang_difference > 180)) {
            RND_center_radius_factor = -1;
        }
         // console.log('RND factor: ' + RND_center_radius_factor);

        var circleRadius = Math.sqrt((element_1[circleCenterAxes[1]] - element_2_startInFrame[axes[1]])**2 + (element_1[circleCenterAxes[0]] - element_2_startInFrame[axes[0]])**2)
        var RND_center_radius = circleRadius + element_1.RND * RND_center_radius_factor;

        // console.log('RND center radius: ' + RND_center_radius);

        //line func
        var A = element_2_startInFrame[axes[1]] - element_2_endInFrame[axes[1]];
        var B = element_2_endInFrame[axes[0]] - element_2_startInFrame[axes[0]];
        var C = -1 * element_2_endInFrame[axes[0]] * (element_2_startInFrame[axes[1]] - element_2_endInFrame[axes[1]]) + element_2_endInFrame[axes[1]] * (element_2_startInFrame[axes[0]] - element_2_endInFrame[axes[0]]);


        if (A != 0) {
            B /= A;
            C /= A;
            A = 1;
        } else {
            A=0;
            C /= B;
            B=1;
        }
            // console.log(A +`${axes[0].toLowerCase()} + ` + B + `${axes[1].toLowerCase()} + ` + C + ' = 0');

        var ang_to_circleCenter = myMath.atan2((element_1[circleCenterAxes[1]] - element_1[axes[1]]),(element_1[circleCenterAxes[0]] - element_1[axes[0]]));
        if (ang_to_circleCenter < 0) {
            ang_to_circleCenter += 360;
        }
        // console.log('ANG to circle center: ' + ang_to_circleCenter);
        var distance_factor = 1;
        ang_difference = line_ang - ang_to_circleCenter;

        if (ang_difference < 0) {
            ang_difference += 360;
        }
        // console.log('ANG dif: ' + ang_difference);
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

        var distance_From_CircleCenter_To_RND_Line = distance_factor * Math.abs((A * element_1[circleCenterAxes[0]] + B * element_1[circleCenterAxes[1]] + C)/Math.sqrt(A**2 + B**2)) + element_1.RND * RND_center_radius_factor;
        // console.log('Distance: ' + distance_From_CircleCenter_To_RND_Line);

        var ang_factor = (distance_From_CircleCenter_To_RND_Line / Math.abs(distance_From_CircleCenter_To_RND_Line))
        var ang_norm = line_ang +  ang_factor * 90;
        if (element_1.type == 'G3') {
            ang_norm -= 180;
        }
        if (ang_norm > 360) {
            ang_norm -=360;
        }
        if (ang_norm < 0) {
            ang_norm +=360;
        }
        // console.log('Угол перпендикуляра к прямой: ' + ang_norm);
        //Начальный угол RND
        var RND_end_ang;
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

        // console.log('угол начала RND: ' + RND_start_ang);

        var RND_center = {}
        if (element_1.type == 'G2') {
            if (RND_center_radius_factor < 0 ) {
                var katet_2 = RND_center_radius * myMath.cos(myMath.asin(Math.abs(distance_From_CircleCenter_To_RND_Line)/RND_center_radius))
                RND_center[axes[0]] = Math.abs(distance_From_CircleCenter_To_RND_Line) * myMath.cos(ang_norm) + katet_2 * myMath.cos(line_ang + 180) + element_1[circleCenterAxes[0]];
                RND_center[axes[1]] = Math.abs(distance_From_CircleCenter_To_RND_Line) * myMath.sin(ang_norm) + katet_2 * myMath.sin(line_ang + 180) + element_1[circleCenterAxes[1]];
                // console.log(RND_center[axes[0]]);
                if (Number.isNaN(RND_center[axes[0]])) {
                    View.sinumerikView.parseData.errors.push({text: `RND too large "${element_1.RND}"  prog ${programName} row ${element_1.row + 1}`, row: element_1.row});
                    return;
                }
            }
            if (RND_center_radius_factor > 0 ) {
                var katet_2 = RND_center_radius * myMath.cos(myMath.asin(Math.abs(distance_From_CircleCenter_To_RND_Line)/RND_center_radius))
                RND_center[axes[0]] = Math.abs(distance_From_CircleCenter_To_RND_Line) * myMath.cos(ang_norm) + katet_2 * myMath.cos(line_ang) + element_1[circleCenterAxes[0]];
                RND_center[axes[1]] = Math.abs(distance_From_CircleCenter_To_RND_Line) * myMath.sin(ang_norm) + katet_2 * myMath.sin(line_ang) + element_1[circleCenterAxes[1]];
                // console.log(RND_center[axes[0]]);
                if (Number.isNaN(RND_center[axes[0]])) {
                    View.sinumerikView.parseData.errors.push({text: `RND too large "${element_1.RND}"  prog ${programName} row ${element_1.row + 1}`, row: element_1.row});
                    return;
                }

            }

        }

        if (element_1.type == 'G3') {
            if (RND_center_radius_factor < 0 ) {
                var katet_2 = RND_center_radius * myMath.cos(myMath.asin(Math.abs(distance_From_CircleCenter_To_RND_Line)/RND_center_radius))
                RND_center[axes[0]] = Math.abs(distance_From_CircleCenter_To_RND_Line) * myMath.cos(ang_norm) + katet_2 * myMath.cos(line_ang + 180) + element_1[circleCenterAxes[0]];
                RND_center[axes[1]] = Math.abs(distance_From_CircleCenter_To_RND_Line) * myMath.sin(ang_norm) + katet_2 * myMath.sin(line_ang + 180) + element_1[circleCenterAxes[1]];
                // console.log(RND_center[axes[0]]);
                if (Number.isNaN(RND_center[axes[0]])) {
                    View.sinumerikView.parseData.errors.push({text: `RND too large "${element_1.RND}"  prog ${programName} row ${element_1.row + 1}`, row: element_1.row});
                    return;
                }
                // console.log(RND_center);

            }
            if (RND_center_radius_factor > 0 ) {
                var katet_2 = RND_center_radius * myMath.cos(myMath.asin(Math.abs(distance_From_CircleCenter_To_RND_Line)/RND_center_radius))
                RND_center[axes[0]] = Math.abs(distance_From_CircleCenter_To_RND_Line) * myMath.cos(ang_norm) + katet_2 * myMath.cos(line_ang) + element_1[circleCenterAxes[0]];
                RND_center[axes[1]] = Math.abs(distance_From_CircleCenter_To_RND_Line) * myMath.sin(ang_norm) + katet_2 * myMath.sin(line_ang) + element_1[circleCenterAxes[1]];
                // console.log(RND_center[axes[0]]);
                if (Number.isNaN(RND_center[axes[0]])) {
                    View.sinumerikView.parseData.errors.push({text: `RND too large "${element_1.RND}"  prog ${programName} row ${element_1.row + 1}`, row: element_1.row});
                    return;
                }
            }
        }

        // console.log(element_1);

        var ang_To_RND_center = myMath.atan2((RND_center[axes[1]] - element_1[circleCenterAxes[1]]),(RND_center[axes[0]] - element_1[circleCenterAxes[0]]))
        // console.log('Угол к центру радиуса: ' + ang_To_RND_center);

        var RND_start_ang;
        if (RND_center_radius_factor < 0) {
            RND_start_ang = ang_To_RND_center;
        } else {
            RND_start_ang = ang_To_RND_center + 180;
        }
        if (RND_start_ang < 0) {
            RND_start_ang += 360;
        }
        // console.log("Угол конца RND: " + RND_end_ang);

        //Угол раскрытия RND
        var RND_ang = Math.max(RND_start_ang, RND_end_ang) - Math.min(RND_start_ang, RND_end_ang)
        if (RND_ang > 180) {
            RND_ang = 360 - RND_ang;
        }
        // console.log("Угол раскрытия радиуса: " + RND_ang);

        var RND_pointsNum = Math.round((element_1.RND * Math.PI) * RND_ang / 180);
        if (RND_pointsNum < 30) {
            RND_pointsNum = 30;
        }
        if (RND_pointsNum > 300) {
            RND_pointsNum = 300;
        }
        var RND_ang_factor = 1;
        if ((RND_start_ang > RND_end_ang && RND_start_ang - RND_end_ang < 180) ||
            (RND_start_ang < RND_end_ang && RND_start_ang - RND_end_ang < -180)) {
            RND_ang_factor = -1;
        }

        // console.log('RND_ang_factor: ' + RND_ang_factor);
        // console.log('RND_start: ' + RND_start_ang);
        // console.log('RND_end: ' + RND_end_ang);

        //---------------


        //region Тут правим входящую линию
        var LineStartInFrame = {};
        LineStartInFrame[axes[0]] = RND_center[axes[0]] + myMath.cos(RND_end_ang) * element_1.RND;
        LineStartInFrame[axes[1]] = RND_center[axes[1]] + myMath.sin(RND_end_ang) * element_1.RND;
        LineStartInFrame[axes[2]] = element_2[`${axes[2]}_start`];
        var startInBase = getCoordinatesInBase({X:LineStartInFrame.X, Y:LineStartInFrame.Y,Z:LineStartInFrame.Z});
        var LineStartInFrame = {X:startInBase[0], Y:startInBase[1], Z:startInBase[2]};

        element_2[`${axes[0]}_start`] = LineStartInFrame[axes[0]];
        element_2[`${axes[1]}_start`] = LineStartInFrame[axes[1]];
        //endregion



        element_1[axes[0]] = element_1[circleCenterAxes[0]] + circleRadius * myMath.cos(ang_To_RND_center);
        element_1[axes[1]] = element_1[circleCenterAxes[1]] + circleRadius * myMath.sin(ang_To_RND_center);


        var vectorStartAng = myMath.atan2(element_1[`${axes[1]}_start`] - element_1[circleCenterAxes[1]], element_1[`${axes[0]}_start`] - element_1[circleCenterAxes[0]]);
        var vectorEndAng = ang_To_RND_center;

        if (!recursion) {
            var arcAng = vectorEndAng - vectorStartAng;
            var arcFactor = 1;
            if (element_1.type == 'G2') {
                // console.log('G2');
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

            var pointsNum = Math.round((circleRadius * Math.PI) * (Math.abs(arcAng) / 180));
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


            var startInBase = getCoordinatesInBase({X:element_1.X_start, Y:element_1.Y_start,Z:element_1.Z_start});

            View.sinumerikView.parseData.axesPos.X = startInBase[0];
            View.sinumerikView.parseData.axesPos.Y = startInBase[1];
            View.sinumerikView.parseData.axesPos.Z = startInBase[2];

            for (let i = 0; i < pointsNum; i++) {

                var canvasCircleElement = {
                    X_start: View.sinumerikView.parseData.axesPos.X,
                    Y_start: View.sinumerikView.parseData.axesPos.Y,
                    Z_start: View.sinumerikView.parseData.axesPos.Z,
                    row: element_1.row,
                    type: 'G1'
                }
                var thisPointAng = vectorStartAng + (arcAng / pointsNum) * (i + 1);
                var thisPoint = {};

                thisPoint[axes[0]] = parseFloat(myMath.cos(thisPointAng) * circleRadius + element_1[circleCenterAxes[0]]);
                thisPoint[axes[1]] = parseFloat(myMath.sin(thisPointAng) * circleRadius + element_1[circleCenterAxes[1]]);
                thisPoint[axes[2]] = element_1[`${axes[2]}_start`] + (element_1[axes[2]] - element_1[`${axes[2]}_start`]) * ((i+1)/pointsNum);

                var canvasElementInBase = getCoordinatesInBase(thisPoint);

                // console.log(JSON.stringify())
                canvasCircleElement.X = canvasElementInBase[0];
                canvasCircleElement.Y = canvasElementInBase[1];
                canvasCircleElement.Z = canvasElementInBase[2];

                View.sinumerikView.parseData.axesPos.X = canvasCircleElement.X;
                View.sinumerikView.parseData.axesPos.Y = canvasCircleElement.Y;
                View.sinumerikView.parseData.axesPos.Z = canvasCircleElement.Z;

                // console.log(JSON.stringify(canvasCircleElement));
                View.sinumerikView.parseData.canvas.push(canvasCircleElement);
            }
            for (let i = 0; i < RND_pointsNum; i++) {
                var canvasCircleElement = {
                    row: element_1.row,
                    type: 'G1'
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
                var canvasCircleElement = {
                    row: element_1.row,
                    type: 'G1'
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

        // console.log("CHR in the middle of G1");
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

        startCoordsInFrame[0] = getCoordinatesInFrame({
            X: element_1.X_start,
            Y: element_1.Y_start,
            Z: element_1.Z_start
        });
        endCoordsInFrame[0] = getCoordinatesInFrame({X: element_1.X, Y: element_1.Y, Z: element_1.Z});
        startCoordsInFrame[0] = {X: startCoordsInFrame[0][0], Y: startCoordsInFrame[0][1], Z: startCoordsInFrame[0][2]};
        endCoordsInFrame[0] = {X: endCoordsInFrame[0][0], Y: endCoordsInFrame[0][1], Z: endCoordsInFrame[0][2]};

        var ang_1 = myMath.atan2((endCoordsInFrame[0][axes[1]] - startCoordsInFrame[0][axes[1]]), (endCoordsInFrame[0][axes[0]] - startCoordsInFrame[0][axes[0]]));
        if (ang_1 < 0) {
            ang_1 += 360;
        }

        var length_1 = Math.sqrt((startCoordsInFrame[0][axes[1]] - endCoordsInFrame[0][axes[1]]) ** 2 + (startCoordsInFrame[0][axes[0]] - endCoordsInFrame[0][axes[0]]) ** 2);

        startCoordsInFrame[1] = getCoordinatesInFrame({
            X: element_2.X_start,
            Y: element_2.Y_start,
            Z: element_2.Z_start
        });
        endCoordsInFrame[1] = getCoordinatesInFrame({X: element_2.X, Y: element_2.Y, Z: element_2.Z});
        startCoordsInFrame[1] = {X: startCoordsInFrame[1][0], Y: startCoordsInFrame[1][1], Z: startCoordsInFrame[1][2]};
        endCoordsInFrame[1] = {X: endCoordsInFrame[1][0], Y: endCoordsInFrame[1][1], Z: endCoordsInFrame[1][2]};

        var ang_2 = myMath.atan2((endCoordsInFrame[1][axes[1]] - startCoordsInFrame[1][axes[1]]), (endCoordsInFrame[1][axes[0]] - startCoordsInFrame[1][axes[0]]));
        if (ang_2 < 0) {
            ang_2 += 360;
        }
        var length_2 = Math.sqrt((startCoordsInFrame[1][axes[1]] - endCoordsInFrame[1][axes[1]]) ** 2 + (startCoordsInFrame[1][axes[0]] - endCoordsInFrame[1][axes[0]]) ** 2);

        if (ang_1 == ang_2) {
            return ([element_1, element_2]);
        }
        var maxChr = Math.max(length_1, length_2);

        if (maxChr < element_1.CHR) {
            // console.log(maxRnd);
            // console.log(element_1.RND);

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

        var canvasElement = {
            row: element_1.row,
            type: 'G1'
        }
        canvasElement[`${axes[0]}_start`] = element_1[axes[0]];
        canvasElement[`${axes[1]}_start`] = element_1[axes[1]];
        canvasElement[`${axes[2]}_start`] = element_1[axes[2]];
        canvasElement[axes[0]] = element_2[`${axes[0]}_start`];
        canvasElement[axes[1]] = element_2[`${axes[1]}_start`];
        canvasElement[axes[2]] = element_2[`${axes[2]}_start`];

        //
        var elementStart = getCoordinatesInBase({
            X: canvasElement.X_start,
            Y: canvasElement.Y_start,
            Z: canvasElement.Z_start
        });
        var elementEnd = getCoordinatesInBase({
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

            // console.log(JSON.stringify(canvasElement));
        View.sinumerikView.parseData.canvas.push(element_1)
        View.sinumerikView.parseData.canvas.push(canvasElement);

        var coordsInBasis = getCoordinatesInBase({X: element_1.X, Y: element_1.Y, Z: element_1.Z});
        coordsInBasis = {X: coordsInBasis[0], Y: coordsInBasis[1], Z: coordsInBasis[2]};
        element_1[axes[0]] = coordsInBasis[axes[0]];
        element_1[axes[1]] = coordsInBasis[axes[1]];
        element_1[axes[2]] = coordsInBasis[axes[2]];

        coordsInBasis = getCoordinatesInBase({X: element_2.X_start, Y: element_2.Y_start, Z: element_2.Z_start});
        coordsInBasis = {X: coordsInBasis[0], Y: coordsInBasis[1], Z: coordsInBasis[2]};
        element_2[`${axes[0]}_start`] = coordsInBasis[axes[0]];
        element_2[`${axes[1]}_start`] = coordsInBasis[axes[1]];
        element_2[`${axes[2]}_start`] = coordsInBasis[axes[2]];

        return ([element_1, element_2]);
    }
}
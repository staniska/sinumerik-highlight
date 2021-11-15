'use babel';

import {confirmDialog} from "./dialog/confirm";

export default class sinumerikMath {
    constructor() {
    }

    tan(value) {
        return Math.tan(Math.PI * (value / 180));
    }
    sin(value) {
        return Math.sin(Math.PI * (value / 180));
    }
    cos(value) {
        return Math.cos(Math.PI * (value / 180));
    }

    asin(value) {
        if (Math.abs(value) > 1) {
            if (confirmDialog("abs ASIN argument = " + value + ". Equate to 1?")){
                value = 1
            }
        }
        return (180 / Math.PI ) * Math.asin(value);
    }

    acos(value) {
        if (Math.abs(value) > 1) {
            if (confirmDialog("abs ACOS argument = " + value + ". Equate to 1?")){
                value = 1
            }
        }
        return (180 / Math.PI ) * Math.acos(value);
    }

    atan2(val1, val2) {
        return (180 / Math.PI ) * Math.atan2(val1, val2);
    }

    pot(value) {
        return Math.pow(value, 2);
    }

    matrixProduct(m1,m2) {
        var result = [[0,0,0],[0,0,0],[0,0,0]]
        for (let i = 0; i < 3; i ++) {
            for (let j = 0; j < 3; j ++) {
                for (let k = 0; k < 3; k++) {
                    result[i][j] += m1[i][k]*m2[k][j];
                }
            }
        }
        return result;
    }
}
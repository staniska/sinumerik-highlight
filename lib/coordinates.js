'use babel';

import View from './sinumerik';
import sinumerikMath from './degreesMath';

const myMath = new sinumerikMath();

export function clearAxesPos(programName) {
    View.sinumerikView.parseData.axesPos = {};
    View.sinumerikView.parseData.axesPos.X = 10000;
    View.sinumerikView.parseData.axesPos.Z = 10000;
    View.sinumerikView.parseData.pole = {X: 0, Y: 0, Z: 0, AP: 0, RP: 0};

    View.sinumerikView.parseData.prevMove = [];
    //setter для plane (planeAxes, planeFirstAxes, planeCircleAxes)
    Object.defineProperty(
        View.sinumerikView.parseData, 'plane',
        {
            configurable: true,
            set: function (plane) {
                const circleCenterAxes = {X: 'I', Y: 'J', Z: 'K'}
                this.planeStore = plane
                this.planeAxes = ['X', 'Y', 'Z']
                if (plane === 'G18') {
                    this.planeAxes = ['Z', 'X', 'Y']
                }
                if (plane === 'G19') {
                    this.planeAxes = ['Y', 'Z', 'X']
                }
                this.planeFirstAxes = [this.planeAxes[0], this.planeAxes[1]]
                this.planeCircleAxes = [circleCenterAxes[this.planeAxes[0]], circleCenterAxes[this.planeAxes[1]]]
            },
            get: function () {
                return this.planeStore
            }
        }
    );

    View.sinumerikView.parseData.plane = 'G17';
    if (View.sinumerikView.singleLineDebugData.machine.machineType === 'Lathe') {
        View.sinumerikView.parseData.diamon = 1;
        View.sinumerikView.parseData.diam90 = 0;
        View.sinumerikView.parseData.axesPos.Y = 0;
        View.sinumerikView.parseData.plane = 'G18';
    } else {
        View.sinumerikView.parseData.axesPos.Y = 10000;
        View.sinumerikView.parseData.diamon = 0;
    }

    if (View.sinumerikView.programmData[programName].machine.diam90) {
        View.sinumerikView.parseData.diam90 = 1;
    }
    View.sinumerikView.parseData.transformation = null
    View.sinumerikView.parseData.moveBeforeTransform = null
}

export function generateFrame(additive, type, value, prog, row) {

    if (type == 'SCALE') {
        View.sinumerikView.parseData.errors.push({
            text: `${type} not supported yet.  prog ${prog} row ${row + 1}`,
            row: row
        });
        return;
    }

    if (!additive) {
        View.sinumerikView.parseData.frame.trans = {X: 0, Y: 0, Z: 0}
        View.sinumerikView.parseData.frame.mirror = {X: 1, Y: 1, Z: 1}
        View.sinumerikView.parseData.frame.rot = {X: 0, Y: 0, Z: 0};
        View.sinumerikView.parseData.frame.basis = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
        View.sinumerikView.parseData.frame.invertBasis = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    }

    if (type == 'MIRROR') {

        for (const coordinate in value) {
            View.sinumerikView.parseData.frame.mirror[value[coordinate].name] *= parseFloat(value[coordinate].value) === 0 ? -1 : 1
        }
    }

    if (type == 'TRANS') {
        let trans = {X: 0, Y: 0, Z: 0};
        for (const coordinate in value) {
            trans[value[coordinate].name] = parseFloat(value[coordinate].value);
        }
        trans = getCoordinatesInBase(trans);
        View.sinumerikView.parseData.frame.trans.X = trans[0];
        View.sinumerikView.parseData.frame.trans.Y = trans[1];
        View.sinumerikView.parseData.frame.trans.Z = trans[2];
    }

    if (type == 'ROT') {
        const rot = {};
        let matrixRotZ = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
        let matrixRotY = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
        let matrixRotX = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

        for (const coord in value) {
            rot[value[coord].name] = value[coord].value;
        }
        if (rot.Z) {
            matrixRotZ = [[myMath.cos(rot.Z), -1 * myMath.sin(rot.Z), 0],
                [myMath.sin(rot.Z), myMath.cos(rot.Z), 0],
                [0, 0, 1]];
        }
        if (rot.Y) {
            matrixRotY = [[myMath.cos(rot.Y), 0, myMath.sin(rot.Y)],
                [0, 1, 0],
                [-1 * myMath.sin(rot.Y), 0, myMath.cos(rot.Y)]];
        }
        if (rot.X) {
            matrixRotX = [[1, 0, 0],
                [0, myMath.cos(rot.X), -1 * myMath.sin(rot.X)],
                [0, myMath.sin(rot.X), myMath.cos(rot.X)]];
        }
        const rotMatrix = myMath.matrixProduct(View.sinumerikView.parseData.frame.invertBasis, myMath.matrixProduct(matrixRotX, myMath.matrixProduct(matrixRotY, matrixRotZ)));
        View.sinumerikView.parseData.frame.invertBasis = rotMatrix;
    }
    generateBasis();
}

export function generateBasis() {
    let basis = View.sinumerikView.parseData.frame.invertBasis;

    const matrixDeterminant =
        basis[0][0] * basis[1][1] * basis[2][2] +
        basis[2][0] * basis[0][1] * basis[1][2] +
        basis[1][0] * basis[2][1] * basis[0][2] -
        basis[2][0] * basis[1][1] * basis[0][2] -
        basis[0][0] * basis[2][1] * basis[1][2] -
        basis[1][0] * basis[0][1] * basis[2][2];


    const minorMatrix = [[], [], []];
    minorMatrix[0][0] = basis[1][1] * basis[2][2] - basis[2][1] * basis[1][2];
    minorMatrix[1][0] = basis[0][1] * basis[2][2] - basis[2][1] * basis[0][2];
    minorMatrix[2][0] = basis[0][1] * basis[1][2] - basis[1][1] * basis[0][2];
    minorMatrix[0][1] = basis[1][0] * basis[2][2] - basis[2][0] * basis[1][2];
    minorMatrix[1][1] = basis[0][0] * basis[2][2] - basis[2][0] * basis[0][2];
    minorMatrix[2][1] = basis[0][0] * basis[1][2] - basis[1][0] * basis[0][2];
    minorMatrix[0][2] = basis[1][0] * basis[2][1] - basis[2][0] * basis[1][1];
    minorMatrix[1][2] = basis[0][0] * basis[2][1] - basis[2][0] * basis[0][1];
    minorMatrix[2][2] = basis[0][0] * basis[1][1] - basis[1][0] * basis[0][1];

    const complementMatrix = [[minorMatrix[0][0], -1 * minorMatrix[0][1], minorMatrix[0][2]],
        [-1 * minorMatrix[1][0], minorMatrix[1][1], -1 * minorMatrix[1][2]],
        [minorMatrix[2][0], -1 * minorMatrix[2][1], minorMatrix[2][2]]];

    const transposedComplementMatrix = [[], [], []];
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
            transposedComplementMatrix[i][j] = complementMatrix[j][i];
        }
    }

    const inverseMatrix = [[], [], []];
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
            inverseMatrix[i][j] = (1 / matrixDeterminant) * transposedComplementMatrix[i][j];
            if (Math.abs(inverseMatrix[i][j]) < 1e-12) {
                inverseMatrix[i][j] = 0;
            }
        }
    }

    View.sinumerikView.parseData.frame.basis = inverseMatrix;

}

export function getCoordinatesInFrame(coordinates) {

    const basis = View.sinumerikView.parseData.frame.basis;

    const vectorWithoutTrans = [coordinates.X, coordinates.Y, coordinates.Z];
    vectorWithoutTrans[0] -= View.sinumerikView.parseData.frame.trans.X;
    vectorWithoutTrans[1] -= View.sinumerikView.parseData.frame.trans.Y;
    vectorWithoutTrans[2] -= View.sinumerikView.parseData.frame.trans.Z;


    const matrixSystem = JSON.parse(JSON.stringify(basis));
    matrixSystem[3] = [];
    matrixSystem[3][0] = vectorWithoutTrans[0];
    matrixSystem[3][1] = vectorWithoutTrans[1];
    matrixSystem[3][2] = vectorWithoutTrans[2];

    let matrixCoeffSum = 0;

    for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 3; j++) {
            if (Math.abs(matrixSystem[i][j]) < 1e-12) {
                matrixSystem[i][j] = 0;
            }
            if (i < 3) {
                matrixCoeffSum += Math.abs(matrixSystem[i][j]);
            }
        }
    }
    //search first !null coeff

    let first_col = -1;
    for (let i = 0; i < 3; i++) {
        if (matrixSystem[0][i] != 0) {
            first_col = i;
            const coeff = 1 / matrixSystem[0][first_col];
            for (let j = 0; j < 4; j++) {
                matrixSystem[j][first_col] *= coeff;
            }
            break;
        }
    }
    for (let i = 0; i < 3; i++) {
        if (i != first_col) {
            const coeff = matrixSystem[0][i] / matrixSystem[0][first_col];
            for (let j = 0; j < 4; j++) {
                matrixSystem[j][i] -= matrixSystem[j][first_col] * coeff;
                if (Math.abs(matrixSystem[j][i]) < 1e-12) {
                    matrixSystem[j][i] = 0;
                }
            }
        }
    }
    let second_col = -1;
    for (let i = 0; i < 3; i++) {
        if (i != first_col && matrixSystem[1][i] != 0) {
            second_col = i;
            const coeff = 1 / matrixSystem[1][second_col];
            for (let j = 1; j < 4; j++) {
                matrixSystem[j][second_col] *= coeff;
            }
            break;
        }
    }

    for (let i = 0; i < 3; i++) {
        if (i != second_col) {
            const coeff = matrixSystem[1][i] / matrixSystem[1][second_col];
            for (let j = 1; j < 4; j++) {
                matrixSystem[j][i] -= matrixSystem[j][second_col] * coeff;
                if (Math.abs(matrixSystem[j][i]) < 1e-12) {
                    matrixSystem[j][i] = 0;
                }
            }
        }
    }
    let third_col;
    for (let i = 0; i < 3; i++) {
        if (i != first_col && i != second_col) {
            third_col = i;
            const coeff = 1 / matrixSystem[2][third_col];
            for (let j = 2; j < 4; j++) {
                matrixSystem[j][third_col] *= coeff;
            }
        }
    }

    for (let i = 0; i < 3; i++) {
        if (i != third_col) {
            const coeff = matrixSystem[2][i] / matrixSystem[2][third_col];
            for (let j = 2; j < 4; j++) {
                matrixSystem[j][i] -= matrixSystem[j][third_col] * coeff;
                if (Math.abs(matrixSystem[j][i]) < 1e-12) {
                    matrixSystem[j][i] = 0;
                }
            }
        }
    }

    const result = [];

    result[0] = matrixSystem[3][first_col];
    result[1] = matrixSystem[3][second_col];
    result[2] = matrixSystem[3][third_col];

    return result;

    return matrixSystem[3];
}

export function getCoordinatesInBase(coordinates) {
    const invertBasis = View.sinumerikView.parseData.frame.invertBasis;
    const vector = [coordinates.X, coordinates.Y, coordinates.Z];

    const matrixSystem = JSON.parse(JSON.stringify(invertBasis));
    matrixSystem[3] = vector;
    let matrixCoeffSum = 0;

    for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 3; j++) {
            if (Math.abs(matrixSystem[i][j]) < 1e-12) {
                matrixSystem[i][j] = 0;
            }
            if (i < 3) {
                matrixCoeffSum += Math.abs(matrixSystem[i][j]);
            }
        }
    }
    //search first !null coeff

    let first_col = -1;
    for (let i = 0; i < 3; i++) {
        if (matrixSystem[0][i] != 0) {
            first_col = i;
            const coeff = 1 / matrixSystem[0][first_col];
            for (let j = 0; j < 4; j++) {
                matrixSystem[j][first_col] *= coeff;
            }
            break;
        }
    }
    for (let i = 0; i < 3; i++) {
        if (i != first_col) {
            const coeff = matrixSystem[0][i] / matrixSystem[0][first_col];
            for (let j = 0; j < 4; j++) {
                matrixSystem[j][i] -= matrixSystem[j][first_col] * coeff;
                if (Math.abs(matrixSystem[j][i]) < 1e-12) {
                    matrixSystem[j][i] = 0;
                }
            }
        }
    }
    let second_col = -1;
    for (let i = 0; i < 3; i++) {
        if (i != first_col && matrixSystem[1][i] != 0) {
            second_col = i;
            const coeff = 1 / matrixSystem[1][second_col];
            for (let j = 1; j < 4; j++) {
                matrixSystem[j][second_col] *= coeff;
            }
            break;
        }
    }

    for (let i = 0; i < 3; i++) {
        if (i != second_col) {
            const coeff = matrixSystem[1][i] / matrixSystem[1][second_col];
            for (let j = 1; j < 4; j++) {
                matrixSystem[j][i] -= matrixSystem[j][second_col] * coeff;
                if (Math.abs(matrixSystem[j][i]) < 1e-12) {
                    matrixSystem[j][i] = 0;
                }
            }
        }
    }
    let third_col;
    for (let i = 0; i < 3; i++) {
        if (i != first_col && i != second_col) {
            third_col = i;
            const coeff = 1 / matrixSystem[2][third_col];
            for (let j = 2; j < 4; j++) {
                matrixSystem[j][third_col] *= coeff;
            }
        }
    }

    for (let i = 0; i < 3; i++) {
        if (i != third_col) {
            const coeff = matrixSystem[2][i] / matrixSystem[2][third_col];
            for (let j = 2; j < 4; j++) {
                matrixSystem[j][i] -= matrixSystem[j][third_col] * coeff;
                if (Math.abs(matrixSystem[j][i]) < 1e-12) {
                    matrixSystem[j][i] = 0;
                }
            }
        }
    }

    const result = [];

    result[0] = matrixSystem[3][first_col] + View.sinumerikView.parseData.frame.trans.X;
    result[1] = matrixSystem[3][second_col] + View.sinumerikView.parseData.frame.trans.Y;
    result[2] = matrixSystem[3][third_col] + View.sinumerikView.parseData.frame.trans.Z;

    return result;

}

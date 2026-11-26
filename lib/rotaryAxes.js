'use babel'

const DEGREE = Math.PI / 180
const axes = ['X', 'Y', 'Z']

export const spindleNumber = value => {
    if (value == null || String(value).trim() === '') return null
    const number = Number(value)
    return Number.isInteger(number) && number >= 0 ? number : null
}

export const rotaryEnabled = view => Boolean(view.singleLineDebugHelpDiv?.C_As_Rot?.input.checked)
export const machineFor = view => {
    const active = view.singleLineDebugData?.machine
    const configured = view.programmData?.[view.parseData.filename]?.machine
    if (!configured || configured.firstSpindle || !active?.firstSpindle) return configured ?? active
    return {...configured, firstSpindle: active.firstSpindle}
}
export const spindleAxis = machine => machine?.firstSpindle?.name?.toUpperCase() || (machine?.machineType === 'Lathe' ? 'C' : '')

export function rotaryAxis(name, machine) {
    if (name && name === spindleAxis(machine)) return 'C'
    return ['A', 'B', 'C'].includes(name) && (name !== 'C' || !spindleAxis(machine)) ? name : null
}

// Applied to column vectors in the order A, B, C, around the base origin.
export function rotaryMatrix({A = 0, B = 0, C = 0}) {
    if ([A, B, C].every(angle => angle % 360 === 0)) return null
    const [a, b, c] = [A, B, C].map(angle => [Math.cos(angle * DEGREE), Math.sin(angle * DEGREE)])
    return matrixProduct(
        [[c[0], -c[1], 0], [c[1], c[0], 0], [0, 0, 1]],
        matrixProduct(
            [[b[0], 0, b[1]], [0, 1, 0], [-b[1], 0, b[0]]],
            [[1, 0, 0], [0, a[0], -a[1]], [0, a[1], a[0]]],
        ),
    )
}

const matrixProduct = (left, right) => left.map(row => axes.map((_, j) =>
    row.reduce((sum, value, k) => sum + value * right[k][j], 0)))

export function interpolateAngles(from, to, fraction) {
    return Object.fromEntries(['A', 'B', 'C'].map(axis => {
        const start = from[axis] ?? 0
        return [axis, start + ((to[axis] ?? 0) - start) * fraction]
    }))
}

export function polarAngleNear(x, y, previous) {
    if (Math.hypot(x, y) <= 1e-9) return previous
    const raw = Math.atan2(y, x) / DEGREE
    return previous + ((raw - previous + 180) % 360 + 360) % 360 - 180
}

export function rotateVector(vector, matrix, inverse = false) {
    if (!matrix) return vector
    return matrix.map((row, i) => vector.reduce((sum, value, j) =>
        sum + value * (inverse ? matrix[j][i] : row[j]), 0))
}

export function setRotaryFrame(pd, angles) {
    pd.rotaryAngles = angles
    pd.frame.rotary = rotaryMatrix(pd.transformation === 'TRANSMIT' ? {...angles, C: 0} : angles)
    pd.frameDirty = true
}

export function updateTransmitAngle(pd, machine, element) {
    if (pd.transformation !== 'TRANSMIT' || machine?.machineType !== 'Lathe') return
    const axis = spindleAxis(machine)
    const previous = pd.rotaryAngles?.C ?? 0
    const angle = polarAngleNear(element.X, element.Y, previous)
    element.transmitAxis = axis
    pd.rotaryAngles = {...pd.rotaryAngles, C: angle}
    pd.auxPos[axis] = angle
    if (!pd.auxAxes.includes(axis)) pd.auxAxes.push(axis)
    element[axis + '_start'] = previous
    element[axis] = angle
}

// Returning to the turning section changes the display coordinates of the
// stationary tool. Carry its machine position across without generating a move.
export function resetSpindleAngle(pd, axis, enabled) {
    const position = rotateVector(axes.map(key => pd.axesPos[key]), pd.frame.rotary, true)
    pd.auxPos[axis] = 0
    setRotaryFrame(pd, {...pd.rotaryAngles, C: 0})
    if (enabled) {
        const base = rotateVector(position, pd.frame.rotary)
        axes.forEach((key, i) => { pd.axesPos[key] = base[i] })
    }
}

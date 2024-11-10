'use babel'

import View from './sinumerik'

//TODO use LIMS
export const createTimeDiv = () => {
    const timerDiv = document.createElement('div')
    timerDiv.style.fontWeight = 'bold'
    timerDiv.style.display = 'flex'
    timerDiv.style.alignItems = 'center'
    timerDiv.style.gap = '10px'
    const textField = document.createElement('input')
    textField.type = 'button'
    // textField.disabled = true
    textField.id = 'machiningTime'
    textField.style.width = '6em'
    textField.style.color = 'green'
    textField.value = '--:--:--'
    const rapidTimeDiv = document.createElement('div')
    rapidTimeDiv.id = 'rapidTimeDiv'
    rapidTimeDiv.style.color = 'red'
    textField.addEventListener('click', (e) => updateMachineTime(e))
    timerDiv.appendChild(textField)
    timerDiv.appendChild(rapidTimeDiv)
    return timerDiv
}

const updateMachineTime = (e) => {
    const textField = e.target
    // textField.value = '00:00:00'
    const elements = View.sinumerikView.parseData.canvas.filter(el => el.X_start !== undefined)
    const machiningTime = elements.filter(el => el.type === 'G1').reduce((t, el) => t + getElMachineTime(el), 0)
    const rapidTime = elements.filter(el => el.type === 'G0').reduce((t, el) => t + getElMachineTime(el), 0)
    // console.log(machiningTime)
    textField.value = formatTime(machiningTime)
    const rapidField = e.target.closest('div').querySelector('#rapidTimeDiv')
    rapidField.textContent = formatTime(rapidTime)
}

const formatTime = (time) => {
    return `${('' + Math.trunc(time / 60)).padStart(2, '0')}:${('' + Math.trunc(time % 60)).padStart(2, '0')}:${('' + Math.trunc(60 * (time % 1))).padStart(2, '0')}`
}

const getElMachineTime = (el) => {
    if (el.type === 'G0') return getLength(el) / 5000
    if (el.feed.type === 'G94') return getLength(el) / el.feed.value
    if (el.spindleSpeed.type === 'G97' || Math.abs(el.X - el.X_start) < 1) {
        const spindleNums = el.spindleSpeed.value / 2 / el.X * 315
        return getLength(el) / (spindleNums * el.feed.value)
    } else {
        const divider = Math.round(Math.abs(el.X - el.X_start) + 1)
        return (Array(divider).fill('')
            .map((el_part, idx) => {
                return {
                    ...el,
                    X_start: el.X + (el.X - el.X_start) / divider * idx,
                    X: el.X + (el.X - el.X_start) / divider * (idx + 1),
                    Y_start: el.Y + (el.Y - el.Y_start) / divider * idx,
                    Y: el.Y + (el.Y - el.Y_start) / divider * (idx + 1),
                    Z_start: el.Z + (el.Z - el.Z_start) / divider * idx,
                    Z: el.Z + (el.Z - el.Z_start) / divider * (idx + 1),
                }
            }))
            .reduce((time, el_part) => {
                    return time + getElMachineTime(el_part)
                }, 0
            )
    }
}

const getLength = (el) => {
    let length = 0
    const axes_names = ['X', 'Y', 'Z']
    return Math.sqrt(axes_names.reduce((l, ax) => l + (el[ax] - el[`${ax}_start`]) ** 2, 0))
}

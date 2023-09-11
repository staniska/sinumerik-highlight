'use babel'

import View from "./sinumerik";

export const calcToolCompensation = () => {
    View.sinumerikView.parseData.calcComp = true
    const elArr = View.sinumerikView.parseData.canvas

    elArr.forEach((el, idx) => {
        if (idx === elArr.length - 1) return
        console.log(el)
        if (el.toolRadiusCompensation === 'Approach') {
            const comp = compValues(el)
            el.X_start += comp.X
            el.Z_start += comp.Z
            const ang = Math.atan2(el.X - el.X_start, el.Z - el.Z_start)
            el.X_start += Math.sin(ang) * el.activeTool.r
            el.Z_start += Math.cos(ang) * el.activeTool.r
            elArr[idx - 1].X = el.X_start
            elArr[idx - 1].Z = el.Z_start
        }
        if (el.toolRadiusCompensation === 'Departure') {
            const comp = compValues(el)
            el.X += comp.X
            el.Z += comp.Z
            const ang = Math.atan2(el.X_start - el.X, el.Z_start - el.Z)
            el.X += Math.sin(ang) * el.activeTool.r
            el.Z += Math.cos(ang) * el.activeTool.r
            elArr[idx + 1].X_start = el.X
            elArr[idx + 1].Z_start = el.Z
        }
    })
}

const getAxes = plane => {
    return {'G17': ['X', 'Y'], 'G18': ['Z', 'X'], 'G19': ['Y', 'Z']}[plane]
}

const compValues = (el) => {
    //arr [z,x] for 8 edges
    const tool = el.activeTool
    const vec = [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1], [-1, 0], [1, 0], [0, 1]][parseInt(tool.type.substring(2)) - 1]
    const comp = {X: vec[1] * tool.r, Z: vec[0] * tool.r}
    return comp
}
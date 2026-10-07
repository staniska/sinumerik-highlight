'use babel'

// Cutting-edge position ($TC_DP2, Schneidenlage) — where the nose circle sits
// relative to the tool's zero point.
//
// A turning insert is drawn, and dimensioned on the machine, about its
// THEORETICAL sharp tip: the corner the two flanks would meet at if the nose
// were not rounded. The control compensates about the nose CENTRE, and the
// number says in which direction that centre lies. With the nose radius
// ($TC_DP6) it gives the whole offset, which is what tool-radius compensation
// needs and what the trace places the outline by.
//
// The table is in MACHINE axes — Z along the spindle, X as a radius, growing
// away from it — and is the same for every lathe. What changes from machine to
// machine is only how it is drawn: a rear carriage is seen mirrored in X, a
// vertical lathe turned through ninety degrees. That is why the nine pictures
// in the machine manager come in four arrangements while this table does not,
// and `spec/tipPosition.test.js` derives all four from it so the two cannot
// drift apart.
export const TIP_POSITIONS = {
    1: {Z: -1, X: -1},
    2: {Z: +1, X: -1},
    3: {Z: +1, X: +1},
    4: {Z: -1, X: +1},
    5: {Z: -1, X: 0},
    6: {Z: 0, X: -1},
    7: {Z: +1, X: 0},
    8: {Z: 0, X: +1},
    9: {Z: 0, X: 0},
}

// Offset from the tool's zero point to the nose centre, in machine axes, or
// null when the number is not one of the nine.
//
// `number` is $TC_DP2 itself (1…9). The 100-odd form the program-side comment
// uses (`;T103`) is the same number plus a hundred — `parseVariablesBlock`
// already strips that, so it does not appear here.
export function tipPositionOffset(number, radius) {
    const at = TIP_POSITIONS[number]
    if (!at || !(radius > 0)) return null
    return {Z: at.Z * radius, X: at.X * radius}
}

// How each machine draws those nine positions: which machine axis runs across
// the three-by-three grid and which runs down it, and which way round.
//
// A carriage behind the spindle sees the same tools mirrored across the turning
// axis; a vertical lathe has Z for its vertical axis, so the grid turns with it.
export const TOOL_GRID_AXES = {
    'Horizontal/Front': {across: 'Z', acrossSign: +1, down: 'X', downSign: +1},
    'Horizontal/Rear': {across: 'Z', acrossSign: +1, down: 'X', downSign: -1},
    'Vertical/Front': {across: 'X', acrossSign: +1, down: 'Z', downSign: -1},
    'Vertical/Rear': {across: 'X', acrossSign: -1, down: 'Z', downSign: -1},
}

// The nine numbers laid out for one machine, left to right and top to bottom,
// as `;T10x` strings — the form the tool files and the old program comment use.
//
// Each cell holds the number whose nose centre lies in that direction from the
// tool's zero point, as seen on that machine. The centre cell is the position
// with no offset at all.
export function toolPositionGrid(subType, carriage) {
    const axes = TOOL_GRID_AXES[`${subType}/${carriage}`]
    if (!axes) return null

    const cells = new Array(9).fill('')
    Object.keys(TIP_POSITIONS).forEach(key => {
        const at = TIP_POSITIONS[key]
        const column = 1 + axes.acrossSign * at[axes.across]
        const row = 1 + axes.downSign * at[axes.down]
        cells[row * 3 + column] = `10${key}`
    })
    return cells
}

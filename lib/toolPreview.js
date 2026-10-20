'use babel'

// The tool preview: one static picture of a tool file, drawn in the machine's
// own view of the ZX plane.
//
// What the picture is for is the pair of nose circles. A tool file is drawn
// about the reference point P — the theoretical sharp tip for edge positions
// 1…8, the nose centre for a round insert — while the compensation numbers
// ($TC_DP2 / $TC_DP6) say where the nose centre lies and how big it is. When
// the drawing and the declaration disagree, the file describes two different
// tools, and `checkToolConsistency` can only say so in words. Here both
// circles are drawn: the solid one is what the outline measures, the dashed
// one is what the file declares, and the gap between them is the error.
//
// No `View` and no `parseData`: everything comes in as arguments, which is
// what makes `spec/toolPreview.test.js` possible. The two impure pieces live
// with their owners — the machine's axis arrangement is read in `tools.js`
// from `TOOL_GRID_AXES`, and the drawn nose is measured by
// `materialTraceRun::noseFromSections`, whose answer is handed in as
// `drawnNose`.

import {numericVariable, NOSE_RADIUS_TOLERANCE} from './shapeFile'
import {tipPositionOffset} from './tipPosition'

// Share of the smaller canvas side kept clear around the outline.
export const PREVIEW_MARGIN = 0.08

// Z to the right, X up. Used for a machine that is not a lathe, or whose
// subtype / carriage is not set yet: the nine tip positions have no view on
// such a machine either (machine-manager.js falls back to the centre cell),
// so neither has the outline.
export const DEFAULT_PREVIEW_AXES = {across: 'Z', acrossSign: +1, down: 'X', downSign: -1}

// Translucency of a section's fill. The outline on top of it is drawn solid.
const FILL_ALPHA = 0.22

// A section's geometry arrives tessellated into G0/G1 canvas elements, the
// same form `parseData.blank` has. The loose match is the one `renderer2d`
// uses on the same arrays.
const isDrawable = el => el && typeof el.type === 'string' && /G[01]/.test(el.type)

// Sections in drawing order: the cutting edge goes on top of the body, and
// ROLE:ignore is not drawn at all.
export function orderedSections(sections) {
    const drawn = (sections ?? []).filter(s => s && s.role !== 'ignore' && (s.shapes ?? []).length)
    return [...drawn.filter(s => s.role !== 'cut'), ...drawn.filter(s => s.role === 'cut')]
}

// Extent of everything the picture has to contain, per machine axis.
//
// The origin is seeded into the box rather than measured: it IS the reference
// point, so a tool drawn entirely to one side of it must still be shown with
// it. `circles` extends the box by the nose circles, so the dashed declared
// one cannot fall off the edge — which is exactly the case worth seeing.
export function toolPreviewBounds(sections, circles = []) {
    const bounds = {Z: {min: 0, max: 0}, X: {min: 0, max: 0}}

    const put = (axis, value) => {
        if (!Number.isFinite(value)) return
        const at = bounds[axis]
        if (value < at.min) at.min = value
        if (value > at.max) at.max = value
    }

    orderedSections(sections).forEach(section => {
        section.shapes.forEach(el => {
            if (!isDrawable(el)) return
            put('Z', el.Z_start)
            put('X', el.X_start)
            put('Z', el.Z)
            put('X', el.X)
        })
    })

    ;(circles ?? []).forEach(circle => {
        if (!circle || !Number.isFinite(circle.radius)) return
        put('Z', (circle.Z ?? 0) - circle.radius)
        put('Z', (circle.Z ?? 0) + circle.radius)
        put('X', (circle.X ?? 0) - circle.radius)
        put('X', (circle.X ?? 0) + circle.radius)
    })

    return bounds
}

// A machine-axis range seen through a sign: negating an interval swaps its ends.
const signedRange = (range, sign) => sign < 0
    ? {min: -range.max, max: -range.min}
    : {min: range.min, max: range.max}

// Machine coordinates to canvas pixels, fitted to the box.
//
// `axes` is a `TOOL_GRID_AXES` entry: which machine axis runs across the
// picture and which runs down it, and which way round. That table is also
// what machine-manager lays the nine tip positions out by, and it agrees with
// the SLD canvas (`single-line-debug.js::axesByPlane` + its `factor`), so the
// preview, the nine pictures and the trajectory all face the same way.
//
// One scale for both axes: a tool stretched to fill the box would show a nose
// radius that is not round.
export function previewTransform(bounds, width, height, axes, margin = PREVIEW_MARGIN) {
    const pad = Math.min(width, height) * margin
    const across = signedRange(bounds[axes.across], axes.acrossSign)
    const down = signedRange(bounds[axes.down], axes.downSign)

    const du = across.max - across.min
    const dv = down.max - down.min
    const availableW = Math.max(width - 2 * pad, 1)
    const availableH = Math.max(height - 2 * pad, 1)

    // A degenerate extent (a single point, or a tool drawn along one axis
    // only) constrains nothing, so it must not drag the scale to zero.
    const limits = []
    if (du > 0) limits.push(availableW / du)
    if (dv > 0) limits.push(availableH / dv)
    const scale = limits.length ? Math.min(...limits) : 1

    const offsetX = (width - du * scale) / 2
    const offsetY = (height - dv * scale) / 2

    const map = point => [
        offsetX + (axes.acrossSign * (point[axes.across] ?? 0) - across.min) * scale,
        offsetY + (axes.downSign * (point[axes.down] ?? 0) - down.min) * scale,
    ]

    return {scale, map}
}

// The nose the file declares, as a circle in machine axes, or null.
//
// `$TC_DP2` is the bare 1…9 here: `parseVariablesBlock` already strips the
// hundred the `;T103` shorthand carries.
export function declaredNose(variables) {
    const radius = numericVariable(variables, '$TC_DP6')
    const position = numericVariable(variables, '$TC_DP2')
    const at = tipPositionOffset(position, radius)
    if (!at) return null
    return {Z: at.Z, X: at.X, radius, position}
}

const fixed = value => (Math.round(value * 1000) / 1000).toString()
const signedFixed = value => (value >= 0 ? '+' : '') + fixed(value)

// The text under the picture. Returned as lines so the test can read them and
// so the caller decides how to join them.
//
// `drawnNose` is `noseFromSections`' answer converted to this module's
// {Z, X, radius} form — one shape for both circles, because mixing
// `{center: [z, x]}` with named axes is how axes get swapped.
export function describeToolGeometry(geometry, drawnNose) {
    if (!geometry || !(geometry.sections ?? []).length) return ['No geometry loaded']

    const lines = []
    const sections = geometry.sections
    const cut = sections.filter(s => s && s.role === 'cut').length
    lines.push(`${sections.length} section(s), ${cut} cutting`)

    lines.push(drawnNose
        ? `Nose drawn: R${fixed(drawnNose.radius)} at Z${signedFixed(drawnNose.Z)} X${signedFixed(drawnNose.X)}`
        : 'Nose drawn: none (sharp outline)')

    const declared = declaredNose(geometry.variables)
    if (declared) {
        lines.push(`Nose declared: R${fixed(declared.radius)}, position ${declared.position}`
            + ` at Z${signedFixed(declared.Z)} X${signedFixed(declared.X)}`)
    } else {
        lines.push('Nose declared: not in ;---VARIABLES')
    }

    // Same tolerance `checkToolConsistency` judges by, so the picture and the
    // load-time warning cannot disagree about whether this file is sound.
    if (declared && drawnNose && Math.abs(declared.radius - drawnNose.radius) > NOSE_RADIUS_TOLERANCE) {
        lines.push('Declared and drawn nose radius differ')
    }

    return lines
}

function sectionPath(ctx, section, map) {
    let previous = null
    ctx.beginPath()
    section.shapes.forEach(el => {
        if (!isDrawable(el)) return
        const start = map({Z: el.Z_start, X: el.X_start})
        const end = map({Z: el.Z, X: el.X})
        // A jump inside the section starts a new subpath; `fill` closes each
        // of them on its own, which is what the outline needs.
        if (!previous || Math.abs(previous[0] - start[0]) > 0.01 || Math.abs(previous[1] - start[1]) > 0.01) {
            ctx.moveTo(start[0], start[1])
        }
        ctx.lineTo(end[0], end[1])
        previous = end
    })
}

function drawCircle(ctx, circle, map, scale, color, dashed) {
    const radius = circle.radius * scale
    if (!(radius > 0.5)) return
    const centre = map(circle)

    ctx.save()
    ctx.strokeStyle = color
    ctx.lineWidth = 1
    if (dashed) ctx.setLineDash([4, 3])
    ctx.beginPath()
    ctx.arc(centre[0], centre[1], radius, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])

    ctx.beginPath()
    ctx.arc(centre[0], centre[1], 1.5, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
    ctx.restore()
}

// The reference point, and the two axis arrows that say which way the machine
// is being looked at.
function drawFrame(ctx, map, axes, colors, width, height) {
    const origin = map({Z: 0, X: 0})

    ctx.save()
    ctx.strokeStyle = colors.axis
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(origin[0] - 6, origin[1])
    ctx.lineTo(origin[0] + 6, origin[1])
    ctx.moveTo(origin[0], origin[1] - 6)
    ctx.lineTo(origin[0], origin[1] + 6)
    ctx.stroke()

    ctx.fillStyle = colors.text
    ctx.font = '10px sans-serif'
    ctx.fillText('P', origin[0] + 7, origin[1] - 7)

    // Bottom left, pointing the way each machine axis grows on screen.
    const base = [14, height - 14]
    const arm = 16
    const dx = Math.sign(axes.acrossSign)
    const dy = Math.sign(axes.downSign)

    ctx.strokeStyle = colors.axis
    ctx.beginPath()
    ctx.moveTo(base[0], base[1])
    ctx.lineTo(base[0] + dx * arm, base[1])
    ctx.moveTo(base[0], base[1])
    ctx.lineTo(base[0], base[1] + dy * arm)
    ctx.stroke()

    ctx.fillStyle = colors.axis
    ctx.fillText(axes.across, base[0] + dx * (arm + 7) - 3, base[1] + 4)
    ctx.fillText(axes.down, base[0] - 3, base[1] + dy * (arm + 10))
    ctx.restore()
}

function drawMessage(ctx, text, colors, width, height) {
    ctx.save()
    ctx.fillStyle = colors.text
    ctx.font = '12px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(text, width / 2, height / 2)
    ctx.restore()
}

// Paint one tool.
//
// Returns whether anything was drawn, so the caller can tell "nothing to see"
// from "not loaded yet" without re-deriving it.
export function drawToolPreview(ctx, geometry, opts) {
    const {width, height, axes = DEFAULT_PREVIEW_AXES, colors, drawnNose = null, message} = opts

    ctx.clearRect(0, 0, width, height)
    if (colors.bg) {
        ctx.save()
        ctx.fillStyle = colors.bg
        ctx.fillRect(0, 0, width, height)
        ctx.restore()
    }

    const sections = orderedSections(geometry?.sections)
    if (!sections.length) {
        drawMessage(ctx, message ?? 'No geometry', colors, width, height)
        return false
    }

    const declared = declaredNose(geometry.variables)
    const bounds = toolPreviewBounds(geometry.sections, [drawnNose, declared].filter(Boolean))
    const {scale, map} = previewTransform(bounds, width, height, axes)

    sections.forEach(section => {
        const color = section.color || colors.nose
        sectionPath(ctx, section, map)
        ctx.save()
        ctx.globalAlpha = FILL_ALPHA
        ctx.fillStyle = color
        ctx.fill()
        ctx.restore()
        ctx.save()
        ctx.strokeStyle = color
        ctx.lineWidth = 1.5
        ctx.stroke()
        ctx.restore()
    })

    if (drawnNose) drawCircle(ctx, drawnNose, map, scale, colors.nose, false)
    if (declared) drawCircle(ctx, declared, map, scale, colors.warn, true)

    drawFrame(ctx, map, axes, colors, width, height)
    return true
}

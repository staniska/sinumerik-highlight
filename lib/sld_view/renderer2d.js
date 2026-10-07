'use babel'

require = require('esm')(module)

import * as THREE from 'three'
import View from '../sinumerik'
import { canvasElementColor, drawAxes, transformByRange, sldScrollToElement, startDecorationCursorWatch } from '../single-line-debug'
import { showSubroutinePopup, hideSubroutinePopup } from './subroutinePopup'
import {materialTraceRects, materialTracePartialRects, materialTraceGougeRects, materialTraceCollisionRects, materialTraceState} from "../materialTraceRun";

// Loaded after esm setup (these files are ESM-only, same pattern as OrbitControls in view.js)
const { LineSegments2 }        = require('three/examples/jsm/lines/LineSegments2.js')
const { LineSegmentsGeometry } = require('three/examples/jsm/lines/LineSegmentsGeometry.js')
const { LineMaterial }         = require('three/examples/jsm/lines/LineMaterial.js')
const { Line2 }                = require('three/examples/jsm/lines/Line2.js')
const { LineGeometry }         = require('three/examples/jsm/lines/LineGeometry.js')

const CANVAS_RANGE_MIN = 0.05
const CANVAS_RANGE_MAX = 20000
const NORMAL_LINE_WIDTH    = 1.5   // px
const HOVER_LINE_WIDTH     = 4     // px
const SHADOW_LINE_WIDTH    = 7     // px — selection glow width
const SHADOW_OPACITY       = 0.3   // selection glow opacity
const HOVER_HIT_THRESHOLD  = 4     // px extra tolerance around line for hover hit-test
// Initial values — actually overwritten from CSS vars --blank-color /
// --contour-color (defined on .sinumerikCanvas, theme-aware) at every
// geometry rebuild via _syncShapeColors().
const BLANK_COLOR   = new THREE.Color('lightgray')
const CONTOUR_COLOR = new THREE.Color('darkgray')

// module-level renderer state
let glRenderer    = null
let wrapper       = null   // absolute-positioned wrapper holding WebGL canvas + overlay
let scene         = null
let camera        = null
let axesOverlay   = null   // Canvas 2D element sitting over the WebGL canvas
let mainLine      = null   // LineSegments2 — all trajectory segments
let hoverLine     = null   // LineSegments2 — hovered element, drawn on top
let shadowLines   = []     // Line2[] — editor-selection glow paths, behind mainLine
let blankMesh     = null   // filled polygon for parseData.blank
let contourMesh   = null   // filled polygon for parseData.contour
let toolMeshes    = []     // one translucent polygon per tool section, rebuilt each frame
let materialMesh  = null   // stock the tool has removed, accumulated across frames
let materialRects = null   // the rectangle list the mesh was built from
let materialFactor = ''    // axis orientation it was built for
let partialMesh   = null   // the block being animated, shown but not applied
let partialRects  = null
let partialFactor = ''
let gougeMesh     = null   // where the tool cut into the finished part
let gougeRects    = null
let gougeFactor   = ''
let crashMesh     = null   // where the holder met material that was still there
let crashRects    = null
let crashFactor   = ''

// Cleared stock is painted in the canvas background colour, so the blank is
// literally erased where the tool has been — which is what the trace is for.
// Overridable from the theme like the other two, hence the CSS var.
let removedMaterial = new THREE.Color('white')

// Stock taken out of the finished part. Drawn over the cleared area, because it
// is a subset of it and has to win: erasing stock is routine, eating the part
// is the thing to notice.
let gougedMaterial = new THREE.Color('crimson')

// Where the holder hit stock. Drawn above everything else: a gouge spoils the
// part, a holder strike breaks the machine.
let crashedMaterial = new THREE.Color('darkviolet')

// Above blank (-0.2) and contour (-0.1) so it erases them, below the
// trajectory (~0) so the path stays readable through the cleared area.
const MATERIAL_Z = -0.05

// Just above the cleared area, still below the trajectory.
const GOUGE_Z = -0.04
const CRASH_Z = -0.03

// Z of the tool above the trajectory (blank -0.2, contour -0.1, path ≈0): the
// outline sits on top so it reads as the tool passing over the path, and it is
// translucent so the path stays visible through it.
const TOOL_Z       = 0.15
const TOOL_OPACITY = 0.4
let mainMaterial  = null
let hoverMaterial = null
let shadowMaterial  = null
let blankMaterial   = null
let contourMaterial = null
let segmentElementIds = [] // segmentElementIds[i] = elementId of i-th segment
let segmentsUpTo = new Int32Array(1)  // segments contributed by the first i elements
let drawnSegments = 0      // how much of the trajectory this frame shows
let trajectorySource = null // the element array the line was built from
let trajectoryStamp = ''   // the orientation it was baked with
let currentHoveredId  = null
let isDragging        = false
let mouseDownPos      = null   // updated each move during pan
let mouseClickOrigin  = null   // fixed at mousedown — used for click distance check

// ─── public API ─────────────────────────────────────────────────────────────

export function is2DRendererActive() {
    return glRenderer !== null
}

// Return the wrapper div that hosts the WebGL canvas, or null when inactive.
// Used by single-line-debug to hide/restore the WebGL view around Details.
export function getWebGLWrapper() {
    return wrapper
}

export function init2DRenderer(container) {
    // Prefer the Canvas 2D dimensions — they are set by resizeSLDComponents()
    // and survive while the canvas is detached. container.client* may be 0
    // for a fraction of a frame right after the Canvas 2D element is removed.
    const c2d = View.sinumerikView.singleLineDebugCanvas
    const w = c2d?.width  || container.clientWidth  || 600
    const h = c2d?.height || container.clientHeight || 400

    // Absolute wrapper so we never touch the container's position style
    // (singleLineDebugMainWindow needs position:absolute to overlay
    // machineManagerMainWindow via [data-active-tab] toggling).
    wrapper = document.createElement('div')
    wrapper.className = 'sinumerikSLDWebglWrapper'
    wrapper.style.cssText =
        'position:absolute;top:0;left:0;width:100%;height:100%;'
    container.insertBefore(wrapper, container.firstChild)

    // WebGL renderer — alpha:true + transparent clear so the CSS background
    // of .sinumerikCanvas (driven by the theme) shows through.
    glRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, stencil: true })
    glRenderer.setClearColor(0x000000, 0)
    glRenderer.setSize(w, h)
    glRenderer.domElement.classList.add('sinumerikCanvas')
    glRenderer.domElement.tabIndex = 1
    glRenderer.domElement.title = 'Click on graphic field to activate keyboard events'
    wrapper.appendChild(glRenderer.domElement)

    // Orthographic camera; frustum set by syncCamera()
    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1e4, 1e4)
    camera.position.z = 1

    scene = new THREE.Scene()

    // Transparent Canvas 2D for axes, layered on top
    axesOverlay = document.createElement('canvas')
    axesOverlay.width  = w
    axesOverlay.height = h
    axesOverlay.style.cssText =
        'position:absolute;top:0;left:0;pointer-events:none;'
    wrapper.appendChild(axesOverlay)

    // Materials
    const resolution = new THREE.Vector2(w, h)
    mainMaterial = new LineMaterial({
        vertexColors: true,
        linewidth: NORMAL_LINE_WIDTH,
        resolution
    })
    hoverMaterial = new LineMaterial({
        vertexColors: true,
        linewidth: HOVER_LINE_WIDTH,
        depthTest: false,
        resolution
    })
    shadowMaterial = new LineMaterial({
        vertexColors: true,
        linewidth: SHADOW_LINE_WIDTH,
        transparent: true,
        opacity: SHADOW_OPACITY,
        depthTest: false,
        // Stencil prevents a pixel from being covered by shadow twice.
        // First fragment: stencil=0, test (0 != 1) passes → draw, mark stencil=1.
        // Any subsequent shadow fragment at the same pixel: stencil=1 → fails → skip.
        // Three.js clears stencil buffer at the start of each render() call.
        stencilWrite: true,
        stencilFunc:  THREE.NotEqualStencilFunc,
        stencilRef:   1,
        stencilZPass: THREE.ReplaceStencilOp,
        resolution
    })
    blankMaterial   = new THREE.MeshBasicMaterial({ color: BLANK_COLOR,   side: THREE.DoubleSide, depthWrite: false })
    contourMaterial = new THREE.MeshBasicMaterial({ color: CONTOUR_COLOR, side: THREE.DoubleSide, depthWrite: false })

    _buildGeometry()
    _setupEvents()
    _render()
}

export function draw2D() {
    if (!glRenderer) return
    _syncCanvasSize()
    syncCamera()
    _buildGeometry()
    _render()
    _drawAxesOverlay()
}

// Like draw2D but only includes the first elementCount elements.
// sourceElements overrides parseData.canvas — used by slow debug to pass
// the pre-subdivided little-element array instead of the raw canvas.
export function draw2DUpTo(elementCount, sourceElements = null) {
    if (!glRenderer) return
    _syncCanvasSize()
    syncCamera()
    _buildGeometry(elementCount, sourceElements)
    _render()
    _drawAxesOverlay()
}

export function destroy2DRenderer() {
    if (!glRenderer) return
    hideSubroutinePopup()
    _removeEvents()
    if (wrapper?.parentElement) wrapper.parentElement.removeChild(wrapper)
    // Before scene.clear(): each tool section owns its material, so dropping
    // the scene alone would leak one material and one geometry per section.
    _disposeToolMeshes()
    _releaseToolSectionMeshes()
    _disposeMaterialMesh()
    _disposeTrajectory()
    scene.clear()
    mainMaterial?.dispose()
    hoverMaterial?.dispose()
    blankMaterial?.dispose()
    contourMaterial?.dispose()
    glRenderer.dispose()

    glRenderer = hoverLine = mainLine = scene = camera = axesOverlay = null
    shadowLines = []
    wrapper = blankMesh = contourMesh = null
    mainMaterial = hoverMaterial = shadowMaterial = blankMaterial = contourMaterial = null
    segmentElementIds = []
    currentHoveredId = null
}

export function resize2DRenderer(w, h) {
    if (!glRenderer) return
    glRenderer.setSize(w, h)
    axesOverlay.width  = w
    axesOverlay.height = h
    mainMaterial.resolution.set(w, h)
    hoverMaterial.resolution.set(w, h)
    shadowMaterial.resolution.set(w, h)
    _syncCanvasSize()
    syncCamera()
    _render()
    _drawAxesOverlay()
}

// ─── camera sync ─────────────────────────────────────────────────────────────

function syncCamera() {
    const d = View.sinumerikView.singleLineDebugData
    const range = typeof d.canvasRange === 'number' ? d.canvasRange : 1
    const w = glRenderer.domElement.width  || 1
    const h = glRenderer.domElement.height || 1
    const hw = range / 2
    const hh = hw * (h / w)
    const cx = d.canvasCentrPoint?.[0] ?? 0
    const cy = d.canvasCentrPoint?.[1] ?? 0
    camera.left   = -hw + cx
    camera.right  =  hw + cx
    // Mirror Y compared to standard ortho convention so that positive
    // data-Y (= -1 * world-Y after factor) goes UP on screen, matching
    // Canvas 2D where the y-down pixel space combined with factor[1]=-1
    // places positive world-Y above the horizontal axis.
    camera.top    = -hh + cy
    camera.bottom =  hh + cy
    camera.updateProjectionMatrix()
}

// ─── geometry building ───────────────────────────────────────────────────────

function _syncShapeColors() {
    if (!glRenderer) return
    const css = getComputedStyle(glRenderer.domElement)
    const removed = css.getPropertyValue('--removed-color').trim() || 'white'
    removedMaterial = new THREE.Color(removed)
    const gouged = css.getPropertyValue('--gouge-color').trim() || 'crimson'
    gougedMaterial = new THREE.Color(gouged)
    const crashed = css.getPropertyValue('--crash-color').trim() || 'darkviolet'
    crashedMaterial = new THREE.Color(crashed)
    const blank   = css.getPropertyValue('--blank-color').trim()   || 'lightgray'
    const contour = css.getPropertyValue('--contour-color').trim() || 'darkgray'
    if (blankMaterial)   blankMaterial.color.set(blank)
    if (contourMaterial) contourMaterial.color.set(contour)
}

function _buildGeometry(elementLimit = Infinity, sourceElements = null) {
    if (!scene) return
    _syncShapeColors()

    // remove old lines / meshes. The trajectory is detached rather than thrown
    // away: `_trajectory` puts the same one back unless something it was baked
    // with has changed.
    if (mainLine)  scene.remove(mainLine)
    if (hoverLine) scene.remove(hoverLine)
    shadowLines.forEach(l => { scene.remove(l); l.geometry?.dispose() })
    shadowLines = []
    if (blankMesh)   { scene.remove(blankMesh);   blankMesh.geometry?.dispose();   blankMesh = null }
    if (contourMesh) { scene.remove(contourMesh); contourMesh.geometry?.dispose(); contourMesh = null }
    _disposeToolMeshes()
    // Detached, not destroyed: on a frame where nothing was cut the same
    // geometry goes straight back in. Rebuilding it every frame meant
    // allocating thousands of floats for a camera move.
    if (materialMesh) scene.remove(materialMesh)
    if (partialMesh) scene.remove(partialMesh)
    if (gougeMesh) scene.remove(gougeMesh)
    if (crashMesh) scene.remove(crashMesh)

    const d   = View.sinumerikView.singleLineDebugData
    const axes = d.CanvasAxes?.axes ?? ['X', 'Y']
    const factor = _getFactor()
    const ax0 = axes[0]
    const ax1 = axes[1]

    // Blank and contour are extracted out of parseData.canvas by the
    // Canvas 2D path (displayCanvasElements) into separate arrays. Render
    // them as filled polygons so they look like the Canvas 2D version.
    blankMesh   = _buildFilledMesh(View.sinumerikView.parseData?.blank,   blankMaterial,   ax0, ax1, factor, -0.2)
    contourMesh = _buildFilledMesh(View.sinumerikView.parseData?.contour, contourMaterial, ax0, ax1, factor, -0.1)
    if (blankMesh)   scene.add(blankMesh)
    if (contourMesh) scene.add(contourMesh)

    const tmpColor  = new THREE.Color()
    const hasSel    = !!View.sinumerikView.selection

    // sourceElements is the pre-subdivided little-element array from slow debug;
    // fall back to parseData.canvas for normal (non-slow-debug) renders.
    const canvas = sourceElements ?? (View.sinumerikView.parseData?.canvas ?? [])

    _buildMaterialMesh(elementLimit, sourceElements, ax0, ax1, factor)
    _buildToolMeshes(canvas, elementLimit, ax0, ax1, factor)

    // The whole trajectory, built once and then only revealed further. Slow
    // debug moved the limit by one element per frame and the line was rebuilt
    // and re-uploaded whole for every one of them — on the user's program that
    // upload was 70 % of the profile, dwarfing everything the trace itself does.
    // The segments are in element order, so how much of it to show is a count.
    _trajectory(canvas, ax0, ax1, factor)
    drawnSegments = mainLine
        ? segmentsUpTo[Math.min(Number.isFinite(elementLimit) ? elementLimit : canvas.length, canvas.length)]
        : 0

    // Build shadow glow as continuous Line2 paths to avoid opacity doubling
    // at segment joints that LineSegments2 would produce. Split into a new
    // path whenever the selection has a gap or the geometry is discontinuous.
    if (hasSel) {
        const EPS = 1e-9
        const paths = []
        let cur = null
        let prevX = null, prevY = null

        let shadowCount = 0
        ;(sourceElements ?? (View.sinumerikView.parseData?.canvas ?? [])).forEach(el => {
            if (shadowCount >= elementLimit) return
            shadowCount++

            if (!el.type?.match(/G0|G1|G33|transform/)) return

            const x0 = factor[0] * (el[ax0 + '_start'] ?? 0)
            const y0 = factor[1] * (el[ax1 + '_start'] ?? 0)
            const x1 = factor[0] * (el[ax0] ?? 0)
            const y1 = factor[1] * (el[ax1] ?? 0)

            if (!View.sinumerikView.selectionContains(el.mainRow ?? el.row)) {
                cur = null
                prevX = x1; prevY = y1
                return
            }

            tmpColor.set(canvasElementColor(el.type, el.toolRadiusCompensation))
            const r = tmpColor.r, g = tmpColor.g, b = tmpColor.b

            const connects = cur !== null &&
                Math.abs(x0 - prevX) < EPS && Math.abs(y0 - prevY) < EPS

            if (!connects) {
                cur = { pos: [x0, y0, 0], col: [r, g, b] }
                paths.push(cur)
            }
            cur.pos.push(x1, y1, 0)
            cur.col.push(r, g, b)
            prevX = x1; prevY = y1
        })

        paths.forEach(({ pos, col }) => {
            if (pos.length < 6) return
            const geo = new LineGeometry()
            geo.setPositions(pos)
            geo.setColors(col)
            const line = new Line2(geo, shadowMaterial)
            line.renderOrder = -1
            scene.add(line)
            shadowLines.push(line)
        })
    }

    if (!mainLine) return

    // An instanced geometry draws as many segments as it is told to, so a frame
    // costs one number rather than one upload.
    mainLine.geometry.instanceCount = drawnSegments
    mainLine.visible = drawnSegments > 0
    scene.add(mainLine)
    scene.add(hoverLine)
}

// The trajectory line for this element array, orientation and theme — reused
// until one of those changes.
//
// Rebuilt on a re-parse (a different array), on switching axes or reversing one
// (the positions are baked in display coordinates) and when the colours are
// re-read from CSS, since they are baked too.
function _trajectory(canvas, ax0, ax1, factor) {
    const stamp = `${ax0}${ax1},${factor[0]},${factor[1]}`
    if (mainLine && trajectorySource === canvas && trajectoryStamp === stamp) return

    _disposeTrajectory()
    trajectorySource = canvas
    trajectoryStamp = stamp

    const positions = []
    const colors = []
    const tmpColor = new THREE.Color()
    segmentElementIds = []
    // How many segments the first i elements contribute. msg and pause elements
    // carry no coordinates but do count towards the limit, so the two cannot be
    // the same number.
    segmentsUpTo = new Int32Array(canvas.length + 1)

    canvas.forEach((el, i) => {
        segmentsUpTo[i + 1] = segmentsUpTo[i]
        if (!el.type?.match(/G0|G1|G33|transform/)) return

        positions.push(
            factor[0] * (el[ax0 + '_start'] ?? 0), factor[1] * (el[ax1 + '_start'] ?? 0), 0,
            factor[0] * (el[ax0] ?? 0), factor[1] * (el[ax1] ?? 0), 0,
        )
        tmpColor.set(canvasElementColor(el.type, el.toolRadiusCompensation))
        colors.push(tmpColor.r, tmpColor.g, tmpColor.b, tmpColor.r, tmpColor.g, tmpColor.b)
        segmentElementIds.push(el.elementId ?? -1)
        segmentsUpTo[i + 1]++
    })

    if (!positions.length) return

    const geo = new LineSegmentsGeometry()
    geo.setPositions(positions)
    geo.setColors(colors)
    mainLine = new LineSegments2(geo, mainMaterial)

    // Empty hover line — updated by `_updateHover`. Kept alongside the
    // trajectory because it holds a slice of the same geometry.
    const hoverGeo = new LineSegmentsGeometry()
    hoverGeo.setPositions([0, 0, 0, 0, 0, 0])
    hoverLine = new LineSegments2(hoverGeo, hoverMaterial)
    hoverLine.visible = false
    hoverLine.renderOrder = 1
}

function _disposeTrajectory() {
    if (mainLine) {
        scene?.remove(mainLine)
        mainLine.geometry?.dispose()
    }
    if (hoverLine) {
        scene?.remove(hoverLine)
        hoverLine.geometry?.dispose()
    }
    mainLine = hoverLine = null
    trajectorySource = null
    trajectoryStamp = ''
    segmentElementIds = []
    segmentsUpTo = new Int32Array(1)
    drawnSegments = 0
}

function _updateHover(elementId) {
    if (!hoverLine) return
    if (elementId === null) {
        hoverLine.visible = false
        return
    }

    const d    = View.sinumerikView.singleLineDebugData
    const axes = d.CanvasAxes?.axes ?? ['X', 'Y']
    const factor = _getFactor()
    const ax0 = axes[0]
    const ax1 = axes[1]

    const positions = []
    const colors    = []
    const tmpColor  = new THREE.Color()

    ;(View.sinumerikView.parseData?.canvas ?? []).forEach(el => {
        if (el.elementId !== elementId) return
        if (!el.type?.match(/G0|G1|G33|transform/)) return
        positions.push(
            factor[0] * (el[ax0 + '_start'] ?? 0),
            factor[1] * (el[ax1 + '_start'] ?? 0), 0,
            factor[0] * (el[ax0] ?? 0),
            factor[1] * (el[ax1] ?? 0), 0
        )
        tmpColor.set(canvasElementColor(el.type, el.toolRadiusCompensation))
        colors.push(tmpColor.r, tmpColor.g, tmpColor.b,
                    tmpColor.r, tmpColor.g, tmpColor.b)
    })

    if (positions.length === 0) {
        hoverLine.visible = false
        return
    }

    const geo = new LineSegmentsGeometry()
    geo.setPositions(positions)
    geo.setColors(colors)
    hoverLine.geometry.dispose()
    hoverLine.geometry = geo
    hoverLine.visible = true
}

// ─── rendering ───────────────────────────────────────────────────────────────

function _render() {
    if (!glRenderer || !scene || !camera) return
    glRenderer.render(scene, camera)
}

function _drawAxesOverlay() {
    if (!axesOverlay) return
    // Sync the Canvas 2D element dimensions so transformByRange() / drawAxes()
    // read the correct width/height (they reference singleLineDebugCanvas).
    const c2d = View.sinumerikView.singleLineDebugCanvas
    c2d.width  = axesOverlay.width
    c2d.height = axesOverlay.height

    // Update canvasHeightFactor and canvasTransform so drawAxes() works correctly
    const d = View.sinumerikView.singleLineDebugData
    d.canvasHeightFactor = axesOverlay.height / axesOverlay.width
    transformByRange()

    const ctx = axesOverlay.getContext('2d')
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, axesOverlay.width, axesOverlay.height)
    // drawAxes() draws in world coords and expects the same affine that
    // Canvas 2D rendering applies in changeCanvas().
    const t = d.canvasTransform
    ctx.setTransform(t.a, t.b, t.c, t.d, t.e, t.f)
    drawAxes(ctx)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
}

// ─── events ──────────────────────────────────────────────────────────────────

function _setupEvents() {
    const el = glRenderer.domElement

    el.addEventListener('wheel',     _onWheel,     { passive: true })
    el.addEventListener('mousedown', _onMouseDown)
    el.addEventListener('mousemove', _onMouseMove)
    el.addEventListener('mouseleave', _onMouseLeave)
    el.addEventListener('dblclick',  _onDblClick)
    document.addEventListener('mouseup', _onMouseUp)
    el.addEventListener('keydown',   _onKeyDown)
}

function _removeEvents() {
    const el = glRenderer?.domElement
    if (!el) return
    el.removeEventListener('wheel',      _onWheel)
    el.removeEventListener('mousedown',  _onMouseDown)
    el.removeEventListener('mousemove',  _onMouseMove)
    el.removeEventListener('mouseleave', _onMouseLeave)
    el.removeEventListener('dblclick',   _onDblClick)
    document.removeEventListener('mouseup', _onMouseUp)
    el.removeEventListener('keydown',    _onKeyDown)
}

function _onWheel(event) {
    const d = View.sinumerikView.singleLineDebugData
    if (!d.canvasCentrPoint) return
    const now = Date.now()
    if (d.canvasWheelTimestamp > now - 20) return
    d.canvasWheelTimestamp = now

    const w = glRenderer.domElement.offsetWidth
    const h = glRenderer.domElement.offsetHeight
    const delta = event.deltaY
    const oldScale = w / d.canvasRange
    const newRange = d.canvasRange +
        Math.abs(delta) / delta * Number((d.canvasRange / 20).toPrecision(1))
    if (!isFinite(newRange) || newRange < CANVAS_RANGE_MIN || newRange > CANVAS_RANGE_MAX) return

    const center = d.canvasCentrPoint
    const eventPt = [
        center[0] - (w / 2 - event.offsetX) / oldScale,
        center[1] - (h / 2 - event.offsetY) / oldScale
    ]
    d.canvasRange = newRange
    const scale = w / newRange
    center[0] -= (eventPt[0] - center[0]) * ((oldScale - scale) / scale)
    center[1] -= (eventPt[1] - center[1]) * ((oldScale - scale) / scale)

    syncCamera()
    _drawAxesOverlay()
    _render()
}

function _onMouseDown(event) {
    if (event.button !== 0) return
    isDragging = false
    mouseDownPos    = [event.offsetX, event.offsetY]
    mouseClickOrigin = [event.offsetX, event.offsetY]
    glRenderer.domElement.style.cursor = 'grabbing'
}

function _onMouseMove(event) {
    const d = View.sinumerikView.singleLineDebugData

    // drag / pan
    if (mouseDownPos !== null && d.canvasCentrPoint) {
        const dx = event.offsetX - mouseDownPos[0]
        const dy = event.offsetY - mouseDownPos[1]
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
            isDragging = true
        }
        if (isDragging) {
            const w = glRenderer.domElement.offsetWidth
            const scale = w / d.canvasRange
            d.canvasCentrPoint[0] -= dx / scale
            d.canvasCentrPoint[1] -= dy / scale
            mouseDownPos = [event.offsetX, event.offsetY]
            syncCamera()
            _drawAxesOverlay()
            _render()
            return
        }
    }

    // hover hit-test
    if (!mainLine || isDragging) return
    const hitId = _hitTest(event.offsetX, event.offsetY)
    if (hitId !== currentHoveredId) {
        currentHoveredId = hitId
        _updateHover(hitId)
        glRenderer.domElement.style.cursor = hitId !== null ? 'pointer' : 'default'
        _render()
    }
}

function _onMouseUp(event) {
    if (event.button !== 0) return
    isDragging   = false
    mouseDownPos = null

    const origin = mouseClickOrigin
    mouseClickOrigin = null

    if (glRenderer) glRenderer.domElement.style.cursor =
        currentHoveredId !== null ? 'pointer' : 'default'

    if (currentHoveredId === null || !origin) return
    const dx = event.offsetX - origin[0]
    const dy = event.offsetY - origin[1]
    if (Math.sqrt(dx * dx + dy * dy) < 4) {
        _handleClick()
    }
}

function _onMouseLeave() {
    mouseDownPos     = null
    mouseClickOrigin = null
    isDragging       = false
    if (currentHoveredId !== null) {
        currentHoveredId = null
        if (hoverLine) hoverLine.visible = false
        if (glRenderer) glRenderer.domElement.style.cursor = 'default'
        _render()
    }
}

function _onKeyDown(event) {
    // forward keyboard shortcuts to sinumerikEventHandler via custom event
    // The handler in single-line-debug.js listens on singleLineDebugCanvas,
    // so we re-dispatch there.
    const c2d = View.sinumerikView.singleLineDebugCanvas
    if (c2d) c2d.dispatchEvent(new KeyboardEvent('keydown', {
        code: event.code, key: event.key, bubbles: false
    }))
}

// ─── hit testing ─────────────────────────────────────────────────────────────

function _hitTest(offsetX, offsetY) {
    if (!mainLine || !glRenderer || !camera) return null
    // offsetX/Y are CSS pixels; normalize by CSS size (offsetWidth/Height),
    // not the physical buffer size (width/height), to get correct NDC on HiDPI.
    const w = glRenderer.domElement.offsetWidth  || glRenderer.domElement.width
    const h = glRenderer.domElement.offsetHeight || glRenderer.domElement.height
    const mouse = new THREE.Vector2(
        (offsetX / w) * 2 - 1,
        -(offsetY / h) * 2 + 1
    )
    const raycaster = new THREE.Raycaster()
    // Line2 / LineSegments2 use this threshold (in addition to linewidth)
    // for screen-space hit detection. 0 means hit only within the drawn line.
    raycaster.params.Line2 = { threshold: HOVER_HIT_THRESHOLD }
    raycaster.setFromCamera(mouse, camera)

    const hits = raycaster.intersectObject(mainLine)
    if (!hits.length) return null
    const idx = hits[0].faceIndex
    // The geometry holds the whole trajectory even when only part of it is
    // drawn, and a raycast does not know about the draw count — so an element
    // slow debug has not reached yet must not answer.
    if (idx >= drawnSegments) return null
    return idx < segmentElementIds.length ? segmentElementIds[idx] : null
}

// ─── click routing ────────────────────────────────────────────────────────────

function _handleClick() {
    const canvas = View.sinumerikView.parseData?.canvas ?? []
    const el = canvas.find(c => c.elementId === currentHoveredId)
    if (!el) return

    sldScrollToElement(el)
    startDecorationCursorWatch()
}

function _onDblClick() {
    if (currentHoveredId === null) return
    const canvas = View.sinumerikView.parseData?.canvas ?? []
    const el = canvas.find(c => c.elementId === currentHoveredId)
    if (!el?.mainRow) return
    showSubroutinePopup(el)
}

// ─── removed material (slow debug only) ──────────────────────────────────────

function _disposeMaterialMesh() {
    if (materialMesh) {
        scene.remove(materialMesh)
        materialMesh.geometry?.dispose()
        materialMesh.material?.dispose()
        materialMesh = null
        materialRects = null
        materialFactor = ''
    }
    if (partialMesh) {
        scene.remove(partialMesh)
        partialMesh.geometry?.dispose()
        partialMesh.material?.dispose()
        partialMesh = null
        partialRects = null
        partialFactor = ''
    }
    if (gougeMesh) {
        scene.remove(gougeMesh)
        gougeMesh.geometry?.dispose()
        gougeMesh.material?.dispose()
        gougeMesh = null
        gougeRects = null
        gougeFactor = ''
    }
    if (crashMesh) {
        scene.remove(crashMesh)
        crashMesh.geometry?.dispose()
        crashMesh.material?.dispose()
        crashMesh = null
        crashRects = null
        crashFactor = ''
    }
}

// Add or reuse one of the overlay meshes. Rebuilt only when its rectangle list
// changes by identity, or when the axis orientation it was baked with does.
function _overlayMesh(mesh, rects, held, factor, orientation, color, z) {
    if (mesh && held === rects && factor === orientation) {
        scene.add(mesh)
        return mesh
    }
    if (mesh) {
        scene.remove(mesh)
        mesh.geometry?.dispose()
        mesh.material?.dispose()
    }
    const built = new THREE.Mesh(_rectGeometry(rects, factorOf(orientation)), new THREE.MeshBasicMaterial({
        color,
        side: THREE.DoubleSide,
        depthWrite: false,
    }))
    built.position.z = z
    scene.add(built)
    return built
}

const factorOf = orientation => orientation.split(',').map(Number)

// Quads for a rectangle list, in the display axes.
function _rectGeometry(rects, factor) {
    const positions = []
    rects.forEach(r => {
        const u0 = factor[0] * r.a0lo
        const u1 = factor[0] * r.a0hi
        const v0 = factor[1] * r.a1lo
        const v1 = factor[1] * r.a1hi
        positions.push(
            u0, v0, 0, u1, v0, 0, u1, v1, 0,
            u0, v0, 0, u1, v1, 0, u0, v1, 0,
        )
    })

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    return geometry
}

// Paint the stock the tool has taken out.
//
// Reads the trace, never advances it. Advancing belongs to the slow-debug loop
// (`single-line-debug.js::stepMaterialTrace`), because the trace is a model and
// not a picture: tying it to the renderer froze it whenever the renderer was
// destroyed — which is exactly what opening Details does — and then cost a
// replay from the blank on the way back.
//
// Whatever has accumulated keeps being drawn on ordinary redraws, so the
// finished picture survives after the animation ends — unlike the tool outline,
// which shows where the tool is *now* and has nothing left to show once there is
// no "now".
function _buildMaterialMesh(elementLimit, sourceElements, ax0, ax1, factor) {
    const state = materialTraceState()
    if (!state || state.status !== 'ok') return

    // The grid runs along the machine plane's own axes, not the display ones,
    // so that switching the view cannot invalidate it. When the two differ the
    // rectangles have no meaningful projection here — skip rather than smear
    // them onto the wrong pair of axes.
    if (ax0 !== state.a0 || ax1 !== state.a1) return

    const rects = materialTraceRects()

    // `materialTraceRects` hands back the same array by identity until
    // something is cut again, so an unchanged trace needs no new geometry —
    // only the orientation it was baked with has to still hold.
    const orientation = `${factor[0]},${factor[1]}`

    // The block being animated is drawn from its own list, in the same colour.
    // It changes every frame; the applied material does not, and keeping them
    // apart is what lets the big buffer stay on the card between cuts.
    const showing = materialTracePartialRects()
    if (showing.length) {
        partialMesh = _overlayMesh(partialMesh, showing, partialRects, partialFactor, orientation, removedMaterial, MATERIAL_Z)
        partialRects = showing
        partialFactor = orientation
    }

    if (!rects.length) return

    if (materialMesh && materialRects === rects && materialFactor === orientation) {
        scene.add(materialMesh)
    } else {
        if (materialMesh) {
            scene.remove(materialMesh)
            materialMesh.geometry?.dispose()
            materialMesh.material?.dispose()
        }
        materialMesh = new THREE.Mesh(_rectGeometry(rects, factor), new THREE.MeshBasicMaterial({
            color: removedMaterial,
            side: THREE.DoubleSide,
            depthWrite: false,
        }))
        materialMesh.position.z = MATERIAL_Z
        materialRects = rects
        materialFactor = orientation
        scene.add(materialMesh)
    }

    // Then the two kinds of damage, worst on top: a gouge spoils the part, a
    // holder strike breaks the machine.
    const gouges = materialTraceGougeRects()
    if (gouges.length) {
        gougeMesh = _overlayMesh(gougeMesh, gouges, gougeRects, gougeFactor, orientation, gougedMaterial, GOUGE_Z)
        gougeRects = gouges
        gougeFactor = orientation
    }

    const crashes = materialTraceCollisionRects()
    if (crashes.length) {
        crashMesh = _overlayMesh(crashMesh, crashes, crashRects, crashFactor, orientation, crashedMaterial, CRASH_Z)
        crashRects = crashes
        crashFactor = orientation
    }
}

// ─── tool outline (slow debug only) ──────────────────────────────────────────

// Detached, not destroyed: the meshes belong to the tool's sections now and go
// straight back in on the next frame, moved rather than rebuilt. They are
// released when the section is reparsed (`_toolSectionMesh` replaces its own
// cache) or with the renderer (`_releaseToolSectionMeshes`).
function _disposeToolMeshes() {
    toolMeshes.forEach(mesh => scene.remove(mesh))
    toolMeshes = []
}

// Hand back the GPU side of every cached section mesh. Unlike blank/contour,
// each section owns its material — its colour comes from the file — so the
// material has to go too.
function _releaseToolSectionMeshes() {
    const cache = View.sinumerikView.toolGeometry ?? {}
    Object.keys(cache).forEach(path => {
        ;(cache[path]?.sections ?? []).forEach(section => {
            if (!section._mesh2d) return
            scene?.remove(section._mesh2d)
            section._mesh2d.geometry?.dispose()
            section._mesh2d.material?.dispose()
            section._mesh2d = null
            section._mesh2dStamp = ''
        })
    })
}

// Draw the active tool with its reference point sitting on the current end of
// the trajectory.
//
// Only while slow debug is actually animating: the point of the outline is to
// show where the tool is *now*, and on a finished frame there is no "now" —
// it would just sit on the last element forever and hide it.
function _buildToolMeshes(canvas, elementLimit, ax0, ax1, factor) {
    const slowDebug = View.sinumerikView.singleLineDebugInfoDiv?.slowDebugCheck?.checked
    if (!slowDebug || !Number.isFinite(elementLimit)) return
    if (elementLimit <= 0 || elementLimit >= canvas.length) return

    // The reference point rides the END of the last drawn element, not its
    // start. `msg` / `pause` entries count towards elementLimit but carry no
    // coordinates, so walk back to the last one that does.
    let tip = null
    for (let i = Math.min(elementLimit, canvas.length) - 1; i >= 0; i--) {
        const el = canvas[i]
        if (el && typeof el.type === 'string' && /^G[01]$/.test(el.type)) { tip = el; break }
    }
    if (!tip || !tip.toolDef || !tip.toolDef.path) return

    // Geometry is read after the parse (interpretator::preloadToolGeometry),
    // which then asks for another redraw — so a miss here means "not yet",
    // and drawing nothing this frame is correct.
    const geometry = View.sinumerikView.toolGeometry?.[tip.toolDef.path]
    if (!geometry || !geometry.sections) return

    // Zero in the file is the tool reference point, so the offset to the tip
    // IS the tip's own position.
    const offset = [tip[ax0] ?? 0, tip[ax1] ?? 0]

    geometry.sections.forEach(section => {
        const mesh = _toolSectionMesh(section, ax0, ax1, factor)
        if (!mesh) return
        // The outline does not change shape as the tool travels, it only moves.
        mesh.position.set(factor[0] * offset[0], factor[1] * offset[1], TOOL_Z)
        toolMeshes.push(mesh)
        scene.add(mesh)
    })
}

// Same construction as `_buildFilledMesh`, with a per-section translucent
// material and the outline shifted onto the tip. Kept separate rather than
// bolted onto that helper with more parameters, because every call there
// passes a shared module-level material and this one cannot.
// Built once per section and then moved. Triangulating the outline and compiling
// a material for it on every frame of the animation was a shader compile per
// frame per section — `getProgramInfoLog` in the profile — for a shape that only
// ever changes position.
//
// Cached on the section object, beside the outline cache the trace keeps there,
// and keyed by the orientation the points were baked with.
function _toolSectionMesh(section, ax0, ax1, factor) {
    const stamp = `${ax0}${ax1},${factor[0]},${factor[1]}`
    if (section._mesh2d && section._mesh2dStamp === stamp) return section._mesh2d

    if (section._mesh2d) {
        section._mesh2d.geometry?.dispose()
        section._mesh2d.material?.dispose()
        section._mesh2d = null
    }

    const segs = (section.shapes ?? []).filter(el => el.type && el.type.match(/G[01]/))
    if (segs.length === 0) return null

    const pts = []
    const first = segs[0]
    pts.push(new THREE.Vector2(
        factor[0] * (first[ax0 + '_start'] ?? 0),
        factor[1] * (first[ax1 + '_start'] ?? 0)
    ))
    segs.forEach(el => {
        pts.push(new THREE.Vector2(
            factor[0] * (el[ax0] ?? 0),
            factor[1] * (el[ax1] ?? 0)
        ))
    })
    if (pts.length < 3) return null

    const material = new THREE.MeshBasicMaterial({
        color: new THREE.Color(section.color),
        transparent: true,
        opacity: TOOL_OPACITY,
        depthWrite: false,
        side: THREE.DoubleSide,
    })
    section._mesh2d = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(pts)), material)
    section._mesh2dStamp = stamp
    return section._mesh2d
}

// ─── helpers ─────────────────────────────────────────────────────────────────

// Build a filled polygon Mesh from an array of canvas elements (same
// shape as parseData.blank / parseData.contour). Uses THREE.ShapeGeometry
// (earcut) so concave polygons triangulate correctly — a simple fan from
// the first vertex misses pieces on non-convex blanks.
function _buildFilledMesh(array, material, ax0, ax1, factor, z) {
    if (!array || array.length === 0) return null

    // Drop non-trajectory entries (msg / pause / transform). Their X/Y/Z are
    // undefined and the ?? 0 fallback below would draw spurious edges to the
    // origin. Matches the 3D view's createMesh() filter.
    const segs = array.filter(el => el.type && el.type.match(/G[01]/))
    if (segs.length === 0) return null

    const pts = []
    const first = segs[0]
    pts.push(new THREE.Vector2(
        factor[0] * (first[ax0 + '_start'] ?? 0),
        factor[1] * (first[ax1 + '_start'] ?? 0)
    ))
    segs.forEach(el => {
        pts.push(new THREE.Vector2(
            factor[0] * (el[ax0] ?? 0),
            factor[1] * (el[ax1] ?? 0)
        ))
    })
    if (pts.length < 3) return null

    const shape = new THREE.Shape(pts)
    const geo = new THREE.ShapeGeometry(shape)
    const mesh = new THREE.Mesh(geo, material)
    mesh.position.z = z
    return mesh
}

function _getFactor() {
    const d = View.sinumerikView.singleLineDebugData
    const factor = [1, -1]
    if (d.CanvasAxes?.reverseAxes !== undefined) {
        factor[d.CanvasAxes.reverseAxes] *= -1
    }
    return factor
}

function _syncCanvasSize() {
    // keep singleLineDebugCanvas dimensions in sync so transformByRange()
    // and drawAxes() produce correct values when called with WebGL active
    const c2d = View.sinumerikView.singleLineDebugCanvas
    c2d.width  = glRenderer.domElement.width
    c2d.height = glRenderer.domElement.height
}

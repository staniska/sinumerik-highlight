'use babel'

require = require('esm')(module)

import * as THREE from 'three'
import View from '../sinumerik'
import { canvasElementColor, drawAxes, transformByRange } from '../single-line-debug'
import { showSubroutinePopup, hideSubroutinePopup } from './subroutinePopup'

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
let mainMaterial  = null
let hoverMaterial = null
let shadowMaterial  = null
let blankMaterial   = null
let contourMaterial = null
let segmentElementIds = [] // segmentElementIds[i] = elementId of i-th segment
let currentHoveredId  = null
let isDragging        = false
let mouseDownPos      = null   // updated each move during pan
let mouseClickOrigin  = null   // fixed at mousedown — used for click distance check

// ─── public API ─────────────────────────────────────────────────────────────

export function is2DRendererActive() {
    return glRenderer !== null
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

    // WebGL renderer
    glRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, stencil: true })
    glRenderer.setClearColor(0xffffff, 1)
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

export function destroy2DRenderer() {
    if (!glRenderer) return
    hideSubroutinePopup()
    _removeEvents()
    if (wrapper?.parentElement) wrapper.parentElement.removeChild(wrapper)
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

function _buildGeometry() {
    if (!scene) return

    // remove old lines / meshes
    if (mainLine)  scene.remove(mainLine)
    if (hoverLine) scene.remove(hoverLine)
    shadowLines.forEach(l => { scene.remove(l); l.geometry?.dispose() })
    shadowLines = []
    if (blankMesh)   { scene.remove(blankMesh);   blankMesh.geometry?.dispose();   blankMesh = null }
    if (contourMesh) { scene.remove(contourMesh); contourMesh.geometry?.dispose(); contourMesh = null }

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

    const positions   = []
    const colors      = []
    segmentElementIds = []

    const tmpColor  = new THREE.Color()
    const hasSel    = !!View.sinumerikView.selection

    const canvas = View.sinumerikView.parseData?.canvas ?? []
    canvas.forEach(el => {
        if (!el.type?.match(/G0|G1|G33|transform/)) return

        const x0 = factor[0] * (el[ax0 + '_start'] ?? 0)
        const y0 = factor[1] * (el[ax1 + '_start'] ?? 0)
        const x1 = factor[0] * (el[ax0] ?? 0)
        const y1 = factor[1] * (el[ax1] ?? 0)

        positions.push(x0, y0, 0,  x1, y1, 0)

        tmpColor.set(canvasElementColor(el.type, el.toolRadiusCompensation))
        colors.push(tmpColor.r, tmpColor.g, tmpColor.b,
                    tmpColor.r, tmpColor.g, tmpColor.b)

        segmentElementIds.push(el.elementId ?? -1)

    })

    // Build shadow glow as continuous Line2 paths to avoid opacity doubling
    // at segment joints that LineSegments2 would produce. Split into a new
    // path whenever the selection has a gap or the geometry is discontinuous.
    if (hasSel) {
        const EPS = 1e-9
        const paths = []
        let cur = null
        let prevX = null, prevY = null

        canvas.forEach(el => {
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

    if (positions.length === 0) {
        mainLine = null
        hoverLine = null
        return
    }

    const geo = new LineSegmentsGeometry()
    geo.setPositions(positions)
    geo.setColors(colors)
    mainLine = new LineSegments2(geo, mainMaterial)
    scene.add(mainLine)

    // empty hover line — updated by _updateHover()
    const hoverGeo = new LineSegmentsGeometry()
    hoverGeo.setPositions([0, 0, 0, 0, 0, 0])
    hoverLine = new LineSegments2(hoverGeo, hoverMaterial)
    hoverLine.visible = false
    hoverLine.renderOrder = 1
    scene.add(hoverLine)
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
    return idx < segmentElementIds.length ? segmentElementIds[idx] : null
}

// ─── click routing ────────────────────────────────────────────────────────────

function _handleClick() {
    const canvas = View.sinumerikView.parseData?.canvas ?? []
    const el = canvas.find(c => c.elementId === currentHoveredId)
    if (!el) return

    const Editor = atom.workspace.getActiveTextEditor()
    if (!el.mainRow) {
        if (Editor) Editor.setCursorBufferPosition([el.row, 0])
    } else {
        if (Editor) Editor.setCursorBufferPosition([el.mainRow, 0])
        showSubroutinePopup(el)
    }
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

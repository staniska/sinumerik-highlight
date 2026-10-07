'use babel'

require = require("esm")(module)

import View from "../sinumerik";
import * as THREE from 'three';
import {destroy2DRenderer, init2DRenderer, draw2D, is2DRendererActive} from "../sld_view/renderer2d.js";

const {OrbitControls} = require("three/examples/jsm/controls/OrbitControls.js")

const materials = {
    transform: new THREE.LineBasicMaterial({color: 'black', linewidth: 1}),
    G1:        new THREE.LineBasicMaterial({color: 'green', linewidth: 3}),
    G0:        new THREE.LineBasicMaterial({color: 'red', linewidth: 2}),
    G41:       new THREE.LineBasicMaterial({color: 'greenyellow', linewidth: 3}),
    G42:       new THREE.LineBasicMaterial({color: 'springgreen', linewidth: 3}),
    AutoInsert:new THREE.LineBasicMaterial({color: 'goldenrod', linewidth: 3}),
    OffnLoop:  new THREE.LineBasicMaterial({color: 'lightcyan', linewidth: 3})
}

// Build trajectory geometry into scene up to elementLimit elements from sourceElements.
// Counts ALL element types (including msg/pause) toward the limit so the counter
// matches drawnElementsNums from the slow-debug timeout loop.
// Returns camepaStartPoint for initial camera positioning.
function _buildScene3D(scene, elementLimit, sourceElements) {
    const canvas  = sourceElements ?? View.sinumerikView.parseData.canvas
    const limited = canvas.slice(0, elementLimit)
    const drawable = limited.filter(e => e.type?.match(/G[013]|transform/))

    const paths = [[]]
    let pathNum = 0
    drawable.forEach((e, i, a) => {
        paths[pathNum].push(e)
        if (i === a.length - 1 || getElType(e) === getElType(a[i + 1])) return
        pathNum++
        paths.push([])
    })

    const camepaStartPoint = {X: 0, Y: 0, Z: 0, pointsNum: 0}
    paths.forEach(path => {
        if (!path.length) return
        const points = []
        points.push(new THREE.Vector3(path[0].X_start, path[0].Y_start, path[0].Z_start))
        path.forEach(p => {
            camepaStartPoint.pointsNum++
            camepaStartPoint.X += p.X
            camepaStartPoint.Y += p.Y
            camepaStartPoint.Z += p.Z
            points.push(new THREE.Vector3(p.X, p.Y, p.Z))
        })
        const geometry = new THREE.BufferGeometry().setFromPoints(points)
        scene.add(new THREE.Line(geometry, materials[getElType(path[0])]))
    })

    const css = getComputedStyle(View.sinumerikView.singleLineDebugThree.domElement)
    const blankColor   = css.getPropertyValue('--blank-color').trim()   || '#e2e2e2'
    const contourColor = css.getPropertyValue('--contour-color').trim() || '#a9a9a9'
    if (View.sinumerikView.parseData.blank)   scene.add(createMesh(View.sinumerikView.parseData.blank,   blankColor,    1))
    if (View.sinumerikView.parseData.contour) scene.add(createMesh(View.sinumerikView.parseData.contour, contourColor, -1))

    _addToolMeshes3D(scene, canvas, elementLimit)

    scene.add(new THREE.AxesHelper(10000))

    return camepaStartPoint
}

// Rebuild the 3D scene up to elementLimit elements (counts all types, draws only
// G0/G1/G3/transform). Used by _3DSlowDebug to reveal trajectory incrementally.
export function draw3DScene(elementLimit, sourceElements) {
    if (!View.sinumerikView.singleLineDebug3D) return
    const scene = View.sinumerikView.singleLineDebug3D.scene
    while (scene.children.length > 0) scene.remove(scene.children[0])
    _buildScene3D(scene, elementLimit ?? Infinity, sourceElements)
}

export const select3DView = () => {
    const zoomSpeed = 0.3
    const panSpeed = 0.5
    const rotateSpeed = 0.3

    let newRender = View.sinumerikView.singleLineDebugViewDiv.plane2D3D.innerText === '3D'

    if (View.sinumerikView.singleLineDebugThree === undefined) {
        View.sinumerikView.singleLineDebugThree = new THREE.WebGLRenderer({antialias: true, alpha: true});
        const renderer = View.sinumerikView.singleLineDebugThree
        renderer.domElement.tabIndex = 1
        renderer.domElement.addEventListener('mouseenter', () => {
            renderer.domElement.addEventListener('mouseleave', handleMouseLeave)
            renderer.domElement.focus()
        })
        const handleMouseLeave = () => {
            renderer.domElement.removeEventListener('mouseleave', handleMouseLeave)
        }

        renderer.domElement.addEventListener('keydown', (e) => {
            if (e.key === 'Control') setSpeed(0.1)
        })
        renderer.domElement.addEventListener('keyup', (e) => {
            if (e.key === 'Control') setSpeed(1)
        })
    }
    const renderer = View.sinumerikView.singleLineDebugThree

    renderer.setClearColor(0x000000, 0);
    renderer.domElement.classList.add('sinumerikCanvas')
    if (View.sinumerikView.singleLineDebugViewDiv.plane2D3D.innerText === '3D') {
        const mainWindow = View.sinumerikView.singleLineDebugMainWindow
        // Tear down whichever 2D renderer is currently visible. WebGL keeps
        // the Canvas 2D element detached, so removeChild on it would throw.
        if (is2DRendererActive()) {
            destroy2DRenderer()
        } else if (mainWindow.contains(View.sinumerikView.singleLineDebugCanvas)) {
            mainWindow.removeChild(View.sinumerikView.singleLineDebugCanvas)
        }
        View.sinumerikView.singleLineDebugViewDiv.plane2D3D.innerText = '2D'
        mainWindow.appendChild(renderer.domElement);
        View.sinumerikView.resizePanel(0)
    }

    if (newRender) {
        View.sinumerikView.singleLineDebug3D = {}
        View.sinumerikView.singleLineDebug3D.scene = new THREE.Scene();
        View.sinumerikView.singleLineDebug3D.camera = new THREE.PerspectiveCamera(100, renderer.domElement.width / renderer.domElement.height)
        View.sinumerikView.singleLineDebug3D.render = () => {
            requestAnimationFrame(render);
            renderer.render(scene, camera);
        }
    }
    const scene = View.sinumerikView.singleLineDebug3D.scene
    const camera = View.sinumerikView.singleLineDebug3D.camera
    const render = View.sinumerikView.singleLineDebug3D.render
    if (newRender) {
        camera.position.z = 100
        camera.zoom = 1
        camera.far = 10000
        scene.add(camera)
    }
    render()

    if (!newRender) {
        while (scene.children.length > 0) {
            scene.remove(scene.children[0]);
        }
    }

    const camepaStartPoint = _buildScene3D(scene, Infinity, null)

    if (newRender) {
        View.sinumerikView.singleLineDebugControls = new OrbitControls(camera, renderer.domElement)
        View.sinumerikView.singleLineDebugControls.target.x = 0
        View.sinumerikView.singleLineDebugControls.target.y = 0
        View.sinumerikView.singleLineDebugControls.target.z = 0

        View.sinumerikView.singleLineDebugControls.maxDistance = 50000
    }
    const controls = View.sinumerikView.singleLineDebugControls
    let ctrlK = 1
    const updateSpeed = () => {
        const dist = camera.position.distanceTo(controls.target)
        if (dist < 100) {
            const d = camera.position.clone().sub(controls.target)
            controls.target.sub(d.multiplyScalar(0.5))
        }
        const scale = ctrlK * Math.max(1, 200 / dist)
        controls.zoomSpeed   = zoomSpeed   * scale
        controls.panSpeed    = panSpeed    * scale
        controls.rotateSpeed = rotateSpeed * ctrlK
    }
    const setSpeed = (K) => {
        ctrlK = K ?? 1
        updateSpeed()
    }

    if (newRender) {
        controls.zoomToCursor = true
        controls.addEventListener('change', updateSpeed)
        setSpeed(1)
        camera.position.set(
            camepaStartPoint.X / camepaStartPoint.pointsNum,
            camepaStartPoint.Y / camepaStartPoint.pointsNum,
            camepaStartPoint.Z / camepaStartPoint.pointsNum,
        );
        if (View.sinumerikView.singleLineDebug3DCameraState) {
            const saved = View.sinumerikView.singleLineDebug3DCameraState
            camera.position.copy(saved.position)
            controls.target.copy(saved.target)
            View.sinumerikView.singleLineDebug3DCameraState = null
        }
    }

    controls.update();
}

// Translucent outline of the active tool, its reference point sitting on the
// current end of the trajectory. Same rules as the WebGL 2D path
// (sld_view/renderer2d.js::_buildToolMeshes): only while slow debug is
// actually animating, because the outline shows where the tool is *now* and on
// a finished frame it would sit on the last element forever and hide it.
//
// Here the scene is rebuilt wholesale by `draw3DScene`, so the meshes are
// tracked only to dispose what this module allocated — each section owns its
// material, its colour coming from the file.
const TOOL_OPACITY_3D = 0.4

let toolMeshes3D = []

function _disposeToolMeshes3D() {
    toolMeshes3D.forEach(mesh => {
        mesh.geometry?.dispose()
        mesh.material?.dispose()
    })
    toolMeshes3D = []
}

function _addToolMeshes3D(scene, canvas, elementLimit) {
    _disposeToolMeshes3D()

    const slowDebug = View.sinumerikView.singleLineDebugInfoDiv?.slowDebugCheck?.checked
    if (!slowDebug || !Number.isFinite(elementLimit)) return
    if (elementLimit <= 0 || elementLimit >= canvas.length) return

    // The reference point rides the END of the last drawn element. `msg` /
    // `pause` entries count towards the limit but carry no coordinates, so
    // walk back to the last one that does.
    let tip = null
    for (let i = Math.min(elementLimit, canvas.length) - 1; i >= 0; i--) {
        const el = canvas[i]
        if (el && typeof el.type === 'string' && /^G[01]$/.test(el.type)) { tip = el; break }
    }
    if (!tip || !tip.toolDef || !tip.toolDef.path) return

    const geometry = View.sinumerikView.toolGeometry?.[tip.toolDef.path]
    if (!geometry || !geometry.sections) return

    // Zero in the file IS the reference point, so the shift is the tip's own
    // position. Applied by copying the elements rather than by adding an
    // offset parameter to `createMesh`: that function derives the plane normal
    // from the first three points to place an arbitrarily-oriented profile,
    // and a shifted copy goes through it unchanged.
    const dx = tip.X ?? 0
    const dy = tip.Y ?? 0
    const dz = tip.Z ?? 0

    geometry.sections.forEach(section => {
        const shifted = (section.shapes ?? [])
            .filter(el => el.type && el.type.match(/G[01]/))
            .map(el => ({
                ...el,
                X_start: (el.X_start ?? 0) + dx,
                Y_start: (el.Y_start ?? 0) + dy,
                Z_start: (el.Z_start ?? 0) + dz,
                X: (el.X ?? 0) + dx,
                Y: (el.Y ?? 0) + dy,
                Z: (el.Z ?? 0) + dz,
            }))
        // createMesh needs three points to derive a normal from.
        if (shifted.length < 3) return

        const mesh = createMesh(shifted, section.color, -2, TOOL_OPACITY_3D)
        toolMeshes3D.push(mesh)
        scene.add(mesh)
    })
}

const createMesh = (toolpath, color, polygonOffsetFactor, opacity = 0.3) => {
    const points = []
    toolpath
        .filter(e => e.type.match(/G[01]/))
        .forEach(p => points.push(new THREE.Vector3(p.X_start, p.Y_start, p.Z_start)))

    let tri = new THREE.Triangle(points[0], points[1], points[2])
    let normal = new THREE.Vector3()
    tri.getNormal(normal)

    let baseNormal = new THREE.Vector3(0, 0, 1)
    let quaternion = new THREE.Quaternion().setFromUnitVectors(normal, baseNormal)
    let quaternionBack = new THREE.Quaternion().setFromUnitVectors(baseNormal, normal)

    const tempPoints = []
    points.forEach(p => tempPoints.push(p.clone().applyQuaternion(quaternion)))

    const shape = new THREE.Shape(tempPoints)
    const geometry = new THREE.ShapeGeometry(shape)
    const meshMaterial = new THREE.MeshBasicMaterial({
        color: color,
        opacity: opacity,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: polygonOffsetFactor,
        polygonOffsetUnits: polygonOffsetFactor,
    })
    const mesh = new THREE.Mesh(geometry, meshMaterial)
    mesh.rotation.setFromQuaternion(quaternionBack)
    return mesh
}

const getElType = (el) => {
    if (el.type === 'G0') return 'G0'
    if (el.type === 'transform') return 'transform'
    if (el.toolRadiusCompensation === 'G40') return 'G1'
    if (el.toolRadiusCompensation === 'G41') return 'G41'
    if (el.toolRadiusCompensation === 'G42') return 'G42'
    if (el.toolRadiusCompensation === 'AutoInsert') return 'AutoInsert'
    if (el.toolRadiusCompensation === 'offn_loop') return 'OffnLoop'
    return 'G1'
}

export const select2DView = () => {
    if (View.sinumerikView.singleLineDebug3D?.camera && View.sinumerikView.singleLineDebugControls) {
        View.sinumerikView.singleLineDebug3DCameraState = {
            position: View.sinumerikView.singleLineDebug3D.camera.position.clone(),
            target: View.sinumerikView.singleLineDebugControls.target.clone()
        }
    }
    const mainWindow = View.sinumerikView.singleLineDebugMainWindow
    mainWindow.removeChild(View.sinumerikView.singleLineDebugThree.domElement)
    View.sinumerikView.singleLineDebugViewDiv.plane2D3D.innerText = '3D'
    delete View.sinumerikView.singleLineDebugThree
    // Restore the renderer that was active before the user went 3D.
    if (View.sinumerikView.singleLineDebugData?.useWebGL) {
        init2DRenderer(mainWindow)
        draw2D()
    } else {
        mainWindow.appendChild(View.sinumerikView.singleLineDebugCanvas)
    }
}



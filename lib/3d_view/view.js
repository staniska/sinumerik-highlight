'use babel'

require = require("esm")(module)

import View from "../sinumerik";
import * as THREE from 'three';

const {OrbitControls} = require("three/examples/jsm/controls/OrbitControls.js")

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

    renderer.setClearColor(0xffffff, 1);
    renderer.domElement.style.border = 'dimgray solid 2px'
    if (View.sinumerikView.singleLineDebugViewDiv.plane2D3D.innerText === '3D') {
        View.sinumerikView.singleLineDebugMainWindow.removeChild(View.sinumerikView.singleLineDebugCanvas)
        View.sinumerikView.singleLineDebugMainWindow.removeChild(View.sinumerikView.singleLineDebugParseStringDiv)
        View.sinumerikView.singleLineDebugViewDiv.plane2D3D.innerText = '2D'
        View.sinumerikView.singleLineDebugMainWindow.appendChild(renderer.domElement);
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

    const materials = {
        G1: new THREE.LineBasicMaterial({color: 'green', linewidth: 3}),
        G0: new THREE.LineBasicMaterial({color: 'red', linewidth: 2}),
        G41: new THREE.LineBasicMaterial({color: 'greenyellow', linewidth: 3}),
        G42: new THREE.LineBasicMaterial({color: 'darkseagreen', linewidth: 3}),
        AutoInsert: new THREE.LineBasicMaterial({color: 'goldenrod', linewidth: 3}),
        OffnLoop: new THREE.LineBasicMaterial({color: 'lightcyan', linewidth: 3})
    }

    if (!newRender) {
        while (scene.children.length > 0) {
            scene.remove(scene.children[0]);
        }
    }

    const paths = [[]]
    let pathNum = 0
    View.sinumerikView.parseData.canvas
        .filter(e => e.type.match(/G[013]/))
        .forEach((e, i, a) => {
            paths[pathNum].push(e)
            if (i === a.length - 1 || getElType(e) === getElType(a[i + 1])) {
                return
            }
            pathNum++
            paths.push([])
        })
    const camepaStartPoint = {
        X: 0, Y: 0, Z: 0, pointsNum: 0
    }
    paths.forEach(path => {
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
        const line = new THREE.Line(geometry, materials[getElType(path[0])])
        scene.add(line);
    })

    if (!!View.sinumerikView.parseData.blank) scene.add(createMesh(View.sinumerikView.parseData.blank, '#e2e2e2'))
    if (!!View.sinumerikView.parseData.contour) scene.add(createMesh(View.sinumerikView.parseData.contour, '#a9a9a9', 0.1))

    const axesHelper = new THREE.AxesHelper(10000)
    scene.add(axesHelper)

    if (newRender) {
        View.sinumerikView.singleLineDebugControls = new OrbitControls(camera, renderer.domElement)
        View.sinumerikView.singleLineDebugControls.target.x = 0
        View.sinumerikView.singleLineDebugControls.target.y = 0
        View.sinumerikView.singleLineDebugControls.target.z = 0

        View.sinumerikView.singleLineDebugControls.addEventListener('change', () => {
            const target = View.sinumerikView.singleLineDebugControls.target
            const position = camera.position
            const distance = {
                x: position.x - target.x,
                y: position.y - target.y,
                z: position.z - target.z
            }
            const distanceToTarget = Math.sqrt(distance.x ** 2 + distance.y ** 2 + distance.z ** 2)
            if (distanceToTarget < 100) {
                target.x -= distance.x / 2
                target.y -= distance.y / 2
                target.z -= distance.z / 2
            }
            if (distanceToTarget > 500) {
                target.x += distance.x / 2
                target.y += distance.y / 2
                target.z += distance.z / 2
            }
        })
    }
    const controls = View.sinumerikView.singleLineDebugControls
    const setSpeed = (K) => {
        if (K === undefined) K = 1
        controls.zoomSpeed = zoomSpeed * K
        controls.rotateSpeed = rotateSpeed * K
        controls.panSpeed = panSpeed * K
    }

    if (newRender) {
        // controls = new OrbitControls(camera, renderer.domElement)
        controls.zoomToCursor = true
        setSpeed(1)
        camera.position.set(
            camepaStartPoint.X / camepaStartPoint.pointsNum,
            camepaStartPoint.Y / camepaStartPoint.pointsNum,
            camepaStartPoint.Z / camepaStartPoint.pointsNum,
        );
    }

    controls.update();
}

const createMesh = (toolpath, color, offset) => {
    const points = []
    toolpath
        .filter(e => e.type.match(/G[01]/))
        .forEach(p => points.push(new THREE.Vector3(p.X_start, p.Y_start, p.Z_start)))

    let tri = new THREE.Triangle(
        points[0],
        points[1],
        points[2]
    )
    let normal = new THREE.Vector3();
    tri.getNormal(normal);

    let baseNormal = new THREE.Vector3(0, 0, 1);
    let quaternion = new THREE.Quaternion().setFromUnitVectors(normal, baseNormal)
    let quaternionBack = new THREE.Quaternion().setFromUnitVectors(baseNormal, normal)

    const tempPoints = []
    points.forEach(p => tempPoints.push(p.clone().applyQuaternion(quaternion)))

    let shape = new THREE.Shape(tempPoints)
    const extrudeSettings = {
        depth: 1,
        bevelEnabled: false,
        steps: 1,
    };

    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    const meshMaterial = new THREE.MeshBasicMaterial({color: color, opacity: 0.3, transparent: true})
    const mesh = new THREE.Mesh(geometry, meshMaterial)
    mesh.rotation.setFromQuaternion(quaternionBack)
    if (offset !== undefined) {
        mesh.translateOnAxis(normal.applyQuaternion(quaternionBack), offset)
    }

    return mesh
}

const getElType = (el) => {
    if (el.type === 'G0') return 'G0'
    if (el.toolRadiusCompensation === 'G40') return 'G1'
    if (el.toolRadiusCompensation === 'G41') return 'G41'
    if (el.toolRadiusCompensation === 'G42') return 'G42'
    if (el.toolRadiusCompensation === 'AutoInsert') return 'AutoInsert'
    if (el.toolRadiusCompensation === 'offn_loop') return 'OffnLoop'
    return 'G1'
}

export const select2DView = () => {
    View.sinumerikView.singleLineDebugMainWindow.removeChild(View.sinumerikView.singleLineDebugThree.domElement)
    View.sinumerikView.singleLineDebugViewDiv.plane2D3D.innerText = '3D'
    delete View.sinumerikView.singleLineDebugThree
    View.sinumerikView.singleLineDebugMainWindow.appendChild(View.sinumerikView.singleLineDebugCanvas)
    View.sinumerikView.singleLineDebugMainWindow.appendChild(View.sinumerikView.singleLineDebugParseStringDiv)
}



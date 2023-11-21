'use babel'

require = require("esm")(module)

import View from "../sinumerik";
import * as THREE from 'three';
const {OrbitControls} = require("three/examples/jsm/controls/OrbitControls.js")

export const select3DView = () => {
    View.sinumerikView.singleLineDebugMainWindow.removeChild(View.sinumerikView.singleLineDebugCanvas)
    View.sinumerikView.singleLineDebugMainWindow.removeChild(View.sinumerikView.singleLineDebugParseStringDiv)
    View.sinumerikView.singleLineDebugThree = new THREE.WebGLRenderer({antialias: true, alpha: true});
    View.sinumerikView.singleLineDebugViewDiv.plane2D3D.innerText = '2D'
    const renderer = View.sinumerikView.singleLineDebugThree
    renderer.setClearColor(0xffffff, 1);
    View.sinumerikView.singleLineDebugMainWindow.appendChild(renderer.domElement);
    renderer.domElement.style.border = 'dimgray solid 2px'
    View.sinumerikView.resizePanel()

    let scene = new THREE.Scene();
    let camera = new THREE.PerspectiveCamera(70, renderer.domElement.width / renderer.domElement.height);
    camera.position.z = 50;
    scene.add(camera);
    const render = () => {
        requestAnimationFrame(render);
        renderer.render(scene, camera);
    }
    render()

    const materials = {
        G1: new THREE.LineBasicMaterial({color: 'green', linewidth: 3}),
        G0: new THREE.LineBasicMaterial({color: 'red', linewidth: 3}),
        G41: new THREE.LineBasicMaterial({color: 'greenyellow', linewidth: 3}),
        G42: new THREE.LineBasicMaterial({color: 'darkseagreen', linewidth: 3}),
        AutoInsert: new THREE.LineBasicMaterial({color: 'goldenrod', linewidth: 3}),
        OffnLoop: new THREE.LineBasicMaterial({color: 'lightcyan', linewidth: 3})
    }

    const paths = [[]]
    let pathNum = 0
    View.sinumerikView.parseData.canvas
        .filter(e => e.type.match(/G[01]/))
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

    const controls = new OrbitControls(camera, renderer.domElement)

    camera.position.set(
        camepaStartPoint.X / camepaStartPoint.pointsNum,
        camepaStartPoint.Y / camepaStartPoint.pointsNum,
        camepaStartPoint.Z / camepaStartPoint.pointsNum,
    );
    controls.update();
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




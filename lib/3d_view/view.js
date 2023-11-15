'use babel'

require = require("esm")(module)

import View from "../sinumerik";
import * as THREE from 'three';
const {OrbitControls} = require("three/examples/jsm/controls/OrbitControls.js")

export const select3DView = () => {
    View.sinumerikView.singleLineDebugMainWindow.removeChild(View.sinumerikView.singleLineDebugCanvas)
    View.sinumerikView.singleLineDebugMainWindow.removeChild(View.sinumerikView.singleLineDebugParseStringDiv)
    View.sinumerikView.singleLineDebugThree = new THREE.WebGLRenderer({ antialias: true, alpha: true });
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
    let boxGeometry = new THREE.BoxGeometry(10, 10, 10);
    let basicMaterial = new THREE.MeshBasicMaterial({ color: 0x0095dd });
    let cube = new THREE.Mesh(boxGeometry, basicMaterial);
    scene.add(cube)
    cube.rotation.set(0.4, 0.2, 0)
    const controls = new OrbitControls(camera, renderer.domElement)
    camera.position.set( 0, 20, 100 );
    controls.update();
}

export const select2DView = () => {
    View.sinumerikView.singleLineDebugMainWindow.removeChild(View.sinumerikView.singleLineDebugThree.domElement)
    View.sinumerikView.singleLineDebugViewDiv.plane2D3D.innerText = '3D'
    delete View.sinumerikView.singleLineDebugThree
    View.sinumerikView.singleLineDebugMainWindow.appendChild(View.sinumerikView.singleLineDebugCanvas)
    View.sinumerikView.singleLineDebugMainWindow.appendChild(View.sinumerikView.singleLineDebugParseStringDiv)
}




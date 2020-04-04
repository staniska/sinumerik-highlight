'use babel';

import View from "./sinumerik";

export function singleLineDeburRouter (event) {
    console.log('SLD ' + event);
    if (event == 'generateControls'){
        generateSLDComponents();
    }
    if (event == 'scaleMinusButtonClick' ||
        event == 'scalePlusButtonClick') {
        changeCanvas(event);
    }

    if (event.match('move.*ButtonClick')) {
        changeCanvas(event);
    }

}

function generateSLDComponents() {
    let sinumerikEventHandler = View.sinumerikView.eventRouter.route.bind(this);

    View.sinumerikView.singleLineDebugCanvas = document.createElement('canvas');
    View.sinumerikView.singleLineDebugCanvas.className = 'sinumerikCanvas';
    View.sinumerikView.singleLineDebugMainWindow.appendChild(View.sinumerikView.singleLineDebugCanvas);

    View.sinumerikView.singleLineDebugCanvasTransformDiv = document.createElement('div');
    View.sinumerikView.singleLineDebugFootContainer.appendChild(View.sinumerikView.singleLineDebugCanvasTransformDiv);




    //region scale buttons
    View.sinumerikView.singleLineDebugScaleButtonsDiv = document.createElement('div');
    View.sinumerikView.singleLineDebugScaleButtonsDiv.className = 'sinumerikDiv';

    View.sinumerikView.singleLineDebugScaleButtonsDiv.plusButton = document.createElement('button');
    View.sinumerikView.singleLineDebugScaleButtonsDiv.plusButton.className = 'sinumerikButton icon-plus';
    View.sinumerikView.singleLineDebugScaleButtonsDiv.plusButton.addEventListener('click', function () {
        sinumerikEventHandler('{"emitter": "singleLine", "event": "scalePlusButtonClick"}');
    });
    View.sinumerikView.singleLineDebugScaleButtonsDiv.appendChild(View.sinumerikView.singleLineDebugScaleButtonsDiv.plusButton);

    View.sinumerikView.singleLineDebugScaleButtonsDiv.minusButton = document.createElement('button');
    View.sinumerikView.singleLineDebugScaleButtonsDiv.minusButton.className = 'sinumerikButton icon-dash';
    View.sinumerikView.singleLineDebugScaleButtonsDiv.minusButton.addEventListener('click', function () {
        sinumerikEventHandler('{"emitter": "singleLine", "event": "scaleMinusButtonClick"}');
    });
    View.sinumerikView.singleLineDebugScaleButtonsDiv.appendChild(View.sinumerikView.singleLineDebugScaleButtonsDiv.minusButton);
    View.sinumerikView.singleLineDebugFootContainer.appendChild(View.sinumerikView.singleLineDebugScaleButtonsDiv);
    //endregion


    View.sinumerikView.singleLineDebugTransButtonsDiv = document.createElement('div');
    View.sinumerikView.singleLineDebugTransButtonsDiv.className = 'sinumerikDiv';

    View.sinumerikView.singleLineDebugTransButtonsDiv.moveLeftButton = document.createElement('button');
    View.sinumerikView.singleLineDebugTransButtonsDiv.moveLeftButton.className = 'sinumerikButton icon-chevron-left';
    View.sinumerikView.singleLineDebugTransButtonsDiv.moveLeftButton.addEventListener('click', function () {
        sinumerikEventHandler('{"emitter": "singleLine", "event": "moveLeftButtonClick"}');
    });
    View.sinumerikView.singleLineDebugTransButtonsDiv.appendChild(View.sinumerikView.singleLineDebugTransButtonsDiv.moveLeftButton);

    View.sinumerikView.singleLineDebugTransButtonsDiv.moveRightButton = document.createElement('button');
    View.sinumerikView.singleLineDebugTransButtonsDiv.moveRightButton.className = 'sinumerikButton icon-chevron-right';
    View.sinumerikView.singleLineDebugTransButtonsDiv.moveRightButton.addEventListener('click', function () {
        sinumerikEventHandler('{"emitter": "singleLine", "event": "moveRightButtonClick"}');
    });
    View.sinumerikView.singleLineDebugTransButtonsDiv.appendChild(View.sinumerikView.singleLineDebugTransButtonsDiv.moveRightButton);

    View.sinumerikView.singleLineDebugTransButtonsDiv.moveUpButton = document.createElement('button');
    View.sinumerikView.singleLineDebugTransButtonsDiv.moveUpButton.className = 'sinumerikButton icon-chevron-up';
    View.sinumerikView.singleLineDebugTransButtonsDiv.moveUpButton.addEventListener('click', function () {
        sinumerikEventHandler('{"emitter": "singleLine", "event": "moveUpButtonClick"}');
    });
    View.sinumerikView.singleLineDebugTransButtonsDiv.appendChild(View.sinumerikView.singleLineDebugTransButtonsDiv.moveUpButton);

    View.sinumerikView.singleLineDebugTransButtonsDiv.moveDownButton = document.createElement('button');
    View.sinumerikView.singleLineDebugTransButtonsDiv.moveDownButton.className = 'sinumerikButton icon-chevron-down';
    View.sinumerikView.singleLineDebugTransButtonsDiv.moveDownButton.addEventListener('click', function () {
        sinumerikEventHandler('{"emitter": "singleLine", "event": "moveDownButtonClick"}');
    });
    View.sinumerikView.singleLineDebugTransButtonsDiv.appendChild(View.sinumerikView.singleLineDebugTransButtonsDiv.moveDownButton);

    View.sinumerikView.singleLineDebugFootContainer.appendChild(View.sinumerikView.singleLineDebugTransButtonsDiv);

    //region first resize
    const editorWidth = atom.workspace.panelContainers.top.element.offsetWidth;
    const editorHeight = atom.workspace.paneContainers.right.element.clientHeight;
    const widthFactor = 0.6;
    const mainHeightFactor = 0.8;
    //View.sinumerikView.main.style.width = Math.round((editorWidth * widthFactor)/(1 - widthFactor));
    View.sinumerikView.singleLineDebugCanvas.width = Math.round((editorWidth * widthFactor)/(1 - widthFactor))-5;
    View.sinumerikView.singleLineDebugCanvas.height = Math.round((editorHeight-40)*mainHeightFactor)-5;
    //endregion

}

export function resizeSLDComponents() {
    console.log('resizeSLDComponents');
    const editorWidth = atom.workspace.panelContainers.top.element.offsetWidth;
    const editorHeight = atom.workspace.paneContainers.right.element.clientHeight;


    console.log(editorHeight);
    console.log(editorWidth);

    const widthFactor = 0.6;
    const mainHeightFactor = 0.8;
    View.sinumerikView.singleLineDebugCanvas.width = Math.round(editorWidth * widthFactor) - 5;
    View.sinumerikView.singleLineDebugCanvas.height = Math.round((editorHeight-40)*mainHeightFactor)-5;
    console.log('canvas height ' + View.sinumerikView.singleLineDebugCanvas.height);
    console.log('canvas width ' + View.sinumerikView.singleLineDebugCanvas.width);

}

function changeCanvas(event) {
    //console.log('canvasEvent ' + event);

    var ctx = View.sinumerikView.singleLineDebugCanvas.getContext("2d");

    var transform = ctx.getTransform();
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0, 0, View.sinumerikView.singleLineDebugCanvas.width, View.sinumerikView.singleLineDebugCanvas.height);

    var scaleFactor = 1.1;

    if (event == 'scaleMinusButtonClick') {
        scaleFactor = 1 / scaleFactor;
    }
    if (event == 'scaleMinusButtonClick' ||
        event == 'scalePlusButtonClick') {
        transform.d *= scaleFactor;
        transform.a *= scaleFactor;
    }
    var scale = transform.a;

    if (event == 'moveLeftButtonClick') {
        transform.e = transform.e - 30 * scale;
    }
    if (event == 'moveRightButtonClick') {
        transform.e = transform.e + 30 * scale;
    }
    if (event == 'moveUpButtonClick') {
        transform.f = transform.f - 30 * scale;
    }
    if (event == 'moveDownButtonClick') {
        transform.f = transform.f + 30 * scale;
    }




    ctx.setTransform(transform.a, transform.b, transform.c, transform.d, transform.e, transform.f);


    jopa(ctx,scale);




    View.sinumerikView.singleLineDebugCanvasTransformDiv.innerText = `Scale X = ${transform.a}  Y = ${transform.d}   Trans X = ${transform.e} Y=${transform.f}`;
}



function jopa(ctx,scale) {
//    var ctx = View.sinumerikView.singleLineDebugCanvas.getContext("2d");


    ctx.beginPath();
    ctx.moveTo(0, 300);
    ctx.lineTo(40,250);
    ctx.lineTo(300,200);
    ctx.lineTo(300,500);
    ctx.lineTo(1000,800);
    ctx.lineWidth = 1/scale;
    ctx.strokeStyle = "green";
    ctx.stroke();

}



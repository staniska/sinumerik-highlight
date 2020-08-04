'use babel';

import View from "./sinumerik";
import {changeActiveTab} from "./changeTabs";
import {loadDataFromComment} from "./inner-comment";
import {progParser, drawChanges} from "./interpretator";


export function singleLineDebug (event) {
//    console.log('SLD ' + event);

    if (event == 'singleLineDebugButtonClick') {
        changeActiveTab('singleLine');
        View.sinumerikView.counturEditButton.className = 'sinumerikPanelHeadButton';
        View.sinumerikView.singleLineDebugButton.className = 'sinumerikPanelHeadButtonSelect';
        View.sinumerikView.machineManagerButton.className = 'sinumerikPanelHeadButton';
        if (!View.sinumerikView.singleLineDebugCanvas) {
            generateSLDComponents();
        }
    }
    if (event == 'changeEditor') {
        checkChanges(event);
    }

    if (event == 'drawChanges') {
        drawChanges(1);
    }

    if (View.sinumerikView.singleLineDebugData &&
        event == 'singleLineDebugButtonClick') {
        checkChanges(event);
    }

    if (event == 'scaleMinusButtonClick' ||
        event == 'scalePlusButtonClick' ||
        event.match('move.*ButtonClick')) {
        canvasRange(event);
    }

    if (event.match(/[XYZ]+PlaneButtonClick/)) {
        changePlane(event);
    }

    if (event == 'stringParseDetailsButtonClick') {
        View.sinumerikView.singleLineDebugMainWindow.removeChild(View.sinumerikView.singleLineDebugCanvas);
        View.sinumerikView.singleLineDebugMainWindow.appendChild(View.sinumerikView.singleLineDebugStringParseDetailsDiv);
        View.sinumerikView.singleLineDebugMainWindow.appendChild(View.sinumerikView.singleLineDebugParseStringDiv);
        View.sinumerikView.singleLineDebugParseStringDiv.removeChild(View.sinumerikView.singleLineDebugParseStringButton);
        View.sinumerikView.singleLineDebugParseStringDiv.appendChild(View.sinumerikView.closeDetailsButton);

    }
    if (event == 'stringParseDetailsCloseButtonClick') {
        View.sinumerikView.singleLineDebugMainWindow.removeChild(View.sinumerikView.singleLineDebugStringParseDetailsDiv);
        View.sinumerikView.singleLineDebugMainWindow.appendChild(View.sinumerikView.singleLineDebugCanvas);
        View.sinumerikView.singleLineDebugMainWindow.appendChild(View.sinumerikView.singleLineDebugParseStringDiv);
        View.sinumerikView.singleLineDebugParseStringDiv.appendChild(View.sinumerikView.singleLineDebugParseStringButton);
        View.sinumerikView.singleLineDebugParseStringDiv.removeChild(View.sinumerikView.closeDetailsButton);
    }

    if (event == 'changeCanvasPrimitives') {
        // console.log('changeCanvasPrimitives');
        changeCanvas();
    }



}

function checkChanges(event) {

    const Editor = atom.workspace.getActiveTextEditor();
    var filename = Editor.getTitle().replace(/\./g,'_').toUpperCase();

    if (!View.sinumerikView.singleLineDebugData ||
        View.sinumerikView.singleLineDebugData.filename != filename ||
        !View.sinumerikView.singleLineDebugData.filename) {

        generateSLDData();
        event = '';
    }

    if (filename.split('_')[filename.split('_').length - 1].match(/MPF|SPF/) &&
        (event == 'changeEditor' ||
         event == 'singleLineDebugButtonClick')) {
        if (!View.sinumerikView.programmData[filename].machine ||
            !View.sinumerikView.singleLineDebugData.machine ||
            View.sinumerikView.programmData[filename].machine.machineName != View.sinumerikView.singleLineDebugData.machine.machineName) {

            generateSLDData();

        }
    }

    if (View.sinumerikView.singleLineDebugErrorDiv.textContent == '') {
        if (View.sinumerikView.singleLineDebugData.machine.machineType == 'Lathe') {
            changePlane('XZPlaneButtonClick');
        } else {
            changePlane('XYPlaneButtonClick');
        }
    }
}

function generateSLDData() {
    // console.log("generate SLD data");
    // console.log(View.sinumerikView.programmData);
    const Editor = atom.workspace.getActiveTextEditor();
    var filename = Editor.getTitle().replace(/\./g, '_').toUpperCase();
    View.sinumerikView.singleLineDebugData.machine = {};

    View.sinumerikView.singleLineDebugInfoDiv.machineNameDiv.innerText = 'Machine: ';

    if (JSON.stringify(View.sinumerikView.singleLineDebugData) < 3) {
        loadDataFromComment();
    }
    //Reset canvas Range;
    View.sinumerikView.singleLineDebugData.canvasRange = {};

    if (!filename.split('_')[filename.split('_').length - 1].match(/MPF|SPF/)) {
        errorDiv('File extension must be MPF or SPF');
        return;
    }

    if (View.sinumerikView.programmData && View.sinumerikView.programmData[filename] && View.sinumerikView.programmData[filename].machine) {
        View.sinumerikView.singleLineDebugData.machine = JSON.parse(JSON.stringify(View.sinumerikView.programmData[filename].machine));
    } else {
        console.log('filename: ' + filename);
        errorDiv('There are not active machine');
        return;
    }

    if (View.sinumerikView.singleLineDebugActivateMachineDiv && View.sinumerikView.singleLineDebugActivateMachineDiv.parentElement) {
        View.sinumerikView.singleLineDebugFootContainer.removeChild(View.sinumerikView.singleLineDebugActivateMachineDiv);
    }
    View.sinumerikView.singleLineDebugData.filename = filename;

    errorDiv('');

    View.sinumerikView.singleLineDebugInfoDiv.machineNameDiv.innerText = 'Machine: ' + View.sinumerikView.singleLineDebugData.machine.machineName;
}

function errorDiv(text){
    let sinumerikEventHandler = View.sinumerikView.eventRouter.route.bind(this);

    if (!View.sinumerikView.singleLineDebugErrorDiv) {
        View.sinumerikView.singleLineDebugErrorDiv = document.createElement('div');
        View.sinumerikView.singleLineDebugErrorDiv.className = 'sinumerikDiv';
        View.sinumerikView.singleLineDebugErrorDiv.style.color = 'firebrick';
        View.sinumerikView.singleLineDebugErrorDiv.style.fontWeight = 'bold';
    }
    if (text == '') {
        View.sinumerikView.singleLineDebugErrorDiv.innerText = text;
        if (View.sinumerikView.singleLineDebugErrorDiv.parentElement) {
            View.sinumerikView.singleLineDebugFootContainer.removeChild(View.sinumerikView.singleLineDebugErrorDiv);
        }
        View.sinumerikView.singleLineDebugFootContainer.appendChild(View.sinumerikView.singleLineDebugLeftFootDiv);
        View.sinumerikView.singleLineDebugFootContainer.appendChild(View.sinumerikView.singleLineDebugMiddleFootDiv);
        View.sinumerikView.singleLineDebugFootContainer.appendChild(View.sinumerikView.singleLineDebugRightFootDiv);
    } else {
        View.sinumerikView.singleLineDebugErrorDiv.innerText = text;
        if (text == 'There are not active machine') {
            View.sinumerikView.singleLineDebugErrorDiv.innerText = 'There are not active machine for this file. Please select and activate it in Machine Manager';
            const Editor = atom.workspace.getActiveTextEditor();
            var filename = Editor.getTitle();
            if (View.sinumerikView.main.offsetHeight) {
                if (confirm(`There are not active machine for this file(${filename}). Woud you like to select it in Machine manager?`)) {
                    sinumerikEventHandler('{"emitter": "machineManager", "event": "machineManagerButtonClick"}');
                }
            }
        }
        View.sinumerikView.singleLineDebugFootContainer.appendChild(View.sinumerikView.singleLineDebugErrorDiv);

        if (View.sinumerikView.singleLineDebugLeftFootDiv.parentElement) {
            View.sinumerikView.singleLineDebugFootContainer.removeChild(View.sinumerikView.singleLineDebugLeftFootDiv);
            View.sinumerikView.singleLineDebugFootContainer.removeChild(View.sinumerikView.singleLineDebugMiddleFootDiv);
            View.sinumerikView.singleLineDebugFootContainer.removeChild(View.sinumerikView.singleLineDebugRightFootDiv);
        }
    }
}

function changePlane(event) {
    View.sinumerikView.singleLineDebugViewDiv.XYPlaneButton.className = 'sinumerikButton';
    View.sinumerikView.singleLineDebugViewDiv.XZPlaneButton.className = 'sinumerikButton';
    View.sinumerikView.singleLineDebugViewDiv.YZPlaneButton.className = 'sinumerikButton';

    View.sinumerikView.singleLineDebugViewDiv[event.split('Click')[0]].className = 'sinumerikButtonSelected';
    View.sinumerikView.singleLineDebugData.CanvasAxes = {};


    if (event.match(/[XYZ]+PlaneButtonClick/)) {
        View.sinumerikView.singleLineDebugData.plane = event.substring(0,2);
    }
    progParser();
    axesByPlane();
    canvasRange();
}

function generateSLDComponents() {
    let sinumerikEventHandler = View.sinumerikView.eventRouter.route.bind(this);

    View.sinumerikView.singleLineDebugCanvas = document.createElement('canvas');
    View.sinumerikView.singleLineDebugCanvas.className = 'sinumerikCanvas';
    View.sinumerikView.singleLineDebugCanvas.tabIndex = 1;
    View.sinumerikView.singleLineDebugCanvas.title = 'Click on graphic field to activate keyboard events';
    View.sinumerikView.singleLineDebugCanvas.addEventListener('keydown', function(event) {
        if (View.sinumerikView.singleLineDebugMiddleFootDiv.parentElement) {
           // console.log(event);

            if (event.code == 'Equal') {
                sinumerikEventHandler('{"emitter": "singleLine", "event": "scalePlusButtonClick"}');
            }
            if (event.code == 'Minus') {
                sinumerikEventHandler('{"emitter": "singleLine", "event": "scaleMinusButtonClick"}');
            }

            if (event.key == 'ArrowUp') {
                sinumerikEventHandler('{"emitter": "singleLine", "event": "moveUpButtonClick"}');
            }
            if (event.key == 'ArrowDown') {
                sinumerikEventHandler('{"emitter": "singleLine", "event": "moveDownButtonClick"}');
            }
            if (event.key == 'ArrowLeft') {
                sinumerikEventHandler('{"emitter": "singleLine", "event": "moveLeftButtonClick"}');
            }
            if (event.key == 'ArrowRight') {
                sinumerikEventHandler('{"emitter": "singleLine", "event": "moveRightButtonClick"}');
            }
        }
    });



    View.sinumerikView.singleLineDebugMainWindow.appendChild(View.sinumerikView.singleLineDebugCanvas);

    View.sinumerikView.singleLineDebugData = {};
    View.sinumerikView.singleLineDebugData.canvasRange = {};
    View.sinumerikView.singleLineDebugData.canvasTransform = {};


    //Three div's for data, controls & axes canvas;
    View.sinumerikView.singleLineDebugLeftFootDiv = document.createElement('div');
    View.sinumerikView.singleLineDebugLeftFootDiv.className = 'sinumerikDiv sinumerikBorderDiv';
    View.sinumerikView.singleLineDebugLeftFootDiv.style.float = 'left';
    View.sinumerikView.singleLineDebugMiddleFootDiv = document.createElement('div');
    View.sinumerikView.singleLineDebugMiddleFootDiv.className = 'sinumerikDiv sinumerikBorderDiv';
    View.sinumerikView.singleLineDebugMiddleFootDiv.style.float = 'left';
    View.sinumerikView.singleLineDebugRightFootDiv = document.createElement('div');
    View.sinumerikView.singleLineDebugRightFootDiv.className = 'sinumerikDiv sinumerikBorderDiv';
    View.sinumerikView.singleLineDebugRightFootDiv.style.float = 'left';

    View.sinumerikView.singleLineDebugFootContainer.appendChild(View.sinumerikView.singleLineDebugLeftFootDiv);
    View.sinumerikView.singleLineDebugFootContainer.appendChild(View.sinumerikView.singleLineDebugMiddleFootDiv);
    View.sinumerikView.singleLineDebugFootContainer.appendChild(View.sinumerikView.singleLineDebugRightFootDiv);

    View.sinumerikView.singleLineDebugParseStringDiv = document.createElement('div');
    View.sinumerikView.singleLineDebugParseStringDiv.className = 'sinumerikDiv';
    View.sinumerikView.singleLineDebugParseStringDiv.style.margin = '0px';
    View.sinumerikView.singleLineDebugParseStringDiv.style.backgroundColor = 'white';
    View.sinumerikView.singleLineDebugParseStringDiv.style.display = 'flow-root';
    View.sinumerikView.singleLineDebugParseStringDiv.stringDiv = document.createElement('div');
    View.sinumerikView.singleLineDebugParseStringDiv.stringDiv.style.float = 'left';
    View.sinumerikView.singleLineDebugParseStringDiv.stringDiv.style.lineHeight = '35px';
    View.sinumerikView.singleLineDebugParseStringDiv.stringDiv.style.verticalAlign = 'middle';
    View.sinumerikView.singleLineDebugParseStringDiv.appendChild(View.sinumerikView.singleLineDebugParseStringDiv.stringDiv);

    View.sinumerikView.singleLineDebugParseStringButton = document.createElement('button');
    View.sinumerikView.singleLineDebugParseStringButton.className = 'sinumerikButton icon-info';
    View.sinumerikView.singleLineDebugParseStringButton.style.float = 'right';
    View.sinumerikView.singleLineDebugParseStringButton.innerText = 'Details';
    View.sinumerikView.singleLineDebugParseStringButton.addEventListener('click', function () {
        sinumerikEventHandler('{"emitter": "singleLine", "event": "stringParseDetailsButtonClick"}');
    });
    View.sinumerikView.singleLineDebugParseStringDiv.appendChild(View.sinumerikView.singleLineDebugParseStringButton);

    View.sinumerikView.closeDetailsButton = document.createElement('button');
    View.sinumerikView.closeDetailsButton.className = 'sinumerikButton icon-x';
    View.sinumerikView.closeDetailsButton.innerText = 'close Details';
    View.sinumerikView.closeDetailsButton.style.float = 'right';
    View.sinumerikView.closeDetailsButton.addEventListener('click', function () {
        sinumerikEventHandler('{"emitter": "singleLine", "event": "stringParseDetailsCloseButtonClick"}');
    });

    View.sinumerikView.singleLineDebugMainWindow.appendChild(View.sinumerikView.singleLineDebugParseStringDiv);

    View.sinumerikView.singleLineDebugStringParseDetailsDiv = document.createElement('div');
    View.sinumerikView.singleLineDebugStringParseDetailsDiv.style.backgroundColor = 'GhostWhite';
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
    View.sinumerikView.singleLineDebugRightFootDiv.appendChild(View.sinumerikView.singleLineDebugScaleButtonsDiv);
    //endregion

    View.sinumerikView.singleLineDebugInfoDiv = document.createElement('div');
    View.sinumerikView.singleLineDebugInfoDiv.machineNameDiv = document.createElement('div');
    View.sinumerikView.singleLineDebugInfoDiv.machineNameDiv.className = 'sinumerikDiv';
    View.sinumerikView.singleLineDebugInfoDiv.appendChild(View.sinumerikView.singleLineDebugInfoDiv.machineNameDiv);
    View.sinumerikView.singleLineDebugMiddleFootDiv.appendChild(View.sinumerikView.singleLineDebugInfoDiv);

    View.sinumerikView.singleLineDebugInfoDiv.realTimeDebugCheckDiv = document.createElement('div');
    View.sinumerikView.singleLineDebugInfoDiv.realTimeDebugCheckDiv.innerText = 'Real-time\nDebug';
    View.sinumerikView.singleLineDebugInfoDiv.realTimeDebugCheckDiv.style.float = 'left';
    View.sinumerikView.singleLineDebugInfoDiv.realTimeDebugCheck = document.createElement('input');
    View.sinumerikView.singleLineDebugInfoDiv.realTimeDebugCheck.type = 'checkbox';
    View.sinumerikView.singleLineDebugInfoDiv.realTimeDebugCheck.style.height = '25px';
    View.sinumerikView.singleLineDebugInfoDiv.realTimeDebugCheck.style.width = '25px';
    View.sinumerikView.singleLineDebugInfoDiv.realTimeDebugCheck.style.float = 'left';

    View.sinumerikView.singleLineDebugInfoDiv.appendChild(View.sinumerikView.singleLineDebugInfoDiv.realTimeDebugCheck);
    View.sinumerikView.singleLineDebugInfoDiv.appendChild(View.sinumerikView.singleLineDebugInfoDiv.realTimeDebugCheckDiv);


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

    View.sinumerikView.singleLineDebugRightFootDiv.appendChild(View.sinumerikView.singleLineDebugTransButtonsDiv);


    View.sinumerikView.singleLineDebugViewDiv = document.createElement('div');
    View.sinumerikView.singleLineDebugViewDiv.className = 'sinumerikDiv';
    View.sinumerikView.singleLineDebugViewDiv.XZPlaneButton = document.createElement('button');
    View.sinumerikView.singleLineDebugViewDiv.XZPlaneButton.className = 'sinumerikButton';
    View.sinumerikView.singleLineDebugViewDiv.XZPlaneButton.innerText = 'XZ plane';
    View.sinumerikView.singleLineDebugViewDiv.XZPlaneButton.addEventListener('click', function() {
        sinumerikEventHandler('{"emitter": "singleLine", "event": "XZPlaneButtonClick"}');
    });
    View.sinumerikView.singleLineDebugViewDiv.appendChild(View.sinumerikView.singleLineDebugViewDiv.XZPlaneButton);

    View.sinumerikView.singleLineDebugViewDiv.XYPlaneButton = document.createElement('button');
    View.sinumerikView.singleLineDebugViewDiv.XYPlaneButton.className = 'sinumerikButton';
    View.sinumerikView.singleLineDebugViewDiv.XYPlaneButton.innerText = 'XY plane';
    View.sinumerikView.singleLineDebugViewDiv.XYPlaneButton.addEventListener('click', function() {
        sinumerikEventHandler('{"emitter": "singleLine", "event": "XYPlaneButtonClick"}');
    });
    View.sinumerikView.singleLineDebugViewDiv.XYPlaneButton.disabled = false;
    View.sinumerikView.singleLineDebugViewDiv.appendChild(View.sinumerikView.singleLineDebugViewDiv.XYPlaneButton);

    View.sinumerikView.singleLineDebugViewDiv.YZPlaneButton = document.createElement('button');
    View.sinumerikView.singleLineDebugViewDiv.YZPlaneButton.className = 'sinumerikButton';
    View.sinumerikView.singleLineDebugViewDiv.YZPlaneButton.innerText = 'YZ plane';
    View.sinumerikView.singleLineDebugViewDiv.YZPlaneButton.addEventListener('click', function() {
        sinumerikEventHandler('{"emitter": "singleLine", "event": "YZPlaneButtonClick"}');
    });
    View.sinumerikView.singleLineDebugViewDiv.YZPlaneButton.disabled = false;
    View.sinumerikView.singleLineDebugViewDiv.appendChild(View.sinumerikView.singleLineDebugViewDiv.YZPlaneButton);

    View.sinumerikView.singleLineDebugRightFootDiv.appendChild(View.sinumerikView.singleLineDebugViewDiv);


    //region first resize
    const editorWidth = atom.workspace.panelContainers.top.element.offsetWidth;
    const editorHeight = atom.workspace.paneContainers.right.element.clientHeight;
    const widthFactor = 0.6;
    const mainHeightFactor = 0.8;
    //View.sinumerikView.main.style.width = Math.round((editorWidth * widthFactor)/(1 - widthFactor));
    View.sinumerikView.singleLineDebugCanvas.width = Math.round((editorWidth * widthFactor)/(1 - widthFactor))-5;
    View.sinumerikView.singleLineDebugCanvas.height = Math.round((editorHeight-40)*mainHeightFactor)-45;
    //endregion
    View.sinumerikView.singleLineDebugParseStringDiv.style.width = View.sinumerikView.singleLineDebugCanvas.width;
    View.sinumerikView.singleLineDebugStringParseDetailsDiv.style.width = `${Math.round((editorWidth * widthFactor)/(1 - widthFactor))-5}px`;
    View.sinumerikView.singleLineDebugStringParseDetailsDiv.style.height = `${Math.round((editorHeight-40)*mainHeightFactor)-45}px`;

}

export function resizeSLDComponents() {
//    console.log('resizeSLDComponents');
    const editorWidth = atom.workspace.panelContainers.top.element.offsetWidth;
    const editorHeight = atom.workspace.paneContainers.right.element.clientHeight;

    const widthFactor = 0.6;
    const mainHeightFactor = 0.8;
    View.sinumerikView.singleLineDebugCanvas.width = Math.round(editorWidth * widthFactor) - 5;
    View.sinumerikView.singleLineDebugCanvas.height = Math.round((editorHeight-40)*mainHeightFactor)-45;
    // console.log('canvas height ' + View.sinumerikView.singleLineDebugCanvas.height);
    // console.log('canvas width ' + View.sinumerikView.singleLineDebugCanvas.width);
    View.sinumerikView.singleLineDebugParseStringDiv.style.width = View.sinumerikView.singleLineDebugCanvas.width;
    View.sinumerikView.singleLineDebugStringParseDetailsDiv.style.width = `${Math.round(editorWidth * widthFactor) - 5}px`;
    View.sinumerikView.singleLineDebugStringParseDetailsDiv.style.height = `${Math.round((editorHeight-40)*mainHeightFactor)-45}px`;


}

function axesByPlane () {

    const Editor = atom.workspace.getActiveTextEditor();
    var filename = Editor.getTitle().replace(/\./g,'_').toUpperCase();

    if (!View.sinumerikView.singleLineDebugData.CanvasAxes.axes) {
        View.sinumerikView.singleLineDebugData.CanvasAxes.axes = [];
    }
    delete View.sinumerikView.singleLineDebugData.CanvasAxes.reverseAxes;
    if (View.sinumerikView.singleLineDebugData.plane == 'XZ') {
        View.sinumerikView.singleLineDebugData.CanvasAxes.axes[0] = 'Z';
        View.sinumerikView.singleLineDebugData.CanvasAxes.axes[1] = 'X';
        if (View.sinumerikView.singleLineDebugData.machine.machineType == 'Lathe') {
            if (View.sinumerikView.singleLineDebugData.machine.subType == 'Horizontal') {
                if (View.sinumerikView.singleLineDebugData.machine.firstCarriage.position == 'Front') {
                    View.sinumerikView.singleLineDebugData.CanvasAxes.reverseAxes = '1';
                }
            }
            if (View.sinumerikView.singleLineDebugData.machine.subType == 'Vertical') {
                View.sinumerikView.singleLineDebugData.CanvasAxes.axes[0] = 'X';
                View.sinumerikView.singleLineDebugData.CanvasAxes.axes[1] = 'Z';
                if (View.sinumerikView.singleLineDebugData.machine.firstCarriage.position == 'Rear') {
                    View.sinumerikView.singleLineDebugData.CanvasAxes.reverseAxes = '0';
                }
            }
        }
    }
    if (View.sinumerikView.singleLineDebugData.plane == 'XY') {
        View.sinumerikView.singleLineDebugData.CanvasAxes.axes[0] = 'X';
        View.sinumerikView.singleLineDebugData.CanvasAxes.axes[1] = 'Y';
    }
    if (View.sinumerikView.singleLineDebugData.plane == 'YZ') {
        View.sinumerikView.singleLineDebugData.CanvasAxes.axes[0] = 'Z';
        View.sinumerikView.singleLineDebugData.CanvasAxes.axes[1] = 'Y';
        View.sinumerikView.singleLineDebugData.CanvasAxes.reverseAxes = '0';
    }
}

function canvasRange (event) {

    //console.log('Range event' + event);

    if (event == '' || event == undefined) {
        View.sinumerikView.singleLineDebugData.canvasCentrPoint = [0, 0];
        View.sinumerikView.singleLineDebugData.canvasRange = View.sinumerikView.singleLineDebugCanvas.width;
        View.sinumerikView.singleLineDebugData.canvasHeightFactor = View.sinumerikView.singleLineDebugCanvas.height / View.sinumerikView.singleLineDebugCanvas.width;
    }

    var scaleMoveFaсtor = Number((View.sinumerikView.singleLineDebugData.canvasRange / 20).toPrecision(1));

    //console.log('factor ' + scaleMoveFaсtor);


    if (event == 'scaleMinusButtonClick') {
        View.sinumerikView.singleLineDebugData.canvasRange += scaleMoveFaсtor;
    }

    if (event == 'scalePlusButtonClick') {
        View.sinumerikView.singleLineDebugData.canvasRange -= scaleMoveFaсtor;
    }

    if (event == ('moveLeftButtonClick')) {
        View.sinumerikView.singleLineDebugData.canvasCentrPoint[0] -= scaleMoveFaсtor;
    }

    if (event == ('moveRightButtonClick')) {
        View.sinumerikView.singleLineDebugData.canvasCentrPoint[0] += scaleMoveFaсtor;
    }

    if (event == ('moveDownButtonClick')) {
        View.sinumerikView.singleLineDebugData.canvasCentrPoint[1] += scaleMoveFaсtor;
    }

    if (event == ('moveUpButtonClick')) {
        View.sinumerikView.singleLineDebugData.canvasCentrPoint[1] -= scaleMoveFaсtor;
    }

    // console.log('Range:' + View.sinumerikView.singleLineDebugData.canvasRange);
    // console.log('Center:' + View.sinumerikView.singleLineDebugData.canvasCentrPoint);

    transformByRange();
    changeCanvas();
}

function transformByRange() {
    View.sinumerikView.singleLineDebugData.canvasTransform.scale = (View.sinumerikView.singleLineDebugCanvas.width/View.sinumerikView.singleLineDebugData.canvasRange);
    //console.log('Scale: ' + View.sinumerikView.singleLineDebugData.canvasTransform.scale);
    View.sinumerikView.singleLineDebugData.canvasTransform.a = View.sinumerikView.singleLineDebugData.canvasTransform.scale;
    View.sinumerikView.singleLineDebugData.canvasTransform.b = 0;
    View.sinumerikView.singleLineDebugData.canvasTransform.c = 0;
    View.sinumerikView.singleLineDebugData.canvasTransform.d = View.sinumerikView.singleLineDebugData.canvasTransform.scale;
    View.sinumerikView.singleLineDebugData.canvasTransform.e = (View.sinumerikView.singleLineDebugData.canvasRange / 2 - View.sinumerikView.singleLineDebugData.canvasCentrPoint[0]) * View.sinumerikView.singleLineDebugData.canvasTransform.scale;
    View.sinumerikView.singleLineDebugData.canvasTransform.f = (View.sinumerikView.singleLineDebugData.canvasRange * View.sinumerikView.singleLineDebugData.canvasHeightFactor / 2 - View.sinumerikView.singleLineDebugData.canvasCentrPoint[1]) * View.sinumerikView.singleLineDebugData.canvasTransform.scale;
}

function changeCanvas() {

    // console.log('changeCanvas');
    // console.log(View.sinumerikView.singleLineDebugData.CanvasAxes);

    var ctx = View.sinumerikView.singleLineDebugCanvas.getContext("2d");

    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0, 0, View.sinumerikView.singleLineDebugCanvas.width, View.sinumerikView.singleLineDebugCanvas.height);

    //console.log(View.sinumerikView.singleLineDebugData.canvasTransform.f);


    ctx.setTransform(View.sinumerikView.singleLineDebugData.canvasTransform.a,
                     View.sinumerikView.singleLineDebugData.canvasTransform.b,
                     View.sinumerikView.singleLineDebugData.canvasTransform.c,
                     View.sinumerikView.singleLineDebugData.canvasTransform.d,
                     View.sinumerikView.singleLineDebugData.canvasTransform.e,
                     View.sinumerikView.singleLineDebugData.canvasTransform.f);

    // ctx.fillStyle = 'MediumVioletRed';
    // ctx.fillRect(100,100,100,100);
    //
    // ctx.fillStyle = 'DarkTurquoise';
    // ctx.fillRect(100,0,100,100);
    //
    // ctx.fillStyle = 'YellowGreen';
    // ctx.fillRect(0,0,100,100);
    //
    // ctx.fillStyle = 'red';
    // ctx.beginPath();
    // ctx.arc(0, 0, 50, 0, 270, 0);
    // ctx.fill();

    displayCanvasElements(ctx);

    drawAxes(ctx);

}

function displayCanvasElements(ctx) {

    //console.log(View.sinumerikView.parseData);

    var axes = View.sinumerikView.singleLineDebugData.CanvasAxes.axes;
    var factor = [1,-1];
    if (View.sinumerikView.singleLineDebugData.CanvasAxes.reverseAxes) {
        factor[View.sinumerikView.singleLineDebugData.CanvasAxes.reverseAxes] *= -1;
    }
    // View.sinumerikView.singleLineDebugData.CanvasAxes.axes[0] = 'Z';
    // View.sinumerikView.singleLineDebugData.CanvasAxes.axes[1] = 'Y';
    // View.sinumerikView.singleLineDebugData.CanvasAxes.reverseAxes = '0';

    View.sinumerikView.parseData.canvas.forEach(function(element) {
//        console.log(element);

        ctx.beginPath();
        ctx.strokeStyle = canvasElementColor(element.type);
        ctx.lineWidth = 2 / View.sinumerikView.singleLineDebugData.canvasTransform.scale;
        ctx.moveTo(factor[0] * element[`${axes[0]}_start`], factor[1] * element[`${axes[1]}_start`])
        if (element.type.match(/G1|G0|G33/)) {
            //ctx.lineTo(100,100);
            ctx.lineTo(factor[0] * element[`${axes[0]}`], factor[1] * element[`${axes[1]}`]);
        } else {
            ctx.lineTo(factor[0] * element[`${axes[0]}`], factor[1] * element[`${axes[1]}`]);
        }
        ctx.stroke();
    });
}

function canvasElementColor(type) {
    if (type == 'G0') {
        return 'red';
    } else {
        return 'green';
    }
}



function drawAxes(ctx) {
    var axesColor = 'rgba(47, 79, 79, 0.5)';
    var arrowSide = View.sinumerikView.singleLineDebugData.canvasRange / 40;
    var reverseFactor = [1,-1];
    if (View.sinumerikView.parseData.diamon) {
        View.sinumerikView.singleLineDebugData.CanvasAxes.axes.forEach(function (axis, iter) {
            if (axis == 'X') {
                reverseFactor[iter] *= 2;
            }
        });
    }




    //TODO the font size reaches the minimum limit on a large scale and the text disappears
    //TODO текст исчезает при большом увеличении. Надо переделать отрисовку системы координат. Либо сдалать 1мм = 1ед canvas
    ctx.font = `${20/View.sinumerikView.singleLineDebugData.canvasTransform.scale}px Verdana`;

    //Horizontal ax

    ctx.strokeStyle = axesColor;
    ctx.beginPath();
    ctx.moveTo(-0.45 * View.sinumerikView.singleLineDebugData.canvasRange + View.sinumerikView.singleLineDebugData.canvasCentrPoint[0], View.sinumerikView.singleLineDebugData.canvasCentrPoint[1]);
    ctx.lineTo(0.45 * View.sinumerikView.singleLineDebugData.canvasRange + View.sinumerikView.singleLineDebugData.canvasCentrPoint[0], View.sinumerikView.singleLineDebugData.canvasCentrPoint[1]);
    ctx.lineWidth = 1 / View.sinumerikView.singleLineDebugData.canvasTransform.scale;
    ctx.stroke();

    var arrowFactor = 1;
    if (View.sinumerikView.singleLineDebugData.CanvasAxes.reverseAxes == '0') {
        reverseFactor[0] *= -1;
        arrowFactor = -1;
    }
    ctx.fillStyle = axesColor;
    ctx.beginPath();
    ctx.moveTo(0.45 * arrowFactor * View.sinumerikView.singleLineDebugData.canvasRange + View.sinumerikView.singleLineDebugData.canvasCentrPoint[0], View.sinumerikView.singleLineDebugData.canvasCentrPoint[1]);
    ctx.lineTo(0.45 * arrowFactor * View.sinumerikView.singleLineDebugData.canvasRange + View.sinumerikView.singleLineDebugData.canvasCentrPoint[0] - arrowFactor * arrowSide, View.sinumerikView.singleLineDebugData.canvasCentrPoint[1] + arrowSide * 0.3);
    ctx.lineTo(0.45 * arrowFactor * View.sinumerikView.singleLineDebugData.canvasRange + View.sinumerikView.singleLineDebugData.canvasCentrPoint[0] - arrowFactor * arrowSide,View.sinumerikView.singleLineDebugData.canvasCentrPoint[1] - arrowSide * 0.3);
    ctx.fill();
    ctx.fillText(View.sinumerikView.singleLineDebugData.CanvasAxes.axes[0], 0.45 * arrowFactor * View.sinumerikView.singleLineDebugData.canvasRange + View.sinumerikView.singleLineDebugData.canvasCentrPoint[0] - arrowFactor * arrowSide, View.sinumerikView.singleLineDebugData.canvasCentrPoint[1] - arrowSide);



    //Vertical ax
    ctx.beginPath();
    ctx.moveTo(View.sinumerikView.singleLineDebugData.canvasCentrPoint[0], -0.45 * View.sinumerikView.singleLineDebugData.canvasRange * View.sinumerikView.singleLineDebugData.canvasHeightFactor + View.sinumerikView.singleLineDebugData.canvasCentrPoint[1]);
    ctx.lineTo(View.sinumerikView.singleLineDebugData.canvasCentrPoint[0], 0.45 * View.sinumerikView.singleLineDebugData.canvasRange * View.sinumerikView.singleLineDebugData.canvasHeightFactor + View.sinumerikView.singleLineDebugData.canvasCentrPoint[1]);
    ctx.lineWidth = 1 / View.sinumerikView.singleLineDebugData.canvasTransform.scale;
    ctx.stroke();

    var arrowFactor = -1;

    if (View.sinumerikView.singleLineDebugData.CanvasAxes.reverseAxes == '1') {
        reverseFactor[1] *= -1;
        arrowFactor = 1;
    }
    ctx.beginPath();
    ctx.moveTo(View.sinumerikView.singleLineDebugData.canvasCentrPoint[0], 0.45 * arrowFactor * View.sinumerikView.singleLineDebugData.canvasRange * View.sinumerikView.singleLineDebugData.canvasHeightFactor + View.sinumerikView.singleLineDebugData.canvasCentrPoint[1]);
    ctx.lineTo(View.sinumerikView.singleLineDebugData.canvasCentrPoint[0] + 0.3 * arrowSide, 0.45 * arrowFactor * View.sinumerikView.singleLineDebugData.canvasRange * View.sinumerikView.singleLineDebugData.canvasHeightFactor + View.sinumerikView.singleLineDebugData.canvasCentrPoint[1] - arrowFactor * arrowSide);
    ctx.lineTo(View.sinumerikView.singleLineDebugData.canvasCentrPoint[0] - 0.3 * arrowSide, 0.45 * arrowFactor * View.sinumerikView.singleLineDebugData.canvasRange * View.sinumerikView.singleLineDebugData.canvasHeightFactor + View.sinumerikView.singleLineDebugData.canvasCentrPoint[1] - arrowFactor * arrowSide);
    ctx.fill();
    ctx.fillText(View.sinumerikView.singleLineDebugData.CanvasAxes.axes[1], View.sinumerikView.singleLineDebugData.canvasCentrPoint[0] + arrowSide, 0.45 * arrowFactor * View.sinumerikView.singleLineDebugData.canvasRange * View.sinumerikView.singleLineDebugData.canvasHeightFactor + View.sinumerikView.singleLineDebugData.canvasCentrPoint[1] - arrowFactor * arrowSide);


    var centerText = View.sinumerikView.singleLineDebugData.CanvasAxes.axes[0] + ':' +  reverseFactor[0] * View.sinumerikView.singleLineDebugData.canvasCentrPoint[0].toFixed(3) +
                    ' ' + View.sinumerikView.singleLineDebugData.CanvasAxes.axes[1] + ':' +  reverseFactor[1] * View.sinumerikView.singleLineDebugData.canvasCentrPoint[1].toFixed(3);

    ctx.fillText(centerText, View.sinumerikView.singleLineDebugData.canvasCentrPoint[0] + arrowSide, View.sinumerikView.singleLineDebugData.canvasCentrPoint[1] - arrowSide);

}
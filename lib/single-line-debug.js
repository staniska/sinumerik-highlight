'use babel';

import View from "./sinumerik";
import {changeActiveTab} from "./changeTabs";
import {generateComment, loadDataFromComment} from "./inner-comment";
import {drawChanges, progParser} from "./interpretator";
import msg_div from "./msg_div";
import {confirmDialog} from "./dialog/confirm";
import {alertDialog} from "./dialog/alert";
import {calcToolCompensation} from "./calcToolCompensation";
import {select2DView, select3DView} from "./3d_view/view.js";
import {createTimeDiv} from "./time";
import {create_element} from "./createElement";

//Global timer
var ctx_timeout;
//Массив для элементов заготовки
let blank = []
let contour = []


//TODO помимо изменения имени файла. проверять еще и путь

export function singleLineDebug(event) {
//    console.log('SLD ' + event);

    if (event === 'singleLineDebugButtonClick') {
        changeActiveTab('singleLine');
        View.sinumerikView.contourEditButton.className = 'sinumerikPanelHeadButton';
        View.sinumerikView.singleLineDebugButton.className = 'sinumerikPanelHeadButtonSelect';
        View.sinumerikView.machineManagerButton.className = 'sinumerikPanelHeadButton';
        if (!View.sinumerikView.singleLineDebugCanvas) {
            generateSLDComponents();
        }
    }
    if (event === 'changeEditor') {
        checkChanges(event);
    }

    if (event === 'drawChanges') {
        drawChanges(1);
    }

    if (View.sinumerikView.singleLineDebugData &&
        event === 'singleLineDebugButtonClick') {
        checkChanges(event);
    }

    if (event === 'scaleMinusButtonClick' ||
        event === 'scalePlusButtonClick' ||
        event === 'resetPosition' ||
        event.match('move.*ButtonClick')) {
        canvasRange(event);
    }

    if (event.match(/[XYZ]+PlaneButtonClick/)) {
        changePlane(event);
    }

    if (event === 'stringParseDetailsButtonClick') {
        View.sinumerikView.singleLineDebugMainWindow.removeChild(View.sinumerikView.singleLineDebugCanvas);
        View.sinumerikView.singleLineDebugMainWindow.appendChild(View.sinumerikView.singleLineDebugStringParseDetailsDiv);
        View.sinumerikView.singleLineDebugMainWindow.appendChild(View.sinumerikView.singleLineDebugParseStringDiv);
        View.sinumerikView.singleLineDebugParseStringDiv.removeChild(View.sinumerikView.singleLineDebugParseStringButton);
        View.sinumerikView.singleLineDebugParseStringDiv.appendChild(View.sinumerikView.closeDetailsButton);

    }
    if (event === 'stringParseDetailsCloseButtonClick') {
        View.sinumerikView.singleLineDebugMainWindow.removeChild(View.sinumerikView.singleLineDebugStringParseDetailsDiv);
        View.sinumerikView.singleLineDebugMainWindow.appendChild(View.sinumerikView.singleLineDebugCanvas);
        View.sinumerikView.singleLineDebugMainWindow.appendChild(View.sinumerikView.singleLineDebugParseStringDiv);
        View.sinumerikView.singleLineDebugParseStringDiv.appendChild(View.sinumerikView.singleLineDebugParseStringButton);
        View.sinumerikView.singleLineDebugParseStringDiv.removeChild(View.sinumerikView.closeDetailsButton);
    }

    if (event === 'changeCanvasPrimitives') {
        // console.log('changeCanvasPrimitives');
        changeCanvas();
        if (View.sinumerikView.singleLineDebugViewDiv.plane2D3D.innerText === '2D') {
            select3DView()
        }
    }


}

function checkChanges(event) {

    const Editor = atom.workspace.getActiveTextEditor();
    var filename = Editor.getTitle().replace(/\./g, '_').toUpperCase();

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

    if (View.sinumerikView.programmData && View.sinumerikView.programmData[filename]) {
        //Заготовка
        if (View.sinumerikView.programmData[filename].blank) {
            View.sinumerikView.singleLineDebugBlankDiv.input.value = View.sinumerikView.programmData[filename].blank.name
        } else {
            View.sinumerikView.singleLineDebugBlankDiv.input.value = 'BLANK'
        }
        //Контур
        if (View.sinumerikView.programmData[filename].contour) {
            View.sinumerikView.singleLineDebugContourDiv.input.value = View.sinumerikView.programmData[filename].contour.name
        } else {
            View.sinumerikView.singleLineDebugContourDiv.input.value = 'CONTOUR'
        }

        if (View.sinumerikView.programmData[filename].machine) {
            View.sinumerikView.singleLineDebugData.machine = JSON.parse(JSON.stringify(View.sinumerikView.programmData[filename].machine));
        } else {
            const machinesArr = Object.keys(View.sinumerikView.machineData.machines)
            if (machinesArr.length && View.sinumerikView.machineData.defaultMachine &&
                View.sinumerikView.machineData.machines[View.sinumerikView.machineData.defaultMachine] !== undefined) {
                console.log(View.sinumerikView.machineData.defaultMachine)
                View.sinumerikView.programmData[filename].machine = View.sinumerikView.machineData.machines[View.sinumerikView.machineData.defaultMachine]
                View.sinumerikView.singleLineDebugData.machine = JSON.parse(JSON.stringify(View.sinumerikView.programmData[filename].machine));
            } else {
                alertDialog("Please, select machine for this file or default machine")
            }
        }

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

function errorDiv(text) {
    let sinumerikEventHandler = View.sinumerikView.eventRouter.route.bind(this);

    if (!View.sinumerikView.singleLineDebugErrorDiv) {
        View.sinumerikView.singleLineDebugErrorDiv = document.createElement('div');
        View.sinumerikView.singleLineDebugErrorDiv.className = 'sinumerikDiv';
        View.sinumerikView.singleLineDebugErrorDiv.style.color = 'firebrick';
        View.sinumerikView.singleLineDebugErrorDiv.style.fontWeight = 'bold';
    }
    if (text === '') {
        View.sinumerikView.singleLineDebugErrorDiv.innerText = text;
        if (View.sinumerikView.singleLineDebugErrorDiv.parentElement) {
            View.sinumerikView.singleLineDebugFootContainer.removeChild(View.sinumerikView.singleLineDebugErrorDiv);
        }
        View.sinumerikView.singleLineDebugFootContainer.appendChild(View.sinumerikView.singleLineDebugLeftFootDiv);
        View.sinumerikView.singleLineDebugFootContainer.appendChild(View.sinumerikView.singleLineDebugMiddleFootDiv);
        View.sinumerikView.singleLineDebugFootContainer.appendChild(View.sinumerikView.singleLineDebugRightFootDiv);
        View.sinumerikView.singleLineDebugFootContainer.appendChild(View.sinumerikView.singleLineDebugRightFootDiv2);
    } else {
        View.sinumerikView.singleLineDebugErrorDiv.innerText = text;
        if (text === 'There are not active machine') {
            View.sinumerikView.singleLineDebugErrorDiv.innerText = 'There are not active machine for this file. Please select and activate it in Machine Manager';
            const Editor = atom.workspace.getActiveTextEditor();
            var filename = Editor.getTitle();
            if (View.sinumerikView.main.offsetHeight) {
                if (confirmDialog(`There are not active machine for this file(${filename}). Woud you like to select it in Machine manager?`)) {
                    sinumerikEventHandler('{"emitter": "machineManager", "event": "machineManagerButtonClick"}');
                }
            }
        }
        View.sinumerikView.singleLineDebugFootContainer.appendChild(View.sinumerikView.singleLineDebugErrorDiv);

        if (View.sinumerikView.singleLineDebugLeftFootDiv.parentElement) {
            View.sinumerikView.singleLineDebugFootContainer.removeChild(View.sinumerikView.singleLineDebugLeftFootDiv);
            View.sinumerikView.singleLineDebugFootContainer.removeChild(View.sinumerikView.singleLineDebugMiddleFootDiv);
            View.sinumerikView.singleLineDebugFootContainer.removeChild(View.sinumerikView.singleLineDebugRightFootDiv);
            View.sinumerikView.singleLineDebugFootContainer.removeChild(View.sinumerikView.singleLineDebugRightFootDiv2);
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
        View.sinumerikView.singleLineDebugData.plane = event.substring(0, 2);
    }

    // if (progParser() !== 'machine not founded') {
    //TODO очищать канвас и блокировать на нем какие-либо события
    progParser()
    axesByPlane();
    canvasRange();
    // }
}

function generateSLDComponents() {
    let sinumerikEventHandler = View.sinumerikView.eventRouter.route.bind(this);

    View.sinumerikView.singleLineDebugCanvas = document.createElement('canvas');
    View.sinumerikView.singleLineDebugCanvas.className = 'sinumerikCanvas';
    View.sinumerikView.singleLineDebugCanvas.tabIndex = 1;
    View.sinumerikView.singleLineDebugCanvas.title = 'Click on graphic field to activate keyboard events';
    View.sinumerikView.singleLineDebugCanvas.action = null
    View.sinumerikView.singleLineDebugCanvas.addEventListener('keydown', function (event) {
        if (View.sinumerikView.singleLineDebugMiddleFootDiv.parentElement) {
            // console.log(event);

            if (event.code === 'Equal') {
                sinumerikEventHandler('{"emitter": "singleLine", "event": "scalePlusButtonClick"}');
            }
            if (event.code === 'Minus') {
                sinumerikEventHandler('{"emitter": "singleLine", "event": "scaleMinusButtonClick"}');
            }

            if (event.key === 'ArrowUp') {
                sinumerikEventHandler('{"emitter": "singleLine", "event": "moveUpButtonClick"}');
            }
            if (event.key === 'ArrowDown') {
                sinumerikEventHandler('{"emitter": "singleLine", "event": "moveDownButtonClick"}');
            }
            if (event.key === 'ArrowLeft') {
                sinumerikEventHandler('{"emitter": "singleLine", "event": "moveLeftButtonClick"}');
            }
            if (event.key === 'ArrowRight') {
                sinumerikEventHandler('{"emitter": "singleLine", "event": "moveRightButtonClick"}');
            }
        }
    });


    View.sinumerikView.singleLineDebugCanvas.addEventListener('wheel', event => {
        if (View.sinumerikView.singleLineDebugData.canvasWheelTimestamp > Date.now() - 20) return
        View.sinumerikView.singleLineDebugData.canvasWheelTimestamp = Date.now()
        const canvas = View.sinumerikView.singleLineDebugCanvas
        let delta = event.deltaY
        const centerPoint = View.sinumerikView.singleLineDebugData.canvasCentrPoint
        //View.sinumerikView.singleLineDebugCanvas.width / View.sinumerikView.singleLineDebugData.canvasRange

        const oldScale = canvas.width / View.sinumerikView.singleLineDebugData.canvasRange

        const newRange = View.sinumerikView.singleLineDebugData.canvasRange + Math.abs(delta) / delta * Number((View.sinumerikView.singleLineDebugData.canvasRange / 20).toPrecision(1))
        if (newRange !== newRange || newRange < 0.3) return;

        View.sinumerikView.singleLineDebugData.canvasRange = newRange

        const eventPoint = [
            centerPoint[0] - (canvas.offsetWidth / 2 - event.offsetX) / oldScale,
            centerPoint[1] - (canvas.offsetHeight / 2 - event.offsetY) / oldScale
        ]

        const scale = canvas.width / View.sinumerikView.singleLineDebugData.canvasRange
        centerPoint[0] -= (eventPoint[0] - centerPoint[0]) * ((oldScale - scale) / scale)
        centerPoint[1] -= (eventPoint[1] - centerPoint[1]) * ((oldScale - scale) / scale)

        // console.log(View.sinumerikView.singleLineDebugData.canvasRange)

        transformByRange()
        changeCanvas()
    })

    View.sinumerikView.singleLineDebugCanvas.addEventListener('mousedown', (event) => {
        View.sinumerikView.singleLineDebugCanvas.style.cursor = 'grabbing'
        View.sinumerikView.singleLineDebugData.mouseDownPoint = [event.offsetX, event.offsetY]
        View.sinumerikView.singleLineDebugCanvas.action = 'drag'
        View.sinumerikView.singleLineDebugCanvas.addEventListener('mousemove', moveSLDcanvas)
    })
    document.addEventListener('mouseup', () => {
        View.sinumerikView.singleLineDebugCanvas.action = null
        View.sinumerikView.singleLineDebugCanvas.style.cursor = 'default'
        View.sinumerikView.singleLineDebugCanvas.removeEventListener('mousemove', moveSLDcanvas)
    })

    View.sinumerikView.singleLineDebugMainWindow.appendChild(View.sinumerikView.singleLineDebugCanvas);

    View.sinumerikView.singleLineDebugData = {};
    View.sinumerikView.singleLineDebugData.canvasRange = {};
    View.sinumerikView.singleLineDebugData.canvasTransform = {};
    View.sinumerikView.singleLineDebugData.canvasWheelTimestamp = Date.now()

    View.sinumerikView.singleLineDebugData.canvasPositions = []

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

    View.sinumerikView.singleLineDebugRightFootDiv2 = document.createElement('div');
    View.sinumerikView.singleLineDebugRightFootDiv2.className = 'sinumerikDiv sinumerikBorderDiv';
    View.sinumerikView.singleLineDebugRightFootDiv2.style.float = 'right';

    View.sinumerikView.singleLineDebugFootContainer.appendChild(View.sinumerikView.singleLineDebugLeftFootDiv);
    View.sinumerikView.singleLineDebugFootContainer.appendChild(View.sinumerikView.singleLineDebugMiddleFootDiv);
    View.sinumerikView.singleLineDebugFootContainer.appendChild(View.sinumerikView.singleLineDebugRightFootDiv);
    View.sinumerikView.singleLineDebugFootContainer.appendChild(View.sinumerikView.singleLineDebugRightFootDiv2);

    View.sinumerikView.singleLineDebugParseStringDiv = document.createElement('div');
    View.sinumerikView.singleLineDebugParseStringDiv.className = 'sinumerikDiv';
    View.sinumerikView.singleLineDebugParseStringDiv.style.margin = '0px';
    View.sinumerikView.singleLineDebugParseStringDiv.style.backgroundColor = 'white';
    View.sinumerikView.singleLineDebugParseStringDiv.style.display = 'flex';
    View.sinumerikView.singleLineDebugParseStringDiv.style.alignItems = 'center'
    View.sinumerikView.singleLineDebugParseStringDiv.stringDiv = document.createElement('div');
    View.sinumerikView.singleLineDebugParseStringDiv.stringDiv.style.float = 'left';
    View.sinumerikView.singleLineDebugParseStringDiv.stringDiv.style.lineHeight = '35px';
    View.sinumerikView.singleLineDebugParseStringDiv.stringDiv.style.verticalAlign = 'middle';
    View.sinumerikView.singleLineDebugParseStringDiv.stringDiv.style.flexGrow = 1;
    View.sinumerikView.singleLineDebugParseStringDiv.appendChild(View.sinumerikView.singleLineDebugParseStringDiv.stringDiv);

    View.sinumerikView.singleLineDebugParseStringTimeDiv = createTimeDiv()
    View.sinumerikView.singleLineDebugParseStringDiv.appendChild(View.sinumerikView.singleLineDebugParseStringTimeDiv)

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

    View.sinumerikView.singleLineDebugResetCanvasPositionButton = create_element(
        ['sinumerikButton', 'icon-sync'],
        View.sinumerikView.singleLineDebugParseStringDiv,
        '',
        'button'
    )
    View.sinumerikView.singleLineDebugResetCanvasPositionButton.title = 'reset viewport position to default'
    View.sinumerikView.singleLineDebugResetCanvasPositionButton.addEventListener('click', () => sinumerikEventHandler('{"emitter": "singleLine", "event": "resetPosition"}'))

    View.sinumerikView.singleLineDebugMainWindow.appendChild(View.sinumerikView.singleLineDebugParseStringDiv);

    View.sinumerikView.singleLineDebugStringParseDetailsDiv = document.createElement('div');
    View.sinumerikView.singleLineDebugStringParseDetailsDiv.style.backgroundColor = 'GhostWhite';

    //region scale buttons
    // View.sinumerikView.singleLineDebugScaleButtonsDiv = document.createElement('div');
    // View.sinumerikView.singleLineDebugScaleButtonsDiv.className = 'sinumerikDiv';
    //
    // View.sinumerikView.singleLineDebugScaleButtonsDiv.plusButton = document.createElement('button');
    // View.sinumerikView.singleLineDebugScaleButtonsDiv.plusButton.className = 'sinumerikButton icon-plus';
    // View.sinumerikView.singleLineDebugScaleButtonsDiv.plusButton.addEventListener('click', function () {
    //     sinumerikEventHandler('{"emitter": "singleLine", "event": "scalePlusButtonClick"}');
    // });
    // View.sinumerikView.singleLineDebugScaleButtonsDiv.appendChild(View.sinumerikView.singleLineDebugScaleButtonsDiv.plusButton);
    //
    // View.sinumerikView.singleLineDebugScaleButtonsDiv.minusButton = document.createElement('button');
    // View.sinumerikView.singleLineDebugScaleButtonsDiv.minusButton.className = 'sinumerikButton icon-dash';
    // View.sinumerikView.singleLineDebugScaleButtonsDiv.minusButton.addEventListener('click', function () {
    //     sinumerikEventHandler('{"emitter": "singleLine", "event": "scaleMinusButtonClick"}');
    // });
    // View.sinumerikView.singleLineDebugScaleButtonsDiv.appendChild(View.sinumerikView.singleLineDebugScaleButtonsDiv.minusButton);
    // View.sinumerikView.singleLineDebugRightFootDiv.appendChild(View.sinumerikView.singleLineDebugScaleButtonsDiv);
    //endregion

    View.sinumerikView.singleLineDebugInfoDiv = document.createElement('div');
    View.sinumerikView.singleLineDebugInfoDiv.machineNameDiv = document.createElement('div');
    View.sinumerikView.singleLineDebugInfoDiv.machineNameDiv.className = 'sinumerikDiv';
    View.sinumerikView.singleLineDebugInfoDiv.machineNameDiv.style.fontWeight = 'bold';
    View.sinumerikView.singleLineDebugInfoDiv.appendChild(View.sinumerikView.singleLineDebugInfoDiv.machineNameDiv);
    View.sinumerikView.singleLineDebugMiddleFootDiv.appendChild(View.sinumerikView.singleLineDebugInfoDiv);

    //region real_time
    View.sinumerikView.singleLineDebugInfoDiv.realTimeDebugCheckDiv = document.createElement('div');
    View.sinumerikView.singleLineDebugInfoDiv.realTimeDebugCheckDiv.style.height = '37px';
    View.sinumerikView.singleLineDebugInfoDiv.realTimeDebugCheck = document.createElement('input');
    View.sinumerikView.singleLineDebugInfoDiv.realTimeDebugCheck.type = 'checkbox';
    View.sinumerikView.singleLineDebugInfoDiv.realTimeDebugCheck.style.height = '25px';
    View.sinumerikView.singleLineDebugInfoDiv.realTimeDebugCheck.style.width = '25px';
    View.sinumerikView.singleLineDebugInfoDiv.realTimeDebugCheck.style.float = 'left';
    View.sinumerikView.singleLineDebugInfoDiv.realTimeDebugCheck.addEventListener('change', function () {
        if (View.sinumerikView.singleLineDebugInfoDiv.realTimeDebugCheck.checked && View.sinumerikView.singleLineDebugInfoDiv.slowDebugCheck.checked) {
            View.sinumerikView.singleLineDebugInfoDiv.slowDebugCheck.checked = false;
        }
    });
    View.sinumerikView.singleLineDebugInfoDiv.realTimeDebugCheckDiv.appendChild(View.sinumerikView.singleLineDebugInfoDiv.realTimeDebugCheck);

    View.sinumerikView.singleLineDebugInfoDiv.realTimeDebugCheckDivText = document.createElement('div');
    View.sinumerikView.singleLineDebugInfoDiv.realTimeDebugCheckDivText.innerText = 'Real-time\nDebug';
    View.sinumerikView.singleLineDebugInfoDiv.realTimeDebugCheckDiv.appendChild(View.sinumerikView.singleLineDebugInfoDiv.realTimeDebugCheckDivText)

    View.sinumerikView.singleLineDebugInfoDiv.appendChild(View.sinumerikView.singleLineDebugInfoDiv.realTimeDebugCheckDiv);
    //endregion

    //region slow_debug
    View.sinumerikView.singleLineDebugInfoDiv.slowDebugCheckDiv = document.createElement('div');
    View.sinumerikView.singleLineDebugInfoDiv.slowDebugCheckDiv.style.display = 'flex';
    View.sinumerikView.singleLineDebugInfoDiv.slowDebugCheckDiv.style.height = '37px';
    // View.sinumerikView.singleLineDebugInfoDiv.slowDebugCheckDiv.style.float = 'left';
    View.sinumerikView.singleLineDebugInfoDiv.slowDebugCheck = document.createElement('input');
    View.sinumerikView.singleLineDebugInfoDiv.slowDebugCheck.type = 'checkbox';
    View.sinumerikView.singleLineDebugInfoDiv.slowDebugCheck.style.height = '25px';
    View.sinumerikView.singleLineDebugInfoDiv.slowDebugCheck.style.width = '25px';
    View.sinumerikView.singleLineDebugInfoDiv.slowDebugCheck.style.float = 'left';
    View.sinumerikView.singleLineDebugInfoDiv.slowDebugCheck.addEventListener('change', function () {
        if (View.sinumerikView.singleLineDebugInfoDiv.realTimeDebugCheck.checked && View.sinumerikView.singleLineDebugInfoDiv.slowDebugCheck.checked) {
            View.sinumerikView.singleLineDebugInfoDiv.realTimeDebugCheck.checked = false;
            clearTimeout(ctx_timeout);
        }
    });

    View.sinumerikView.singleLineDebugInfoDiv.slowDebugCheckDiv.appendChild(View.sinumerikView.singleLineDebugInfoDiv.slowDebugCheck);

    View.sinumerikView.singleLineDebugInfoDiv.slowDebugCheckMult = document.createElement('select');
    View.sinumerikView.singleLineDebugInfoDiv.slowDebugCheckMult.style.height = '25px';
    View.sinumerikView.singleLineDebugInfoDiv.slowDebugCheckMult.style.marginTop = '4px';

    [20, 10, 5, 2, 1].forEach(el => {
        const option = document.createElement('option');
        if (el === 10) option.selected = true
        option.text = el.toString()
        option.value = 1 / el
        View.sinumerikView.singleLineDebugInfoDiv.slowDebugCheckMult.appendChild(option)
    })
    View.sinumerikView.singleLineDebugInfoDiv.slowDebugCheckDiv.appendChild(View.sinumerikView.singleLineDebugInfoDiv.slowDebugCheckMult);

    View.sinumerikView.singleLineDebugInfoDiv.slowDebugCheckText = document.createElement('div');
    View.sinumerikView.singleLineDebugInfoDiv.slowDebugCheckText.style.margin = 'auto';
    View.sinumerikView.singleLineDebugInfoDiv.slowDebugCheckText.innerText = 'Slow debug';
    View.sinumerikView.singleLineDebugInfoDiv.slowDebugCheckDiv.appendChild(View.sinumerikView.singleLineDebugInfoDiv.slowDebugCheckText);
    View.sinumerikView.singleLineDebugInfoDiv.appendChild(View.sinumerikView.singleLineDebugInfoDiv.slowDebugCheckDiv);
    //endregion


    //region pause_selector
    View.sinumerikView.singleLineDebugInfoDiv.pauseDiv = document.createElement('div');
    View.sinumerikView.singleLineDebugInfoDiv.pauseDiv.style.height = '37px';
    View.sinumerikView.singleLineDebugInfoDiv.pauseCheck = document.createElement('button');
    View.sinumerikView.singleLineDebugInfoDiv.pauseCheck.style.width = '90%';
    View.sinumerikView.singleLineDebugInfoDiv.pauseCheck.style.marginLeft = '5%';
    View.sinumerikView.singleLineDebugInfoDiv.pauseCheck.level = 0;
    View.sinumerikView.singleLineDebugInfoDiv.pauseCheck.buttonText = [
        'Nothing',
        'M0 only',
        'M0 & M1',
        'All',
        'All+ProgEnd'
    ]
    View.sinumerikView.singleLineDebugInfoDiv.pauseCheck.innerText = View.sinumerikView.singleLineDebugInfoDiv.pauseCheck.buttonText[View.sinumerikView.singleLineDebugInfoDiv.pauseCheck.level];
    changePauseBackground();
    View.sinumerikView.singleLineDebugInfoDiv.pauseCheck.addEventListener('click', function () {
        changePauseLevel();
    });

    function changePauseLevel() {
        View.sinumerikView.singleLineDebugInfoDiv.pauseCheck.level++;
        if (View.sinumerikView.singleLineDebugInfoDiv.pauseCheck.level > 4) {
            View.sinumerikView.singleLineDebugInfoDiv.pauseCheck.level = 0;
        }
        View.sinumerikView.singleLineDebugInfoDiv.pauseCheck.innerText = View.sinumerikView.singleLineDebugInfoDiv.pauseCheck.buttonText[View.sinumerikView.singleLineDebugInfoDiv.pauseCheck.level];
        changePauseBackground();
    }

    function changePauseBackground() {
        var jo = 5 + (View.sinumerikView.singleLineDebugInfoDiv.pauseCheck.level) * 27 - 5;
        View.sinumerikView.singleLineDebugInfoDiv.pauseCheck.style.backgroundImage = `linear-gradient(to right,  #82e0aa ${jo}%, green ${jo}%, white ${6 + jo}%)`;
    }

    View.sinumerikView.singleLineDebugInfoDiv.pauseDiv.appendChild(View.sinumerikView.singleLineDebugInfoDiv.pauseCheck);
    View.sinumerikView.singleLineDebugInfoDiv.appendChild(View.sinumerikView.singleLineDebugInfoDiv.pauseDiv);
    //endregion

    //region trans_buttons
    // View.sinumerikView.singleLineDebugTransButtonsDiv = document.createElement('div');
    // View.sinumerikView.singleLineDebugTransButtonsDiv.className = 'sinumerikDiv';
    //
    // View.sinumerikView.singleLineDebugTransButtonsDiv.moveLeftButton = document.createElement('button');
    // View.sinumerikView.singleLineDebugTransButtonsDiv.moveLeftButton.className = 'sinumerikButton icon-chevron-left';
    // View.sinumerikView.singleLineDebugTransButtonsDiv.moveLeftButton.addEventListener('click', function () {
    //     sinumerikEventHandler('{"emitter": "singleLine", "event": "moveLeftButtonClick"}');
    // });
    // View.sinumerikView.singleLineDebugTransButtonsDiv.appendChild(View.sinumerikView.singleLineDebugTransButtonsDiv.moveLeftButton);
    //
    // View.sinumerikView.singleLineDebugTransButtonsDiv.moveRightButton = document.createElement('button');
    // View.sinumerikView.singleLineDebugTransButtonsDiv.moveRightButton.className = 'sinumerikButton icon-chevron-right';
    // View.sinumerikView.singleLineDebugTransButtonsDiv.moveRightButton.addEventListener('click', function () {
    //     sinumerikEventHandler('{"emitter": "singleLine", "event": "moveRightButtonClick"}');
    // });
    // View.sinumerikView.singleLineDebugTransButtonsDiv.appendChild(View.sinumerikView.singleLineDebugTransButtonsDiv.moveRightButton);
    //
    // View.sinumerikView.singleLineDebugTransButtonsDiv.moveUpButton = document.createElement('button');
    // View.sinumerikView.singleLineDebugTransButtonsDiv.moveUpButton.className = 'sinumerikButton icon-chevron-up';
    // View.sinumerikView.singleLineDebugTransButtonsDiv.moveUpButton.addEventListener('click', function () {
    //     sinumerikEventHandler('{"emitter": "singleLine", "event": "moveUpButtonClick"}');
    // });
    // View.sinumerikView.singleLineDebugTransButtonsDiv.appendChild(View.sinumerikView.singleLineDebugTransButtonsDiv.moveUpButton);
    //
    // View.sinumerikView.singleLineDebugTransButtonsDiv.moveDownButton = document.createElement('button');
    // View.sinumerikView.singleLineDebugTransButtonsDiv.moveDownButton.className = 'sinumerikButton icon-chevron-down';
    // View.sinumerikView.singleLineDebugTransButtonsDiv.moveDownButton.addEventListener('click', function () {
    //     sinumerikEventHandler('{"emitter": "singleLine", "event": "moveDownButtonClick"}');
    // });
    // View.sinumerikView.singleLineDebugTransButtonsDiv.appendChild(View.sinumerikView.singleLineDebugTransButtonsDiv.moveDownButton);
    //
    // View.sinumerikView.singleLineDebugRightFootDiv.appendChild(View.sinumerikView.singleLineDebugTransButtonsDiv);
    //endregion


    View.sinumerikView.singleLineDebugViewDiv = document.createElement('div');
    View.sinumerikView.singleLineDebugViewDiv.className = 'sinumerikDiv flexColumn';
    View.sinumerikView.singleLineDebugViewDiv.XZPlaneButton = document.createElement('button');
    View.sinumerikView.singleLineDebugViewDiv.XZPlaneButton.className = 'sinumerikButton';
    View.sinumerikView.singleLineDebugViewDiv.XZPlaneButton.innerText = 'XZ plane';
    View.sinumerikView.singleLineDebugViewDiv.XZPlaneButton.addEventListener('click', function () {
        sinumerikEventHandler('{"emitter": "singleLine", "event": "XZPlaneButtonClick"}');
    });
    View.sinumerikView.singleLineDebugViewDiv.appendChild(View.sinumerikView.singleLineDebugViewDiv.XZPlaneButton);

    View.sinumerikView.singleLineDebugViewDiv.XYPlaneButton = document.createElement('button');
    View.sinumerikView.singleLineDebugViewDiv.XYPlaneButton.className = 'sinumerikButton';
    View.sinumerikView.singleLineDebugViewDiv.XYPlaneButton.innerText = 'XY plane';
    View.sinumerikView.singleLineDebugViewDiv.XYPlaneButton.addEventListener('click', function () {
        sinumerikEventHandler('{"emitter": "singleLine", "event": "XYPlaneButtonClick"}');
    });
    View.sinumerikView.singleLineDebugViewDiv.XYPlaneButton.disabled = false;
    View.sinumerikView.singleLineDebugViewDiv.appendChild(View.sinumerikView.singleLineDebugViewDiv.XYPlaneButton);

    View.sinumerikView.singleLineDebugViewDiv.YZPlaneButton = document.createElement('button');
    View.sinumerikView.singleLineDebugViewDiv.YZPlaneButton.className = 'sinumerikButton';
    View.sinumerikView.singleLineDebugViewDiv.YZPlaneButton.innerText = 'YZ plane';
    View.sinumerikView.singleLineDebugViewDiv.YZPlaneButton.addEventListener('click', function () {
        sinumerikEventHandler('{"emitter": "singleLine", "event": "YZPlaneButtonClick"}');
    });
    View.sinumerikView.singleLineDebugViewDiv.YZPlaneButton.disabled = false;
    View.sinumerikView.singleLineDebugViewDiv.appendChild(View.sinumerikView.singleLineDebugViewDiv.YZPlaneButton);

    View.sinumerikView.singleLineDebugViewDiv.plane2D3D = document.createElement('button');
    View.sinumerikView.singleLineDebugViewDiv.plane2D3D.className = 'sinumerikButton';
    View.sinumerikView.singleLineDebugViewDiv.plane2D3D.innerText = '3D';
    View.sinumerikView.singleLineDebugViewDiv.plane2D3D.addEventListener('click', (e) => {
        if (e.target.innerText === '3D') {
            select3DView()
        } else {
            select2DView()
        }
    });
    View.sinumerikView.singleLineDebugViewDiv.plane2D3D.disabled = false;
    View.sinumerikView.singleLineDebugViewDiv.appendChild(View.sinumerikView.singleLineDebugViewDiv.plane2D3D);


    View.sinumerikView.singleLineDebugRightFootDiv.appendChild(View.sinumerikView.singleLineDebugViewDiv);


    View.sinumerikView.singleLineDebugHelpDiv = document.createElement('div');
    View.sinumerikView.singleLineDebugHelpDiv.className = 'sinumerikDiv';
    View.sinumerikView.singleLineDebugHelpDiv.style.display = 'flex'
    View.sinumerikView.singleLineDebugHelpDiv.style.flexDirection = 'column'

    View.sinumerikView.singleLineDebugHelpDiv.G40div = document.createElement('div');
    View.sinumerikView.singleLineDebugHelpDiv.G40div.style.float = 'none';
    View.sinumerikView.singleLineDebugHelpDiv.G40div.textDiv = document.createElement('div');
    View.sinumerikView.singleLineDebugHelpDiv.G40div.textDiv.innerText = 'G40  ';
    View.sinumerikView.singleLineDebugHelpDiv.G40div.textDiv.style.float = 'left';
    View.sinumerikView.singleLineDebugHelpDiv.G40div.appendChild(View.sinumerikView.singleLineDebugHelpDiv.G40div.textDiv);
    View.sinumerikView.singleLineDebugHelpDiv.G40div.lineDiv = document.createElement('div');
    View.sinumerikView.singleLineDebugHelpDiv.G40div.lineDiv.style.height = '3px';
    View.sinumerikView.singleLineDebugHelpDiv.G40div.lineDiv.style.width = '22px';
    View.sinumerikView.singleLineDebugHelpDiv.G40div.lineDiv.style.background = 'green';
    View.sinumerikView.singleLineDebugHelpDiv.G40div.lineDiv.style.float = 'right';
    View.sinumerikView.singleLineDebugHelpDiv.G40div.lineDiv.style.marginTop = '6px';
    View.sinumerikView.singleLineDebugHelpDiv.G40div.lineDiv.style.marginLeft = '10px';
    View.sinumerikView.singleLineDebugHelpDiv.G40div.appendChild(View.sinumerikView.singleLineDebugHelpDiv.G40div.lineDiv);
    View.sinumerikView.singleLineDebugHelpDiv.appendChild(View.sinumerikView.singleLineDebugHelpDiv.G40div);

    View.sinumerikView.singleLineDebugHelpDiv.G41div = document.createElement('div');
    View.sinumerikView.singleLineDebugHelpDiv.G41div.style.float = 'left';
    View.sinumerikView.singleLineDebugHelpDiv.G41div.textDiv = document.createElement('div');
    View.sinumerikView.singleLineDebugHelpDiv.G41div.textDiv.innerText = 'G41';
    View.sinumerikView.singleLineDebugHelpDiv.G41div.textDiv.style.float = 'left';
    View.sinumerikView.singleLineDebugHelpDiv.G41div.appendChild(View.sinumerikView.singleLineDebugHelpDiv.G41div.textDiv);
    View.sinumerikView.singleLineDebugHelpDiv.G41div.lineDiv = document.createElement('div');
    View.sinumerikView.singleLineDebugHelpDiv.G41div.lineDiv.style.height = '3px';
    View.sinumerikView.singleLineDebugHelpDiv.G41div.lineDiv.style.width = '22px';
    View.sinumerikView.singleLineDebugHelpDiv.G41div.lineDiv.style.background = 'greenyellow';
    View.sinumerikView.singleLineDebugHelpDiv.G41div.lineDiv.style.float = 'right';
    View.sinumerikView.singleLineDebugHelpDiv.G41div.lineDiv.style.marginTop = '6px';
    View.sinumerikView.singleLineDebugHelpDiv.G41div.lineDiv.style.marginLeft = '10px';
    View.sinumerikView.singleLineDebugHelpDiv.G41div.appendChild(View.sinumerikView.singleLineDebugHelpDiv.G41div.lineDiv);
    View.sinumerikView.singleLineDebugHelpDiv.appendChild(View.sinumerikView.singleLineDebugHelpDiv.G41div);

    View.sinumerikView.singleLineDebugHelpDiv.G42div = document.createElement('div');
    View.sinumerikView.singleLineDebugHelpDiv.G42div.style.float = 'none';
    View.sinumerikView.singleLineDebugHelpDiv.G42div.textDiv = document.createElement('div');
    View.sinumerikView.singleLineDebugHelpDiv.G42div.textDiv.innerText = 'G42';
    View.sinumerikView.singleLineDebugHelpDiv.G42div.textDiv.style.float = 'left';
    View.sinumerikView.singleLineDebugHelpDiv.G42div.appendChild(View.sinumerikView.singleLineDebugHelpDiv.G42div.textDiv);
    View.sinumerikView.singleLineDebugHelpDiv.G42div.lineDiv = document.createElement('div');
    View.sinumerikView.singleLineDebugHelpDiv.G42div.lineDiv.style.height = '3px';
    View.sinumerikView.singleLineDebugHelpDiv.G42div.lineDiv.style.width = '22px';
    View.sinumerikView.singleLineDebugHelpDiv.G42div.lineDiv.style.background = 'springgreen';
    View.sinumerikView.singleLineDebugHelpDiv.G42div.lineDiv.style.float = 'right';
    View.sinumerikView.singleLineDebugHelpDiv.G42div.lineDiv.style.marginTop = '6px';
    View.sinumerikView.singleLineDebugHelpDiv.G42div.lineDiv.style.marginLeft = '10px';
    View.sinumerikView.singleLineDebugHelpDiv.G42div.appendChild(View.sinumerikView.singleLineDebugHelpDiv.G42div.lineDiv);
    View.sinumerikView.singleLineDebugHelpDiv.appendChild(View.sinumerikView.singleLineDebugHelpDiv.G42div);

    View.sinumerikView.singleLineDebugHelpDiv.CompMath = document.createElement('div');
    View.sinumerikView.singleLineDebugHelpDiv.CompMath.style.border = '1px solid #F62217'

    View.sinumerikView.singleLineDebugHelpDiv.CompMathText = document.createElement('div');
    View.sinumerikView.singleLineDebugHelpDiv.CompMathText.style.width = '100px'
    View.sinumerikView.singleLineDebugHelpDiv.CompMathText.innerText = 'Calc lathe tool compensation. EXPERIMENTAL!';
    View.sinumerikView.singleLineDebugHelpDiv.CompMath.appendChild(View.sinumerikView.singleLineDebugHelpDiv.CompMathText)
    View.sinumerikView.singleLineDebugHelpDiv.CompMathCheckbox = document.createElement('input');
    View.sinumerikView.singleLineDebugHelpDiv.CompMathCheckbox.type = 'checkbox';
    View.sinumerikView.singleLineDebugHelpDiv.CompMath.appendChild(View.sinumerikView.singleLineDebugHelpDiv.CompMathCheckbox)
    View.sinumerikView.singleLineDebugHelpDiv.appendChild(View.sinumerikView.singleLineDebugHelpDiv.CompMath)

    View.sinumerikView.singleLineDebugLeftFootDiv.appendChild(View.sinumerikView.singleLineDebugHelpDiv);

//region C_As_Rot
    View.sinumerikView.singleLineDebugHelpDiv.C_As_Rot = document.createElement('div')
    View.sinumerikView.singleLineDebugHelpDiv.C_As_Rot.textDiv = document.createElement('div')
    View.sinumerikView.singleLineDebugHelpDiv.C_As_Rot.textDiv.innerText = 'C as ROT'
    View.sinumerikView.singleLineDebugHelpDiv.C_As_Rot.textDiv.style.float = 'left'
    View.sinumerikView.singleLineDebugHelpDiv.C_As_Rot.textDiv.style.margin = '5px'

    View.sinumerikView.singleLineDebugHelpDiv.C_As_Rot.appendChild(View.sinumerikView.singleLineDebugHelpDiv.C_As_Rot.textDiv)
    View.sinumerikView.singleLineDebugHelpDiv.C_As_Rot.input = document.createElement("input")
    View.sinumerikView.singleLineDebugHelpDiv.C_As_Rot.input.type = 'checkbox'
    View.sinumerikView.singleLineDebugHelpDiv.C_As_Rot.input.defaultChecked = true
    View.sinumerikView.singleLineDebugHelpDiv.C_As_Rot.input.style.height = '20px'
    View.sinumerikView.singleLineDebugHelpDiv.C_As_Rot.input.style.width = '20px'
    View.sinumerikView.singleLineDebugHelpDiv.C_As_Rot.input.style.marginRight = '5px'
    View.sinumerikView.singleLineDebugHelpDiv.C_As_Rot.appendChild(View.sinumerikView.singleLineDebugHelpDiv.C_As_Rot.input)
    View.sinumerikView.singleLineDebugRightFootDiv2.appendChild(View.sinumerikView.singleLineDebugHelpDiv.C_As_Rot)
//endregion

//region blank
    View.sinumerikView.singleLineDebugBlankDiv = document.createElement("div")
    View.sinumerikView.singleLineDebugBlankDiv.textDiv = document.createElement("div")
    View.sinumerikView.singleLineDebugBlankDiv.textDiv.innerText = 'Blank:'
    View.sinumerikView.singleLineDebugBlankDiv.textDiv.style.float = 'left'
    View.sinumerikView.singleLineDebugBlankDiv.textDiv.style.marginTop = '10px'
    View.sinumerikView.singleLineDebugBlankDiv.textDiv.style.marginLeft = '5px'
    View.sinumerikView.singleLineDebugBlankDiv.textDiv.style.marginRight = '10px'
    View.sinumerikView.singleLineDebugBlankDiv.appendChild(View.sinumerikView.singleLineDebugBlankDiv.textDiv)
    View.sinumerikView.singleLineDebugBlankDiv.input = document.createElement("input")
    View.sinumerikView.singleLineDebugBlankDiv.input.className = 'sinumerikInput native-key-bindings'
    View.sinumerikView.singleLineDebugBlankDiv.input.type = 'text'
    View.sinumerikView.singleLineDebugBlankDiv.input.style.width = '12em'
    View.sinumerikView.singleLineDebugBlankDiv.appendChild(View.sinumerikView.singleLineDebugBlankDiv.input)
    View.sinumerikView.singleLineDebugBlankDiv.submitButton = document.createElement("button")
    View.sinumerikView.singleLineDebugBlankDiv.submitButton.className = 'sinumerikButton icon-check'
    View.sinumerikView.singleLineDebugBlankDiv.submitButton.addEventListener('click', save_blank)
    View.sinumerikView.singleLineDebugBlankDiv.appendChild(View.sinumerikView.singleLineDebugBlankDiv.submitButton)
    View.sinumerikView.singleLineDebugRightFootDiv2.appendChild(View.sinumerikView.singleLineDebugBlankDiv)

    function save_blank() {
        const Editor = atom.workspace.getActiveTextEditor();
        var filename = Editor.getTitle().replace(/\./g, '_').toUpperCase();

        if (View.sinumerikView.programmData && View.sinumerikView.programmData[filename]) {
            if (View.sinumerikView.singleLineDebugBlankDiv.input.value.length > 2) {
                View.sinumerikView.programmData[filename].blank = {name: View.sinumerikView.singleLineDebugBlankDiv.input.value}
                generateComment()
                console.log('save_blank_file: ', View.sinumerikView.singleLineDebugBlankDiv.input.value)
            }
        }
        blank = []
    }

//endregion

//region contour
    View.sinumerikView.singleLineDebugContourDiv = document.createElement("div")
    View.sinumerikView.singleLineDebugContourDiv.textDiv = document.createElement("div")
    View.sinumerikView.singleLineDebugContourDiv.textDiv.innerText = 'Contour:'
    View.sinumerikView.singleLineDebugContourDiv.textDiv.style.float = 'left'
    View.sinumerikView.singleLineDebugContourDiv.textDiv.style.marginTop = '10px'
    View.sinumerikView.singleLineDebugContourDiv.textDiv.style.marginLeft = '5px'
    View.sinumerikView.singleLineDebugContourDiv.textDiv.style.marginRight = '10px'
    View.sinumerikView.singleLineDebugContourDiv.appendChild(View.sinumerikView.singleLineDebugContourDiv.textDiv)
    View.sinumerikView.singleLineDebugContourDiv.input = document.createElement("input")
    View.sinumerikView.singleLineDebugContourDiv.input.className = 'sinumerikInput native-key-bindings'
    View.sinumerikView.singleLineDebugContourDiv.input.type = 'text'
    View.sinumerikView.singleLineDebugContourDiv.input.style.width = '12em'
    View.sinumerikView.singleLineDebugContourDiv.appendChild(View.sinumerikView.singleLineDebugContourDiv.input)
    View.sinumerikView.singleLineDebugContourDiv.submitButton = document.createElement("button")
    View.sinumerikView.singleLineDebugContourDiv.submitButton.className = 'sinumerikButton icon-check'
    View.sinumerikView.singleLineDebugContourDiv.submitButton.addEventListener('click', save_contour)
    View.sinumerikView.singleLineDebugContourDiv.appendChild(View.sinumerikView.singleLineDebugContourDiv.submitButton)
    View.sinumerikView.singleLineDebugRightFootDiv2.appendChild(View.sinumerikView.singleLineDebugContourDiv)

    function save_contour() {
        const Editor = atom.workspace.getActiveTextEditor();
        var filename = Editor.getTitle().replace(/\./g, '_').toUpperCase();

        if (View.sinumerikView.programmData && View.sinumerikView.programmData[filename]) {
            if (View.sinumerikView.singleLineDebugContourDiv.input.value.length > 2) {
                View.sinumerikView.programmData[filename].contour = {name: View.sinumerikView.singleLineDebugContourDiv.input.value}
                generateComment()
                console.log('save_contour_file: ', View.sinumerikView.singleLineDebugContourDiv.input.value)
            }
        }
        contour = []
    }

//endregion
    View.sinumerikView.singleLineDebugEquipment = document.createElement('button')
    View.sinumerikView.singleLineDebugEquipment.className = 'sinumerikButton'
    View.sinumerikView.singleLineDebugEquipment.textContent = 'Equipment'
    View.sinumerikView.singleLineDebugEquipment.addEventListener('click', () => {
        View.toggleEquipment()
    })
    View.sinumerikView.singleLineDebugRightFootDiv2.appendChild(View.sinumerikView.singleLineDebugEquipment)


//region first resize
    const editorHeight = atom.workspace.paneContainers.right.element.clientHeight;
    const mainHeightFactor = 0.8;
    View.sinumerikView.singleLineDebugCanvas.width = View.sinumerikView.Panel.offsetWidth - 5;
    View.sinumerikView.singleLineDebugCanvas.height = Math.round((editorHeight - 40) * mainHeightFactor) - 45;
    View.sinumerikView.singleLineDebugParseStringDiv.style.width = View.sinumerikView.singleLineDebugCanvas.width;
    View.sinumerikView.singleLineDebugStringParseDetailsDiv.style.width = View.sinumerikView.singleLineDebugCanvas.width;
    View.sinumerikView.singleLineDebugStringParseDetailsDiv.style.height = `${Math.round((editorHeight - 40) * mainHeightFactor) - 45}px`;
//endregion

}

const moveSLDcanvas = (event) => {
    if (View.sinumerikView.singleLineDebugCanvas.action === 'drag') {
        const mouseDownPoint = View.sinumerikView.singleLineDebugData.mouseDownPoint
        const actPoint = [event.offsetX, event.offsetY]
        if (Math.max(...mouseDownPoint.map((ax, i) => Math.abs(ax - actPoint[i]))) < 10) return
        const centerPoint = View.sinumerikView.singleLineDebugData.canvasCentrPoint
        const scale = View.sinumerikView.singleLineDebugCanvas.width / View.sinumerikView.singleLineDebugData.canvasRange
        centerPoint[0] += (mouseDownPoint[0] - actPoint[0]) / scale
        centerPoint[1] += (mouseDownPoint[1] - actPoint[1]) / scale
        mouseDownPoint.forEach((p, i) => mouseDownPoint[i] = actPoint[i])
        transformByRange()
        changeCanvas()
    }
    if (View.sinumerikView.singleLineDebugCanvas.action === 'rotation') {
        console.log('rotation')
    }
}

export function resizeSLDComponents(panelWidth) {
    const editorHeight = atom.workspace.paneContainers.right.element.clientHeight;

    const mainHeightFactor = 0.8;
    View.sinumerikView.singleLineDebugCanvas.width = Math.round(panelWidth) - 5;
    View.sinumerikView.singleLineDebugCanvas.height = Math.round((editorHeight - 40) * mainHeightFactor) - 45;
    if (!!View.sinumerikView.singleLineDebugThree) {
        View.sinumerikView.singleLineDebugThree.setSize(Math.round(panelWidth) - 5, Math.round((editorHeight - 40) * mainHeightFactor - 5))
    }
    View.sinumerikView.singleLineDebugParseStringDiv.style.width = View.sinumerikView.singleLineDebugCanvas.width;
    View.sinumerikView.singleLineDebugStringParseDetailsDiv.style.width = View.sinumerikView.singleLineDebugCanvas.width;
    View.sinumerikView.singleLineDebugStringParseDetailsDiv.style.height = `${Math.round((editorHeight - 40) * mainHeightFactor) - 45}px`;
}

function axesByPlane() {

    const Editor = atom.workspace.getActiveTextEditor();
    var filename = Editor.getTitle().replace(/\./g, '_').toUpperCase();

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
        View.sinumerikView.singleLineDebugData.CanvasAxes.axes[1] = 'Z';
        View.sinumerikView.singleLineDebugData.CanvasAxes.axes[0] = 'Y';
        // View.sinumerikView.singleLineDebugData.CanvasAxes.reverseAxes = '0';
    }
}

function canvasRange(event) {
    const Editor = atom.workspace.getActiveTextEditor();
    const filename = Editor.getPath().replace(/\./g, '_').toUpperCase();
    //console.log('Range event' + event);

    if (event == '' || event == undefined) {
        View.sinumerikView.singleLineDebugData.canvasCentrPoint = [0, 0];
        View.sinumerikView.singleLineDebugData.canvasRange = View.sinumerikView.singleLineDebugCanvas.width;
        const savedPosition = View.sinumerikView.singleLineDebugData.canvasPositions.find(el => el.filename === filename)
        if (savedPosition) {
            View.sinumerikView.singleLineDebugData.canvasCentrPoint = savedPosition.centerPoint
            View.sinumerikView.singleLineDebugData.canvasRange = savedPosition.range
        } else {
            View.sinumerikView.singleLineDebugData.canvasPositions.push(
                {
                    filename,
                    centerPoint: View.sinumerikView.singleLineDebugData.canvasCentrPoint,
                    range: View.sinumerikView.singleLineDebugData.canvasRange
                }
            )
        }
    }

    if (event === 'resetPosition') {
        View.sinumerikView.singleLineDebugData.canvasCentrPoint = [0, 0];
        View.sinumerikView.singleLineDebugData.canvasRange = View.sinumerikView.singleLineDebugCanvas.width;
    }

    View.sinumerikView.singleLineDebugData.canvasHeightFactor = View.sinumerikView.singleLineDebugCanvas.height / View.sinumerikView.singleLineDebugCanvas.width;

    var scaleMoveFactor = Number((View.sinumerikView.singleLineDebugData.canvasRange / 20).toPrecision(1));

    //console.log('factor ' + scaleMoveFaсtor);


    if (event === 'scaleMinusButtonClick') {
        View.sinumerikView.singleLineDebugData.canvasRange += scaleMoveFactor;
    }

    if (event === 'scalePlusButtonClick') {
        View.sinumerikView.singleLineDebugData.canvasRange -= scaleMoveFactor;
    }

    if (event === ('moveLeftButtonClick')) {
        View.sinumerikView.singleLineDebugData.canvasCentrPoint[0] -= scaleMoveFactor;
    }

    if (event === ('moveRightButtonClick')) {
        View.sinumerikView.singleLineDebugData.canvasCentrPoint[0] += scaleMoveFactor;
    }

    if (event === ('moveDownButtonClick')) {
        View.sinumerikView.singleLineDebugData.canvasCentrPoint[1] += scaleMoveFactor;
    }

    if (event === ('moveUpButtonClick')) {
        View.sinumerikView.singleLineDebugData.canvasCentrPoint[1] -= scaleMoveFactor;
    }

    const position = View.sinumerikView.singleLineDebugData.canvasPositions.find(el => el.filename === filename)
    position.centerPoint = View.sinumerikView.singleLineDebugData.canvasCentrPoint
    position.range = View.sinumerikView.singleLineDebugData.canvasRange

    // console.log('Range:' + View.sinumerikView.singleLineDebugData.canvasRange);
    // console.log('Center:' + View.sinumerikView.singleLineDebugData.canvasCentrPoint);

    transformByRange();
    changeCanvas();
}

function transformByRange() {
    // console.log('transformByRange')
    View.sinumerikView.singleLineDebugData.canvasTransform.scale = (View.sinumerikView.singleLineDebugCanvas.width / View.sinumerikView.singleLineDebugData.canvasRange);
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

    ctx.setTransform(1, 0, 0, 1, 0, 0);
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

    clearTimeout(ctx_timeout);

    //TODO сделать отрисовку вершины инструмента при включенном slow debug

    if (!View.sinumerikView.parseData.canvas.length) {
        return
    }

    if (View.sinumerikView.parseData.canvas[0].blank !== undefined) {
        blank = []

        //Вытаскиваем заготовку из массива элементов
        while (View.sinumerikView.parseData.canvas.length && View.sinumerikView.parseData.canvas[0].blank !== undefined) {
            blank.push(View.sinumerikView.parseData.canvas.shift())
        }


        // Соединяем последний элемент заготовки с первым
        if (blank.length) {
            const axes_names = ['X', 'Y', 'Z']
            let connector = {...blank[blank.length - 1]}
            axes_names.forEach(axis => {
                connector[axis] = blank[1][`${axis}_start`]
                connector[`${axis}_start`] = blank[blank.length - 1][axis]
            })
            // Удаляем первый элемент заготовки (Подход)
            blank.shift()
            //Добавляем соединитель
            blank.push(connector)
        }
        View.sinumerikView.parseData.blank = blank
    }

    if (View.sinumerikView.parseData.canvas[0].contour !== undefined) {
        contour = []

        //Вытаскиваем контур из массива элементов
        while (View.sinumerikView.parseData.canvas.length && View.sinumerikView.parseData.canvas[0].contour !== undefined) {
            contour.push(View.sinumerikView.parseData.canvas.shift())
        }

        // Соединяем последний элемент контура с первым
        if (contour.length) {
            const axes_names = ['X', 'Y', 'Z']
            let connector = {...contour[contour.length - 1]}
            axes_names.forEach(axis => {
                connector[axis] = contour[1][`${axis}_start`]
                connector[`${axis}_start`] = contour[contour.length - 1][axis]
            })
            // Удаляем первый элемент контура (Подход)
            contour.shift()
            //Добавляем соединитель
            contour.push(connector)
        }
        View.sinumerikView.parseData.contour = contour
    }

    var axes = View.sinumerikView.singleLineDebugData.CanvasAxes.axes;
    var factor = [1, -1];
    if (View.sinumerikView.singleLineDebugData.CanvasAxes.reverseAxes) {
        factor[View.sinumerikView.singleLineDebugData.CanvasAxes.reverseAxes] *= -1;
    }
    // View.sinumerikView.singleLineDebugData.CanvasAxes.axes[0] = 'Z';
    // View.sinumerikView.singleLineDebugData.CanvasAxes.axes[1] = 'Y';
    // View.sinumerikView.singleLineDebugData.CanvasAxes.reverseAxes = '0';

    if (blank.length) {
        if (View.sinumerikView.contourEditData) {
            View.sinumerikView.contourEditData.blank = blank.map(el => {
                return {
                    start: {
                        X: el.X_start,
                        Y: el.Y_start,
                        Z: el.Z_start,
                    },
                    end: {
                        X: el.X,
                        Y: el.Y,
                        Z: el.Z,
                    }
                }
            })
        }
        ctx_draw_fill(blank, 'blank')
    }
    if (contour.length) {
        if (View.sinumerikView.contourEditData) {
            View.sinumerikView.contourEditData.contour = contour.map(el => {
                return {
                    start: {
                        X: el.X_start,
                        Y: el.Y_start,
                        Z: el.Z_start,
                    },
                    end: {
                        X: el.X,
                        Y: el.Y,
                        Z: el.Z,
                    }
                }
            })
        }
        ctx_draw_fill(contour, 'contour')
    }

    if (View.sinumerikView.singleLineDebugHelpDiv.CompMathCheckbox.checked && !View.sinumerikView.parseData.calcComp) {
        calcToolCompensation()
    }


    if (!View.sinumerikView.singleLineDebugInfoDiv.slowDebugCheck.checked && View.sinumerikView.singleLineDebugInfoDiv.pauseCheck.level === 0) {
        View.sinumerikView.parseData.canvas.forEach(function (element) {
            ctx_draw(element);
        });
    } else {
        const axes_names = ['X', 'Y', 'Z'];
        var array_of_little_elements = [];

        if (!View.sinumerikView.parseData.drawnElementsNums) {
            if (View.sinumerikView.singleLineDebugInfoDiv.slowDebugCheck.checked) {
                View.sinumerikView.parseData.canvas.forEach((element) => {
                    if (element.type != 'msg' || element.type != 'pause') {
                        var element_length = 0;
                        axes_names.forEach(function (axis) {
                            element_length += (element[axis] - element[`${axis}_start`]) ** 2;
                        });
                        element_length = Math.sqrt(element_length);

                        // console.log(element_length);
                        if (element_length > 1) {
                            var element_devider = 1;
                            if (element_length > 20) {
                                element_devider = Math.round(element_length / 20)
                            }
                            var little_element_nums = Math.round(element_length / element_devider);
                            var little_element = JSON.parse(JSON.stringify(element));
                            for (let i = 0; i < little_element_nums; i++) {
                                axes_names.forEach((axis) => {
                                    little_element[axis] = element[`${axis}_start`] + (element[axis] - element[`${axis}_start`]) * ((i + 1) / little_element_nums);
                                    little_element[`${axis}_start`] = element[`${axis}_start`] + (element[axis] - element[`${axis}_start`]) * (i / little_element_nums);
                                })
                                array_of_little_elements.push(JSON.parse(JSON.stringify(little_element)));
                            }
                        } else {
                            array_of_little_elements.push(element);
                        }
                    } else {
                        array_of_little_elements.push(element);
                    }
                })
            } else {
                array_of_little_elements = View.sinumerikView.parseData.canvas;
            }
        }

        if (array_of_little_elements.length) {
            View.sinumerikView.parseData.elements = array_of_little_elements
        }

        if (View.sinumerikView.parseData.drawnElementsNums) {
            View.sinumerikView.parseData.elements.slice
            (0, View.sinumerikView.parseData.drawnElementsNums)
                .forEach(el => ctx_draw(el, false))
        }

        array_of_little_elements = View.sinumerikView.parseData.elements.slice(View.sinumerikView.parseData.drawnElementsNums)

        var idx = 0;
        var timeout = 5;
        var pause = 0;
        var timeout_K = 1;
        if (!View.sinumerikView.singleLineDebugInfoDiv.slowDebugCheck.checked) {
            timeout_K = 0;
        }

        ctx_timeout = setTimeout(function draw() {
            if (array_of_little_elements.length === 0) {
                return
            }
            if (pause !== 1) {
                pause = ctx_draw(array_of_little_elements[idx], true);

                timeout = timeout_K * (array_of_little_elements[idx].type == 'G0' ? 5 : 100);

                //region decrease timeouf for too small G1 elements

                if (timeout > 0 && array_of_little_elements[idx].type == 'G1') {
                    let axes = ['X', 'Y', 'Z']
                    let length_of_little_element = Math.sqrt(axes.reduce(
                        (total, axis) => {
                            let el = array_of_little_elements[idx]
                            return total + ((el[axis] - el[`${axis}_start`]) ** 2)
                        }, 0
                    ))
                    if (length_of_little_element < 0.3) {
                        timeout = 0
                    } else {
                        timeout *= View.sinumerikView.singleLineDebugInfoDiv.slowDebugCheckMult.value * length_of_little_element
                    }
                }
                //endregion

                if (!pause) {
                    idx++;
                    View.sinumerikView.parseData.drawnElementsNums++
                }
            } else {
                timeout = 200;
                if (!View.sinumerikView.msgDiv.parentElement) {
                    pause = 0;
                    idx++
                    View.sinumerikView.parseData.drawnElementsNums++
                }
            }
            if (idx < array_of_little_elements.length && !(idx === array_of_little_elements.length - 1 && pause)) {
                ctx_timeout = setTimeout(draw, timeout);
            }
        }, timeout);
    }

    function ctx_draw(element, msg) {
        if (element === undefined) {
            return
        }
        let pause = 0
        if ((View.sinumerikView.singleLineDebugInfoDiv.slowDebugCheck.checked
                || View.sinumerikView.singleLineDebugInfoDiv.pauseCheck.level > 0)
            && msg) {
            const level = View.sinumerikView.singleLineDebugInfoDiv.pauseCheck.level

            if (element.type === 'msg' && level >= 3) {
                msg_div(element);
                pause = 1
            }

            if (element.type === 'pause') {
                if (element.value === 'M0' ||
                    (element.value === 'M1' && level > 1)) {
                    msg_div(element)
                    pause = 1
                }
                if (element.value === 'The end'
                    && !View.sinumerikView.singleLineDebugInfoDiv.slowDebugCheck.checked
                    && View.sinumerikView.singleLineDebugInfoDiv.pauseCheck.level === 4
                ) {
                    element.value = element.programName + '. The end.'
                    msg_div(element)
                    pause = 1
                }
            }
        }

        const selectionFactor = View.sinumerikView.selection ?
            (View.sinumerikView.selectionContains(element.row) ? 2 : 0.5) : 1

        ctx.beginPath();
        ctx.strokeStyle = canvasElementColor(element.type, element.toolRadiusCompensation);
        ctx.lineWidth = 2 * selectionFactor / View.sinumerikView.singleLineDebugData.canvasTransform.scale
        ctx.moveTo(factor[0] * element[`${axes[0]}_start`], factor[1] * element[`${axes[1]}_start`])
        if (element.type.match(/G1|G0|G33/)) {
            //ctx.lineTo(100,100);
            ctx.lineTo(factor[0] * element[`${axes[0]}`], factor[1] * element[`${axes[1]}`]);
        } else {
            ctx.lineTo(factor[0] * element[`${axes[0]}`], factor[1] * element[`${axes[1]}`]);
        }
        ctx.stroke();
        return pause;
    }

    function ctx_draw_fill(array, type) {
        ctx.beginPath()
        ctx.fillStyle = (type === 'blank' ? 'lightgray' : 'darkgray')
        // ctx.lineWidth = 2 / View.sinumerikView.singleLineDebugData.canvasTransform.scale;
        let element = array[0]
        ctx.moveTo(factor[0] * element[`${axes[0]}_start`], factor[1] * element[`${axes[1]}_start`])
        array.forEach(element => {
            ctx.lineTo(factor[0] * element[`${axes[0]}`], factor[1] * element[`${axes[1]}`]);
        })
        ctx.fill();
        return 0;
    }

}


function canvasElementColor(type, toolRadiusCompensation) {
    if (type == 'G0') {
        return 'red';
    } else {
        if (toolRadiusCompensation === 'G40') {
            return 'green'
        }
        if (toolRadiusCompensation === 'G41') {
            return 'greenyellow'
        }
        if (toolRadiusCompensation === 'G42') {
            return 'springgreen'
        }
        if (toolRadiusCompensation === 'AutoInsert') {
            return 'goldenrod'
        }
        if (toolRadiusCompensation === 'offn_loop') {
            return 'lightcyan'
        }
        return 'green';
    }
}


function drawAxes(ctx) {
    var axesColor = 'rgba(47, 79, 79, 0.5)';
    var arrowSide = View.sinumerikView.singleLineDebugData.canvasRange / 40;
    var reverseFactor = [1, -1];
    View.sinumerikView.singleLineDebugData.canvasHeightFactor = View.sinumerikView.singleLineDebugCanvas.height / View.sinumerikView.singleLineDebugCanvas.width;

    //текст исчезает при большом увеличении. Надо переделать отрисовку системы координат. Либо сдалать 1мм = 1ед canvas
    ctx.font = `${20 / View.sinumerikView.singleLineDebugData.canvasTransform.scale}px Verdana`;

    // var axes = View.sinumerikView.singleLineDebugData.CanvasAxes.axes;
    var factor = [1, -1];

    var reverse = [1, 1];
    // console.log(View.sinumerikView.singleLineDebugData.CanvasAxes.axes.indexOf('X'));
    // console.log(View.sinumerikView.programmData[View.sinumerikView.parseData.filename].machine.machineType);
    // console.log(View.sinumerikView.programmData[View.sinumerikView.parseData.filename].machine.firstCarriage.position);
    // console.log(View.sinumerikView);
    if (View.sinumerikView.singleLineDebugData.CanvasAxes.axes.indexOf('X') >= 0 &&
        View.sinumerikView.singleLineDebugData.machine.machineType == 'Lathe') {
        if (View.sinumerikView.singleLineDebugData.machine.subType == 'Horizontal' &&
            View.sinumerikView.singleLineDebugData.machine.firstCarriage.position == 'Front') {
            reverse[View.sinumerikView.singleLineDebugData.CanvasAxes.axes.indexOf('X')] = -1;
        }
        if (View.sinumerikView.singleLineDebugData.machine.subType == 'Vertical' &&
            View.sinumerikView.singleLineDebugData.machine.firstCarriage.position == 'Rear') {
            reverse[View.sinumerikView.singleLineDebugData.CanvasAxes.axes.indexOf('X')] = -1;
        }
    }
    if (View.sinumerikView.parseData.diamon) {
        reverse[View.sinumerikView.singleLineDebugData.CanvasAxes.axes.indexOf('X')] *= 2;
    }

    //Горизонтальная линейка
    ctx.strokeStyle = axesColor;
    ctx.fillStyle = axesColor;
    ctx.beginPath();
    ctx.moveTo(
        -0.49 * factor[0] * View.sinumerikView.singleLineDebugData.canvasRange + View.sinumerikView.singleLineDebugData.canvasCentrPoint[0],
        -0.49 * factor[1] * View.sinumerikView.singleLineDebugData.canvasRange * View.sinumerikView.singleLineDebugData.canvasHeightFactor + View.sinumerikView.singleLineDebugData.canvasCentrPoint[1]
    );
    ctx.lineTo(
        0.49 * factor[0] * View.sinumerikView.singleLineDebugData.canvasRange + View.sinumerikView.singleLineDebugData.canvasCentrPoint[0],
        -0.49 * factor[1] * View.sinumerikView.singleLineDebugData.canvasRange * View.sinumerikView.singleLineDebugData.canvasHeightFactor + View.sinumerikView.singleLineDebugData.canvasCentrPoint[1]
    );
    ctx.lineWidth = 1 / View.sinumerikView.singleLineDebugData.canvasTransform.scale;
    ctx.stroke();
    ctx.fillText(
        View.sinumerikView.singleLineDebugData.CanvasAxes.axes[0],
        0.47 * factor[0] * View.sinumerikView.singleLineDebugData.canvasRange + View.sinumerikView.singleLineDebugData.canvasCentrPoint[0],
        -0.48 * factor[1] * View.sinumerikView.singleLineDebugData.canvasRange * View.sinumerikView.singleLineDebugData.canvasHeightFactor + View.sinumerikView.singleLineDebugData.canvasCentrPoint[1]
    );

    var scale_length = 1000;
    while (View.sinumerikView.singleLineDebugData.canvasRange / scale_length < 10) {
        scale_length /= 10;
    }
    if (View.sinumerikView.singleLineDebugData.canvasRange / scale_length > 100) {
        scale_length *= 5;
    }
    if (View.sinumerikView.singleLineDebugData.canvasRange / scale_length > 20) {
        scale_length *= 2;
    }
    // console.log(scale_length);
    //
    // console.log('center: ', View.sinumerikView.singleLineDebugData.canvasCentrPoint[0]);
    var base_for_scale_pipki = 5 * scale_length * Math.round(View.sinumerikView.singleLineDebugData.canvasCentrPoint[0] / (5 * scale_length));

    // console.log(base_for_scale_pipki);
    //палочки на горизонтальной линейке
    var pipki_num = Math.round(View.sinumerikView.singleLineDebugData.canvasRange / scale_length);
    // console.log(View.sinumerikView.singleLineDebugData.canvasTransform.scale);
    var font_scale_base = 16;
    if (View.sinumerikView.singleLineDebugData.canvasTransform.scale > 1600) {
        font_scale_base = View.sinumerikView.singleLineDebugData.canvasTransform.scale / 99
    }
    ctx.font = `${font_scale_base / View.sinumerikView.singleLineDebugData.canvasTransform.scale}px Verdana`;
    for (let i = 0; i < pipki_num; i++) {
        var five_factor;
        if ((base_for_scale_pipki + (i - Math.round(pipki_num / 2)) * scale_length) % (5 * scale_length) == 0) {
            ctx.fillText(
                (Math.round((base_for_scale_pipki + (i - Math.round(pipki_num / 2)) * scale_length) * 10000) * reverse[0] / 10000).toString(),
                base_for_scale_pipki + (i - Math.round(pipki_num / 2)) * scale_length,
                -0.465 * factor[1] * View.sinumerikView.singleLineDebugData.canvasRange * View.sinumerikView.singleLineDebugData.canvasHeightFactor + View.sinumerikView.singleLineDebugData.canvasCentrPoint[1]
            );
            five_factor = 0.47;
        } else {
            five_factor = 0.48;
        }


        // ctx.fillStyle = axesColor;
        ctx.beginPath();
        ctx.moveTo(
            base_for_scale_pipki + (i - Math.round(pipki_num / 2)) * scale_length,
            -0.49 * factor[1] * View.sinumerikView.singleLineDebugData.canvasRange * View.sinumerikView.singleLineDebugData.canvasHeightFactor + View.sinumerikView.singleLineDebugData.canvasCentrPoint[1]
        );
        ctx.lineTo(
            base_for_scale_pipki + (i - Math.round(pipki_num / 2)) * scale_length,
            -1 * five_factor * factor[1] * View.sinumerikView.singleLineDebugData.canvasRange * View.sinumerikView.singleLineDebugData.canvasHeightFactor + View.sinumerikView.singleLineDebugData.canvasCentrPoint[1]
        );
        ctx.lineWidth = 1 / View.sinumerikView.singleLineDebugData.canvasTransform.scale;
        ctx.stroke();

    }


    //Вертикальная линейка
    // ctx.fillStyle = axesColor;
    ctx.beginPath();
    ctx.moveTo(
        -0.49 * factor[0] * View.sinumerikView.singleLineDebugData.canvasRange + View.sinumerikView.singleLineDebugData.canvasCentrPoint[0],
        -0.49 * factor[1] * View.sinumerikView.singleLineDebugData.canvasRange * View.sinumerikView.singleLineDebugData.canvasHeightFactor + View.sinumerikView.singleLineDebugData.canvasCentrPoint[1]
    );
    ctx.lineTo(
        -0.49 * factor[0] * View.sinumerikView.singleLineDebugData.canvasRange + View.sinumerikView.singleLineDebugData.canvasCentrPoint[0],
        0.49 * factor[1] * View.sinumerikView.singleLineDebugData.canvasRange * View.sinumerikView.singleLineDebugData.canvasHeightFactor + View.sinumerikView.singleLineDebugData.canvasCentrPoint[1]
    );
    ctx.lineWidth = 1 / View.sinumerikView.singleLineDebugData.canvasTransform.scale;
    ctx.stroke();
    ctx.fillText(
        View.sinumerikView.singleLineDebugData.CanvasAxes.axes[1],
        -0.47 * factor[0] * View.sinumerikView.singleLineDebugData.canvasRange + View.sinumerikView.singleLineDebugData.canvasCentrPoint[0],
        0.48 * factor[1] * View.sinumerikView.singleLineDebugData.canvasRange * View.sinumerikView.singleLineDebugData.canvasHeightFactor + View.sinumerikView.singleLineDebugData.canvasCentrPoint[1]
    );

    base_for_scale_pipki = 5 * scale_length * Math.round(View.sinumerikView.singleLineDebugData.canvasCentrPoint[1] / (5 * scale_length));

    //палочки на вертикальной линейке
    pipki_num = Math.round(View.sinumerikView.singleLineDebugData.canvasRange * View.sinumerikView.singleLineDebugData.canvasHeightFactor / scale_length);

    for (let i = 0; i < pipki_num; i++) {
        var five_factor = 0.48;
        if ((base_for_scale_pipki + (i - Math.round(pipki_num / 2)) * scale_length) % (5 * scale_length) == 0) {
            ctx.fillText(
                (Math.round((base_for_scale_pipki + (i - Math.round(pipki_num / 2)) * scale_length) * 10000 * factor[1]) * reverse[1] / 10000).toString(),
                -0.47 * factor[0] * View.sinumerikView.singleLineDebugData.canvasRange + View.sinumerikView.singleLineDebugData.canvasCentrPoint[0],
                base_for_scale_pipki + (i - Math.round(pipki_num / 2)) * scale_length
            );
            five_factor = 0.47;
        } else {
            five_factor = 0.48;
        }


        ctx.fillStyle = axesColor;
        ctx.beginPath();
        ctx.moveTo(
            -0.49 * factor[0] * View.sinumerikView.singleLineDebugData.canvasRange + View.sinumerikView.singleLineDebugData.canvasCentrPoint[0],
            base_for_scale_pipki + (i - Math.round(pipki_num / 2)) * scale_length,
        );
        ctx.lineTo(
            -1 * five_factor * factor[0] * View.sinumerikView.singleLineDebugData.canvasRange + View.sinumerikView.singleLineDebugData.canvasCentrPoint[0],
            base_for_scale_pipki + (i - Math.round(pipki_num / 2)) * scale_length,
        );
        ctx.lineWidth = 1 / View.sinumerikView.singleLineDebugData.canvasTransform.scale;
        ctx.stroke();

    }


}
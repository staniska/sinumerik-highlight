'use babel';

var fs = require("fs-extra");

import View from "./sinumerik";
import {changeActiveTab} from './changeTabs';

export function machineManager(event) {
    //console.log("MM " + event);
    if (event == 'machineManagerButtonClick') {
        changeActiveTab('machineManager');
        View.sinumerikView.counturEditButton.className = 'sinumerikPanelHeadButton';
        View.sinumerikView.singleLineDebugButton.className = 'sinumerikPanelHeadButton';
        View.sinumerikView.machineManagerButton.className = 'sinumerikPanelHeadButtonSelect';
    }

    if (event == 'machineManagerMachineSearchButtonClick') {
        var text = View.sinumerikView.machineManagerMachineSearchInput.value;
        console.log('Text: ' + text);
    }

    if (event == 'machineManagerCreateFileButtonClick') {
        createMachineDataFile();
    }

    if (event == 'machineManagerNewMachineButtonClick') {
        machineManagerCreateMachineMainDiv(event);
    }
    if (event == 'createNewMachineLatheSelect') {
        machineManagerCreateMachineMainDiv(event);
    }
    if (event == 'createNewMachineLatheSubTypeSelect') {
        machineManagerCreateMachineMainDiv(event);
    }
    if (event == 'createNewMachineLatheFirstCarriagePositionSelected') {
        machineManagerCreateMachineMainDiv(event);
    }
    if (event == 'createNewMachineMillSelect') {
        machineManagerCreateMachineMainDiv(event);
    }
    if (event == 'createNewMachineLatheSecondCarriageAddButtonClick') {
        machineManagerCreateMachineMainDiv(event);
    }
    if (event == 'createNewMachineLatheSecondCarriageRemoveButtonClick') {
        machineManagerCreateMachineMainDiv(event);
    }
    if (event == 'createNewMachineLatheSubTypeVericalSelect') {
        machineManagerCreateMachineMainDiv(event);
    }
    if (event == 'createNewMachineLatheSubTypeHorizontalSelect') {
        machineManagerCreateMachineMainDiv(event);
    }
    if (event == 'createNewMachineLatheSecondSpindleAddButtonClick') {
        machineManagerCreateMachineMainDiv(event);
    }
    if (event == 'createNewMachineLatheSecondSpindleRemoveButtonClick') {
        machineManagerCreateMachineMainDiv(event);
    }



    if (!View.sinumerikView.machineData) {
        loadMachineData();
    } else {
       // console.log(View.sinumerikView.machineData);
    }

}


function loadMachineData () {
    var machineFilePath = atom.packages.getPackageDirPaths()[0] + '/sinumerik/userData/machines.json';
    fs.readFile(machineFilePath, function (err, data) {
        if (err) {
            if (err.code == 'ENOENT') {
                if (!View.sinumerikView.machineManagerCreateFileDiv) {
                    machineManagerCreateFileDiv();
                }
                return;
            } else {
                console.log('Read machine data error' + err);
                return;
            }
        }
        //console.log(data);
        try {
            View.sinumerikView.machineData = JSON.parse(data);
        } catch (e) {
            console.log(e);
        }
    });
    //
    //

}

function createMachineDataFile() {
    var machineFilePath = atom.packages.getPackageDirPaths()[0] + '/sinumerik/userData/machines.json';
    fs.open(machineFilePath, 'w+', (err, fd) => {
        if (err) {
            console.log('machineDataFile create error' + err);
            throw err;
            return;
        } else {
            console.log('machineDataFile created');
            createNewMachineDataJson();
            fs.write(fd, JSON.stringify(View.sinumerikView.machineData), (err, written, str) => {
                // console.log('FS write');
                // console.log('err ' + err);
                // console.log('written ' + written);
                // console.log('string' + str);
            });

            fs.close(fd, (err) => {
                if (err) {
                    console.log(err);
                    throw err;
                } else {
                    View.sinumerikView.machineManagerRightContainer.removeChild(View.sinumerikView.machineManagerCreateFileDiv);
                }
            });
        }
    });

    function createNewMachineDataJson() {
        View.sinumerikView.machineData = {};
        var machineData = View.sinumerikView.machineData;
        machineData.machines = {};
        // machineData.availableMacinesAndProperties = JSON.parse('{ \
        //                             "machine": { \
        //                                 "Lathe": { \
        //                                     "with drived tool": 0, \
        //                                     "with Y axis": 0, \
        //                                     "tool turret": ["front", "rear"], \
        //                                     "main spindle number": 1, \
        //                                     "drive tool spindle": 2, \
        //                                     "DIAMON preset (only X axis)": 1, \
        //                                     "spindle Axis name (eg \'1\')": "" \
        //                                  } \
        //                             }, \
        //                             "name": "machine1" \
        //                         }');
    }

}

function machineManagerCreateFileDiv () {
    let sinumerikEventHandler = View.sinumerikView.eventRouter.route.bind(this);

    //region Text
    View.sinumerikView.machineManagerCreateFileDiv = document.createElement('div');
    View.sinumerikView.machineManagerCreateFileDiv.innerText = 'Machine data file does not exist. ' +
        'Click a button to create it. \n\n';
    View.sinumerikView.machineManagerCreateFileDiv.style.fontWeight = 'bold';
    View.sinumerikView.machineManagerCreateFileDiv.style.marginTop = '10px';
    View.sinumerikView.machineManagerCreateFileDiv.style.color = 'firebrick';
    View.sinumerikView.machineManagerCreateFileDiv.align = 'center';
    //endregion

    //region Button
    View.sinumerikView.machineManagerCreateFileButton  = document.createElement('Button');
    View.sinumerikView.machineManagerCreateFileButton.innerText = 'Create\nFile';
    View.sinumerikView.machineManagerCreateFileButton.style.color = '#2E2E2E';
    View.sinumerikView.machineManagerCreateFileButton.addEventListener('click', function() {
        sinumerikEventHandler('{"emitter": "machineManager", "event": "machineManagerCreateFileButtonClick"}');
    });
    View.sinumerikView.machineManagerCreateFileDiv.appendChild(View.sinumerikView.machineManagerCreateFileButton);
    //endregion
    View.sinumerikView.machineManagerRightContainer.appendChild(View.sinumerikView.machineManagerCreateFileDiv);
}

function machineManagerCreateMachineMainDiv(event) {
    let sinumerikEventHandler = View.sinumerikView.eventRouter.route.bind(this);

    if (event == 'createNewMachineMillSelect') {
        while (View.sinumerikView.machineManagerCreateMachineMainDiv.children.length > 4) {
            View.sinumerikView.machineManagerCreateMachineMainDiv.removeChild(View.sinumerikView.machineManagerCreateMachineMainDiv.children[3]);
        }
    }

    if (event == 'createNewMachineLatheSubTypeVericalSelect') {
        if (View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.firstSpindleDiv.secondSpindleButton && View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.firstSpindleDiv.secondSpindleButton.parentElement) {
            View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.firstSpindleDiv.removeChild(View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.firstSpindleDiv.secondSpindleButton);
        }
        if (View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.secondSpindleDiv) {
            if (View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.secondSpindleDiv.parentElement) {
                View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.removeChild(View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.secondSpindleDiv);
            }
        }
    }
    if (event == 'createNewMachineLatheSubTypeHorizontalSelect') {
        if (View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.firstSpindleDiv) {
            if (!View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.secondSpindleDiv || !View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.secondSpindleDiv.parentElement) {
                View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.firstSpindleDiv.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.firstSpindleDiv.secondSpindleButton);
            }
        }
    }



    if (event == 'createNewMachineLatheSecondCarriageRemoveButtonClick') {
        View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.removeChild(View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv);
        View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageAddButton);
    }

    if (event == 'createNewMachineLatheSecondCarriageAddButtonClick') {
        console.log(event);
        if (!View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv) {
            console.log('create second carriage div');
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv = document.createElement('div');
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.className = 'sinumerikDiv sinumerikBorderDiv';

            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.head = document.createElement('div');
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.head.className = 'sinumerikMachineManagerHead';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.head.innerText = 'Second carriage properties';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.head);
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.positionSelectTitle = document.createElement('span');
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.positionSelectTitle.innerText = 'Position';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.positionSelectTitle);

            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.positionSelect = document.createElement('select');
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.positionSelect.className = 'sinumerikSelect';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.positionSelect.title = 'Carriage position relative to the rotating axis';

            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.positionSelect.pleaseSelect = document.createElement('option');
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.positionSelect.pleaseSelect.innerText = 'please select';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.positionSelect.pleaseSelect.disabled = 'disabled';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.positionSelect.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.positionSelect.pleaseSelect);

            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.positionSelect.Front = document.createElement('option');
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.positionSelect.Front.innerText = 'Front';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.positionSelect.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.positionSelect.Front);

            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.positionSelect.Rear = document.createElement('option');
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.positionSelect.Rear.innerText = 'Rear';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.positionSelect.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.positionSelect.Rear);

            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.positionSelect.addEventListener('change', function () {
                var type = View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.positionSelect.value;
                console.log('Selected second carriage position:' + type);
                sinumerikEventHandler('{"emitter": "machineManager", "event": "createNewMachineLatheSecondCarriagePositionSelected"}');
            });
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.positionSelect);

            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageRemoveButton = document.createElement('button');
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageRemoveButton.className = 'sinumerikButton icon-dash';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageRemoveButton.title = 'Remove second carriage';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageRemoveButton.innerText = ' Remove second carriage';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageRemoveButton.addEventListener('click', function () {
                sinumerikEventHandler('{"emitter": "machineManager", "event": "createNewMachineLatheSecondCarriageRemoveButtonClick"}');
            });
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageRemoveButton);
        }
        View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.positionSelect.pleaseSelect.selected = true;
        View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.removeChild(View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageAddButton);
        if (!View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.parentElement) {
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv);
        }
    }

    if (event == 'createNewMachineLatheFirstCarriagePositionSelected') {
        View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageAddButton.disabled = false;
    }

    if (event == 'createNewMachineLatheSecondSpindleRemoveButtonClick') {
        View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.removeChild(View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.secondSpindleDiv);
        View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.firstSpindleDiv.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.firstSpindleDiv.secondSpindleButton);
    }

    if (event == 'createNewMachineLatheSecondSpindleAddButtonClick') {

        if (!View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.secondSpindleDiv) {
            View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.secondSpindleDiv = document.createElement('div');
            View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.secondSpindleDiv);
            View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.secondSpindleDiv.className = 'sinumerikDiv sinumerikBorderDiv';
            View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.secondSpindleDiv.head = document.createElement('div');
            View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.secondSpindleDiv.head.className = 'sinumerikMachineManagerHead';
            View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.secondSpindleDiv.head.innerText = 'Please insert second spindle parameters';
            View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.secondSpindleDiv.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.secondSpindleDiv.head);
            View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.secondSpindleDiv.inputNameDiv = document.createElement('div');
            View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.secondSpindleDiv.inputNameDiv.className = 'sinumerikDiv';
            View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.secondSpindleDiv.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.secondSpindleDiv.inputNameDiv);
            View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.secondSpindleDiv.inputNameDiv.innerText = 'Spindle name: ';
            View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.secondSpindleDiv.inputNameDiv.inputName = document.createElement('input');
            View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.secondSpindleDiv.inputNameDiv.inputName.className = 'sinumerikInput native-key-bindings';
            View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.secondSpindleDiv.inputNameDiv.inputName.title = 'This name will be used for spindle moving in Axis mode (G0 C1=90):';
            View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.secondSpindleDiv.inputNameDiv.inputName.type = 'text';
            View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.secondSpindleDiv.inputNameDiv.inputName.style.height = '25px';
            View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.secondSpindleDiv.inputNameDiv.inputName.addEventListener('input', function (e) {
                console.log(View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.secondSpindleDiv.inputNameDiv.inputName.value);
            });
            View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.secondSpindleDiv.inputNameDiv.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.secondSpindleDiv.inputNameDiv.inputName);

            View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.secondSpindleDiv.inputNumDiv = document.createElement('div');
            View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.secondSpindleDiv.inputNumDiv.className = 'sinumerikDiv';
            View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.secondSpindleDiv.inputNumDiv.innerText = 'Spindle number';
            View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.secondSpindleDiv.inputNumDiv.inputNum = document.createElement('input');
            View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.secondSpindleDiv.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.secondSpindleDiv.inputNumDiv);
            View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.secondSpindleDiv.inputNumDiv.inputNum.className = 'sinumerikInput native-key-bindings';
            View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.secondSpindleDiv.inputNumDiv.inputNum.title = 'This number will be used for SETMS and SPCON';
            View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.secondSpindleDiv.inputNumDiv.inputNum.type = 'text';
            View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.secondSpindleDiv.inputNumDiv.inputNum.style.height = '25px';
            View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.secondSpindleDiv.inputNumDiv.inputNum.addEventListener('input', function (e) {
                console.log(View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.secondSpindleDiv.inputNumDiv.inputNum.value);
            });
            View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.secondSpindleDiv.inputNumDiv.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.secondSpindleDiv.inputNumDiv.inputNum);

            View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.secondSpindleDiv.secondSpindleRemoveButton = document.createElement('button');
            View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.secondSpindleDiv.secondSpindleRemoveButton.className = 'sinumerikButton icon-dash';
            View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.secondSpindleDiv.secondSpindleRemoveButton.innerText = '   Remove second spindle';
            View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.secondSpindleDiv.secondSpindleRemoveButton.title = 'Remove second spindle';
            View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.secondSpindleDiv.secondSpindleRemoveButton.addEventListener('click', function () {
                sinumerikEventHandler('{"emitter": "machineManager", "event": "createNewMachineLatheSecondSpindleRemoveButtonClick"}');
            });
            View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.secondSpindleDiv.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.secondSpindleDiv.secondSpindleRemoveButton);
        }

        if (!View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.secondSpindleDiv.parentElement) {
            View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.secondSpindleDiv);
        }
        View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.firstSpindleDiv.removeChild(View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.firstSpindleDiv.secondSpindleButton);
    }

    if (event == 'createNewMachineLatheSubTypeSelect') {
        //region carriage div and fist carriage
        if (!View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv) {
            console.log('create carriage div and first carriage property div');

            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv = document.createElement('div');
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.className = 'sinumerikDiv';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv = document.createElement('div');
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.className = 'sinumerikDiv sinumerikBorderDiv';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.head = document.createElement('div');
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.head.className = 'sinumerikMachineManagerHead';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.head.innerText = 'First carriage parameters';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.head);
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv);

            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.positionSelectTitle = document.createElement('span');
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.positionSelectTitle.innerText = 'Position';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.positionSelectTitle);

            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.positionSelect = document.createElement('select');
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.positionSelect.className = 'sinumerikSelect';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.positionSelect.title = 'Carriage position relative to the rotating axis';

            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.positionSelect.pleaseSelect = document.createElement('option');
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.positionSelect.pleaseSelect.innerText = 'please select';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.positionSelect.pleaseSelect.disabled = 'disabled';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.positionSelect.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.positionSelect.pleaseSelect);

            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.positionSelect.Front = document.createElement('option');
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.positionSelect.Front.innerText = 'Front';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.positionSelect.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.positionSelect.Front);

            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.positionSelect.Rear = document.createElement('option');
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.positionSelect.Rear.innerText = 'Rear';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.positionSelect.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.positionSelect.Rear);

            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.positionSelect.addEventListener('change', function () {
                var type = View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.positionSelect.value;
                console.log('Selected carriage position:' + type);
                sinumerikEventHandler('{"emitter": "machineManager", "event": "createNewMachineLatheFirstCarriagePositionSelected"}');
            });

            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.positionSelect);
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageAddButton = document.createElement('button');
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageAddButton.className = 'sinumerikButton icon-plus';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageAddButton.innerText = 'Add second carriage';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageAddButton.title = 'Add second carriage';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageAddButton.addEventListener('click', function () {
                sinumerikEventHandler('{"emitter": "machineManager", "event": "createNewMachineLatheSecondCarriageAddButtonClick"}');
            });
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageAddButton.disabled = true;
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv);
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageAddButton);
        }
        // if (View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageSelect != undefined) {
        //     View.sinumerikView.machineManagerCreateMachineMainDiv.secondCarriageSelect.pleaseSelect.selected = true;
        // }
        View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.positionSelect.pleaseSelect.selected = true;
        View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageAddButton.disabled = true;
        if (!View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.parentElement) {
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv
            View.sinumerikView.machineManagerCreateMachineMainDiv.insertBefore(View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv, View.sinumerikView.machineManagerCreateMachineMainDiv.submitButtonDiv);
            if (View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv && View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.parentElement) {
                View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.removeChild(View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv);
                View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageAddButton);
            }
        }
        //endregion

        if (!View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv) {
            View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv = document.createElement('div');

            View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.firstSpindleDiv = document.createElement('div');
            View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.firstSpindleDiv);
            View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.firstSpindleDiv.className = 'sinumerikDiv sinumerikBorderDiv';
            View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.firstSpindleDiv.head = document.createElement('div');
            View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.firstSpindleDiv.head.className = 'sinumerikMachineManagerHead';
            View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.firstSpindleDiv.head.innerText = 'Please insert first spindle parameters';
            View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.firstSpindleDiv.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.firstSpindleDiv.head);
            View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.firstSpindleDiv.inputNameDiv = document.createElement('div');
            View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.firstSpindleDiv.inputNameDiv.className = 'sinumerikDiv';
            View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.firstSpindleDiv.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.firstSpindleDiv.inputNameDiv);
            View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.firstSpindleDiv.inputNameDiv.innerText = 'Spindle name';
            View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.firstSpindleDiv.inputNameDiv.inputName = document.createElement('input');
            View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.firstSpindleDiv.inputNameDiv.inputName.className = 'sinumerikInput native-key-bindings';
            View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.firstSpindleDiv.inputNameDiv.inputName.title = 'This name will be used for spindle moving in Axis mode (G0 C1=90):';
            View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.firstSpindleDiv.inputNameDiv.inputName.type = 'text';
            View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.firstSpindleDiv.inputNameDiv.inputName.style.height = '25px';
            View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.firstSpindleDiv.inputNameDiv.inputName.addEventListener('input', function (e) {
                console.log(View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.firstSpindleDiv.inputNameDiv.inputName.value);
            });
            View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.firstSpindleDiv.inputNameDiv.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.firstSpindleDiv.inputNameDiv.inputName);

            View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.firstSpindleDiv.inputNumDiv = document.createElement('div');
            View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.firstSpindleDiv.inputNumDiv.className = 'sinumerikDiv';
            View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.firstSpindleDiv.inputNumDiv.innerText = 'Spindle number';
            View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.firstSpindleDiv.inputNumDiv.inputNum = document.createElement('input');
            View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.firstSpindleDiv.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.firstSpindleDiv.inputNumDiv);
            View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.firstSpindleDiv.inputNumDiv.inputNum.className = 'sinumerikInput native-key-bindings';
            View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.firstSpindleDiv.inputNumDiv.inputNum.title = 'This number will be used for SETMS and SPCON';
            View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.firstSpindleDiv.inputNumDiv.inputNum.type = 'text';
            View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.firstSpindleDiv.inputNumDiv.inputNum.style.height = '25px';
            View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.firstSpindleDiv.inputNumDiv.inputNum.addEventListener('input', function (e) {
                console.log(View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.firstSpindleDiv.inputNumDiv.inputNum.value);
            });
            View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.firstSpindleDiv.inputNumDiv.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.firstSpindleDiv.inputNumDiv.inputNum);

            View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.firstSpindleDiv.secondSpindleButton = document.createElement('button');
            View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.firstSpindleDiv.secondSpindleButton.className = 'sinumerikButton icon-plus';
            View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.firstSpindleDiv.secondSpindleButton.innerText = '   Add second spindle';
            View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.firstSpindleDiv.secondSpindleButton.title = 'Add second spindle';
            View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.firstSpindleDiv.secondSpindleButton.addEventListener('click', function () {
                sinumerikEventHandler('{"emitter": "machineManager", "event": "createNewMachineLatheSecondSpindleAddButtonClick"}');
            });
            View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.firstSpindleDiv.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.firstSpindleDiv.secondSpindleButton);
        }

        if (!View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.parentElement) {
            View.sinumerikView.machineManagerCreateMachineMainDiv.insertBefore(View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv, View.sinumerikView.machineManagerCreateMachineMainDiv.submitButtonDiv);
        }

    }


    if (event == 'createNewMachineLatheSelect') {
        if (!View.sinumerikView.machineManagerCreateMachineMainDiv.subTypeSelectDiv) {
            console.log("subType create");
            View.sinumerikView.machineManagerCreateMachineMainDiv.subTypeSelectDiv = document.createElement('div');
            View.sinumerikView.machineManagerCreateMachineMainDiv.subTypeSelectDiv.className = 'sinumerikDiv';
            View.sinumerikView.machineManagerCreateMachineMainDiv.subTypeSelectDiv.innerText = 'Please select lathe subType';
            View.sinumerikView.machineManagerCreateMachineMainDiv.subTypeSelect = document.createElement('select');
            View.sinumerikView.machineManagerCreateMachineMainDiv.subTypeSelect.className = 'sinumerikSelect';

            View.sinumerikView.machineManagerCreateMachineMainDiv.subTypeSelect.pleaseSelect = document.createElement('option');
            View.sinumerikView.machineManagerCreateMachineMainDiv.subTypeSelect.pleaseSelect.innerText = 'please select';
            View.sinumerikView.machineManagerCreateMachineMainDiv.subTypeSelect.pleaseSelect.disabled = 'disabled';
            View.sinumerikView.machineManagerCreateMachineMainDiv.subTypeSelect.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.subTypeSelect.pleaseSelect);

            View.sinumerikView.machineManagerCreateMachineMainDiv.subTypeSelect.Horizontal = document.createElement('option');
            View.sinumerikView.machineManagerCreateMachineMainDiv.subTypeSelect.Horizontal.innerText = 'Horizontal';
            View.sinumerikView.machineManagerCreateMachineMainDiv.subTypeSelect.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.subTypeSelect.Horizontal);

            View.sinumerikView.machineManagerCreateMachineMainDiv.subTypeSelect.Vertical = document.createElement('option');
            View.sinumerikView.machineManagerCreateMachineMainDiv.subTypeSelect.Vertical.innerText = 'Vertical';

            View.sinumerikView.machineManagerCreateMachineMainDiv.subTypeSelect.addEventListener('change', function () {
                var type = View.sinumerikView.machineManagerCreateMachineMainDiv.subTypeSelect.value
                console.log('Selected subType:' + type);
                sinumerikEventHandler('{"emitter": "machineManager", "event": "createNewMachineLatheSubTypeSelect"}');
                if (type == 'Vertical') {
                    sinumerikEventHandler('{"emitter": "machineManager", "event": "createNewMachineLatheSubTypeVericalSelect"}');
                }
                if (type == 'Horizontal') {
                    sinumerikEventHandler('{"emitter": "machineManager", "event": "createNewMachineLatheSubTypeHorizontalSelect"}');
                }
            });
            View.sinumerikView.machineManagerCreateMachineMainDiv.subTypeSelect.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.subTypeSelect.Vertical);
            View.sinumerikView.machineManagerCreateMachineMainDiv.subTypeSelectDiv.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.subTypeSelect);
        }
        View.sinumerikView.machineManagerCreateMachineMainDiv.subTypeSelect.pleaseSelect.selected = true;
        View.sinumerikView.machineManagerCreateMachineMainDiv.insertBefore(View.sinumerikView.machineManagerCreateMachineMainDiv.subTypeSelectDiv, View.sinumerikView.machineManagerCreateMachineMainDiv.submitButtonDiv);
    }

    //region create main div
    if (!View.sinumerikView.machineManagerCreateMachineMainDiv) {
        View.sinumerikView.machineManagerCreateMachineMainDiv = document.createElement('div');

        //region header
        View.sinumerikView.machineManagerCreateMachineMainDiv.header = document.createElement('div');
        View.sinumerikView.machineManagerCreateMachineMainDiv.header.innerText = 'Create new machine';
        View.sinumerikView.machineManagerCreateMachineMainDiv.header.className = 'sinumerikMachineManagerHead';
        View.sinumerikView.machineManagerCreateMachineMainDiv.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.header);
        //endregion

        //region name input
        View.sinumerikView.machineManagerCreateMachineMainDiv.nameInputDiv = document.createElement('div');
        View.sinumerikView.machineManagerCreateMachineMainDiv.nameInputDiv.className = 'sinumerikDiv';
        View.sinumerikView.machineManagerCreateMachineMainDiv.nameInputDiv.innerText = 'Please enter machine name';
        View.sinumerikView.machineManagerCreateMachineMainDiv.nameInput = document.createElement('input');
        View.sinumerikView.machineManagerCreateMachineMainDiv.nameInput.className = 'sinumerikInput native-key-bindings';
        View.sinumerikView.machineManagerCreateMachineMainDiv.nameInput.type = 'text';
        View.sinumerikView.machineManagerCreateMachineMainDiv.nameInput.style.height = '25px';
        View.sinumerikView.machineManagerCreateMachineMainDiv.nameInput.addEventListener('input', function (e) {
            //TODO тут должна быть функция проверки имени на существование
            console.log(View.sinumerikView.machineManagerCreateMachineMainDiv.nameInput.value);
        });
        View.sinumerikView.machineManagerCreateMachineMainDiv.nameInputDiv.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.nameInput);
        View.sinumerikView.machineManagerCreateMachineMainDiv.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.nameInputDiv);
        //endregion

        //region type selector
        View.sinumerikView.machineManagerCreateMachineMainDiv.typeSelectDiv = document.createElement('div');
        View.sinumerikView.machineManagerCreateMachineMainDiv.typeSelectDiv.innerText = 'Select machine type: ';
        View.sinumerikView.machineManagerCreateMachineMainDiv.typeSelectDiv.className = 'sinumerikDiv'
        View.sinumerikView.machineManagerCreateMachineMainDiv.typeSelect = document.createElement('select');
        View.sinumerikView.machineManagerCreateMachineMainDiv.typeSelect.className = 'sinumerikSelect';

        View.sinumerikView.machineManagerCreateMachineMainDiv.typeSelect.pleaseSelect = document.createElement('option');
        View.sinumerikView.machineManagerCreateMachineMainDiv.typeSelect.pleaseSelect.innerText = 'please select';
        View.sinumerikView.machineManagerCreateMachineMainDiv.typeSelect.pleaseSelect.disabled = 'disabled';
        View.sinumerikView.machineManagerCreateMachineMainDiv.typeSelect.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.typeSelect.pleaseSelect);

        View.sinumerikView.machineManagerCreateMachineMainDiv.typeSelect.Lathe = document.createElement('option');
        View.sinumerikView.machineManagerCreateMachineMainDiv.typeSelect.Lathe.innerText = 'Lathe';
        View.sinumerikView.machineManagerCreateMachineMainDiv.typeSelect.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.typeSelect.Lathe);

        View.sinumerikView.machineManagerCreateMachineMainDiv.typeSelect.Mill = document.createElement('option');
        View.sinumerikView.machineManagerCreateMachineMainDiv.typeSelect.Mill.innerText = 'Mill';
        View.sinumerikView.machineManagerCreateMachineMainDiv.typeSelect.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.typeSelect.Mill);

        View.sinumerikView.machineManagerCreateMachineMainDiv.typeSelect.addEventListener('change', function () {
            var type = View.sinumerikView.machineManagerCreateMachineMainDiv.typeSelect.value
            console.log('Selected type:' + type);
            if (type == 'Lathe') {
                sinumerikEventHandler('{"emitter": "machineManager", "event": "createNewMachineLatheSelect"}');
            }
            if (type == 'Mill') {
                sinumerikEventHandler('{"emitter": "machineManager", "event": "createNewMachineMillSelect"}');
            }

        });

        View.sinumerikView.machineManagerCreateMachineMainDiv.typeSelect.pleaseSelect.selected = true;
        View.sinumerikView.machineManagerCreateMachineMainDiv.typeSelectDiv.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.typeSelect);
        View.sinumerikView.machineManagerCreateMachineMainDiv.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.typeSelectDiv);
        //endregion

        //region submit button
        View.sinumerikView.machineManagerCreateMachineMainDiv.submitButtonDiv = document.createElement('div');
        View.sinumerikView.machineManagerCreateMachineMainDiv.submitButtonDiv.className = 'sinumerikDiv';
        View.sinumerikView.machineManagerCreateMachineMainDiv.submitButton = document.createElement('button');
        View.sinumerikView.machineManagerCreateMachineMainDiv.submitButton.className = 'sinumerikButton';
        View.sinumerikView.machineManagerCreateMachineMainDiv.submitButton.innerText = 'Create Machine';
        View.sinumerikView.machineManagerCreateMachineMainDiv.submitButton.disabled = true;


        View.sinumerikView.machineManagerCreateMachineMainDiv.submitButtonDiv.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.submitButton);
        View.sinumerikView.machineManagerCreateMachineMainDiv.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.submitButtonDiv);
        //endregion

        View.sinumerikView.machineManagerMainWindow.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv);
    }
    //endregion



}

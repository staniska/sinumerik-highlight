'use babel';

//TODO Сделать цвет фона зависимым от темы. Во всем окне.

const fs = require("fs-extra");
const {dialog} = require("electron").remote;

import View from "./sinumerik";
import {changeActiveTab} from './changeTabs';
import {generateComment, loadDataFromComment} from "./inner-comment";
import {loadSnippet} from "./snippets";

export function machineManager(event) {
    if (event === 'machineManagerButtonClick') {
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
    //region create new machines events
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
    if (event == 'createNewMachineSubmitClick') {
        machineManagerCreateMachineMainDiv(event);
    }
    //endregion


    if (event == 'removeMachineButtonClick' ||
        event == 'removeMachineButtonNo' ||
        event == 'removeMachineButtonYes' ||
        event == 'attachMachineButtonClick'||
        event == 'setActiveMachineButtonClick') {
        machineOptionsHandler(event);
    }

    if (event == 'loadMachineDataFromProgrammButtonClick') {
        loadMachineDataFromProgrammFile();
    }


    if (!View.sinumerikView.machineData) {
        loadMachineData();
    } else {
       // console.log(View.sinumerikView.machineData);
    }

}

export function checkMachine() {
    if (View.sinumerikView.activeTab != 'machineManager') {
        return;
    }

    const Editor = atom.workspace.getActiveTextEditor();
    if (Editor === undefined) {
        return
    }
    var filename = Editor.getTitle().replace(/\./g,'_').toUpperCase();

    if (Editor.getTitle().split('.')[1].toUpperCase().match("MPF|SPF")) {
        if (View.sinumerikView.programmData[filename].machine) {
            if (searchMachine(View.sinumerikView.programmData[filename].machine.machineName, true).length == 0) {
                console.log('Не найдено машины с соответствующим именем.', View.sinumerikView.programmData[filename].machine.machineName);
                createMachineDataFromProgrammDiv();
            }
        }
    }
}

function loadMachineDataFromProgrammFile() {
    if (confirm('This function will add the machine in your macines list. Do you agree?')) {
        const Editor = atom.workspace.getActiveTextEditor();
        var filename = Editor.getTitle().replace(/\./g,'_').toUpperCase();

        View.sinumerikView.machineData.machines[`${View.sinumerikView.programmData[filename].machine.machineName}`] = View.sinumerikView.programmData[filename].machine;
        saveMachineData();
        View.sinumerikView.machineManagerMainWindow.removeChild(View.sinumerikView.machineManagerMainWindow.machineDataFromProgramDiv);
    }

}

function createMachineDataFromProgrammDiv() {
    let sinumerikEventHandler = View.sinumerikView.eventRouter.route.bind(this);

    if (!View.sinumerikView.machineManagerMainWindow.machineDataFromProgramDiv) {
        View.sinumerikView.machineManagerMainWindow.machineDataFromProgramDiv = document.createElement('div');
        View.sinumerikView.machineManagerMainWindow.machineDataFromProgramDiv.className = 'sinumerikDiv sinumerikBorderDiv';
        View.sinumerikView.machineManagerMainWindow.machineDataFromProgramDiv.innerText = 'There are not machine associated with the program in your machines list.Click the button to add it';
        View.sinumerikView.machineManagerMainWindow.machineDataFromProgramDiv.addButton = document.createElement('button');
        View.sinumerikView.machineManagerMainWindow.machineDataFromProgramDiv.addButton.className = 'sinumerikButton icon-plus';
        View.sinumerikView.machineManagerMainWindow.machineDataFromProgramDiv.addButton.innerText = 'Add';
        View.sinumerikView.machineManagerMainWindow.machineDataFromProgramDiv.addButton.addEventListener('click', function() {
            sinumerikEventHandler('{"emitter": "machineManager", "event": "loadMachineDataFromProgrammButtonClick"}');
        });
        View.sinumerikView.machineManagerMainWindow.machineDataFromProgramDiv.appendChild(View.sinumerikView.machineManagerMainWindow.machineDataFromProgramDiv.addButton);
    }
    if (!View.sinumerikView.machineManagerMainWindow.machineDataFromProgramDiv.parentElement) {
        View.sinumerikView.machineManagerMainWindow.appendChild(View.sinumerikView.machineManagerMainWindow.machineDataFromProgramDiv);
    }
}


function searchMachine(text,full) {
    var machineNamesArr = [];
    for (var machine in View.sinumerikView.machineData.machines) {
        var machineName = View.sinumerikView.machineData.machines[machine].machineName;
        // console.log(machineName);
        // console.log(text);
        if (machineName.match(text)) {
            if (!full) {
                machineNamesArr.push(machineName);
            } else {
                if (machineName == text) {
                    machineNamesArr.push(machineName);
                    return machineNamesArr;
                }
            }
        }
    }
    return machineNamesArr;
}


export function loadMachineData () {
    var machineFilePath = atom.packages.getPackageDirPaths()[0] + '/sinumerik-highlight/userData/machines.json';
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

            //Create UL
            if (!View.sinumerikView.machineManagerRightContainer.machineManagerMachinesDiv) {
                View.sinumerikView.machineManagerRightContainer.machineManagerMachinesDiv = document.createElement('div');
                View.sinumerikView.machineManagerRightContainer.appendChild(View.sinumerikView.machineManagerRightContainer.machineManagerMachinesDiv);
                View.sinumerikView.machineManagerRightContainer.machineManagerMachinesDiv.machinesList = document.createElement('ul');
                View.sinumerikView.machineManagerRightContainer.machineManagerMachinesDiv.machinesList.addEventListener('click', function (event) {
                    if (event.target.tagName != 'LI') {
                        return;
                    }
                    if(View.sinumerikView.machineManagerRightContainer.machineManagerMachinesDiv.machinesList.getElementsByClassName('sinumerikLiSelected')[0]) {
                        View.sinumerikView.machineManagerRightContainer.machineManagerMachinesDiv.machinesList.getElementsByClassName('sinumerikLiSelected')[0].className = 'sinumerikLi';
                    }
                    event.target.className = 'sinumerikLiSelected';
                    machineOptions(event.target.innerText);
                });
                View.sinumerikView.machineManagerRightContainer.machineManagerMachinesDiv.appendChild(View.sinumerikView.machineManagerRightContainer.machineManagerMachinesDiv.machinesList);
            }
            //Remove old LI
            while (View.sinumerikView.machineManagerRightContainer.machineManagerMachinesDiv.machinesList.children.length > 0) {
                var lastChild = View.sinumerikView.machineManagerRightContainer.machineManagerMachinesDiv.machinesList.lastChild;
                View.sinumerikView.machineManagerRightContainer.machineManagerMachinesDiv.machinesList.removeChild(lastChild);
            }

            for (var machine in View.sinumerikView.machineData.machines) {
                var newMachineName = View.sinumerikView.machineData.machines[machine].machineName;
                View.sinumerikView.machineManagerRightContainer.machineManagerMachinesDiv.machinesList[`${newMachineName}`] = document.createElement('li')
                View.sinumerikView.machineManagerRightContainer.machineManagerMachinesDiv.machinesList[`${newMachineName}`].innerText = `${newMachineName}`;
                View.sinumerikView.machineManagerRightContainer.machineManagerMachinesDiv.machinesList[`${newMachineName}`].className = 'sinumerikLi';
                View.sinumerikView.machineManagerRightContainer.machineManagerMachinesDiv.machinesList.appendChild(View.sinumerikView.machineManagerRightContainer.machineManagerMachinesDiv.machinesList[`${newMachineName}`])

            }
//            console.log(View.sinumerikView);




        } catch (e) {
            console.log(e);
        }
        checkMachine();
    });
    //
    // search machine from program in machines array

}

function machineOptionsHandler(event) {
    let sinumerikEventHandler = View.sinumerikView.eventRouter.route.bind(this);
    var machineName = View.sinumerikView.machineManagerMainWindow.machineOptions.header.textContent;

    if (event == 'removeMachineButtonClick') {
        if (!View.sinumerikView.machineManagerMainWindow.removeMachineConfirmDiv) {
            View.sinumerikView.machineManagerMainWindow.removeMachineConfirmDiv = document.createElement('div');
            View.sinumerikView.machineManagerMainWindow.removeMachineConfirmDiv.className = 'sinumerikBorderDiv';
            View.sinumerikView.machineManagerMainWindow.removeMachineConfirmDiv.innerText = '\nDo you really want to remove machine "' + machineName + '"?\n';
            View.sinumerikView.machineManagerMainWindow.removeMachineConfirmDiv.yesButton = document.createElement('button');
            View.sinumerikView.machineManagerMainWindow.removeMachineConfirmDiv.yesButton.className = 'sinumerikButton icon-check';
            View.sinumerikView.machineManagerMainWindow.removeMachineConfirmDiv.yesButton.innerText = ' Yes';
            View.sinumerikView.machineManagerMainWindow.removeMachineConfirmDiv.yesButton.addEventListener('click', function () {
                sinumerikEventHandler('{"emitter": "machineManager", "event": "removeMachineButtonYes"}');
            });
            View.sinumerikView.machineManagerMainWindow.removeMachineConfirmDiv.appendChild(View.sinumerikView.machineManagerMainWindow.removeMachineConfirmDiv.yesButton);
            View.sinumerikView.machineManagerMainWindow.removeMachineConfirmDiv.noButton = document.createElement('button');
            View.sinumerikView.machineManagerMainWindow.removeMachineConfirmDiv.noButton.className = 'sinumerikButton icon-x';
            View.sinumerikView.machineManagerMainWindow.removeMachineConfirmDiv.noButton.innerText = ' No';
            View.sinumerikView.machineManagerMainWindow.removeMachineConfirmDiv.noButton.addEventListener('click', function () {
                sinumerikEventHandler('{"emitter": "machineManager", "event": "removeMachineButtonNo"}');
            });
            View.sinumerikView.machineManagerMainWindow.removeMachineConfirmDiv.appendChild(View.sinumerikView.machineManagerMainWindow.removeMachineConfirmDiv.noButton);
        }

        View.sinumerikView.machineManagerMainWindow.machineOptions.style.visibility = 'hidden';
        View.sinumerikView.machineManagerMainWindow.appendChild(View.sinumerikView.machineManagerMainWindow.removeMachineConfirmDiv);
    }

    if (event == 'removeMachineButtonNo') {
        View.sinumerikView.machineManagerMainWindow.removeChild(View.sinumerikView.machineManagerMainWindow.removeMachineConfirmDiv);
        View.sinumerikView.machineManagerMainWindow.machineOptions.style.visibility = 'visible';
    }

    if (event == 'removeMachineButtonYes') {
        console.log("Machine fo remove " + machineName);
        delete View.sinumerikView.machineData.machines[machineName];
        saveMachineData();
        loadMachineData();
        machineOptions('');
        View.sinumerikView.machineManagerMainWindow.removeChild(View.sinumerikView.machineManagerMainWindow.removeMachineConfirmDiv);
        View.sinumerikView.machineManagerMainWindow.machineOptions.style.visibility = 'visible';
    }

    if (event == 'attachMachineButtonClick') {
        const Editor = atom.workspace.getActiveTextEditor();
        if (!Editor) {
            alert('No open file!');
            return;
        }
        var filename = Editor.getTitle();
        if (filename.split('.').length != 2) {
            alert('a file name can contain only one dot (eg JOPA.MPF)')
            return;
        }
        var extension = filename.split('.')[1].toUpperCase();
        if (extension != 'MPF' && extension != 'SPF') {
            alert('a file extension must be MPF or SPF');
            return;
        }
        if (confirm('This function will add a comment to the end of your file. Do you agree?')) {
            var filename = Editor.getTitle().replace(/\./g,'_').toUpperCase();
            View.sinumerikView.programmData[filename].machine = View.sinumerikView.machineData.machines[machineName];
            generateComment();
        }
    }

    if (event === 'setActiveMachineButtonClick') {
        const Editor = atom.workspace.getActiveTextEditor();
        if (!Editor) {
            alert('No open file!');
            return;
        }
        filename = Editor.getTitle();
        if (filename.split('.').length !== 2) {
            alert('a file name can contain only one dot (eg JOPA.MPF)')
            return;
        }
        extension = filename.split('.')[1].toUpperCase();
        if (extension !== 'MPF' && extension !== 'SPF') {
            alert('a file extension must be MPF or SPF');
            return;
        }
        if (confirm('Activate machine for this file? (file\'ll not changed)')) {
            filename = Editor.getTitle().replace(/\./g,'_').toUpperCase();
            View.sinumerikView.programmData[filename].machine = View.sinumerikView.machineData.machines[machineName];

            // console.log(View.sinumerikView.programmData[filename].machine.machineName);
            // console.log(View.sinumerikView.singleLineDebugData.machine.machineName);


            if (View.sinumerikView.singleLineDebugData) {
                View.sinumerikView.singleLineDebugData.CanvasAxes = {};
            }
        }
    }


}

function machineOptions(machineName) {
    let sinumerikEventHandler = View.sinumerikView.eventRouter.route.bind(this);

    if (View.sinumerikView.machineManagerCreateMachineMainDiv && View.sinumerikView.machineManagerCreateMachineMainDiv.parentElement) {
        View.sinumerikView.machineManagerMainWindow.removeChild(View.sinumerikView.machineManagerCreateMachineMainDiv);
    }
    if (!View.sinumerikView.machineManagerMainWindow.machineOptions) {
        View.sinumerikView.machineManagerMainWindow.machineOptions = document.createElement('div');
        View.sinumerikView.machineManagerMainWindow.appendChild(View.sinumerikView.machineManagerMainWindow.machineOptions);
        View.sinumerikView.machineManagerMainWindow.machineOptions.header = document.createElement('div');
        View.sinumerikView.machineManagerMainWindow.machineOptions.header.className = 'sinumerikMachineManagerHead';
        View.sinumerikView.machineManagerMainWindow.machineOptions.appendChild(View.sinumerikView.machineManagerMainWindow.machineOptions.header);

        View.sinumerikView.machineManagerMainWindow.machineOptions.propertiesDiv = document.createElement('div');
        View.sinumerikView.machineManagerMainWindow.machineOptions.propertiesDiv.className = 'sinumerikDiv sinumerikBorderDiv';
        View.sinumerikView.machineManagerMainWindow.machineOptions.appendChild(View.sinumerikView.machineManagerMainWindow.machineOptions.propertiesDiv);
        View.sinumerikView.machineManagerMainWindow.machineOptions.propertiesDiv.blockPre = document.createElement('pre');
        View.sinumerikView.machineManagerMainWindow.machineOptions.propertiesDiv.appendChild(View.sinumerikView.machineManagerMainWindow.machineOptions.propertiesDiv.blockPre);

        View.sinumerikView.machineManagerMainWindow.machineOptions.machineAttachButton = document.createElement('button');
        View.sinumerikView.machineManagerMainWindow.machineOptions.machineAttachButton.className = 'sinumerikButton icon-pin';
        View.sinumerikView.machineManagerMainWindow.machineOptions.machineAttachButton.innerText = 'Attach';
        View.sinumerikView.machineManagerMainWindow.machineOptions.machineAttachButton.title = 'Attach this machine to the programm';
        View.sinumerikView.machineManagerMainWindow.machineOptions.machineAttachButton.addEventListener('click', function () {
            sinumerikEventHandler('{"emitter": "machineManager", "event": "attachMachineButtonClick"}');
        });
        View.sinumerikView.machineManagerMainWindow.machineOptions.appendChild(View.sinumerikView.machineManagerMainWindow.machineOptions.machineAttachButton);

        View.sinumerikView.machineManagerMainWindow.machineOptions.machineSetActiveButton = document.createElement('button');
        View.sinumerikView.machineManagerMainWindow.machineOptions.machineSetActiveButton.className = 'sinumerikButton icon-squirrel';
        View.sinumerikView.machineManagerMainWindow.machineOptions.machineSetActiveButton.innerText = 'Activate';
        View.sinumerikView.machineManagerMainWindow.machineOptions.machineSetActiveButton.title = 'Set this machine active for this file';
        View.sinumerikView.machineManagerMainWindow.machineOptions.machineSetActiveButton.addEventListener('click', function () {
            sinumerikEventHandler('{"emitter": "machineManager", "event": "setActiveMachineButtonClick"}');
        });
        View.sinumerikView.machineManagerMainWindow.machineOptions.appendChild(View.sinumerikView.machineManagerMainWindow.machineOptions.machineSetActiveButton);


        View.sinumerikView.machineManagerMainWindow.machineOptions.machineRemoveButton = document.createElement('button');
        View.sinumerikView.machineManagerMainWindow.machineOptions.machineRemoveButton.className = 'sinumerikButton icon-dash';
        View.sinumerikView.machineManagerMainWindow.machineOptions.machineRemoveButton.innerText = 'Remove Machine';
        View.sinumerikView.machineManagerMainWindow.machineOptions.machineRemoveButton.addEventListener('click', function () {
            sinumerikEventHandler('{"emitter": "machineManager", "event": "removeMachineButtonClick"}');
        });
        View.sinumerikView.machineManagerMainWindow.machineOptions.appendChild(View.sinumerikView.machineManagerMainWindow.machineOptions.machineRemoveButton);


        //region subroutines
        View.sinumerikView.machineManagerMainWindow.machineOptions.subroutinesDiv = document.createElement('div');
        View.sinumerikView.machineManagerMainWindow.machineOptions.subroutinesDiv.className = 'sinumerikDiv sinumerikBorderDiv';
        View.sinumerikView.machineManagerMainWindow.machineOptions.subroutinesDiv.head = document.createElement('div');
        View.sinumerikView.machineManagerMainWindow.machineOptions.subroutinesDiv.head.className = 'sinumerikMachineManagerHead';
        View.sinumerikView.machineManagerMainWindow.machineOptions.subroutinesDiv.head.innerText = 'Subroutines folder paths';
        View.sinumerikView.machineManagerMainWindow.machineOptions.subroutinesDiv.appendChild(View.sinumerikView.machineManagerMainWindow.machineOptions.subroutinesDiv.head);
        View.sinumerikView.machineManagerMainWindow.machineOptions.subroutinesDiv.subroutinesUl = document.createElement('ul');
        View.sinumerikView.machineManagerMainWindow.machineOptions.subroutinesDiv.appendChild(View.sinumerikView.machineManagerMainWindow.machineOptions.subroutinesDiv.subroutinesUl);
        View.sinumerikView.machineManagerMainWindow.machineOptions.subroutinesDiv.addButton = document.createElement('button');
        View.sinumerikView.machineManagerMainWindow.machineOptions.subroutinesDiv.addButton.className = 'sinumerikButton icon-plus';
        View.sinumerikView.machineManagerMainWindow.machineOptions.subroutinesDiv.addButton.title = 'Add subroutines folder';

        //TODO УБРАТЬ :-) Мегакостыль для переключения листенера
        if (!View.sinumerikView.machineManagerData) {
            View.sinumerikView.machineManagerData = {};
        }
        View.sinumerikView.machineManagerMainWindow.machineOptions.subroutinesDiv.addButton.addEventListener('click', function() {
            var path;
            try {
                path = dialog.showOpenDialogSync({properties: ['openDirectory']});
            } catch (e) {
                path = dialog.showOpenDialog({properties: ['openDirectory']});
            }
            if (path) {
                for (let i = 0; i < path.length; i++ ) {
                    console.log(path[i]);
                    if (!View.sinumerikView.machineData.subroutines) {
                        View.sinumerikView.machineData.subroutines = {};
                    }
                    if (!View.sinumerikView.machineData.subroutines[View.sinumerikView.machineManagerData.selectedMachine]) {
                        View.sinumerikView.machineData.subroutines[View.sinumerikView.machineManagerData.selectedMachine] = [];
                    }
                    View.sinumerikView.machineData.subroutines[View.sinumerikView.machineManagerData.selectedMachine].push(path[i]);
                    saveMachineData();
                    loadSubroutinesData(View.sinumerikView.machineManagerData.selectedMachine);
                    // console.log(View.sinumerikView.machineData);
                }
            }
        });

        View.sinumerikView.machineManagerMainWindow.machineOptions.subroutinesDiv.appendChild(View.sinumerikView.machineManagerMainWindow.machineOptions.subroutinesDiv.addButton);
        View.sinumerikView.machineManagerMainWindow.machineOptions.appendChild(View.sinumerikView.machineManagerMainWindow.machineOptions.subroutinesDiv);
        //endregion


        //region snippets
        View.sinumerikView.machineManagerMainWindow.machineOptions.snippetsDiv = document.createElement('div');
        View.sinumerikView.machineManagerMainWindow.machineOptions.snippetsDiv.className = 'sinumerikDiv sinumerikBorderDiv';
        View.sinumerikView.machineManagerMainWindow.machineOptions.snippetsDiv.head = document.createElement('div');
        View.sinumerikView.machineManagerMainWindow.machineOptions.snippetsDiv.head.className = 'sinumerikMachineManagerHead';
        View.sinumerikView.machineManagerMainWindow.machineOptions.snippetsDiv.head.innerText = 'Snippets paths';
        View.sinumerikView.machineManagerMainWindow.machineOptions.snippetsDiv.appendChild(View.sinumerikView.machineManagerMainWindow.machineOptions.snippetsDiv.head);
        View.sinumerikView.machineManagerMainWindow.machineOptions.snippetsDiv.snippetsUl = document.createElement('ul');
        View.sinumerikView.machineManagerMainWindow.machineOptions.snippetsDiv.appendChild(View.sinumerikView.machineManagerMainWindow.machineOptions.snippetsDiv.snippetsUl);
        View.sinumerikView.machineManagerMainWindow.machineOptions.snippetsDiv.addButton = document.createElement('button');
        View.sinumerikView.machineManagerMainWindow.machineOptions.snippetsDiv.addButton.className = 'sinumerikButton icon-plus';
        View.sinumerikView.machineManagerMainWindow.machineOptions.snippetsDiv.addButton.title = 'Add snippets path';

        if (!View.sinumerikView.machineManagerData) {
            View.sinumerikView.machineManagerData = {};
        }
        View.sinumerikView.machineManagerMainWindow.machineOptions.snippetsDiv.addButton.addEventListener('click', function() {
            var path;
            try {
                path = dialog.showOpenDialogSync({properties: ['openDirectory']});
            } catch (e) {
                path = dialog.showOpenDialog({properties: ['openDirectory']});
            }
            if (path) {
                for (let i = 0; i < path.length; i++ ) {
                    if (!View.sinumerikView.machineData.snippets) {
                        View.sinumerikView.machineData.snippets = {};
                    }
                    if (!View.sinumerikView.machineData.snippets[View.sinumerikView.machineManagerData.selectedMachine]) {
                        View.sinumerikView.machineData.snippets[View.sinumerikView.machineManagerData.selectedMachine] = [];
                    }
                    View.sinumerikView.machineData.snippets[View.sinumerikView.machineManagerData.selectedMachine].push({path: path[i], snippets: loadSnippet(path[i])});
                    saveMachineData();
                    // console.log(View.sinumerikView.machineData.snippets)
                    loadSnippetsData(View.sinumerikView.machineManagerData.selectedMachine);
                }
            }
        });

        View.sinumerikView.machineManagerMainWindow.machineOptions.snippetsDiv.appendChild(View.sinumerikView.machineManagerMainWindow.machineOptions.snippetsDiv.addButton);
        View.sinumerikView.machineManagerMainWindow.machineOptions.appendChild(View.sinumerikView.machineManagerMainWindow.machineOptions.snippetsDiv);
        //endregion

    }

    View.sinumerikView.machineManagerData.selectedMachine = machineName;
    loadSubroutinesData(machineName);
    loadSnippetsData(machineName);

    if (!View.sinumerikView.machineManagerMainWindow.machineOptions.parentElement) {
        View.sinumerikView.machineManagerMainWindow.appendChild(View.sinumerikView.machineManagerMainWindow.machineOptions);
    }
    if (machineName != '') {
        View.sinumerikView.machineManagerMainWindow.machineOptions.header.innerText = machineName;
        View.sinumerikView.machineManagerMainWindow.machineOptions.propertiesDiv.blockPre.innerText = JSON.stringify(View.sinumerikView.machineData.machines[machineName], null, 4);
        toolContainerContent(machineName);
    } else {
        View.sinumerikView.machineManagerMainWindow.machineOptions.header.innerText = 'There was machine here';
        View.sinumerikView.machineManagerMainWindow.machineOptions.propertiesDiv.blockPre.innerText = '';
    }
}

function loadSubroutinesData(machineName) {
    // console.log(View.sinumerikView.machineManagerMainWindow.machineOptions.subroutinesDiv.subroutinesUl.firstChild);
    while (View.sinumerikView.machineManagerMainWindow.machineOptions.subroutinesDiv.subroutinesUl.firstChild) {
        View.sinumerikView.machineManagerMainWindow.machineOptions.subroutinesDiv.subroutinesUl.removeChild(View.sinumerikView.machineManagerMainWindow.machineOptions.subroutinesDiv.subroutinesUl.firstChild);
    }

    if (!View.sinumerikView.machineData.subroutines) {
        View.sinumerikView.machineData.subroutines = {};
    }

    if (!View.sinumerikView.machineData.subroutines[machineName]) {
        return;
    }

    for (let i = 0; i < View.sinumerikView.machineData.subroutines[machineName].length; i ++) {
        var element = document.createElement('li');
        element.mainDiv = document.createElement('div');
        element.textDiv = document.createElement('div');
        element.textDiv.style.float = 'left';
        element.textDiv.style.marginTop = '10px';
        //TODO Сделать динамичный отступ.
        element.textDiv.innerText = View.sinumerikView.machineData.subroutines[machineName][i];
        element.mainDiv.appendChild(element.textDiv);
        element.removeButton = document.createElement('button');
        element.removeButton.className = 'sinumerikButton icon-dash';
        element.removeButton.addEventListener('click', function () {

            if (confirm(`Remove subroutines folder link ${View.sinumerikView.machineData.subroutines[machineName][i]}?`)) {
                View.sinumerikView.machineData.subroutines[machineName].splice(i, 1);
                saveMachineData();
                loadSubroutinesData(machineName);
            }
        })
        element.mainDiv.appendChild(element.removeButton);
        element.appendChild(element.mainDiv);
        View.sinumerikView.machineManagerMainWindow.machineOptions.subroutinesDiv.subroutinesUl.appendChild(element);
    }

}

function loadSnippetsData(machineName) {
    while (View.sinumerikView.machineManagerMainWindow.machineOptions.snippetsDiv.snippetsUl.firstChild) {
        View.sinumerikView.machineManagerMainWindow.machineOptions.snippetsDiv.snippetsUl.removeChild(View.sinumerikView.machineManagerMainWindow.machineOptions.snippetsDiv.snippetsUl.firstChild);
    }

    if (!View.sinumerikView.machineData.snippets) {
        View.sinumerikView.machineData.snippets = {};
    }

    if (!View.sinumerikView.machineData.snippets[machineName]) {
        return;
    }

    for (let i = 0; i < View.sinumerikView.machineData.snippets[machineName].length; i ++) {

        var element = document.createElement('li');
        element.mainDiv = document.createElement('div');
        element.textDiv = document.createElement('div');
        element.textDiv.style.float = 'left';
        element.textDiv.style.marginTop = '10px';
        //TODO Сделать динамичный отступ.
        element.textDiv.innerText = View.sinumerikView.machineData.snippets[machineName][i].path;
        element.mainDiv.appendChild(element.textDiv);
        element.removeButton = document.createElement('button');
        element.removeButton.className = 'sinumerikButton icon-dash';
        element.removeButton.addEventListener('click', function () {

            if (confirm(`Remove snippets folder link ${View.sinumerikView.machineData.snippets[machineName][i].path}?`)) {
                View.sinumerikView.machineData.snippets[machineName].splice(i, 1);
                saveMachineData();
                loadSnippetsData(machineName);
            }
        })
        element.mainDiv.appendChild(element.removeButton);
        element.appendChild(element.mainDiv);
        View.sinumerikView.machineManagerMainWindow.machineOptions.snippetsDiv.snippetsUl.appendChild(element);
    }

}

function toolContainerContent(machineName) {
    // while (View.sinumerikView.toolContainer.body.firstChild) {
    //     View.sinumerikView.toolContainer.body.removeChild(View.sinumerikView.toolContainer.body.firstChild);
    // }
    if (!View.sinumerikView.toolContainer.body.firstChild) {
        View.sinumerikView.toolContainer.body.elements = [];
        var rotate = [315,0,45,270,0,90,225,180,135];
        var width = Math.round((View.sinumerikView.right.offsetWidth - 10)/3);
        for (let i = 0; i < 9; i ++) {
            View.sinumerikView.toolContainer.body.elements[i] = document.createElement('div');
            View.sinumerikView.toolContainer.body.elements[i].style.width = `${width}px`;
            View.sinumerikView.toolContainer.body.elements[i].style.height = `${width}px`;
            View.sinumerikView.toolContainer.body.elements[i].style.float = 'left';
            View.sinumerikView.toolContainer.body.elements[i].style.border = '#eaeaeb 1px solid';
            View.sinumerikView.toolContainer.body.appendChild(View.sinumerikView.toolContainer.body.elements[i]);
            // View.sinumerikView.toolContainer.body.elements[i].innerText = "" + i;

            View.sinumerikView.toolContainer.body.elements[i].back_image = document.createElement('div');
            View.sinumerikView.toolContainer.body.elements[i].back_image.style.position = 'absolute';
            View.sinumerikView.toolContainer.body.elements[i].back_image.style.width = `${width}px`;
            View.sinumerikView.toolContainer.body.elements[i].back_image.style.height = `${width}px`;
            View.sinumerikView.toolContainer.body.elements[i].appendChild(View.sinumerikView.toolContainer.body.elements[i].back_image);

            View.sinumerikView.toolContainer.body.elements[i].front_text = document.createElement('div');
            View.sinumerikView.toolContainer.body.elements[i].front_text.style.position = 'absolute';
            View.sinumerikView.toolContainer.body.elements[i].front_text.style.fontWeight = 'bolder';
            View.sinumerikView.toolContainer.body.elements[i].front_text.style.zIndex = '3';
            View.sinumerikView.toolContainer.body.elements[i].front_text.style.transform = `translateY(${width/4}px)`;
            View.sinumerikView.toolContainer.body.elements[i].front_text.style.width = `${width}px`;
            View.sinumerikView.toolContainer.body.elements[i].front_text.style.height = `${width}px`;
            View.sinumerikView.toolContainer.body.elements[i].front_text.style.textAlign = 'center';
            View.sinumerikView.toolContainer.body.elements[i].appendChild(View.sinumerikView.toolContainer.body.elements[i].front_text);

            if (i != 4) {
                var translateY = 0;
                if (i == 0 || i == 2 || i == 6 || i == 8) {
                    translateY = width/4;
                }
                View.sinumerikView.toolContainer.body.elements[i].back_image.style.backgroundImage = `url(${atom.packages.getPackageDirPaths()[0]}/sinumerik-highlight/images/triangle.png`;
                View.sinumerikView.toolContainer.body.elements[i].back_image.style.backgroundSize = "60%";
                View.sinumerikView.toolContainer.body.elements[i].back_image.style.opacity = '0.2';
                View.sinumerikView.toolContainer.body.elements[i].back_image.style.backgroundRepeat = 'no-repeat';
                View.sinumerikView.toolContainer.body.elements[i].back_image.style.transform = `rotate(${rotate[i]}deg) translateX(${width/6}px) translateY(${translateY}px)`;
            }
        }

    }

    if (View.sinumerikView.machineData.machines[machineName].machineType == 'Lathe') {
        View.sinumerikView.toolContainer.body.elements[4].front_text.innerText = '109';
        if (View.sinumerikView.machineData.machines[machineName].subType == 'Horizontal') {
            if (View.sinumerikView.machineData.machines[machineName].firstCarriage.position == 'Rear') {
                View.sinumerikView.toolContainer.body.elements[0].front_text.innerText = '104';
                View.sinumerikView.toolContainer.body.elements[1].front_text.innerText = '108';
                View.sinumerikView.toolContainer.body.elements[2].front_text.innerText = '103';
                View.sinumerikView.toolContainer.body.elements[3].front_text.innerText = '105';
                View.sinumerikView.toolContainer.body.elements[5].front_text.innerText = '107';
                View.sinumerikView.toolContainer.body.elements[6].front_text.innerText = '101';
                View.sinumerikView.toolContainer.body.elements[7].front_text.innerText = '106';
                View.sinumerikView.toolContainer.body.elements[8].front_text.innerText = '102';
            }
            if (View.sinumerikView.machineData.machines[machineName].firstCarriage.position == 'Front') {
                View.sinumerikView.toolContainer.body.elements[0].front_text.innerText = '101';
                View.sinumerikView.toolContainer.body.elements[1].front_text.innerText = '106';
                View.sinumerikView.toolContainer.body.elements[2].front_text.innerText = '102';
                View.sinumerikView.toolContainer.body.elements[3].front_text.innerText = '105';
                View.sinumerikView.toolContainer.body.elements[5].front_text.innerText = '107';
                View.sinumerikView.toolContainer.body.elements[6].front_text.innerText = '104';
                View.sinumerikView.toolContainer.body.elements[7].front_text.innerText = '108';
                View.sinumerikView.toolContainer.body.elements[8].front_text.innerText = '103';
            }
        }
        if (View.sinumerikView.machineData.machines[machineName].subType == 'Vertical') {
            if (View.sinumerikView.machineData.machines[machineName].firstCarriage.position == 'Front') {
                View.sinumerikView.toolContainer.body.elements[0].front_text.innerText = '102';
                View.sinumerikView.toolContainer.body.elements[1].front_text.innerText = '107';
                View.sinumerikView.toolContainer.body.elements[2].front_text.innerText = '103';
                View.sinumerikView.toolContainer.body.elements[3].front_text.innerText = '106';
                View.sinumerikView.toolContainer.body.elements[5].front_text.innerText = '108';
                View.sinumerikView.toolContainer.body.elements[6].front_text.innerText = '101';
                View.sinumerikView.toolContainer.body.elements[7].front_text.innerText = '105';
                View.sinumerikView.toolContainer.body.elements[8].front_text.innerText = '104';
            }
            if (View.sinumerikView.machineData.machines[machineName].firstCarriage.position == 'Rear') {
                View.sinumerikView.toolContainer.body.elements[0].front_text.innerText = '103';
                View.sinumerikView.toolContainer.body.elements[1].front_text.innerText = '107';
                View.sinumerikView.toolContainer.body.elements[2].front_text.innerText = '102';
                View.sinumerikView.toolContainer.body.elements[3].front_text.innerText = '108';
                View.sinumerikView.toolContainer.body.elements[5].front_text.innerText = '106';
                View.sinumerikView.toolContainer.body.elements[6].front_text.innerText = '104';
                View.sinumerikView.toolContainer.body.elements[7].front_text.innerText = '105';
                View.sinumerikView.toolContainer.body.elements[8].front_text.innerText = '101';
            }
        }
        // console.log(View.sinumerikView.machineData.machines[machineName]);
    } else {
        for (let i = 0; i < 9; i ++ ) {
            View.sinumerikView.toolContainer.body.elements[i].front_text.innerText = '';
        }
    }
}

function createMachineDataFile() {
    var machineFilePath = atom.packages.getPackageDirPaths()[0] + '/sinumerik-highlight/userData/machines.json';
    var dirPath = atom.packages.getPackageDirPaths()[0] + '/sinumerik-highlight/userData';
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, 0744);
    }
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
    if (View.sinumerikView.machineManagerMainWindow.machineOptions && View.sinumerikView.machineManagerMainWindow.machineOptions.parentElement) {
        View.sinumerikView.machineManagerMainWindow.removeChild(View.sinumerikView.machineManagerMainWindow.machineOptions);
    }


    let sinumerikEventHandler = View.sinumerikView.eventRouter.route.bind(this);

    if (event == 'createNewMachineSubmitClick') {
        var newMachine = {};
        newMachine.machineName = View.sinumerikView.machineManagerCreateMachineMainDiv.nameInput.value;
        newMachine.machineType = View.sinumerikView.machineManagerCreateMachineMainDiv.typeSelect.value;

        if (newMachine.machineName.length < 3) {
            createMachineError('Machine name must be longer than 2 characters');
            return;
        }
        if (newMachine.machineType == 'please select') {
            createMachineError('Please select Machine type');
            return;
        }
        if (newMachine.machineType == 'Lathe') {
            newMachine.subType = View.sinumerikView.machineManagerCreateMachineMainDiv.subTypeSelect.value;
            newMachine.firstCarriage = {};
            if (newMachine.subType == 'please select') {
                createMachineError('Please select Machine subType');
                return;
            }
            newMachine.subType == View.sinumerikView.machineManagerCreateMachineMainDiv.subTypeSelect.value;
            newMachine.diam90 = View.sinumerikView.machineManagerCreateMachineMainDiv.diam90Chekbox.checked;
            newMachine.firstCarriage.position = View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.positionSelect.value;
            newMachine.firstCarriage.axisY = View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.yAxisSpan.Checkbox.checked;
            newMachine.firstCarriage.drivedTool = View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.drivedToolSpan.Checkbox.checked;
            newMachine.firstCarriage.coolantOn = View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.coolantSpan.inputOn.value;
            newMachine.firstCarriage.coolantOff = View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.coolantSpan.inputOff.value;
            newMachine.firstCarriage.toolChange = View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.toolChangeSpan.inputM6.value;
            if (newMachine.firstCarriage.drivedTool) {

                newMachine.firstCarriage.drivedToolSpindleNum = View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.drivedToolSpan.spindleNumInput.value;

                if (newMachine.firstCarriage.drivedToolSpindleNum == '') {
                    createMachineError('Please input first carriage drived tool spindle number. It will be used for SETMS & SPOS');
                    return;
                }
            }
            if (newMachine.firstCarriage.position == 'please select') {
                createMachineError('Please select first carriage position');
                return;
            }
            if (newMachine.firstCarriage.coolantOn == '' || newMachine.firstCarriage.coolantOff == '') {
                createMachineError('Please input first carriage coolant M-functions');
                return;
            }
            if (View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv && View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.parentElement) {
                newMachine.secondCarriage = {};
                newMachine.secondCarriage.position = View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.positionSelect.value;
                newMachine.secondCarriage.axisY = View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.yAxisSpan.Checkbox.checked;
                newMachine.secondCarriage.drivedTool = View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.drivedToolSpan.Checkbox.checked;
                newMachine.secondCarriage.coolantOn = View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.coolantSpan.inputOn.value;
                newMachine.secondCarriage.coolantOff = View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.coolantSpan.inputOff.value;
                newMachine.secondCarriage.toolChange = View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.toolChangeSpan.inputM6.value;

                if (newMachine.secondCarriage.drivedTool) {

                    newMachine.secondCarriage.drivedToolSpindleNum = View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.drivedToolSpan.spindleNumInput.value;

                    if (newMachine.secondCarriage.drivedToolSpindleNum == '') {
                        createMachineError('Please input second carriage drived tool spindle number. It will be used for SETMS & SPOS');
                        return;
                    }
                }
                if (newMachine.secondCarriage.position == 'please select') {
                    createMachineError('Please select second carriage position');
                    return;
                }
                if (newMachine.secondCarriage.coolantOn == '' || newMachine.secondCarriage.coolantOff == '') {
                    createMachineError('Please input second carriage coolant M-functions');
                    return;
                }

            }
            newMachine.firstSpindle = {};
            newMachine.firstSpindle.name = View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.firstSpindleDiv.inputNameDiv.inputName.value;
            newMachine.firstSpindle.num = View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.firstSpindleDiv.inputNumDiv.inputNum.value;
            if (newMachine.firstSpindle.name == '') {
                createMachineError('Please input first spindle name. It will be used in spindle axis mode, eg "G0 C4=50"');
                return;
            }
            if (newMachine.firstSpindle.num == '') {
                createMachineError('Please input first spindle number. It will be used for SPCON, SETMS & SPOS');
                return;
            }
            if (View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.secondSpindleDiv && View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.secondSpindleDiv.parentElement) {
                newMachine.secondSpindle = {};
                newMachine.secondSpindle.name = View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.secondSpindleDiv.inputNameDiv.inputName.value;
                newMachine.secondSpindle.num = View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.secondSpindleDiv.inputNumDiv.inputNum.value;
                if (newMachine.secondSpindle.name == '') {
                    createMachineError('Please input second spindle name. It will be used in spindle axis mode, eg "G0 C4=50"');
                    return;
                }
                if (newMachine.secondSpindle.num == '') {
                    createMachineError('Please input second spindle number. It will be used for SPCON, SETMS & SPOS');
                    return;
                }

            }
            View.sinumerikView.machineData.machines[`${newMachine.machineName}`] = newMachine;
            console.log(View.sinumerikView.machineData);

            saveMachineData();
            View.sinumerikView.machineManagerMainWindow.removeChild(View.sinumerikView.machineManagerCreateMachineMainDiv);
        }
        if (newMachine.machineType == 'Mill') {
            newMachine.firstSpindle = {};
            newMachine.firstSpindle.name = 'C';
            newMachine.firstSpindle.num = 1;
            View.sinumerikView.machineData.machines[`${newMachine.machineName}`] = newMachine;
            console.log(View.sinumerikView.machineData);

            saveMachineData();
            View.sinumerikView.machineManagerMainWindow.removeChild(View.sinumerikView.machineManagerCreateMachineMainDiv);
        }

    }

    if (event == 'createNewMachineMillSelect') {
        while (View.sinumerikView.machineManagerCreateMachineMainDiv.children.length > 5) {
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

            //region second carriage Div & header
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.head = document.createElement('div');
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.head.className = 'sinumerikMachineManagerHead';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.head.innerText = 'Second carriage properties';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.head);
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.positionSelectTitle = document.createElement('span');
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.positionSelectTitle.innerText = 'Position';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.positionSelectTitle);
            //endregion

            //region  second carriage position selector
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
            //endregion

            //region Coolant M-command input
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.coolantSpan = document.createElement('span');
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.coolantSpan.innerText = ' Coolant:';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.coolantSpan);
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.coolantSpan.inputOn = document.createElement('input');
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.coolantSpan.inputOn.type = 'text';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.coolantSpan.inputOn.className = 'sinumerikCoolantInput  native-key-bindings';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.coolantSpan.inputOn.title = 'Coolant ON M-command (Usually M8)';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.coolantSpan.inputOn.placeholder = ' M8';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.coolantSpan.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.coolantSpan.inputOn);
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.coolantSpan.inputOff = document.createElement('input');
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.coolantSpan.inputOff.type = 'text';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.coolantSpan.inputOff.className = 'sinumerikCoolantInput native-key-bindings';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.coolantSpan.inputOff.title = 'Coolant OFF M-command (Usually M9)';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.coolantSpan.inputOff.placeholder = ' M9';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.coolantSpan.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.coolantSpan.inputOff);
            //endregion

            //region Y checkbox
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.yAxisSpan = document.createElement('span');
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.yAxisSpan.innerText = '  Y axis: ';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.yAxisSpan.className = 'sinumerikNowrap';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.yAxisSpan.Checkbox = document.createElement('input');
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.yAxisSpan.Checkbox.className = 'sinumerikCheckbox';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.yAxisSpan.Checkbox.type = 'checkbox';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.yAxisSpan.Checkbox.title = 'Сheck the box if there is an Y axis on the carriage';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.yAxisSpan.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.yAxisSpan.Checkbox);
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.yAxisSpan);
            //endregion

            //region drived tool checkbox
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.drivedToolSpan = document.createElement('span');
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.drivedToolSpan.innerText = '  Drived tool: ';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.drivedToolSpan.className = 'sinumerikNowrap';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.drivedToolSpan.Checkbox = document.createElement('input');
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.drivedToolSpan.Checkbox.className = 'sinumerikCheckbox';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.drivedToolSpan.Checkbox.type = 'checkbox';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.drivedToolSpan.Checkbox.title = 'Сheck the box if there is an drived tool on the carriage';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.drivedToolSpan.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.drivedToolSpan.Checkbox);
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.drivedToolSpan.spindleNumInput = document.createElement('input');
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.drivedToolSpan.spindleNumInput.className = 'sinumerikCoolantInput  native-key-bindings';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.drivedToolSpan.spindleNumInput.type = 'text';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.drivedToolSpan.spindleNumInput.title = 'Please enter drive tool spindle number for SETMS()';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.drivedToolSpan.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.drivedToolSpan.spindleNumInput);
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.drivedToolSpan.spindleNumInput.style.visibility = 'hidden';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.drivedToolSpan.spindleNumInput.placeholder = 'Spndl';

            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.drivedToolSpan.Checkbox.addEventListener('change', function (){
                if (View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.drivedToolSpan.Checkbox.checked) {
                    View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.drivedToolSpan.spindleNumInput.style.visibility = 'visible';
                } else {
                    View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.drivedToolSpan.spindleNumInput.style.visibility = 'hidden';
                }
            });
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.drivedToolSpan);
            //endregion

            //region M6 replacement
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.toolChangeSpan = document.createElement('span');
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.toolChangeSpan.innerText = 'M6 replacement';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.toolChangeSpan.className = 'sinumerikNowrap';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.toolChangeSpan.inputM6 = document.createElement('input');
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.toolChangeSpan.inputM6.type = 'text';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.toolChangeSpan.inputM6.className = 'sinumerikCoolantInput native-key-bindings';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.toolChangeSpan.inputM6.value = 'M6';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.toolChangeSpan.inputM6.title = 'If the M6 is not used on the carriage, please enter a replacement';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.toolChangeSpan.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.toolChangeSpan.inputM6);
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.toolChangeSpan);
            //endregion


            //region second carriage remove button
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageRemoveButton = document.createElement('button');
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageRemoveButton.className = 'sinumerikButton icon-dash';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageRemoveButton.title = 'Remove second carriage';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageRemoveButton.innerText = ' Remove second carriage';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageRemoveButton.addEventListener('click', function () {
                sinumerikEventHandler('{"emitter": "machineManager", "event": "createNewMachineLatheSecondCarriageRemoveButtonClick"}');
            });
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageDiv.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageRemoveButton);
            //endregion
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
            //region first carriage Div & header
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv = document.createElement('div');
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.className = 'sinumerikDiv sinumerikBorderDiv';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.head = document.createElement('div');
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.head.className = 'sinumerikMachineManagerHead';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.head.innerText = 'First carriage parameters';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.head);
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv);
            //endregion

            //region position selector
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
            //endregion

            //region Coolant M-command input
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.coolantSpan = document.createElement('span');
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.coolantSpan.innerText = ' Coolant:';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.coolantSpan);
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.coolantSpan.inputOn = document.createElement('input');
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.coolantSpan.inputOn.type = 'text';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.coolantSpan.inputOn.className = 'sinumerikCoolantInput native-key-bindings';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.coolantSpan.inputOn.title = 'Coolant ON M-command (Usually M8)';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.coolantSpan.inputOn.placeholder = ' M8';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.coolantSpan.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.coolantSpan.inputOn);
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.coolantSpan.inputOff = document.createElement('input');
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.coolantSpan.inputOff.type = 'text';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.coolantSpan.inputOff.className = 'sinumerikCoolantInput native-key-bindings';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.coolantSpan.inputOff.title = 'Coolant OFF M-command (Usually M9)';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.coolantSpan.inputOff.placeholder = ' M9';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.coolantSpan.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.coolantSpan.inputOff);
            //endregion

            //region Y checkbox
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.yAxisSpan = document.createElement('span');
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.yAxisSpan.innerText = '  Y axis: ';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.yAxisSpan.className = 'sinumerikNowrap';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.yAxisSpan.Checkbox = document.createElement('input');
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.yAxisSpan.Checkbox.className = 'sinumerikCheckbox';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.yAxisSpan.Checkbox.type = 'checkbox';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.yAxisSpan.Checkbox.title = 'Сheck the box if there is an Y axis on the carriage';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.yAxisSpan.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.yAxisSpan.Checkbox);
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.yAxisSpan);
            //endregion

            //region drived tool checkbox
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.drivedToolSpan = document.createElement('span');
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.drivedToolSpan.innerText = '  Drived tool: ';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.drivedToolSpan.className = 'sinumerikNowrap';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.drivedToolSpan.Checkbox = document.createElement('input');
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.drivedToolSpan.Checkbox.className = 'sinumerikCheckbox';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.drivedToolSpan.Checkbox.type = 'checkbox';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.drivedToolSpan.Checkbox.title = 'Сheck the box if there is an drived tool on the carriage';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.drivedToolSpan.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.drivedToolSpan.Checkbox);
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.drivedToolSpan.spindleNumInput = document.createElement('input');
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.drivedToolSpan.spindleNumInput.className = 'sinumerikCoolantInput  native-key-bindings';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.drivedToolSpan.spindleNumInput.type = 'text';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.drivedToolSpan.spindleNumInput.title = 'Please enter drive tool spindle number for SETMS()';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.drivedToolSpan.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.drivedToolSpan.spindleNumInput);
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.drivedToolSpan.spindleNumInput.style.visibility = 'hidden';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.drivedToolSpan.spindleNumInput.placeholder = 'Spndl';

            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.drivedToolSpan.Checkbox.addEventListener('change', function (){
               if (View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.drivedToolSpan.Checkbox.checked) {
                   View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.drivedToolSpan.spindleNumInput.style.visibility = 'visible';
               } else {
                   View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.drivedToolSpan.spindleNumInput.style.visibility = 'hidden';
               }
            });
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.drivedToolSpan);
            //endregion

            //region M6 replacement
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.toolChangeSpan = document.createElement('span');
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.toolChangeSpan.innerText = 'M6 replacement';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.toolChangeSpan.className = 'sinumerikNowrap';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.toolChangeSpan.inputM6 = document.createElement('input');
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.toolChangeSpan.inputM6.type = 'text';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.toolChangeSpan.inputM6.className = 'sinumerikCoolantInput native-key-bindings';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.toolChangeSpan.inputM6.value = 'M6';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.toolChangeSpan.inputM6.title = 'If the M6 is not used on the carriage, please enter a replacement';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.toolChangeSpan.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.toolChangeSpan.inputM6);
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.toolChangeSpan);
            //endregion

            //region second carriage add button
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageAddButton = document.createElement('button');
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageAddButton.className = 'sinumerikButton icon-plus';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageAddButton.innerText = 'Add second carriage';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageAddButton.title = 'Add second carriage';
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageAddButton.addEventListener('click', function () {
                sinumerikEventHandler('{"emitter": "machineManager", "event": "createNewMachineLatheSecondCarriageAddButtonClick"}');
            });
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageAddButton.disabled = true;
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageAddButton.style.visibility = 'hidden';
            //TODO Remove hidden for activate second carriage
            //endregion
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv);
            View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.firstCarriageDiv.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.carriageDiv.secondCarriageAddButton);
        }

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

        //region first spindle Div
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
            View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.firstSpindleDiv.secondSpindleButton.style.visibility = 'hidden';
            //TODO Remove hidden for activate second spindle option
            View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.firstSpindleDiv.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.firstSpindleDiv.secondSpindleButton);
        }

        if (!View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv.parentElement) {
            View.sinumerikView.machineManagerCreateMachineMainDiv.insertBefore(View.sinumerikView.machineManagerCreateMachineMainDiv.spindleDiv, View.sinumerikView.machineManagerCreateMachineMainDiv.submitButtonDiv);
        }
        //endregion

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

            View.sinumerikView.machineManagerCreateMachineMainDiv.diam90Div = document.createElement('div');
            View.sinumerikView.machineManagerCreateMachineMainDiv.diam90Div.className = 'sinumerikDiv';
            View.sinumerikView.machineManagerCreateMachineMainDiv.diam90Div.innerText = 'DIAM90';

            View.sinumerikView.machineManagerCreateMachineMainDiv.diam90Chekbox = document.createElement('input');
            View.sinumerikView.machineManagerCreateMachineMainDiv.diam90Chekbox.type = 'checkbox';
            View.sinumerikView.machineManagerCreateMachineMainDiv.diam90Chekbox.className = 'sinumerikCheckbox';
            View.sinumerikView.machineManagerCreateMachineMainDiv.diam90Chekbox.title = 'If DIAM90 is enabled by default on your machine, set this flag';
            View.sinumerikView.machineManagerCreateMachineMainDiv.diam90Div.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.diam90Chekbox);

        }
        View.sinumerikView.machineManagerCreateMachineMainDiv.subTypeSelect.pleaseSelect.selected = true;
        View.sinumerikView.machineManagerCreateMachineMainDiv.insertBefore(View.sinumerikView.machineManagerCreateMachineMainDiv.subTypeSelectDiv, View.sinumerikView.machineManagerCreateMachineMainDiv.submitButtonDiv);
        View.sinumerikView.machineManagerCreateMachineMainDiv.insertBefore(View.sinumerikView.machineManagerCreateMachineMainDiv.diam90Div, View.sinumerikView.machineManagerCreateMachineMainDiv.submitButtonDiv);

    }


    //region create main div
    if (event == 'machineManagerNewMachineButtonClick') {
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
                //console.log(View.sinumerikView.machineManagerCreateMachineMainDiv.nameInput.value);
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
            View.sinumerikView.machineManagerCreateMachineMainDiv.submitButton.disabled = false;
            View.sinumerikView.machineManagerCreateMachineMainDiv.submitButton.addEventListener('click', function () {
                sinumerikEventHandler('{"emitter": "machineManager", "event": "createNewMachineSubmitClick"}');
            });


            View.sinumerikView.machineManagerCreateMachineMainDiv.submitButtonDiv.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.submitButton);
            View.sinumerikView.machineManagerCreateMachineMainDiv.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.submitButtonDiv);
            //endregion
        }

        if (!View.sinumerikView.machineManagerCreateMachineMainDiv.parentElement) {
            View.sinumerikView.machineManagerMainWindow.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv);
        }
    }

    //endregion

    if (!View.sinumerikView.machineManagerCreateMachineMainDiv.errorDiv) {
        View.sinumerikView.machineManagerCreateMachineMainDiv.errorDiv = document.createElement('div');
        View.sinumerikView.machineManagerCreateMachineMainDiv.errorDiv.className = 'sinumerikDiv sinumerikError';
        View.sinumerikView.machineManagerCreateMachineMainDiv.appendChild(View.sinumerikView.machineManagerCreateMachineMainDiv.errorDiv);
    }

    createMachineError('');

    function createMachineError(err) {
        View.sinumerikView.machineManagerCreateMachineMainDiv.errorDiv.innerText = err;
    }
}

function saveMachineData() {
    var machineFilePath = atom.packages.getPackageDirPaths()[0] + '/sinumerik-highlight/userData/machines.json';
    fs.remove(machineFilePath, err => {
        if (err) {
            console.error(err);
            return;
        }
        fs.writeFile(machineFilePath, JSON.stringify(View.sinumerikView.machineData), err => {
            if (err) {
                console.error(err);
                return;
            }
            loadMachineData();
            // console.log('success!')
        });
    })
}
'use babel';
/** @jsx etch.dom */

import EventRouter from "./event-router";
import {loadDataFromComment} from './inner-comment';
import {checkMachine, loadMachineData, saveMachineData} from "./machine-manager";
import {resizeSLDComponents} from "./single-line-debug"
import View from './sinumerik';
import sinumerik from "./sinumerik";
import {drawChanges} from "./interpretator";
import {getSnippets} from "./snippets";
import {handleSelection} from "./selection";
import {generateContourEditContainers} from "./contourEdit/contourEdit";
import {updateContourEditData} from "./contourEdit/tools/fs";
import {generatePlanes, selectPlane} from "./contourEdit/contourEditRight";
import {draw, updateDiamonAx, resizeContourEditCanvas} from "./contourEdit/canvas";
import {normalizeFileName} from "./utils";

export default class SinumerikView {

    constructor(serializedState) {
        this.eventRouter = new EventRouter();
        this.cycleHighlightMarker = [];
        this.cycleHighlight = [];

        let sinumerikEventHandler = this.eventRouter.route.bind(this);
        const Editor = atom.workspace.getActiveTextEditor();

        if (Editor) {
            this.selectionContains = (row) => {
                if (!this.selection) {
                    return
                }
                if (!this.selection.intersectsRow(row)) {
                    return
                }
                if (this.selection.end.row === row) {
                    if (this.selection.end.column === 0) {
                        return
                    }
                }
                return true
            }

            Editor.onDidChangeSelectionRange((selection) => {
                handleSelection(selection.newBufferRange)
            })

            Editor.onDidChangeCursorPosition(function () {
                sinumerikEventHandler('{"emitter": "editor", "event": "changeCursorPosition"}');
            });

            atom.workspace.onDidChangeActiveTextEditor(function (editor) {
                if (!View.modalPanel.visible) return
                const Editor = atom.workspace.getActiveTextEditor();
                if (!Editor) return

                const timerDiv = document.querySelector('#machiningTime')
                if (timerDiv) {
                    timerDiv.value = '--:--:--'
                    document.querySelector('#rapidTimeDiv').textContent = ''
                }

                Editor.onDidChangeSelectionRange((selection) => {
                    handleSelection(selection.newBufferRange)
                })

                const filename = Editor.getPath();
                if (Editor.getTitle().split('.')[1].toUpperCase().match("MPF|SPF")) {
                    if (!View.sinumerikView.programmData) {
                        loadDataFromComment();
                    }
                    if (!View.sinumerikView.programmData[filename] ||
                        JSON.stringify(View.sinumerikView.programmData[filename]).length < 3) {
                        loadDataFromComment();
                    }
                    checkMachine();
                }
                if (View.sinumerikView.activeTab == 'singleLine' &&
                    !View.sinumerikView.sldPinnedFile) {
                    sinumerikEventHandler('{"emitter": "singleLine", "event": "changeEditor"}');
                }
                if (View.sinumerikView.activeTab === 'contourEdit') {
                    sinumerikEventHandler('{"emitter": "singleLine", "event": "changeEditor"}')
                    if (View.sinumerikView.contourEditData) {
                        updateContourEditData()
                        View.sinumerikView.contourEditData.plane = selectPlane()
                        updateDiamonAx()
                        draw()
                    }
                }

                editor.onDidChangeCursorPosition(function () {
                    sinumerikEventHandler('{"emitter": "editor", "event": "changeCursorPosition"}');
                });
            });
        }

        this.activeTab = 'singleLine';

        this.Panel = document.createElement('div');
        this.Panel.classList.add('sinumerikPanel');
        this.addTemplate(this.Panel);
        this.Panel.dataset.activeTab = 'singleLine';
    }

    displayForm(modal) {
        if (modal.isVisible())
            modal.hide();
        else {
            this.resetValues();
            this.createWindow();
            modal.show();
        }
        this.update({modal});
    }

    addTemplate(parent) {

        //Panel head
        this.headContainer = document.createElement('div');
        this.headContainer.classList.add('sinumerikPanelHeadContainer');
        this.head = document.createElement('div');
        this.head.classList.add('sinumerikPanelHead');
        this.headContainer.appendChild(this.head);
        parent.appendChild(this.headContainer);
        //Panel main and right div's
        this.centralContainer = document.createElement('div');
        this.centralContainer.classList.add('sinumerikPanelCentralContainer');
        //Panel main
        this.main = document.createElement('div');
        this.main.classList.add('sinumerikPanelMain');
        //panel right
        this.right = document.createElement('div');
        this.right.classList.add('sinumerikPanelRight');
        //Append
        this.centralContainer.appendChild(this.main);
        this.centralContainer.appendChild(this.right);
        parent.appendChild(this.centralContainer);
        //Foot
        this.footContainer = document.createElement('div');
        this.footContainer.classList.add('sinumerikPanelFootContainer');
        this.foot = document.createElement('div');
        this.foot.classList.add('sinumerikPanelFoot');
        this.footContainer.appendChild(this.foot);
        parent.appendChild(this.footContainer);

        this.resizeDiv = document.createElement('div')
        this.resizeDiv.className = 'resize'
        this.resizeDiv.addEventListener('mousedown', handleMouseDown)
        parent.appendChild(this.resizeDiv);

        this.singleLineDebug();
        this.contourEdit();
        this.machineManager();

        this.savePanelWidth = document.createElement('button')
        this.savePanelWidth.className = 'sinumerikButton icon-check sinumerikButton--savePanelWidth'
        this.savePanelWidth.title = 'Save panel width'
        this.savePanelWidth.addEventListener('click', () => {
            this.machineData.panelWidth = (this.Panel.offsetWidth)
            saveMachineData()
            this.resizePanel()
        })
        this.head.appendChild(this.savePanelWidth);
    }

    machineManager() {
        let sinumerikEventHandler = this.eventRouter.route.bind(this);
        //region TopPanelButton
        this.machineManagerButton = document.createElement('button');
        this.machineManagerButton.innerText = 'Machine\nManager';
        this.machineManagerButton.className = 'sinumerikPanelHeadButton';
        this.machineManagerButton.addEventListener('click', function () {
            sinumerikEventHandler('{"emitter": "machineManager", "event": "machineManagerButtonClick"}');
        });
        this.head.appendChild(this.machineManagerButton);
        //endregion

        //region Foot container for controls
        this.machineManagerFootContainer = document.createElement('div');
        this.machineManagerFootContainer.className = "sinumerikMachineManagerFoot";
        this.foot.appendChild(this.machineManagerFootContainer);
        //endregion

        //region Main container
        this.machineManagerMainWindow = document.createElement('div');
        this.machineManagerMainWindow.className = "sinumerikMachineManagerMain";
        this.main.appendChild(this.machineManagerMainWindow);
        //endregion

        //region Right container
        this.machineManagerRightContainer = document.createElement('div');
        this.machineManagerRightContainer.className = "sinumerikMachineManagerRightContainer";
        this.right.appendChild(this.machineManagerRightContainer);

        //region Head
        this.machineManagerRightHead = document.createElement('div');
        this.machineManagerRightHead.className = 'sinumerikMachineManagerHead';
        this.machineManagerRightHead.innerText = 'Machines';
        this.machineManagerRightContainer.appendChild(this.machineManagerRightHead);
        //endregion

        //region Machine search button
        this.machineManagerMachineSearchButton = document.createElement('button');
        this.machineManagerMachineSearchButton.className = 'sinumerikRightButtons icon-search';
        this.machineManagerMachineSearchButton.addEventListener('click', function () {
            sinumerikEventHandler('{"emitter": "machineManager", "event": "machineManagerMachineSearchButtonClick"}');
        });
        this.machineManagerMachineSearchButton.title = 'Поиск';
        this.machineManagerRightContainer.appendChild(this.machineManagerMachineSearchButton);
        //endregion

        //region Search input
        this.machineManagerMachineSearchInput = document.createElement('input');
        this.machineManagerMachineSearchInput.className = 'sinumerikMachineSearchInput native-key-bindings';
        this.machineManagerMachineSearchInput.type = 'text';
        this.machineManagerMachineSearchInput.addEventListener('keydown', function (e) {
            if (e.keyCode == 13) {
                sinumerikEventHandler('{"emitter": "machineManager", "event": "machineManagerMachineSearchButtonClick"}');
            }
        });
        this.machineManagerRightContainer.appendChild(this.machineManagerMachineSearchInput);

        //endregion

        //region New Machine button
        this.machineManagerNewMachineButton = document.createElement('button');
        this.machineManagerNewMachineButton.className = 'sinumerikRightButtons icon-plus';
        this.machineManagerNewMachineButton.addEventListener('click', function () {
            sinumerikEventHandler('{"emitter": "machineManager", "event": "machineManagerNewMachineButtonClick"}');
        });
        this.machineManagerNewMachineButton.title = 'Создать станок';
        this.machineManagerRightContainer.appendChild(this.machineManagerNewMachineButton);
        //endregion
        //endregion

        this.toolContainer = document.createElement('div');
        this.toolContainer.className = 'toolContainer';
        this.right.appendChild(this.toolContainer);
        this.toolContainer.head = document.createElement('div');
        this.toolContainer.head.className = 'sinumerikMachineManagerHead';
        this.toolContainer.head.innerText = 'Tools';
        this.toolContainer.appendChild(this.toolContainer.head);
        this.toolContainer.secondHead = document.createElement('div');
        this.toolContainer.secondHead.innerText = 'Tool numbers for parse $TC_DP2 variable (tool orientataion)'
        this.toolContainer.appendChild(this.toolContainer.secondHead);
        this.toolContainer.body = document.createElement('div');
        this.toolContainer.appendChild(this.toolContainer.body);

    }

    singleLineDebug() {
        let sinumerikEventHandler = this.eventRouter.route.bind(this);

        //Button for single line debug
        this.singleLineDebugButton = document.createElement('button');
        this.singleLineDebugButton.innerText = 'SL\ndebug';
        this.singleLineDebugButton.className = 'sinumerikPanelHeadButtonSelect';
        //first onclick create single line debug containers
        // let SLDebug = this.singleLineDebug.bind(this);
        this.singleLineDebugButton.addEventListener("click", function () {
            // SLDebug();
            sinumerikEventHandler('{"emitter": "singleLine", "event": "singleLineDebugButtonClick"}');
        });
        this.head.appendChild(this.singleLineDebugButton);

        //region Foot container for controls.
        this.singleLineDebugFootContainer = document.createElement('div');
        this.singleLineDebugFootContainer.className = 'sinumerikSLDFootContainer';
        this.foot.appendChild(this.singleLineDebugFootContainer);
        //endregion

        //region Main container
        this.singleLineDebugMainWindow = document.createElement('div');
        this.singleLineDebugMainWindow.className = "sinumerikSingleLineDebugMain";
        this.main.appendChild(this.singleLineDebugMainWindow);
        //endregion
    }

    contourEdit() {
        let sinumerikEventHandler = this.eventRouter.route.bind(this);

        //Button for contour Edit
        this.contourEditButton = document.createElement('button');
        this.contourEditButton.innerText = 'contour\nedit';
        this.contourEditButton.className = 'sinumerikPanelHeadButton';
        this.contourEditButton.addEventListener('click', function () {
            sinumerikEventHandler('{"emitter": "contourEdit", "event": "contourEditButtonClick"}');
        });
        this.head.appendChild(this.contourEditButton);

        generateContourEditContainers(this)
    }

    resizePanel(increment) {
        if (!this.machineData) {
            loadMachineData(() => {
                setTimeout(()=> {
                    if (!this.machineData) console.log('jopa')
                    this.resizePanel()
                }, 300)
            })
            return
        }

        const editorWidth = atom.workspace.panelContainers.top.element.offsetWidth;
        const editorHeight = atom.workspace.paneContainers.right.element.clientHeight;
        const widthFactor = 0.6;

        let panelWidth
        if (increment === undefined) {
            if (!this.machineData.panelWidth) {
                panelWidth = editorWidth * widthFactor
            } else {
                panelWidth = this.machineData.panelWidth
            }
        } else {
            panelWidth = this.Panel.offsetWidth + increment
            if (panelWidth < 100) return 1
            if (editorWidth < 100 && increment > 0) return 1
        }

        this.Panel.style.setProperty('--panel-width', `${panelWidth}px`)
        this.Panel.style.setProperty('--panel-height', `${editorHeight}px`)
        if (!atom.workspace.getActiveTextEditor()) {
            return 1
        }

        if (this.toolContainer.body.firstChild && this.Panel.dataset.activeTab === 'machineManager') {
            for (let i = 0; i < 9; i++) {
                const width = Math.round((panelWidth - Math.round((panelWidth) * 0.7) - 10) / 3);
                for (let i = 0; i < 9; i++) {
                    this.toolContainer.body.elements[i].style.width = `${width}px`;
                }
            }
        }

        if (this.singleLineDebugCanvas) {
            resizeSLDComponents(panelWidth);
        }

        if (this.contourEditMainWindow && this.contourEditMainWindow.canvas) {
            resizeContourEditCanvas();
        }

        if (this.machineData.panelWidth && this.machineData.panelWidth === panelWidth) {
            this.savePanelWidth.classList.remove('icon-unverified')
            this.savePanelWidth.classList.add('icon-verified')
        } else {
            this.savePanelWidth.classList.remove('icon-verified')
            this.savePanelWidth.classList.add('icon-unverified')
        }
    }

    //comment / uncomment lines
    comment() {
        const Editor = atom.workspace.getActiveTextEditor();
        const range = Editor.getSelectedBufferRange();
        let select = 0;
        if (range.start.row == range.end.row) {
            select = 1;
        }
        if (range.end.column > 0) {
            select = 1
        }

        let commentOnFirstRow = 0;
        let ident = 1;
        if (Editor.lineTextForBufferRow(range.start.row).trim()[0] == ';') {
            commentOnFirstRow = 1;
        }
        if (commentOnFirstRow == 1) {
            for (let i = range.start.row; i < range.end.row + select; i++) {
                let commentOnRow = 0;
                if (Editor.lineTextForBufferRow(i).trim()[0] == ';') {
                    commentOnRow = 1;
                }
                if (commentOnRow != commentOnFirstRow) {
                    ident = 0;
                    break;
                }
            }
        }
        if (commentOnFirstRow == 1 && ident == 1) {
            for (let i = range.start.row; i < range.end.row + select; i++) {
                Editor.setCursorBufferPosition([i, Editor.lineTextForBufferRow(range.start.row).indexOf(';')]);
                Editor.delete();
            }
        } else {
            for (let i = range.start.row; i < range.end.row + select; i++) {
                Editor.setCursorBufferPosition([i, Editor.lineTextForBufferRow(range.start.row).indexOf(';')]);
                Editor.insertText(';');
            }
        }
        Editor.setSelectedScreenRange(range);
    }

    redraw() {
        atom.workspace.panelContainers.right.panels.forEach(function (panel) {
            if (panel.item.className == 'sinumerikPanel') {
                if (panel.visible) {
                    const timerDiv = panel.item.querySelector('#machiningTime')
                    if (timerDiv) {
                        timerDiv.value = '--:--:--'
                        panel.item.querySelector('#rapidTimeDiv').textContent = ''
                    }
                    if (!View.sinumerikView.parseData || View.sinumerikView.Panel.dataset.activeTab !== 'singleLine') {
                        sinumerik.sinumerikView.eventRouter.route('{"emitter": "singleLine", "event": "singleLineDebugButtonClick"}');
                    } else {
                        sinumerik.sinumerikView.eventRouter.route('{"emitter": "singleLine", "event": "drawChanges"}');
                    }
                }
            }
        });
    }

    contourEditTab() {
        atom.workspace.panelContainers.right.panels.forEach(panel => {
            if (panel.item.className == 'sinumerikPanel') {
                if (panel.visible) {
                    sinumerik.sinumerikView.eventRouter.route('{"emitter": "contourEdit", "event": "contourEditButtonClick"}');
                }
            }
        })
    }

    getSnip() {
        getSnippets()
    }

    // Returns an object that can be retrieved when package is activated
    serialize() {
    }

    // Tear down any state and detach
    destroy() {
        this.Panel.remove();
    }

    getElement() {
        return this.Panel;
    }

    toggleSldPin() {
        const Editor = atom.workspace.getActiveTextEditor()
        if (!Editor) return

        if (this.sldPinnedFile) {
            // Unpin
            this.sldPinnedFile = null
            if (this.sldPinButton) {
                this.sldPinButton.classList.remove('sinumerikSLDPinActive')
                this.sldPinButton.title = 'Pin current file to SLD'
                this.sldPinButton.innerText = ''
            }
        } else {
            // Pin current file
            const filename = Editor.getPath()
            if (!filename?.toUpperCase().match(/MPF|SPF/)) return
            this.sldPinnedFile = filename
            if (this.sldPinButton) {
                this.sldPinButton.classList.add('sinumerikSLDPinActive')
                const base = filename.slice(filename.lastIndexOf('/') + 1)
                this.sldPinButton.title = `Pinned: ${base} — click to unpin`
                this.sldPinButton.innerText = base
            }
        }
    }
}

let lastMouseCoord

const handleMove = (e) => {
    const increment = lastMouseCoord - e.clientX
    if (Math.abs(increment) < 5) return
    if (!View.sinumerikView.resizePanel(increment)) {
        lastMouseCoord = e.clientX;
    }
}

const handleMouseDown = (e) => {
    lastMouseCoord = e.clientX;
    document.addEventListener('mouseup', handleMouseUp)
    document.addEventListener('mousemove', handleMove)
}

const handleMouseUp = () => {
    document.removeEventListener('mouseup', handleMouseUp)
    document.removeEventListener('mousemove', handleMove)

    if (View.sinumerikView.singleLineDebugCanvas) {
        drawChanges(1)
    }
}

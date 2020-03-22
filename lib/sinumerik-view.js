'use babel';
/** @jsx etch.dom */

import EventRouter from "./event-router";

export default class SinumerikView {


  constructor(serializedState) {
    this.eventRouter = new EventRouter();
    this.cycleHighlightMarker = [];
    this.cycleHighlight = [];

    let sinumerikEventHandler = this.eventRouter.route.bind(this);
    const Editor = atom.workspace.getActiveTextEditor();
    Editor.onDidChangeCursorPosition(function() {
          sinumerikEventHandler('{"emitter": "editor", "event": "changeCursorPosition"}');
       });
    atom.workspace.onDidChangeActiveTextEditor(function (editor) {
      editor.onDidChangeCursorPosition(function() {
           sinumerikEventHandler('{"emitter": "editor", "event": "changeCursorPosition"}');
        });
    });

    this.activeTab = "jopa";
    //visibility
    this.singleLineDebugVisibility = 'visible';
    this.counturEditVisibility = 'hidden';
    this.machineManagerVisibility = 'hidden';

    this.Panel = document.createElement('div');
    this.Panel.classList.add('sinumerikPanel');
    this.addTemplate(this.Panel);
  }

  displayForm(modal) {
    if(modal.isVisible())
      modal.hide();
    else{
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

    this.singleLineDebug();
    this.counturEdit();
    this.machineManager();
  }

  machineManager() {
    let sinumerikEventHandler = this.eventRouter.route.bind(this);
    //region TopPanelButton
    this.machineManagerButton = document.createElement('button');
    this.machineManagerButton.innerText = 'Machine\nManager';
    this.machineManagerButton.className = 'sinumerikPanelHeadButton';
    this.machineManagerButton.addEventListener('click', function() {
      sinumerikEventHandler('{"emitter": "machineManager", "event": "machineManagerButtonClick"}');
    });
    this.head.appendChild(this.machineManagerButton);
    //endregion

    //region Foot container for controls
    this.machineManagerFootContainer = document.createElement('div');
    this.machineManagerFootContainer.className = "sinumerikMachineManagerFoot";
    this.machineManagerFootContainer.style.visibility = this.machineManagerVisibility;
    this.foot.appendChild(this.machineManagerFootContainer);
    //endregion

    //region Main container
    this.machineManagerMainWindow = document.createElement('div');
    this.machineManagerMainWindow.className = "sinumerikMachineManagerMain";
    this.machineManagerMainWindow.style.visibility = this.machineManagerVisibility;
    this.main.appendChild(this.machineManagerMainWindow);
    //endregion

    //region Right container
    this.machineManagerRightContainer = document.createElement('div');
    this.machineManagerRightContainer.className = "sinumerikMachineManagerRightContainer";
    this.machineManagerRightContainer.style.visibility = this.machineManagerVisibility;
    this.right.appendChild(this.machineManagerRightContainer);

    //region Head
    this.machineManagerRightHead = document.createElement('div');
    this.machineManagerRightHead.className = 'sinumerikMachineManagerRightHead';
    this.machineManagerRightHead.innerText = 'Machines';
    this.machineManagerRightContainer.appendChild(this.machineManagerRightHead);
    //endregion

    //region Machine search button
    this.machineManagerMachineSearchButton = document.createElement('button');
    this.machineManagerMachineSearchButton.className = 'sinumerikRightButtons icon-search';
    this.machineManagerMachineSearchButton.addEventListener('click', function() {
      sinumerikEventHandler('{"emitter": "machineManager", "event": "machineManagerMachineSearchButtonClick"}');
    });
    this.machineManagerMachineSearchButton.style.verticalAlign = 'bottom';
    this.machineManagerMachineSearchButton.style.height = '25px';
    this.machineManagerRightContainer.appendChild(this.machineManagerMachineSearchButton);
    //endregion


    //region Search input
    this.machineManagerMachineSearchInput = document.createElement('input');
    this.machineManagerMachineSearchInput.className = 'sinumerikMachineSearchInput native-key-bindings';
    this.machineManagerMachineSearchInput.type = 'text';
    this.machineManagerMachineSearchInput.style.height = '25px';
    this.machineManagerMachineSearchInput.addEventListener('keydown', function(e) {
      if (e.keyCode == 13) {
        sinumerikEventHandler('{"emitter": "machineManager", "event": "machineManagerMachineSearchButtonClick"}');
      }
    });
    this.machineManagerMachineSearchButton.title = 'Поиск';
    this.machineManagerRightContainer.appendChild(this.machineManagerMachineSearchInput);

    //endregion

    //region New Machine button
    this.machineManagerNewMachineButton = document.createElement('button');
    this.machineManagerNewMachineButton.className = 'sinumerikRightButtons icon-plus';
    this.machineManagerNewMachineButton.addEventListener('click', function() {
      sinumerikEventHandler('{"emitter": "machineManager", "event": "machineManagerNewMachineButtonClick"}');
    });
    this.machineManagerNewMachineButton.style.verticalAlign = 'bottom';
    this.machineManagerNewMachineButton.style.height = '25px';
    this.machineManagerNewMachineButton.title = 'Создать станок';
    this.machineManagerRightContainer.appendChild(this.machineManagerNewMachineButton);
    //endregion
    //endregion

  }

  singleLineDebug() {
    let sinumerikEventHandler = this.eventRouter.route.bind(this);

    //Button for single line debug
    this.singleLineDebugButton = document.createElement('button');
    this.singleLineDebugButton.innerText = 'SL\ndebug';
    this.singleLineDebugButton.className = 'sinumerikPanelHeadButtonSelect';
    //first onclick create single line debug containers
    // let SLDebug = this.singleLineDebug.bind(this);
    this.singleLineDebugButton.addEventListener("click", function() {
      // SLDebug();
      sinumerikEventHandler('{"emitter": "singleLine", "event": "singleLineDebugButtonClick"}');
    });
    this.head.appendChild(this.singleLineDebugButton);

    //region Foot container for controls.
    this.singleLineDebugFootContainer = document.createElement('div');
    this.singleLineDebugFootContainer.className = "sinumerikSingleLineDebugFoot";
    this.singleLineDebugFootContainer.style.visibility = this.singleLineDebugVisibility;
    this.foot.appendChild(this.singleLineDebugFootContainer);
    //endregion

    //region Foot controls
    //region Home button
    this.singleLineDebugFootHomeButton = document.createElement('button');
    this.singleLineDebugFootHomeButton.innerText = 'HOME';
    this.singleLineDebugFootHomeButton.className = 'sinumerikFootButton';
    this.singleLineDebugFootHomeButton.addEventListener('click', function (){
      sinumerikEventHandler('{"emitter": "singleLine", "event": "singleLineDebugHomeButtoClick"}');
    });
    this.singleLineDebugFootContainer.appendChild(this.singleLineDebugFootHomeButton);
    //endregion

    //region Next button
    this.singleLineDebugFootNextButton = document.createElement('button');
    this.singleLineDebugFootNextButton.innerText = 'NEXT';
    this.singleLineDebugFootNextButton.className = 'sinumerikFootButton';
    this.singleLineDebugFootNextButton.addEventListener('click', function (){
      sinumerikEventHandler('{"emitter": "singleLine", "event": "singleLineDebugNextButtoClick"}');
    });
    this.singleLineDebugFootContainer.appendChild(this.singleLineDebugFootNextButton);
    //endregion

    //region Prev button
    this.singleLineDebugFootPrevButton = document.createElement('button');
    this.singleLineDebugFootPrevButton.innerText = 'PREV';
    this.singleLineDebugFootPrevButton.className = 'sinumerikFootButton';
    this.singleLineDebugFootPrevButton.addEventListener('click', function (){
      sinumerikEventHandler('{"emitter": "singleLine", "event": "singleLineDebugPrevButtoClick"}');
    });
    this.singleLineDebugFootContainer.appendChild(this.singleLineDebugFootPrevButton);
    //endregion
    //endregion

    //region Main container
    this.singleLineDebugMainWindow = document.createElement('div');
    this.singleLineDebugMainWindow.className = "sinumerikSingleLineDebugMain";
    this.singleLineDebugMainWindow.style.visibility = this.singleLineDebugVisibility;
    this.main.appendChild(this.singleLineDebugMainWindow);
    //endregion
  }

  counturEdit() {
    let sinumerikEventHandler = this.eventRouter.route.bind(this);

    //Button for countur Edit
    this.counturEditButton = document.createElement('button');
    this.counturEditButton.innerText = 'Countur\nedit';
    this.counturEditButton.className = 'sinumerikPanelHeadButton';
    this.counturEditButton.addEventListener('click',function () {
      sinumerikEventHandler('{"emitter": "counturEdit", "event": "counturEditButtonClick"}');
    });
    this.head.appendChild(this.counturEditButton);

    //Foot container for controls
    this.counturEditFootContainer = document.createElement('div');
    this.counturEditFootContainer.className = "sinumerikCounturEditFoot";
    this.counturEditFootContainer.style.visibility = this.counturEditVisibility;
    this.foot.appendChild(this.counturEditFootContainer);

    //Main container
    this.counturEditMainWindow = document.createElement('div');
    this.counturEditMainWindow.className = 'sinumerikCounturEditMain';
    this.counturEditMainWindow.style.visibility = this.counturEditVisibility;
    this.main.appendChild(this.counturEditMainWindow);

  }

  resizePanel() {
    const editorWidth = atom.workspace.panelContainers.top.element.offsetWidth;
    const editorHeight = atom.workspace.paneContainers.right.element.clientHeight;
    const widthFactor = 0.6;
    const mainHeightFactor = 0.8;
    //width
    this.Panel.style.width = `${editorWidth * widthFactor}px`;
    this.head.style.width =  `${editorWidth * widthFactor}px`;
    this.main.style.width =  `${Math.round((editorWidth * widthFactor)*0.7)}px`;
    this.right.style.width =  `${editorWidth * widthFactor - Math.round((editorWidth * widthFactor)*0.7)}px`;
    this.foot.style.width =  `${editorWidth * widthFactor}px`;
    //height
    this.Panel.style.height = `${editorHeight}px`;
    this.head.style.height = `40px`;
    this.main.style.height = `${Math.round((editorHeight-40)*mainHeightFactor)}px`;
    this.main.style.maxHeight = this.main.style.height;
    this.right.style.height = `${Math.round((editorHeight-40)*mainHeightFactor)}px`;
    this.foot.style.height = `${editorHeight - 40 - Math.round((editorHeight-40)*mainHeightFactor)}px`;


    //region Machine search input and buttons resize
    var buttonWidth = 30;
    this.machineManagerMachineSearchButton.style.width = `${buttonWidth}px`;
    this.machineManagerNewMachineButton.style.width = `${buttonWidth}px`;
    this.machineManagerMachineSearchInput.style.width = `${editorWidth * widthFactor - Math.round((editorWidth * widthFactor)*0.7) - 5 - 2 * buttonWidth}px`;
    //endregion





  }

  // Returns an object that can be retrieved when package is activated
  serialize() {}

  // Tear down any state and detach
  destroy() {
    this.Panel.remove();
  }

  getElement() {
    return this.Panel;
  }

}

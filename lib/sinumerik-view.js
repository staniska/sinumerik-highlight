'use babel';
/** @jsx etch.dom */

import EventRouter from "./event-router";

export default class SinumerikView {



  constructor(serializedState) {
    console.log(atom);
    this.activeTab = "jopa";
    //visibility
    this.singleLineDebugVisibility = 'visible';
    this.counturEditVisibility = 'hidden';


    this.eventRouter = new EventRouter();

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
    this.resizePanel();

    this.singleLineDebug();

    this.counturEdit();
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

    //Foot container for controls.
    this.singleLineDebugFootContainer = document.createElement('div');
    this.singleLineDebugFootContainer.className = "sinumerikSingleLineDebugFoot";
    this.singleLineDebugFootContainer.style.visibility = this.singleLineDebugVisibility;
    this.foot.appendChild(this.singleLineDebugFootContainer);

 //Foot controls
    //Home button
    this.singleLineDebugFootHomeButton = document.createElement('button');
    this.singleLineDebugFootHomeButton.innerText = 'HOME';
    this.singleLineDebugFootHomeButton.className = 'sinumerikFootButton';
    this.singleLineDebugFootHomeButton.addEventListener('click', function (){
      sinumerikEventHandler('{"emitter": "singleLine", "event": "singleLineDebugHomeButtoClick"}');
    });
    this.singleLineDebugFootContainer.appendChild(this.singleLineDebugFootHomeButton);

    //Next button
    this.singleLineDebugFootNextButton = document.createElement('button');
    this.singleLineDebugFootNextButton.innerText = 'NEXT';
    this.singleLineDebugFootNextButton.className = 'sinumerikFootButton';
    this.singleLineDebugFootNextButton.addEventListener('click', function (){
      sinumerikEventHandler('{"emitter": "singleLine", "event": "singleLineDebugNextButtoClick"}');
    });
    this.singleLineDebugFootContainer.appendChild(this.singleLineDebugFootNextButton);

    //Prev button
    this.singleLineDebugFootPrevButton = document.createElement('button');
    this.singleLineDebugFootPrevButton.innerText = 'PREV';
    this.singleLineDebugFootPrevButton.className = 'sinumerikFootButton';
    this.singleLineDebugFootPrevButton.addEventListener('click', function (){
      sinumerikEventHandler('{"emitter": "singleLine", "event": "singleLineDebugPrevButtoClick"}');
    });
    this.singleLineDebugFootContainer.appendChild(this.singleLineDebugFootPrevButton);





    //Main container
    this.singleLineDebugMainWindow = document.createElement('div');
    this.singleLineDebugMainWindow.className = "sinumerikSingleLineDebugMain";
    this.singleLineDebugMainWindow.style.visibility = this.singleLineDebugVisibility;
    this.main.appendChild(this.singleLineDebugMainWindow);

    // atom.workspace.getActiveTextEditor().moveToTop();
    // this.singleLineDebugFootContainer.style.visibility = 'visible';
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
    //width
    this.Panel.style.width = `${editorWidth * widthFactor}px`;
    this.head.style.width =  `${editorWidth * widthFactor}px`;
    this.main.style.width =  `${Math.round((editorWidth * widthFactor)*0.7)}px`;
    this.right.style.width =  `${editorWidth * widthFactor - Math.round((editorWidth * widthFactor)*0.7)}px`;
    this.foot.style.width =  `${editorWidth * widthFactor}px`;
    //height
    this.Panel.style.height = `${editorHeight}px`;
    this.head.style.height = `40px`;
    this.main.style.height = `${Math.round((editorHeight-40)*0.7)}px`;
    this.main.style.maxHeight = this.main.style.height;
    this.right.style.height = `${Math.round((editorHeight-40)*0.7)}px`;
    this.foot.style.height = `${editorHeight - 40 - Math.round((editorHeight-40)*0.7)}px`;
  }


  //Make a div in Main sinumerik panel with text from editor
  // bufferFromEditor() {
  //   atom.workspace.observeTextEditors(editor => {
  //     if (!this.bufferDiv) {
  //       this.bufferDiv = document.createElement('div');
  //       this.bufferDiv.addEventListener("scroll", function () {
  //         console.log("FFF");
  //       });
  //       this.bufferDiv.style.overflow = 'auto';
  //       this.bufferDiv.style.height = '100%';
  //       this.main.appendChild(this.bufferDiv);
  //     }
  //     this.bufferDiv.innerText = editor.getText();
  //
  //   });
  // }




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

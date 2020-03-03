'use babel';
/** @jsx etch.dom */

import eventRouter from "./event-router";

export default class SinumerikView {



  constructor(serializedState) {
    console.log(atom);
    this.eventRouter = new eventRouter();
    this.Panel = document.createElement('div');
    this.Panel.classList.add('sinumerikPanel');
    this.addTemplate(this.Panel);

    this.activeTab = "Jopa";


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
    let sinumerikEventHandler = this.eventRouter.route.bind(this);

    //Panel head
    this.headContainer = document.createElement('div')
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

    //Button for single line debug
    this.singleLineDebugButton = document.createElement('button');
    this.singleLineDebugButton.innerText = 'SL\ndebug';
    this.singleLineDebugButton.className = 'sinumerikPanelHeadButtonSelect';
    //first onclick create single line debug containers
    // let SLDebug = this.singleLineDebug.bind(this);
    this.singleLineDebugButton.addEventListener("click", function(Event) {
      // SLDebug();
      sinumerikEventHandler('{"emitter": "singleLine", "event": "singleLineDebugButtonClick"}');
    });
    this.head.appendChild(this.singleLineDebugButton);

    //Button for countur Edit
    this.counturEditButton = document.createElement('button');
    this.counturEditButton.innerText = 'Countur\nedit';
    this.counturEditButton.className = 'sinumerikPanelHeadButton';
    this.counturEditButton.addEventListener('click',function (Event) {
      sinumerikEventHandler('{"emitter": "counturEdit", "event": "counturEditButtonClick"}');
    });
    this.head.appendChild(this.counturEditButton);






  }

  eventRouter(event) {

  }


  singleLineDebug() {
    //Foot container for controls. It's hidden while button not pressed
    if (!this.singleLineDebugFootContainer) {
      this.singleLineDebugFootContainer = document.createElement('div');
      this.singleLineDebugFootContainer.style.visibility = 'hidden';
      this.singleLineDebugFootContainer.style.backgroundColor = 'red';
      this.singleLineDebugFootContainer.style.width = '100px';
      this.singleLineDebugFootContainer.style.height = '100px';

      this.foot.appendChild(this.singleLineDebugFootContainer);
    }

    atom.workspace.getActiveTextEditor().moveToTop();
    this.singleLineDebugFootContainer.style.visibility = 'visible';
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
  bufferFromEditor() {
    atom.workspace.observeTextEditors(editor => {
      if (!this.bufferDiv) {
        this.bufferDiv = document.createElement('div');
        this.bufferDiv.addEventListener("scroll", function (event) {
          console.log("FFF");
        });
        this.bufferDiv.style.overflow = 'auto';
        this.bufferDiv.style.height = '100%';
        this.main.appendChild(this.bufferDiv);
      }
      this.bufferDiv.innerText = editor.getText();

    });
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

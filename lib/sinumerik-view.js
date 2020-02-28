'use babel';
/** @jsx etch.dom */

export default class SinumerikView {

  constructor(serializedState) {
    console.log(atom);

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

    this.head.innerText = 'HEADмного лишних букав';
    this.main.innerText = 'MAIN';
    this.right.innerText = 'RIGHT';
    this.foot.innerText = 'FOOT';


    this.resizePanel();
//    console.log(atom);
  }


  resizePanel() {
    const editorWidth = atom.workspace.panelContainers.top.element.offsetWidth;
    const editorHeight = atom.workspace.paneContainers.center.paneContainer.element.offsetHeight;
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
    this.right.style.height = `${Math.round((editorHeight-40)*0.7)}px`;
    this.foot.style.height = `${editorHeight - Math.round((editorHeight-40)*0.7)}px`;
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

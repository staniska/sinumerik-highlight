'use babel';
/** @jsx etch.dom */

export default class SinumerikView {

  constructor(serializedState) {

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
    //Main table
    this.table = document.createElement('table');
    this.table.classList.add('sinumerikWinTable');
    const headTr = document.createElement('tr');
    const headTd = document.createElement('td');
    const bodyTr =  document.createElement('tr');
    const footTr =  document.createElement('tr');
    const leftBodyTd = document.createElement('td');
    const middleBodyTd = document.createElement('td');
    const rightBodyTd = document.createElement('td');
    const footTd = document.createElement('td');

    this.table.appendChild(headTr);
    headTr.appendChild(headTd);
    headTd.innerText = 'Head';
    this.table.appendChild(bodyTr);
    bodyTr.appendChild(leftBodyTd);
    bodyTr.appendChild(middleBodyTd);
    bodyTr.appendChild(rightBodyTd);
    leftBodyTd.innerText = 'Left';
    middleBodyTd.innerText = 'middle';
    rightBodyTd.innerText = 'right';
    this.table.appendChild(footTr);
    footTr.appendChild(footTd);
    footTd.innerText = 'Foot';
    this.resizePanel();
    console.log(atom);
    parent.appendChild(this.table);
  }


  resizePanel() {
    this.table.width = atom.workspace.panelContainers.top.element.offsetWidth / 2;
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

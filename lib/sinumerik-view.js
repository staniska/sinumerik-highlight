'use babel';
/** @jsx etch.dom */

//import etch from 'etch'
import {CompositeDisposable, TextEditor} from 'atom'
import fs from 'fs'
import path from 'path'
//import escapeJSON from 'escape-json-node'
//import cson from 'cson'


export default class SinumerikView {

  constructor(serializedState) {
    // Create root element
    /*this.element = document.createElement('div');
    this.element.classList.add('sinumerik');

    // Create message element
    const message = document.createElement('div');
    message.textContent = 'The Sinumerik package is Alive! It\'s ALIVE!';
    message.classList.add('message');
    this.element.appendChild(message);
    */

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
    const table = document.createElement('table');
    table.classList.add('sinumerikWinTable');
    const headTr = document.createElement('tr');
    const headTd = document.createElement('td');
    const bodyTr =  document.createElement('tr');
    const footTr =  document.createElement('tr');
    const leftBodyTd = document.createElement('td');
    const middleBodyTd = document.createElement('td');
    const rightBodyTd = document.createElement('td');
    const footTd = document.createElement('td');

    table.appendChild(headTr);
    headTr.appendChild(headTd);
    headTd.innerText = 'Head';
    table.appendChild(bodyTr);
    bodyTr.appendChild(leftBodyTd);
    bodyTr.appendChild(middleBodyTd);
    bodyTr.appendChild(rightBodyTd);
    leftBodyTd.innerText = 'Left';
    middleBodyTd.innerText = 'middle';
    rightBodyTd.innerText = 'right';
    table.appendChild(footTr);
    footTr.appendChild(footTd);
    footTd.innerText = 'Foot';
    this.resizePanel(table);
    parent.appendChild(table);
  }

  resizePanel(table) {
    table.width = atom.workspace.panelContainers.top.element.offsetWidth / 2;
  }


  // Returns an object that can be retrieved when package is activated
  serialize() {}

  // Tear down any state and detach
  destroy() {
    this.Jopa.remove();
  }

  getElement() {
    return this.Panel;
  }

}

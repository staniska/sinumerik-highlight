'use babel'


import View from './sinumerik';

export default class EventRouter{
    route(event) {
        event = JSON.parse(event);
        let emitter = event.emitter;
        event = event.event;

        if (emitter == 'singleLine') {
            singleLine(event);
        } else if (emitter == 'counturEdit') {
            counturEdit(event);
        } else {
            console.log(event);
        }
    }
}

function singleLine(event) {
    var parseNeed = 0;
    var textLine = '';

    //console.log("SLD " + event);
    if (event == 'singleLineDebugButtonClick') {
        changeActiveTab('singleLine');
        View.sinumerikView.counturEditButton.className = 'sinumerikPanelHeadButton';
        View.sinumerikView.singleLineDebugButton.className = 'sinumerikPanelHeadButtonSelect';
    }
    if (event == 'singleLineDebugHomeButtoClick') {
        textLine = getHomeLineText();
        parseNeed = 1;
    }
    if (event == 'singleLineDebugNextButtoClick') {
        textLine = getNextLineText()
        parseNeed = 1;
    }
    if (event == 'singleLineDebugPrevButtoClick') {
        textLine = getPrevLineText();
        parseNeed = 1;
    }



    if (parseNeed) {
        View.sinumerikView.singleLineDebugMainWindow.innerText = parseSelectedLine(textLine);
    }
}

function getHomeLineText() {
    const Editor = atom.workspace.getActiveTextEditor();
    Editor.moveToTop();
    Editor.moveToEndOfLine();
    Editor.selectToBeginningOfLine();
    return Editor.getSelectedText();
}

function getNextLineText() {
    const Editor = atom.workspace.getActiveTextEditor();
    Editor.moveToEndOfLine();
    Editor.moveDown();
    Editor.moveToEndOfLine();
    Editor.selectToBeginningOfLine();
    return Editor.getSelectedText();
}

function getPrevLineText() {
    const Editor = atom.workspace.getActiveTextEditor();
    Editor.moveToBeginningOfLine();
    Editor.moveUp();
    Editor.moveToEndOfLine();
    Editor.selectToBeginningOfLine();
    return Editor.getSelectedText();
}


function parseSelectedLine(textLine) {
    //remove spaces from beginning and end
    const Editor = atom.workspace.getActiveTextEditor();

    var trimedLine = textLine.split(";")[0].trim();
    if (trimedLine.length == 0) {
        return 0;
    }

    //Read 1st word.
    var firstWord = trimedLine.split(" ")[0];
    //IF ENDIF
    if (firstWord == 'IF') {
        var ifLevel = 0;
        var ifLine = Editor.getCursorScreenPosition().row;
        var elseLine = 0;
        var endifLine = 0;
        console.log(ifLine);
    }
    return('AAA');
}

function counturEdit(event) {
    console.log("CE " + event);
    if (event == 'counturEditButtonClick') {
        changeActiveTab('counturEdit');
        View.sinumerikView.counturEditButton.className = 'sinumerikPanelHeadButtonSelect';
        View.sinumerikView.singleLineDebugButton.className = 'sinumerikPanelHeadButton';
    }
}

function changeActiveTab(newTab) {
    if (View.sinumerikView.activeTab != newTab) {
        var singleLineDelay = 0;
        var counturEditDelay = 0;
        var visibilityDelay = 300;
        View.sinumerikView.activeTab = newTab;
        if (newTab == 'singleLine') {
            singleLineDelay = visibilityDelay;
            View.sinumerikView.singleLineDebugVisibility = 'visible';
            View.sinumerikView.counturEditVisibility = 'hidden';
        } else if (newTab == 'counturEdit') {
            counturEditDelay = visibilityDelay;
            View.sinumerikView.singleLineDebugVisibility = 'hidden';
            View.sinumerikView.counturEditVisibility = 'visible';
        } else {
            console.log('set active tab error!!!');
        }
        setTimeout(setCounturEditVisibility, counturEditDelay);
        setTimeout(setSingleLineDebugVisibility, singleLineDelay);
    } else {
        console.log('Old tab');
    }
}

function setCounturEditVisibility() {
    View.sinumerikView.counturEditFootContainer.style.visibility = View.sinumerikView.counturEditVisibility;
    View.sinumerikView.counturEditMainWindow.style.visibility = View.sinumerikView.counturEditVisibility;
}

function setSingleLineDebugVisibility() {
    View.sinumerikView.singleLineDebugFootContainer.style.visibility = View.sinumerikView.singleLineDebugVisibility;
    View.sinumerikView.singleLineDebugMainWindow.style.visibility = View.sinumerikView.singleLineDebugVisibility;
}
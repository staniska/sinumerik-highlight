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
        } else if (emitter == 'editor') {
            if (event == 'changeCursorPosition') {
                cyclesHighlight();
            }
        }
        else {
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

function cyclesHighlight() {
    const Editor = atom.workspace.getActiveTextEditor();
    const row = Editor.getCursorBufferPosition().row;
    var firstOperator = Editor.lineTextForBufferRow(row).trim().split(" ")[0];
    // console.log('search row ' + row);
    if (firstOperator == "IF" || firstOperator == 'ELSE' || firstOperator == 'ENDIF') {
        searchEndif(row,firstOperator, Editor);
    } else {
        for (let i = 0; i < View.sinumerikView.cycleHighlightMarker.length; i++) {
            try {
                View.sinumerikView.cycleHighlightMarker[i].destroy();
            } catch (err) {
                console.log('highlight error '+ err);
            }
        }
    }
}

function highlightRows(Editor, highlightedRows, typeHighlight) {
    // console.log("ppp" + highlightedRows);
    for (let i = 0; i < View.sinumerikView.cycleHighlightMarker.length; i++) {
        try {
            View.sinumerikView.cycleHighlightMarker[i].destroy();
        } catch (err) {
            console.log('highlight error '+ err);
        }
    }
    for (let i = 0; i < highlightedRows.length; i++) {
        var row = highlightedRows[i];
        var lastSymbol = Editor.lineTextForBufferRow(row).length;
        View.sinumerikView.cycleHighlightMarker[i] = Editor.markBufferRange([[row, 0], [row, lastSymbol]]);
        Editor.decorateMarker(
                View.sinumerikView.cycleHighlightMarker[i],
                 {type: 'text', class: 'cycleHighlight'}
             );
    }
}

function searchEndif(row, operator, Editor){
    var highlightedRows = [];
    highlightedRows.push(row);
    
    if (operator == 'IF') {
        var string = Editor.lineTextForBufferRow(row)
        if (string.match(/GOTO[BF]?/) == null) {
            highlightedRows.push(searchIfElseEndif(Editor, 'ELSE', row, 1));
            highlightedRows.push(searchIfElseEndif(Editor, 'ENDIF', row, 1));
        }
    } else if (operator == 'ELSE') {
        highlightedRows.push(searchIfElseEndif(Editor, 'IF', row, -1));
        highlightedRows.push(searchIfElseEndif(Editor, 'ENDIF', row, 1));
    } else if (operator == 'ENDIF') {
        highlightedRows.push(searchIfElseEndif(Editor, 'IF', row, -1));
        highlightedRows.push(searchIfElseEndif(Editor, 'ELSE', row, -1));
    }
    for (let i = 0; i < highlightedRows.length; i++) {
        if (highlightedRows[i] < 0) {
            highlightedRows.splice(i, 1);
            i -= 1;
        }
    }

    highlightRows(Editor, highlightedRows, 'cycles');

}

function searchIfElseEndif(editor, word, row, direction) {
    var lastRow = editor.getLastBufferRow();
    var level = 0;
    var levelIncIf = direction;
    var levelIncEndif = - direction;

    row += direction;
    
    while (row <= lastRow && row >= 0) {
        var string = editor.lineTextForBufferRow(row)
        var operatorArr = string.trim().split(" ")
        var firstOperator = operatorArr[0];

        if (string.match(/GOTO[BF]?/) == null) {

            if (firstOperator == word && level == 0) {
                return row;
            }
            if (firstOperator == 'IF') {
                level += levelIncIf;
            }
            if (firstOperator == 'ENDIF') {
                level += levelIncEndif;
            }
            if (level < 0) {
                row = -2;
            }

        }

        row += direction;
    }
    return -1;
}
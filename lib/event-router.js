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
        } else if (emitter == 'machineManager') {
            machineManager(event);
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
    if (event == 'singleLineDebugButtonClick') {
        changeActiveTab('singleLine');
        View.sinumerikView.counturEditButton.className = 'sinumerikPanelHeadButton';
        View.sinumerikView.singleLineDebugButton.className = 'sinumerikPanelHeadButtonSelect';
        View.sinumerikView.machineManagerButton.className = 'sinumerikPanelHeadButton';
    }
    if (event == 'singleLineDebugHomeButtoClick') {
        console.log('HomeBtnClc');
    }
    if (event == 'singleLineDebugNextButtoClick') {
        console.log('NextBtnClc');
    }
    if (event == 'singleLineDebugPrevButtoClick') {
        console.log('PrevBtnClc');
    }
}

function counturEdit(event) {
    console.log("CE " + event);
    if (event == 'counturEditButtonClick') {
        changeActiveTab('counturEdit');
        View.sinumerikView.counturEditButton.className = 'sinumerikPanelHeadButtonSelect';
        View.sinumerikView.singleLineDebugButton.className = 'sinumerikPanelHeadButton';
        View.sinumerikView.machineManagerButton.className = 'sinumerikPanelHeadButton';
    }
}

function machineManager(event) {
    console.log("MM " + event);
    if (event == 'machineManagerButtonClick') {
        changeActiveTab('machineManager');
        View.sinumerikView.counturEditButton.className = 'sinumerikPanelHeadButton';
        View.sinumerikView.singleLineDebugButton.className = 'sinumerikPanelHeadButton';
        View.sinumerikView.machineManagerButton.className = 'sinumerikPanelHeadButtonSelect';
    }
}


//Задержка при переключении вкладок в меню
//Change tabs in sinumerik sidebar with delay
function changeActiveTab(newTab) {
    if (View.sinumerikView.activeTab != newTab) {
        var singleLineDelay = 0;
        var counturEditDelay = 0;
        var machineManagerDelay = 0;
        var visibilityDelay = 300;
        View.sinumerikView.activeTab = newTab;
        if (newTab == 'singleLine') {
            singleLineDelay = visibilityDelay;
            View.sinumerikView.singleLineDebugVisibility = 'visible';
            View.sinumerikView.counturEditVisibility = 'hidden';
            View.sinumerikView.machineManagerVisibility = 'hidden';
        } else if (newTab == 'counturEdit') {
            counturEditDelay = visibilityDelay;
            View.sinumerikView.singleLineDebugVisibility = 'hidden';
            View.sinumerikView.counturEditVisibility = 'visible';
            View.sinumerikView.machineManagerVisibility = 'hidden';
        } else if (newTab == 'machineManager') {
            machineManagerDelay = visibilityDelay;
            View.sinumerikView.singleLineDebugVisibility = 'hidden';
            View.sinumerikView.counturEditVisibility = 'hidden';
            View.sinumerikView.machineManagerVisibility = 'visible';
        }else {
            console.log('set active tab error!!!');
        }
        setTimeout(setCounturEditVisibility, counturEditDelay);
        setTimeout(setSingleLineDebugVisibility, singleLineDelay);
        setTimeout(setMachineManagerVisibility, machineManagerDelay);

    } else {
        console.log('Old tab');
    }
    function setCounturEditVisibility() {
        View.sinumerikView.counturEditFootContainer.style.visibility = View.sinumerikView.counturEditVisibility;
        View.sinumerikView.counturEditMainWindow.style.visibility = View.sinumerikView.counturEditVisibility;
    }

    function setSingleLineDebugVisibility() {
        View.sinumerikView.singleLineDebugFootContainer.style.visibility = View.sinumerikView.singleLineDebugVisibility;
        View.sinumerikView.singleLineDebugMainWindow.style.visibility = View.sinumerikView.singleLineDebugVisibility;
    }

    function setMachineManagerVisibility() {
        View.sinumerikView.machineManagerFootContainer.style.visibility = View.sinumerikView.machineManagerVisibility;
        View.sinumerikView.machineManagerMainWindow.style.visibility = View.sinumerikView.machineManagerVisibility;
    }

}

function cyclesHighlight() {
    var highlightedRows = [];
    const Editor = atom.workspace.getActiveTextEditor();
    const row = Editor.getCursorBufferPosition().row;
    var string = Editor.lineTextForBufferRow(row);
    var firstOperator = string.trim().split(" ")[0];
    // console.log('search row ' + row);
    if (firstOperator == 'IF' || firstOperator == 'ELSE' || firstOperator == 'ENDIF') {
        searchEndif(row,firstOperator, Editor);
    }
    if (firstOperator == 'WHILE' || firstOperator == 'ENDWHILE') {
        searchEndwhile(row,firstOperator, Editor);
    }
    if (firstOperator == 'FOR' || firstOperator == 'ENDFOR') {
        searchEndFor(row,firstOperator, Editor);
    }


    if (string.match(/GOTO[BF]?|REPEAT/)) {
        searchMarkerContainer(row);
    }



    highlightRows(Editor, highlightedRows, 'cycles');

    function searchEndFor(row, operator, Editor) {
        highlightedRows.push(row);
        if (operator == 'FOR') {
            highlightedRows.push(searchForEndfor(Editor, 'ENDFOR', row, 1));
        } else {
            highlightedRows.push(searchForEndfor(Editor, 'FOR', row, -1));
        }

        function searchForEndfor(editor, word, row, direction) {
            var lastRow = editor.getLastBufferRow();
            var level = 0;
            var levelIncFor = direction;
            var levelIncEndfor = - direction;

            row += direction;

            while (row <= lastRow && row >= 0) {
                var string = editor.lineTextForBufferRow(row)
                var operatorArr = string.trim().split(" ")
                var firstOperator = operatorArr[0];

                if (firstOperator == word && level == 0) {
                    return row;
                }
                if (firstOperator == 'FOR') {
                    level += levelIncFor;
                }
                if (firstOperator == 'ENDFOR') {
                    level += levelIncEndfor;
                }
                if (level < 0) {
                    row = -2;
                }
                row += direction;
            }

            return -1;
        }
    }

    function searchMarkerContainer(row) {
        if (firstOperator != 'IF') {
            highlightedRows.push(row);
        }
        var stringTrim = string.trim().split(" ");
        var marker = '';
        var searchDirection = [];
        for (let i = 0; i < stringTrim.length; i++) {
            if (stringTrim[i].match(/GOTO[BF]?/) && stringTrim[i+1] != undefined && stringTrim[i+1].match(/[\w_].*/)) {
                searchDirection.push(-1);
                if (stringTrim[i] == 'GOTOF') {
                    searchDirection[0] = 1;
                } else if (stringTrim[i] == 'GOTO') {
                    searchDirection.push(1);
                }
                marker = stringTrim[i+1];
                i = stringTrim.length;
            }
        }

        for (let i = 0; i < searchDirection.length; i++) {
            var rows = searchMarker(row, searchDirection[i]);
            for (let i = 0; i < rows.length; i++) {
                highlightedRows.push(rows[i]);
            }
            if (highlightedRows.length > 2) {
                console.log('Много одинаковых меток');
            }
        }

        function searchMarker (row, direction) {
            var lastRow = Editor.getLastBufferRow();
            row += direction;
            var rows = [];

            while (row <= lastRow && row >= 0) {
                var string = Editor.lineTextForBufferRow(row)
                var operatorArr = string.trim().split(" ")
                var firstOperator = operatorArr[0];
                var regEx = '' + marker + '\:';

                if (firstOperator.match(regEx)) {
                    rows.push(row);
                }
                row += direction;
            }
            return rows;
        }
    }

    function searchEndwhile(row, operator, Editor) {
        highlightedRows.push(row);
        if (operator == 'WHILE') {
            highlightedRows.push(searchWhileEndwhile(Editor, 'ENDWHILE', row, 1));
        } else {
            highlightedRows.push(searchWhileEndwhile(Editor, 'WHILE', row, -1));
        }

        function searchWhileEndwhile(editor, word, row, direction) {
            var lastRow = editor.getLastBufferRow();
            var level = 0;
            var levelIncWhile = direction;
            var levelIncEndwhile = - direction;

            row += direction;

            while (row <= lastRow && row >= 0) {
                var string = editor.lineTextForBufferRow(row)
                var operatorArr = string.trim().split(" ")
                var firstOperator = operatorArr[0];

                if (firstOperator == word && level == 0) {
                    return row;
                }
                if (firstOperator == 'WHILE') {
                    level += levelIncWhile;
                }
                if (firstOperator == 'ENDWHILE') {
                    level += levelIncEndwhile;
                }
                if (level < 0) {
                    row = -2;
                }
                row += direction;
            }

            return -1;
        }
    }

    function searchEndif(row, operator, Editor){
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
    }
}

function highlightRows(Editor, highlightedRows, typeHighlight) {
    for (let i = 0; i < highlightedRows.length; i++) {
        if (highlightedRows[i] < 0) {
            highlightedRows.splice(i, 1);
            i -= 1;
        }
    }

    for (let i = 0; i < View.sinumerikView.cycleHighlightMarker.length; i++) {
        try {
            View.sinumerikView.cycleHighlightMarker[i].destroy();
        } catch (err) {
            console.log('highlight error '+ err);
        }
    }

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

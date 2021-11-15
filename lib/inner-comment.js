'use babel';

import View from "./sinumerik";

const beginSubstr = ';This comment is automatically created by sinumerik-highlight package';
const endSubstr = ';End of comment created by sinumerik-highlight package';


export function loadDataFromComment() {
    const Editor = atom.workspace.getActiveTextEditor();
    var filename = Editor.getTitle().replace(/\./g,'_').toUpperCase();
    if (!View.sinumerikView.programmData) {
        View.sinumerikView.programmData = {};
    }
    //Костыль чтоб не сбивалась активная машина
    if (View.sinumerikView.programmData[filename]) {
        return
    }
    View.sinumerikView.programmData[filename] = {};
    View.sinumerikView.programmData[filename].blank = {name: 'BLANK'}
    View.sinumerikView.programmData[filename].contour = {name: 'CONTOUR'}


    var programmText = Editor.getText();

    var containingString = '';
    var beginSubstrIndex = programmText.indexOf(beginSubstr, 0);
    while (beginSubstrIndex > 0) {
        var endSubstrIndex = programmText.indexOf(endSubstr, beginSubstrIndex + beginSubstr.length);
        if (endSubstrIndex < 0) {
            console.log('Broken comment');
        } else {
            containingString += programmText.substring(beginSubstrIndex+beginSubstr.length, endSubstrIndex).replace(/;/g,'').replace(/\n/g,'').replace(/ /g,'');
        }
        beginSubstrIndex = programmText.indexOf(beginSubstr, beginSubstrIndex + beginSubstr.length + endSubstr.length);
    }

    containingString = containingString.split('}{');
    //return '}'
    for (let i = 0; i < containingString.length - 1; i++) {
        containingString[i] = containingString[i] + '}';
    }
    //return '{'
    for (let i = 1; i < containingString.length; i++) {
        containingString[i] = '{' + containingString[i];
    }

    //console.log(containingString);

    if (containingString[0].length > 0) {
        for (let i = 0; i < containingString.length; i++) {
            try {
                var dataObj = JSON.parse(containingString[i]);
                if (dataObj.machine) {
                    View.sinumerikView.programmData[filename].machine = dataObj.machine;
                }
                if (dataObj.blank) {
                    View.sinumerikView.programmData[filename].blank = dataObj.blank;
                }
                if (dataObj.contour) {
                    View.sinumerikView.programmData[filename].contour = dataObj.contour;
                }
            } catch (err) {
                console.log('ERRORO Auto comment = ' + containingString);
                console.log(err);
            }
        }
    }
//    console.log(View.sinumerikView.programmData);
}


//TODO После вставки коммента редактирование в винде становится нефозможным
export function generateComment() {
    const Editor = atom.workspace.getActiveTextEditor();
    var filename = Editor.getTitle().replace(/\./g,'_').toUpperCase();
    var autoComment = ';This comment is automatically created by sinumerik-highlight package\n;';
    autoComment += JSON.stringify(View.sinumerikView.programmData[filename],null, 2).replace(/\n/g,'\n;')
    autoComment += '\n;End of comment created by sinumerik-highlight package';
    updateComment(autoComment);
}

function updateComment(autoComment) {
    const Editor = atom.workspace.getActiveTextEditor();
    const cursorPosition = Editor.getCursorBufferPosition()

    var commentEndColumn = 1;
    //Remove all autocomments
    while (commentEndColumn) {
        var commentBeginRow = -1;
        var commentEndRow = -1;
        commentEndColumn = 0;
        Editor.scan(beginSubstr, {}, function (result) {
            commentBeginRow = result.row;
            Editor.scan(endSubstr, {}, function (result) {
                commentEndRow = result.row;
                //console.log(result.row);
                if (commentEndRow > 1) {
                    commentEndColumn = Editor.lineTextForBufferRow(commentEndRow).length;
                    if (commentBeginRow && commentEndRow) {
                        Editor.setSelectedBufferRange([[commentBeginRow, 0], [commentEndRow, commentEndColumn]]);
                        if (Editor.getSelectedText().length >= beginSubstr.length + endSubstr.length) {
                            Editor.delete();
                        }
                    }
                }
            });
        });

    }

    Editor.moveToBottom();
    Editor.moveToEndOfLine();
    Editor.insertNewlineBelow();
    Editor.moveToBottom();
    Editor.moveToBeginningOfLine();
    var foldLine = Editor.getCursorBufferPosition().row;
    Editor.insertText(autoComment);
    Editor.foldBufferRow(foldLine);

    Editor.setCursorBufferPosition(cursorPosition)
}


'use babel';

import View from "./sinumerik";
import {normalizeFileName} from "./utils";

const beginSubstr = ';This comment is automatically created by sinumerik-highlight package';
const endSubstr = ';End of comment created by sinumerik-highlight package';


// Pure parser of sinumerik-highlight auto-comment blocks. Returns
// {machine?, blank?, contour?} merged from every {...} chunk found between
// the marker pair (multiple blocks supported). Returns {} when no block,
// empty block, or malformed JSON — caller decides what to do with defaults.
export function parseAutoComment(programmText) {
    const result = {};
    if (typeof programmText !== 'string' || !programmText.length) return result;

    let containingString = '';
    let beginSubstrIndex = programmText.indexOf(beginSubstr, 0);
    while (beginSubstrIndex > 0) {
        const endSubstrIndex = programmText.indexOf(endSubstr, beginSubstrIndex + beginSubstr.length);
        if (endSubstrIndex < 0) {
            console.log('Broken comment');
            break;
        }
        containingString += programmText.substring(beginSubstrIndex + beginSubstr.length, endSubstrIndex)
            .replace(/;/g, '').replace(/\n/g, '').replace(/ /g, '');
        beginSubstrIndex = programmText.indexOf(beginSubstr, beginSubstrIndex + beginSubstr.length + endSubstr.length);
    }

    if (!containingString.length) return result;

    const chunks = containingString.split('}{');
    for (let i = 0; i < chunks.length - 1; i++) chunks[i] = chunks[i] + '}';
    for (let i = 1; i < chunks.length; i++) chunks[i] = '{' + chunks[i];

    for (const chunk of chunks) {
        if (!chunk.length) continue;
        try {
            const dataObj = JSON.parse(chunk);
            if (dataObj.machine) result.machine = dataObj.machine;
            if (dataObj.blank) result.blank = dataObj.blank;
            if (dataObj.contour) result.contour = dataObj.contour;
        } catch (err) {
            console.log('ERROR Auto comment = ' + chunk);
            console.log(err);
        }
    }
    return result;
}


export function loadDataFromComment() {
    const Editor = atom.workspace.getActiveTextEditor();
    const filename = Editor.getPath();
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

    const parsed = parseAutoComment(Editor.getText());
    if (parsed.machine) View.sinumerikView.programmData[filename].machine = parsed.machine;
    if (parsed.blank) View.sinumerikView.programmData[filename].blank = parsed.blank;
    if (parsed.contour) View.sinumerikView.programmData[filename].contour = parsed.contour;
}


//TODO После вставки коммента редактирование в винде становится нефозможным
export function generateComment() {
    const Editor = atom.workspace.getActiveTextEditor();
    const filename = Editor.getPath();
    let autoComment = ';This comment is automatically created by sinumerik-highlight package\n;';
    autoComment += JSON.stringify(View.sinumerikView.programmData[filename],null, 2).replace(/\n/g,'\n;')
    autoComment += '\n;End of comment created by sinumerik-highlight package';
    updateComment(autoComment);
}

function updateComment(autoComment) {
    const Editor = atom.workspace.getActiveTextEditor();
    const cursorPosition = Editor.getCursorBufferPosition()

    let commentEndColumn = 1;
    //Remove all autocomments
    while (commentEndColumn) {
        let commentBeginRow = -1;
        let commentEndRow = -1;
        commentEndColumn = 0;
        Editor.scan(beginSubstr, {}, function (result) {
            commentBeginRow = result.row;
            Editor.scan(endSubstr, {}, function (result) {
                commentEndRow = result.row;
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
    const foldLine = Editor.getCursorBufferPosition().row;
    Editor.insertText(autoComment);
    Editor.foldBufferRow(foldLine);

    Editor.setCursorBufferPosition(cursorPosition)
}


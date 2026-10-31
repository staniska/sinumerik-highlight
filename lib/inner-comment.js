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


// Which keys of `programmData[file]` the file's own text actually declares.
//
// Kept beside `programmData`, never inside it: `generateComment` serialises that
// object, so a bookkeeping field put there would end up in the program.
//
// The distinction exists because `loadDataFromComment` seeds `blank` and
// `contour` defaults whether the file named them or not. Serialising the object
// whole therefore wrote fields the user never chose — that is how `Attach` came
// to put `BLANK` and `CONTOUR` into every program it touched, and why the
// comment was longer than what it said.
function declaredOf(filename, text) {
    if (!View.sinumerikView.declaredFields) View.sinumerikView.declaredFields = {};
    const store = View.sinumerikView.declaredFields;
    if (!store[filename]) {
        // This file's comment was never read — `machine-manager` can create the
        // `programmData` entry on its own, bypassing `loadDataFromComment`.
        // Seeding from the text keeps the one invariant that matters here: a
        // save never writes LESS than the file already carries.
        store[filename] = new Set(text ? Object.keys(parseAutoComment(text)) : []);
    }
    return store[filename];
}


// Values whose own shape this module defines, and may therefore prune inside.
// `machine` is written verbatim: its structure is read by the sinumerik-to-nc
// package, and dropping a nested empty object here would be a change to a
// documented interface made by accident.
const PRUNE_INSIDE = ['ips'];

function pruneValue(value, depth) {
    if (value === undefined || value === null) return undefined;
    if (Array.isArray(value)) return value.length ? value : undefined;
    if (typeof value !== 'object') return value;
    if (depth <= 0) return Object.keys(value).length ? value : undefined;

    const out = {};
    Object.keys(value).forEach(key => {
        const pruned = pruneValue(value[key], depth - 1);
        if (pruned !== undefined) out[key] = pruned;
    });
    return Object.keys(out).length ? out : undefined;
}


// What the comment should contain: the declared keys of `data` and nothing else.
//
// Pure, so the rule can be tested without an editor. `declared` is a Set or any
// array-like of key names — the keys the file itself declared, plus the ones an
// explicit save has added since.
export function commentPayload(data, declared) {
    const payload = {};
    if (!data || typeof data !== 'object') return payload;

    const has = declared instanceof Set
        ? (key) => declared.has(key)
        : (key) => Array.from(declared ?? []).indexOf(key) > -1;

    Object.keys(data).forEach(key => {
        if (!has(key)) return;
        const value = pruneValue(data[key], PRUNE_INSIDE.indexOf(key) > -1 ? 2 : 0);
        if (value !== undefined) payload[key] = value;
    });
    return payload;
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
    // Authoritative: this is the one place that reads the file's own comment.
    View.sinumerikView.declaredFields = View.sinumerikView.declaredFields || {};
    View.sinumerikView.declaredFields[filename] = new Set(Object.keys(parsed));
    if (parsed.machine) {
        // Back-compat: programs commented before the metric/inch toggle existed default to metric.
        if (!parsed.machine.units) parsed.machine.units = 'metric';
        View.sinumerikView.programmData[filename].machine = parsed.machine;
    }
    if (parsed.blank) View.sinumerikView.programmData[filename].blank = parsed.blank;
    if (parsed.contour) View.sinumerikView.programmData[filename].contour = parsed.contour;
}


//TODO После вставки коммента редактирование в винде становится нефозможным
// `fields` — what this press declares, e.g. `['contour']`. They are added to
// what the file already declared; the comment is then the union, so pressing
// Contour on an old program does not drop its machine. Called without
// arguments it writes exactly what is already declared.
export function generateComment(fields = []) {
    const Editor = atom.workspace.getActiveTextEditor();
    const filename = Editor.getPath();

    const declared = declaredOf(filename, Editor.getText());
    fields.forEach(field => declared.add(field));

    const payload = commentPayload(View.sinumerikView.programmData[filename], declared);
    // Nothing declared means nothing to say, and `updateComment` starts by
    // removing the blocks that are there: writing an empty one would be a
    // deletion dressed up as a save.
    if (!Object.keys(payload).length) return;

    let autoComment = ';This comment is automatically created by sinumerik-highlight package\n;';
    autoComment += JSON.stringify(payload, null, 2).replace(/\n/g,'\n;')
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


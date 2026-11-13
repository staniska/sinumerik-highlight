'use babel';

import View from "./sinumerik";
import {normalizeFileName} from "./utils";
import {blankMode} from "./ipsReference";

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
            // Every field, not a list of three. `ips` was dropped here, so a
            // program that borrowed a previous one's stock came back looking
            // like it had no reference at all. A field this package does not
            // know is kept too: `declaredFields` reads these keys, and a save
            // then carries it through instead of deleting it.
            Object.keys(dataObj).forEach(key => {
                if (dataObj[key] !== undefined && dataObj[key] !== null) result[key] = dataObj[key];
            });
        } catch (err) {
            console.log('ERROR Auto comment = ' + chunk);
            console.log(err);
        }
    }
    return result;
}


// Which fields the program text declares — read from the text, every time.
//
// The one source of truth. An in-memory record of this goes stale the moment
// the comment is edited or deleted by hand: a save would then put back a
// contour the file no longer carries, which is exactly what it looked like.
//
// The distinction matters because `loadDataFromComment` seeds `blank` and
// `contour` defaults whether the file named them or not. Serialising that
// object whole wrote fields the user never chose — that is how `Attach` came to
// put `BLANK` and `CONTOUR` into every program it touched.
export function declaredFields(programmText) {
    return new Set(Object.keys(parseAutoComment(programmText)));
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


// What the comment should contain: the declared fields and nothing else.
//
// Pure, so the rule can be tested without an editor.
//
//   `declared` — the fields the file itself declares, plus the ones this save
//                adds. A Set or any array-like of names.
//   `base`     — what the file currently says, so that a field only the file
//                knows about is carried through unchanged: saving the contour
//                must not drop the machine just because memory never read it.
//   `saving`   — what this press declares. Only a press that touches the blank
//                row may resolve `blank` against `ips`; any other save leaves
//                whichever of the two the file has alone, which is the whole
//                point of saving one thing at a time.
export function commentPayload(data, declared, {base = {}, saving = []} = {}) {
    const payload = {};
    const merged = {...(base ?? {}), ...(data ?? {})};
    if (!Object.keys(merged).length) return payload;

    const has = declared instanceof Set
        ? (key) => declared.has(key)
        : (key) => Array.from(declared ?? []).indexOf(key) > -1;

    Object.keys(merged).forEach(key => {
        if (!has(key)) return;
        const value = pruneValue(merged[key], PRUNE_INSIDE.indexOf(key) > -1 ? 2 : 0);
        if (value !== undefined) payload[key] = value;
    });

    // `blank` and `ips` are mutually exclusive — that is what keeps every older
    // program working and the comment short. Memory holds the mode the user
    // switched to, so memory decides which of the two survives.
    if (Array.from(saving).some(field => field === 'blank' || field === 'ips')) {
        delete payload[blankMode(data) === 'ips' ? 'blank' : 'ips'];
    }
    return payload;
}


// What the comment of a file said the last time it was read, by path. The key
// to re-reading a comment without undoing anything chosen in the UI: a field is
// taken from the text only where the TEXT has changed, so memory keeps whatever
// the user picked in machineManager — and the machine the IPS pre-pass lends a
// source for the length of a resolve, which is written into the same record.
//
// In a module variable rather than in `programmData`, whose shape is read by
// the sinumerik-to-nc package.
const lastComment = new Map();

export function loadDataFromComment() {
    refreshDataFromComment(atom.workspace.getActiveTextEditor());
}

// Read the auto-comment of `Editor` into `programmData`.
//
// It used to return early whenever the file already had a record — the crutch
// that kept the active machine from being knocked out — and the cost was that a
// machine changed in the comment by hand did not reach the simulation until
// Pulsar was restarted, which is the one thing that empties `programmData`.
//
// Now the text is read every time and compared with what it said at the last
// read: a field whose declaration CHANGED is adopted, everything else is left
// as memory has it. That keeps the crutch's purpose — nothing the user chose in
// the UI is overwritten by a comment that has not moved — while an edited one
// takes effect on the next redraw.
//
// A field that DISAPPEARS from the comment is deliberately not acted on. The
// text is re-read while it is being typed, and a half-written or broken block
// parses as "declares nothing" (`parseAutoComment` skips a chunk it cannot
// parse): acting on that would take the machine away in the middle of an edit,
// and there is no good outcome to taking it away at all. Removing a field is
// what closing and reopening the file is for.
//
// The machine the IPS pre-pass lends a source is safe for the same reason: it
// is lent precisely to a source whose comment declares no machine
// (`ipsResolve.js::sourceMachine`), so there is no declaration of that field to
// change and this never writes one — which is what keeps `withSourceMachine`
// free to put the record back as it found it.
export function refreshDataFromComment(Editor) {
    if (!Editor) return;
    const filename = Editor.getPath();
    if (!View.sinumerikView.programmData) {
        View.sinumerikView.programmData = {};
    }

    const parsed = parseAutoComment(Editor.getText());
    if (parsed.machine && !parsed.machine.units) {
        // Back-compat: programs commented before the metric/inch toggle existed default to metric.
        parsed.machine.units = 'metric';
    }

    const known = View.sinumerikView.programmData[filename];
    if (known) {
        mergeComment(filename, known, parsed);
        return;
    }

    View.sinumerikView.programmData[filename] = {};
    View.sinumerikView.programmData[filename].blank = {name: 'BLANK'}
    View.sinumerikView.programmData[filename].contour = {name: 'CONTOUR'}

    // Every field the file declares, not a list of three: `ips` and `ipsPiece`
    // arrive the same way, and so will whatever comes next.
    Object.keys(parsed).forEach(key => {
        View.sinumerikView.programmData[filename][key] = parsed[key];
    });
    if (parsed.ips) {
        // Mutually exclusive, and that has to hold in memory from the moment the
        // file is read: a program that borrows a previous one's stock has no
        // blank of its own, not even the default one seeded above. The Blank ⇄
        // IPS switch puts the default back if the user flips it.
        delete View.sinumerikView.programmData[filename].blank;
    }
    lastComment.set(filename, parsed);
}

const sameDeclaration = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// Take over the fields whose declaration in the text has changed.
function mergeComment(filename, known, parsed) {
    const seen = lastComment.get(filename) ?? {};
    const changed = Object.keys(parsed).filter(key => !sameDeclaration(seen[key], parsed[key]));

    // Nothing moved in the text: leave the record exactly as it is, including
    // the remembered declaration. Writing it back would make the first read of
    // a record this function did not create — the one the IPS pre-pass makes —
    // look like a change on the next call.
    if (!changed.length) return;

    changed.forEach(key => { known[key] = parsed[key]; });

    // The same exclusivity a fresh read applies, in whichever direction the
    // edit went: the two cannot both be in force, and the text decides.
    if (parsed.ips) delete known.blank;
    else if (parsed.blank) delete known.ips;

    lastComment.set(filename, parsed);
}


//TODO После вставки коммента редактирование в винде становится нефозможным
// `fields` — what this press declares, e.g. `['contour']`. They are added to
// what the file already declared; the comment is then the union, so pressing
// Contour on an old program does not drop its machine. Called without
// arguments it writes exactly what is already declared.
export function generateComment(fields = []) {
    const Editor = atom.workspace.getActiveTextEditor();
    const filename = Editor.getPath();

    // Read the text, not a memory of it: the comment may have been edited or
    // deleted by hand since it was loaded, and a save must never put back a
    // field the file no longer carries.
    const fromText = parseAutoComment(Editor.getText());
    const declared = new Set(Object.keys(fromText));
    fields.forEach(field => declared.add(field));

    const payload = commentPayload(View.sinumerikView.programmData[filename], declared,
        {base: fromText, saving: fields});
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


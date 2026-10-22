'use babel';

import View from "./sinumerik";

// Two rows over the graphics area, in one column.
//
// The hanging MSG and a modal M0/M1 are separate elements on purpose. The modal
// one keeps exactly the behaviour the three animation loops were built around —
// shown means "in the DOM", closed means "removed" — so none of them had to
// learn a new way of being released. The hanging row is the one that outlives a
// block, and a message is never erased by a pause that happens on top of it.
//
// `_stickyHold` is the second half of the release signal: at pause level 3 and
// up a MSG stops the run, and the run is let go by the Continue button, which
// leaves the message standing. Only `msgPauseHeld()` is asked by the loops, so
// they do not care which of the two is holding them.
let _stickyHold = false

function msgStack() {
    if (!View.sinumerikView.msgStack) {
        View.sinumerikView.msgStack = document.createElement('div')
        View.sinumerikView.msgStack.className = 'sinumerikMsgStack'
    }
    if (!View.sinumerikView.msgStack.parentElement) {
        View.sinumerikView.singleLineDebugMainWindow.appendChild(View.sinumerikView.msgStack)
    }
    return View.sinumerikView.msgStack
}

// `close msg` removes the row, which is what releases the loops. A row that is
// merely emptied would leave them waiting for ever.
export default function msg_div(msg_element) {
    if (!View.sinumerikView.msgDiv) {
        View.sinumerikView.msgDiv = document.createElement('div');
        View.sinumerikView.msgDiv.className = 'sinumerikMsgDiv';
        View.sinumerikView.msgDiv.head = document.createElement('div');
        View.sinumerikView.msgDiv.head.className = 'sinumerikMsgHead';
        View.sinumerikView.msgDiv.head.innerText = 'MSG: ';
        View.sinumerikView.msgDiv.appendChild(View.sinumerikView.msgDiv.head);
        View.sinumerikView.msgDiv.msg = document.createElement('div');
        View.sinumerikView.msgDiv.msg.className = 'sinumerikMsgBody';
        View.sinumerikView.msgDiv.appendChild(View.sinumerikView.msgDiv.msg);
        View.sinumerikView.msgDiv.closeButton = document.createElement('button');
        View.sinumerikView.msgDiv.closeButton.className = 'sinumerikMsgClose';
        View.sinumerikView.msgDiv.closeButton.addEventListener('click', () => {
            msg_div({});
        });
        View.sinumerikView.msgDiv.closeButton.innerText = 'close msg';

        View.sinumerikView.msgDiv.appendChild(View.sinumerikView.msgDiv.closeButton);
    }

    if (msg_element.value) {
        msgStack().appendChild(View.sinumerikView.msgDiv);
        // The width is set in LESS, as a share of the main window. It used to be
        // measured off the Canvas 2D element here, which is out of the DOM while
        // the WebGL or the 3D renderer is up: `offsetWidth` was 0, the width came
        // out negative and was ignored, and the row shrank to fit its own text.
        View.sinumerikView.msgDiv.msg.innerText = msg_element.value;
    } else {
        if (View.sinumerikView.msgDiv.parentElement) {
            View.sinumerikView.msgDiv.msg.innerText = '';
            View.sinumerikView.msgDiv.remove();
        }
    }
}

function stickyDiv() {
    if (!View.sinumerikView.stickyMsgDiv) {
        const row = document.createElement('div')
        row.className = 'sinumerikMsgDiv sinumerikMsgDiv--sticky'

        row.head = document.createElement('div')
        row.head.className = 'sinumerikMsgHead'
        row.head.innerText = 'MSG: '
        row.appendChild(row.head)

        row.msg = document.createElement('div')
        row.msg.className = 'sinumerikMsgBody'
        row.appendChild(row.msg)

        row.continueButton = document.createElement('button')
        row.continueButton.className = 'sinumerikMsgContinue'
        row.continueButton.innerText = 'continue'
        // Releases the run and nothing else: the message it belongs to goes on
        // standing until the program replaces it or takes it down.
        row.continueButton.addEventListener('click', () => {
            _stickyHold = false
            row.classList.remove('sinumerikMsgDiv--held')
        })
        row.appendChild(row.continueButton)

        View.sinumerikView.stickyMsgDiv = row
    }
    return View.sinumerikView.stickyMsgDiv
}

// The hanging message. Shown without a button and left standing until the
// program replaces it, so it does not have to be clicked away to see the rest of
// the run. An empty value is how a program takes it down (`MSG()`, `MSG("")`).
//
// The hold is NOT touched here. This is also what redraws the row after a
// rewind, and arming a pause from there would stop a run the user has just
// repositioned. `sticky_hold()` is the only thing that arms it.
export function sticky_msg(value) {
    const row = stickyDiv()

    if (!value) {
        if (row.parentElement) {
            row.msg.innerText = ''
            row.remove()
        }
        // A hold left behind with no row to release it would freeze the next run
        // with nothing on screen to explain why.
        _stickyHold = false
        row.classList.remove('sinumerikMsgDiv--held')
        return
    }

    if (row.msg.innerText !== value) {
        _stickyHold = false
        row.classList.remove('sinumerikMsgDiv--held')
    }
    row.msg.innerText = value
    msgStack().appendChild(row)
}

// Stop the run on the message now showing, and offer Continue. Returns whether
// the run is actually held, so the caller pauses only when there is something
// to confirm — an empty MSG has nothing to read.
export function sticky_hold() {
    const row = stickyDiv()
    if (!row.parentElement) return false

    _stickyHold = true
    // A class, not an inline style: the button is hidden by a CSS rule, and
    // `style.display = ''` would just fall back to it.
    row.classList.add('sinumerikMsgDiv--held')
    return true
}

// Is anything holding the run: a modal row not yet closed, or a hanging message
// waiting for Continue.
export function msgPauseHeld() {
    return !!View.sinumerikView.msgDiv?.parentElement || _stickyHold
}

// Both rows down, nothing holding. For the end of a run and for a run cut short.
export function clear_msgs() {
    msg_div({})
    sticky_msg('')
}

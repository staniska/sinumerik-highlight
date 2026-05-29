'use babel';

import View from "./sinumerik";

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
        View.sinumerikView.singleLineDebugMainWindow.appendChild(View.sinumerikView.msgDiv);
        View.sinumerikView.msgDiv.style.width = `${View.sinumerikView.singleLineDebugCanvas.offsetWidth - 30}px`;
        View.sinumerikView.msgDiv.msg.innerText = msg_element.value;
    } else {
        if (View.sinumerikView.msgDiv.parentElement) {
            View.sinumerikView.msgDiv.msg.innerText = '';
            View.sinumerikView.singleLineDebugMainWindow.removeChild(View.sinumerikView.msgDiv);
        }
    }
}
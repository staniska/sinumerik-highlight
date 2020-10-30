'use babel';

import View from "./sinumerik";

export default function msg_div(msg_element) {
    // console.log(msg_element);
    if (!View.sinumerikView.msgDiv) {
        View.sinumerikView.msgDiv = document.createElement('div');
        View.sinumerikView.msgDiv.head = document.createElement('div');
        View.sinumerikView.msgDiv.head.innerText = 'MSG: ';
        View.sinumerikView.msgDiv.head.style.float = 'left';
        View.sinumerikView.msgDiv.head.style.marginRight = '10px';
        View.sinumerikView.msgDiv.appendChild(View.sinumerikView.msgDiv.head);
        View.sinumerikView.msgDiv.msg = document.createElement('div');
        View.sinumerikView.msgDiv.msg.style.float = 'left';
        View.sinumerikView.msgDiv.appendChild(View.sinumerikView.msgDiv.msg);
        View.sinumerikView.msgDiv.closeButton = document.createElement('button');
        View.sinumerikView.msgDiv.closeButton.addEventListener('click', () => {
            msg_div({});
        });
        View.sinumerikView.msgDiv.closeButton.style.float = 'right';
        View.sinumerikView.msgDiv.closeButton.style.fontSize = '12px';
        View.sinumerikView.msgDiv.closeButton.innerText = 'close msg';

        View.sinumerikView.msgDiv.appendChild(View.sinumerikView.msgDiv.closeButton);
    }

    if (msg_element.value) {
        // console.log(msg_element.value);
        View.sinumerikView.singleLineDebugMainWindow.appendChild(View.sinumerikView.msgDiv);
        View.sinumerikView.msgDiv.style.position = 'absolute';
        View.sinumerikView.msgDiv.style.left = '20px';
        View.sinumerikView.msgDiv.style.top = '10px';
        View.sinumerikView.msgDiv.style.width = `${View.sinumerikView.singleLineDebugCanvas.offsetWidth - 30}px`;
        View.sinumerikView.msgDiv.style.background = 'white';
        View.sinumerikView.msgDiv.style.border = '1px solid blue';
        View.sinumerikView.msgDiv.style.fontSize = '15px';
        View.sinumerikView.msgDiv.style.fontWeight = 'bold';
        View.sinumerikView.msgDiv.msg.innerText = msg_element.value;
    } else {
        if (View.sinumerikView.msgDiv.parentElement) {
            View.sinumerikView.msgDiv.msg.innerText = '';
            View.sinumerikView.singleLineDebugMainWindow.removeChild(View.sinumerikView.msgDiv);
        }
    }
}
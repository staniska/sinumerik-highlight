'use babel'

//import SinumerikView from "./sinumerik-view";
import SinumerikView from './sinumerik';
export default class eventRouter{
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
            console.log(SinumerikView);
            //Jopa(event); Оно работает
    }
}

function singleLine(event) {
    if (event = 'singleLineDebugButtonClick') {
        console.log("SLDBC");
        SinumerikView.sinumerikView.activeTab = 'singleLine';
        SinumerikView.sinumerikView.counturEditButton.className = 'sinumerikPanelHeadButton';
        SinumerikView.sinumerikView.singleLineDebugButton.className = 'sinumerikPanelHeadButtonSelect';
    }
}

function counturEdit(event) {
    if (event == 'counturEditButtonClick') {
        console.log("CEBC");
        SinumerikView.sinumerikView.activeTab = 'counturEdit';
        SinumerikView.sinumerikView.counturEditButton.className = 'sinumerikPanelHeadButtonSelect';
        SinumerikView.sinumerikView.singleLineDebugButton.className = 'sinumerikPanelHeadButton';
    }
}


function Jopa(event) {
    console.log(event);
    const jopa = document.createElement('div');
    jopa.innerText = "Jopa" + event;
    SinumerikView.modalPanel.item.appendChild(jopa);
}

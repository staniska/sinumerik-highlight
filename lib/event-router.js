'use babel';

import View from './sinumerik';
import {machineManager} from './machine-manager'
import {cyclesHighlight} from './highlights'
import {changeActiveTab} from './changeTabs';
import {singleLineDebug} from "./single-line-debug";
import {contourEditElements} from './contourEdit/contourEdit'


export default class EventRouter{
    route(event) {
        event = JSON.parse(event);
        let emitter = event.emitter;
        event = event.event;

        if (emitter == 'singleLine') {
            singleLineDebug(event);
        } else if (emitter == 'contourEdit') {
            contourEdit(event);
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

function contourEdit(event) {
    // console.log("CE " + event);
    if (event == 'contourEditButtonClick') {
        contourEditElements()
        changeActiveTab('contourEdit');
        View.sinumerikView.contourEditButton.className = 'sinumerikPanelHeadButtonSelect';
        View.sinumerikView.singleLineDebugButton.className = 'sinumerikPanelHeadButton';
        View.sinumerikView.machineManagerButton.className = 'sinumerikPanelHeadButton';
    }
}

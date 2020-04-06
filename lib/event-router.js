'use babel';

import View from './sinumerik';
import {machineManager} from './machine-manager'
import {cyclesHighlight} from './highlights'
import {changeActiveTab} from './changeTabs';
import {singleLineDebug} from "./single-line-debug";


export default class EventRouter{
    route(event) {
        event = JSON.parse(event);
        let emitter = event.emitter;
        event = event.event;

        if (emitter == 'singleLine') {
            singleLineDebug(event);
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

function counturEdit(event) {
    console.log("CE " + event);
    if (event == 'counturEditButtonClick') {
        changeActiveTab('counturEdit');
        View.sinumerikView.counturEditButton.className = 'sinumerikPanelHeadButtonSelect';
        View.sinumerikView.singleLineDebugButton.className = 'sinumerikPanelHeadButton';
        View.sinumerikView.machineManagerButton.className = 'sinumerikPanelHeadButton';
    }
}

'use babel'


import View from './sinumerik';

export default class EventRouter{
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
    }
}

function singleLine(event) {
    console.log("SLD " + event);
    if (event == 'singleLineDebugButtonClick') {
        changeActiveTab('singleLine');
        View.sinumerikView.counturEditButton.className = 'sinumerikPanelHeadButton';
        View.sinumerikView.singleLineDebugButton.className = 'sinumerikPanelHeadButtonSelect';
        // View.sinumerikView.counturEditFootContainer.style.visibility = 'hidden';
        // View.sinumerikView.counturEditMainWindow.style.visibility = 'hidden';
        // View.sinumerikView.singleLineDebugFootContainer.style.visibility = 'visible';
        // View.sinumerikView.singleLineDebugMainWindow.style.visibility = 'visible';
    }

}

function counturEdit(event) {
    console.log("CE " + event);
    if (event == 'counturEditButtonClick') {
        changeActiveTab('counturEdit');
        View.sinumerikView.counturEditButton.className = 'sinumerikPanelHeadButtonSelect';
        View.sinumerikView.singleLineDebugButton.className = 'sinumerikPanelHeadButton';
        // View.sinumerikView.singleLineDebugFootContainer.style.visibility = 'hidden';
        // View.sinumerikView.singleLineDebugMainWindow.style.visibility = 'hidden';
        // View.sinumerikView.counturEditFootContainer.style.visibility = 'visible';
        // View.sinumerikView.counturEditMainWindow.style.visibility = 'visible';
    }
}

function changeActiveTab(newTab) {
    if (View.sinumerikView.activeTab != newTab) {
        var singleLineDelay = 0;
        var counturEditDelay = 0;
        var visibilityDelay = 300;
        View.sinumerikView.activeTab = newTab;
        if (newTab == 'singleLine') {
            singleLineDelay = visibilityDelay;
            View.sinumerikView.singleLineDebugVisibility = 'visible';
            View.sinumerikView.counturEditVisibility = 'hidden';
        } else if (newTab == 'counturEdit') {
            counturEditDelay = visibilityDelay;
            View.sinumerikView.singleLineDebugVisibility = 'hidden';
            View.sinumerikView.counturEditVisibility = 'visible';
        } else {
            console.log('set active tab error!!!');
        }
        setTimeout(setCounturEditVisibility, counturEditDelay);
        setTimeout(setSingleLineDebugVisibility, singleLineDelay);
    } else {
        console.log('Old tab');
    }
}

function setCounturEditVisibility() {
    View.sinumerikView.counturEditFootContainer.style.visibility = View.sinumerikView.counturEditVisibility;
    View.sinumerikView.counturEditMainWindow.style.visibility = View.sinumerikView.counturEditVisibility;
}

function setSingleLineDebugVisibility() {
    View.sinumerikView.singleLineDebugFootContainer.style.visibility = View.sinumerikView.singleLineDebugVisibility;
    View.sinumerikView.singleLineDebugMainWindow.style.visibility = View.sinumerikView.singleLineDebugVisibility;
}
'use babel';

import View from "./sinumerik";

//Задержка при переключении вкладок в меню
//Change tabs in sinumerik sidebar with delay

export function changeActiveTab(newTab) {
    let sinumerikEventHandler = View.sinumerikView.eventRouter.route.bind(this);

    if (View.sinumerikView.activeTab != newTab) {
        var singleLineDelay = 0;
        var contourEditDelay = 0;
        var machineManagerDelay = 0;
        var visibilityDelay = 300;
        View.sinumerikView.activeTab = newTab;
        if (newTab == 'singleLine') {
            singleLineDelay = visibilityDelay;
            View.sinumerikView.singleLineDebugVisibility = 'visible';
            View.sinumerikView.contourEditVisibility = 'hidden';
            View.sinumerikView.machineManagerVisibility = 'hidden';
            sinumerikEventHandler('{"emitter": "singleLine", "event": "selectSLDTab"}');
        } else if (newTab == 'contourEdit') {
            contourEditDelay = visibilityDelay;
            View.sinumerikView.singleLineDebugVisibility = 'hidden';
            View.sinumerikView.contourEditVisibility = 'visible';
            View.sinumerikView.machineManagerVisibility = 'hidden';
        } else if (newTab == 'machineManager') {
            machineManagerDelay = visibilityDelay;
            View.sinumerikView.singleLineDebugVisibility = 'hidden';
            View.sinumerikView.contourEditVisibility = 'hidden';
            View.sinumerikView.machineManagerVisibility = 'visible';
        }else {
            console.log('set active tab error!!!');
        }
        setTimeout(setContourEditVisibility, contourEditDelay);
        setTimeout(setSingleLineDebugVisibility, singleLineDelay);
        setTimeout(setMachineManagerVisibility, machineManagerDelay);

    } else {
        console.log('Old tab');
    }
    function setContourEditVisibility() {
        View.sinumerikView.contourEditFootContainer.style.visibility = View.sinumerikView.contourEditVisibility;
        View.sinumerikView.contourEditMainWindow.style.visibility = View.sinumerikView.contourEditVisibility;
        View.sinumerikView.contourEditRightContainer.style.visibility = View.sinumerikView.contourEditVisibility;
    }

    function setSingleLineDebugVisibility() {
        View.sinumerikView.singleLineDebugFootContainer.style.visibility = View.sinumerikView.singleLineDebugVisibility;
        View.sinumerikView.singleLineDebugMainWindow.style.visibility = View.sinumerikView.singleLineDebugVisibility;
    }

    function setMachineManagerVisibility() {
        View.sinumerikView.machineManagerFootContainer.style.visibility = View.sinumerikView.machineManagerVisibility;
        View.sinumerikView.machineManagerMainWindow.style.visibility = View.sinumerikView.machineManagerVisibility;
        View.sinumerikView.machineManagerRightContainer.style.visibility = View.sinumerikView.machineManagerVisibility;
        if (View.sinumerikView.toolContainer) {
            View.sinumerikView.toolContainer.style.visibility = View.sinumerikView.machineManagerVisibility;
        }
    }
}



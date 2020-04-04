'use babel';

import View from "./sinumerik";

//Задержка при переключении вкладок в меню
//Change tabs in sinumerik sidebar with delay


export function changeActiveTab(newTab) {
    if (View.sinumerikView.activeTab != newTab) {
        var singleLineDelay = 0;
        var counturEditDelay = 0;
        var machineManagerDelay = 0;
        var visibilityDelay = 300;
        View.sinumerikView.activeTab = newTab;
        if (newTab == 'singleLine') {
            singleLineDelay = visibilityDelay;
            View.sinumerikView.singleLineDebugVisibility = 'visible';
            View.sinumerikView.counturEditVisibility = 'hidden';
            View.sinumerikView.machineManagerVisibility = 'hidden';
        } else if (newTab == 'counturEdit') {
            counturEditDelay = visibilityDelay;
            View.sinumerikView.singleLineDebugVisibility = 'hidden';
            View.sinumerikView.counturEditVisibility = 'visible';
            View.sinumerikView.machineManagerVisibility = 'hidden';
        } else if (newTab == 'machineManager') {
            machineManagerDelay = visibilityDelay;
            View.sinumerikView.singleLineDebugVisibility = 'hidden';
            View.sinumerikView.counturEditVisibility = 'hidden';
            View.sinumerikView.machineManagerVisibility = 'visible';
        }else {
            console.log('set active tab error!!!');
        }
        setTimeout(setCounturEditVisibility, counturEditDelay);
        setTimeout(setSingleLineDebugVisibility, singleLineDelay);
        setTimeout(setMachineManagerVisibility, machineManagerDelay);

    } else {
        console.log('Old tab');
    }
    function setCounturEditVisibility() {
        View.sinumerikView.counturEditFootContainer.style.visibility = View.sinumerikView.counturEditVisibility;
        View.sinumerikView.counturEditMainWindow.style.visibility = View.sinumerikView.counturEditVisibility;
    }

    function setSingleLineDebugVisibility() {
        View.sinumerikView.singleLineDebugFootContainer.style.visibility = View.sinumerikView.singleLineDebugVisibility;
        View.sinumerikView.singleLineDebugMainWindow.style.visibility = View.sinumerikView.singleLineDebugVisibility;
    }

    function setMachineManagerVisibility() {
        View.sinumerikView.machineManagerFootContainer.style.visibility = View.sinumerikView.machineManagerVisibility;
        View.sinumerikView.machineManagerMainWindow.style.visibility = View.sinumerikView.machineManagerVisibility;
        View.sinumerikView.machineManagerRightContainer.style.visibility = View.sinumerikView.machineManagerVisibility;
    }
}



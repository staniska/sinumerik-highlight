'use babel';

import View from "./sinumerik";

export function changeActiveTab(newTab) {
    const sinumerikEventHandler = View.sinumerikView.eventRouter.route.bind(this);
    if (View.sinumerikView.activeTab === newTab) return

    View.sinumerikView.activeTab = newTab;

    if (newTab !== 'singleLine' && newTab !== 'contourEdit' && newTab !== 'machineManager') {
        console.log('set active tab error!!!');
        return
    }

    View.sinumerikView.Panel.dataset.activeTab = ''

    if (newTab === 'singleLine') {
        sinumerikEventHandler('{"emitter": "singleLine", "event": "selectSLDTab"}');
    }

    setTimeout(() => {
        View.sinumerikView.Panel.dataset.activeTab = newTab
    }, 300)
}

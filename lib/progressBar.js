'use babel'


import {create_element} from "./createElement";
import View from "./sinumerik";
import {changeCanvas} from "./single-line-debug";

export const progressBar = (parent) => {
    const progressBarContainer = create_element([], parent, '')
    const progressLine = create_element([], progressBarContainer)
    progressLine.style.flexGrow = 1
    progressLine.style.margin = '5px'
    progressLine.style.height = '15px'
    const progressBar = create_element(['singleLineDebugProgressLine', 'native-key-bindings'], progressLine, '', 'progress')
    progressBar.max = 100
    progressBar.value = 0
    progressBar.tabIndex = '0'

    const clickListener = (e) => {
        View.sinumerikView.parseData.drawnElementsNums = Math.round(progressBar.max * e.layerX / e.target.offsetWidth)

        View.sinumerikView.singleLineDebugData.progressBarDebug = true
        if (!progressBar.classList.contains('progressBar_Active')) {
            progressBar.classList.add('progressBar_Active')

            document.addEventListener('click', clickOutListener)
        }
        progressBar.focus()
        progressBar.addEventListener('keydown', keyListener)
        changeCanvas()
    }
    const clickOutListener = (e) => {
        if (e.target.tagName !== 'PROGRESS' && e.target.tagName !== 'CANVAS') {
            View.sinumerikView.singleLineDebugData.progressBarDebug = false
            if (progressBar.classList.contains('progressBar_Active')) {
                progressBar.classList.remove('progressBar_Active')
            }
            progressBar.removeEventListener('keydown', keyListener)
            document.removeEventListener('click', clickOutListener)
        }
        changeCanvas()
    }

    const keyListener = (e) => {
        if (!e.key.match(/Arrow[Left|Right]/)) return
        let iterator = 1
        if (e.shiftKey) iterator = 10
        if (e.key === 'ArrowLeft') {
            View.sinumerikView.parseData.drawnElementsNums -= iterator
            if (View.sinumerikView.parseData.drawnElementsNums < 0) View.sinumerikView.parseData.drawnElementsNums = 0
        }
        if (e.key === 'ArrowRight') {
            View.sinumerikView.parseData.drawnElementsNums += iterator
            if (View.sinumerikView.parseData.drawnElementsNums > progressBar.max) View.sinumerikView.parseData.drawnElementsNums = progressBar.max
        }
        changeCanvas()
    }
    progressBar.addEventListener('click', clickListener)
    return progressBarContainer
}

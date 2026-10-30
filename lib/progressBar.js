'use babel'


import {create_element} from "./createElement";
import View from "./sinumerik";
import {changeCanvas, setSlowDebugHold} from "./single-line-debug";

export const progressBar = (parent) => {
    const progressBarContainer = create_element([], parent)
    const progressLine = create_element(['sinumerikProgressLine'], progressBarContainer)
    const progressBar = create_element(['singleLineDebugProgressLine', 'native-key-bindings'], progressLine, 'progress')
    progressBar.max = 100
    progressBar.value = 0
    progressBar.tabIndex = '0'

    const clickListener = (e) => {
        // offsetX, not layerX: layerX is measured from the layer the element
        // sits in, so everything laid out to the left of the bar is counted into
        // it, while the width it is divided by is the bar's own. That was exact
        // only as long as the bar started at the left edge — putting the hold
        // button beside it moved every click about the width of that button to
        // the right. offsetX is measured from the bar itself.
        View.sinumerikView.parseData.drawnElementsNums = Math.max(0, Math.min(
            progressBar.max,
            Math.round(progressBar.max * e.offsetX / e.target.offsetWidth)
        ))

        View.sinumerikView.singleLineDebugData.progressBarDebug = true
        // A scrub freezes the animation loops, so it is a hold as far as the
        // play/pause button is concerned: without this the button would offer to
        // pause a run that is already standing still, and pressing it would do
        // nothing visible.
        setSlowDebugHold(true)
        if (!progressBar.classList.contains('progressBar_Active')) {
            progressBar.classList.add('progressBar_Active')

            document.addEventListener('click', clickOutListener)
        }
        progressBar.focus()
        progressBar.addEventListener('keydown', keyListener)
        changeCanvas()
    }
    const clickOutListener = (e) => {
        // While slow debug is on, nothing outside the graphics area, the bar and
        // the play/pause button has a say over the run. This listener used to
        // answer any click anywhere with changeCanvas(), which during a run means
        // restarting it: picking a unit, or pressing the play button beside the
        // bar, threw the animation back to the position it had been scrubbed to.
        // The play button is now the way out of scrub mode — see its handler.
        if (View.sinumerikView.singleLineDebugInfoDiv?.slowDebugCheck?.checked) return
        if (e.target.classList?.contains('sinumerikSLDPlayButton')) return

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

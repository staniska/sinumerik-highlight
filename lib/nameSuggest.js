'use babel'

// Autocomplete for a field that takes a program name.
//
// Not a native `<datalist>`. Pulsar's global key handler translates every
// keyboard event the document sees, and the first thing it does is read
// `event.key.length` (`@pulsar-edit/atom-keymap/src/helpers.js`) — the events
// Chromium's own datalist popup sends arrive without a `key`, so opening the
// native dropdown crashed the editor's keymap with "Cannot read properties of
// undefined (reading 'length')". There is nothing to fix on our side of that:
// the only way out is not to use the native popup.
//
// So: a list of our own, with the two rules the other two menus in this package
// already use (`snippets.js`, `tools.js::handleToolsKey`) — the arrows wrap
// round, Enter accepts — and every key it handles stopped from reaching the
// document, which is what keeps Pulsar from acting on it as a command.
//
// The list is mounted on `body` with fixed coordinates rather than inside the
// row: the panel's footer is a flex box that would clip it.

import {create_element} from './createElement'

const MAX_VISIBLE = 8

export function attachNameSuggest(input, namesProvider) {
    const state = {list: null, items: [], selected: 0, names: []}

    const close = () => {
        if (state.list) state.list.remove()
        state.list = null
        state.items = []
        state.selected = 0
    }

    const accept = () => {
        if (!state.list || !state.items.length) return false
        input.value = state.items[state.selected].dataset.name
        close()
        return true
    }

    const render = () => {
        const typed = input.value.trim().toUpperCase()
        const matches = suggestionsFor(state.names, typed)

        close()
        if (!matches.length) return
        // Nothing to suggest when the field already holds the only match.
        if (matches.length === 1 && matches[0] === typed) return

        state.list = create_element(['sinumerikNameSuggest'], document.body, 'ul')
        matches.forEach((name, idx) => {
            const item = create_element(['sinumerikNameSuggestItem'], state.list, 'li', name)
            item.dataset.name = name
            // `mousedown`, not `click`: a click would take the focus off the
            // field first, and the blur handler would have closed the list
            // before the click arrived.
            item.addEventListener('mousedown', (e) => {
                e.preventDefault()
                state.selected = idx
                accept()
                input.focus()
            })
            state.items.push(item)
        })
        state.selected = 0
        paint()
        position()
    }

    const paint = () => {
        state.items.forEach((item, idx) => {
            item.classList.toggle('sinumerikNameSuggestItem--selected', idx === state.selected)
        })
        const current = state.items[state.selected]
        if (current) current.scrollIntoView({block: 'nearest'})
    }

    const position = () => {
        const box = input.getBoundingClientRect()
        state.list.style.left = `${box.left}px`
        state.list.style.minWidth = `${box.width}px`
        // Below the field, unless there is no room below — then above it.
        const height = state.list.offsetHeight
        state.list.style.top = (box.bottom + height > window.innerHeight && box.top > height)
            ? `${box.top - height}px`
            : `${box.bottom}px`
    }

    const open = async () => {
        try {
            state.names = await namesProvider()
        } catch (e) {
            console.log('name suggest', e)
            return
        }
        render()
    }

    input.addEventListener('focus', () => { open() })
    input.addEventListener('input', () => {
        if (state.names.length) render()
        else open()
    })
    input.addEventListener('blur', () => close())

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (!state.list) return
            e.preventDefault()
            e.stopPropagation()
            close()
            return
        }
        if (e.key === 'Enter') {
            // Only swallowed when there is something to accept, so that Enter
            // on a hand-typed name still reaches the field's own handler.
            if (!state.list) return
            e.preventDefault()
            e.stopPropagation()
            accept()
            return
        }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            e.stopPropagation()
            if (!state.list) {
                open()
                return
            }
            const step = e.key === 'ArrowDown' ? 1 : -1
            state.selected = (state.selected + step + state.items.length) % state.items.length
            paint()
        }
    })

    return {close}
}

// Which names to offer for what is typed, and in what order.
//
// Prefix matches first: a name is typed from the front, so the one that starts
// with what is there is the one meant. Pure, so the rule can be checked without
// a DOM.
export function suggestionsFor(names, typed) {
    const text = (typed ?? '').trim().toUpperCase()
    return (names ?? [])
        .filter(name => name.indexOf(text) > -1)
        .sort((a, b) => (b.indexOf(text) === 0) - (a.indexOf(text) === 0))
        .slice(0, MAX_VISIBLE * 4)
}

'use babel'

export const addOptions = (div) => {
    const D_num_div = document.createElement('div')
    D_num_div.className = 'sinumerikOptionRow'
    const D_num_text = document.createElement('div')
    D_num_text.innerText = 'use D-num (T1 D1) instead of T0101'
    const D_num_checkbox = document.createElement('input')
    D_num_checkbox.id = 'D_num'
    D_num_checkbox.type = 'checkbox'
    D_num_checkbox.className = 'sinumerikOptionCheckbox'
    D_num_div.appendChild(D_num_text)
    D_num_div.appendChild(D_num_checkbox)
    div.appendChild(D_num_div)

    const G43_div = document.createElement('div')
    G43_div.className = 'sinumerikOptionRow'
    const G43_text = document.createElement('div')
    G43_text.innerText = 'insert G43 H... after tool change'
    const G43_checkbox = document.createElement('input')
    G43_checkbox.id = 'G43'
    G43_checkbox.type = 'checkbox'
    G43_checkbox.className = 'sinumerikOptionCheckbox'
    G43_div.appendChild(G43_text)
    G43_div.appendChild(G43_checkbox)
    div.appendChild(G43_div)

}
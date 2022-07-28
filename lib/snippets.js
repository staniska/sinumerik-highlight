'use babel';

import View from "./sinumerik";
import {loadDataFromComment} from "./inner-comment";

var fs = require("fs-extra");
var path = require("path");

export function loadSnippet(filepath) {

    let snippets = []

    fs.readdirSync(filepath).forEach(file => {
        let extension = path.extname(file)
        if (extension === '.json') {
            try {
                let snippet = JSON.parse(fs.readFileSync(filepath + '/' + file, {encoding: 'utf8'}))
                snippets.push(snippet)
            }
            catch (e) {
                console.log(e)
            }
        }
    });
    return snippets
}

export function getSnippets () {
    let Editor = atom.workspace.getActiveTextEditor()
    let fileName = Editor.getTitle().toUpperCase().replace('.', '_')

    if (View.sinumerikView.programmData[fileName].machine === undefined) { return }

    let machineName = View.sinumerikView.programmData[fileName].machine.machineName

    // console.log(Editor.cursors[0].getScreenPosition())

    let cursorDiv = [...document.getElementsByClassName('line cursor-line')].filter((el) => {
        return el.clientHeight > 0
    })[0]

    let cursorScreenPosition = GetScreenCordinates(cursorDiv)

    let cursorPosition = Editor.getCursorBufferPosition()

    if (cursorPosition.row < Editor.getFirstVisibleScreenRow() ||
        cursorPosition.row > Editor.getLastVisibleScreenRow()) {
        console.log('Snippets: off-screen cursor')
        return
    }

    let snipArray = []

    let sinumerikSnippetDiv = document.getElementsByClassName('sinumerikSnippetsMenu')

    if (!View.sinumerikView.snippetsDiv) {
        View.sinumerikView.snippetsDiv = document.createElement('div')
        View.sinumerikView.snippetsDiv.className = 'sinumerikSnippetsMenu modal overlay select-list'
        View.sinumerikView.snippetsDiv.style.backgroundColor = '#eaeaeb';
        View.sinumerikView.snippetsDiv.style.border = '1px solid dimgray';
        sinumerikSnippetDiv = document.getElementsByClassName('sinumerikSnippetsMenu')
    }

    if (sinumerikSnippetDiv.length) {
        let snippetDivParent = sinumerikSnippetDiv[0].parentElement
        if (snippetDivParent) {
            while (sinumerikSnippetDiv[0].children.length) {
                sinumerikSnippetDiv[0].removeChild(sinumerikSnippetDiv[0].lastChild)
            }
            snippetDivParent.removeChild(snippetDivParent.lastChild)
        }
        if (View.sinumerikView.snipForm) {
            View.sinumerikView.snipForm.destroy()
        }

        View.sinumerikView.snippetsTopPanel.destroy()
        atom.workspace.getPanes()[0].activate()

    } else {
        View.sinumerikView.snippetsTopPanel = atom.workspace.addTopPanel({item: View.sinumerikView.snippetsDiv})

        View.sinumerikView.snippetsDiv.inputIcon = document.createElement('div')
        View.sinumerikView.snippetsDiv.inputIcon.style.float = 'left'
        View.sinumerikView.snippetsDiv.inputIcon.className = 'icon icon-search'
        View.sinumerikView.snippetsDiv.appendChild(View.sinumerikView.snippetsDiv.inputIcon)
        View.sinumerikView.snippetsDiv.input = document.createElement('input')
        View.sinumerikView.snippetsDiv.appendChild(View.sinumerikView.snippetsDiv.input)
        View.sinumerikView.snippetsDiv.input.focus()
        View.sinumerikView.snippetsDiv.selectedIdx = 0


        View.sinumerikView.snippetsDiv.input.addEventListener('keyup', (key) => {

            if (key.key === 'ArrowRight' || key.key === 'Enter') {
                snippetForm(snipArray[View.sinumerikView.snippetsDiv.selectedIdx], cursorScreenPosition, cursorPosition)
            } else if (key.key === 'ArrowUp') {
                View.sinumerikView.snippetsDiv.selectedIdx -= 1
                if (View.sinumerikView.snippetsDiv.selectedIdx < 0) {
                    View.sinumerikView.snippetsDiv.selectedIdx = snipArray.length - 1
                }
                getSnipList()
            } else if (key.key === 'ArrowDown') {
                View.sinumerikView.snippetsDiv.selectedIdx += 1
                if (View.sinumerikView.snippetsDiv.selectedIdx == snipArray.length) {
                    View.sinumerikView.snippetsDiv.selectedIdx = 0
                }
                getSnipList()
            } else {
                if (key.key === 'Backspace') {
                    View.sinumerikView.snippetsDiv.input.value = View.sinumerikView.snippetsDiv.input.value.slice(0, -1)
                }
                snipArray = getSnipArray()
                snipListFilter(snipArray, View.sinumerikView.snippetsDiv.input.value)
                getSnipList()
            }
        })


        View.sinumerikView.snippetsDiv.snippetsOl = document.createElement('ol')
        View.sinumerikView.snippetsDiv.snippetsOl.className = 'mark-active'
        View.sinumerikView.snippetsDiv.appendChild(View.sinumerikView.snippetsDiv.snippetsOl)
        View.sinumerikView.snippetsDiv.snippetsOl.style.listStyle = 'none'


        View.sinumerikView.snippetsDiv.style.top = cursorScreenPosition.y + 'px'
        View.sinumerikView.snippetsDiv.style.left = cursorScreenPosition.x + 'px'

        snipArray = getSnipArray()
        snipListFilter(snipArray, '')
        getSnipList()

    }

    function getSnipList() {
        while (View.sinumerikView.snippetsDiv.snippetsOl.children.length) {
            View.sinumerikView.snippetsDiv.snippetsOl.removeChild(View.sinumerikView.snippetsDiv.snippetsOl.lastChild)
        }

        snipArray.forEach((snip, idx) => {
            if (snip.Li) {
                delete(snip.Li)
            }
            snip.idx = idx
            snip.Li = document.createElement('li')
            snip.Li.className = 'snippetsLi'
            snip.Li.id = 'snippet ' + snip.name
            // snip.Li.innerText = snip.name
            snip.Li.tabIndex = -1
            snip.Li.addEventListener('keydown', (key) => {
                if (key.key === 'ArrowDown'){
                    let nextElementId = snip.Li.nextElementSibling ? snip.Li.nextElementSibling.id : snip.Li.parentElement.firstChild.id
                    document.getElementById(nextElementId).focus();
                }
                if (key.key === 'ArrowUp'){
                    let prevElementId = snip.Li.previousElementSibling ? snip.Li.previousElementSibling.id : snip.Li.parentElement.lastChild.id
                    document.getElementById(prevElementId).focus();
                }
                if (key.key === 'ArrowRight' || key.key === 'Enter') {
                    snippetForm(snip, cursorScreenPosition, cursorPosition)
                }
            })
            snip.Li.addEventListener('focus', () => {
                snip.Li.className = 'snippetsLiSelected'
            })
            snip.Li.addEventListener('blur', () => {
                snip.Li.className = 'snippetsLi'
            })

            snip.Li.nameDiv = document.createElement('div')
            snip.Li.nameDiv.className = 'snipName'
            snip.Li.nameDiv.innerText = snip.name
            snip.Li.appendChild(snip.Li.nameDiv)

            snip.Li.commentDiv = document.createElement('div')
            snip.Li.commentDiv.className = 'comment'
            if (snip.comment) {
                snip.Li.commentDiv.innerText = '      (' + snip.comment + ')'
            }
            snip.Li.appendChild(snip.Li.commentDiv)

            View.sinumerikView.snippetsDiv.snippetsOl.appendChild(snip.Li)

            if (idx === View.sinumerikView.snippetsDiv.selectedIdx) {
                snip.Li.className = 'snippetsLiSelected'
            }

        })
    }

    function getSnipArray() {
        let snipArray = []

        View.sinumerikView.machineData.snippets[machineName].forEach((snippetsPath) => {
            snippetsPath.snippets.forEach((snippet) => {
                snipArray.push(snippet)
            })
        })
        return snipArray
    }

}

function snipListFilter(snipArray, word) {
    snipArray.sort(function (a, b) {
        let compare = {a: 0, b: 0}
        Array.from(word).forEach((symbol, idx) => {
            compare.a += a.name[idx].toLowerCase() === symbol.toLowerCase() ? 1 : 0
            compare.b += b.name[idx].toLowerCase() === symbol.toLowerCase() ? 1 : 0
        })

        if (compare.a > compare.b) {
            return -1
        }
        if (compare.a < compare.b) {
            return 1
        }
        return 0
    })
}

function snippetForm(snip, cursorScreenPosition, cursorPosition) {
    let snipForm = document.createElement('div')
    snipForm.className = 'sinumerikSnippetsMenu modal overlay select-list'
    snipForm.style.backgroundColor = '#eaeaeb';
    snipForm.style.border = '1px solid dimgray';
    snipForm.style.top = cursorScreenPosition.y + snip.idx * snip.Li.clientHeight + 20 + 'px'
    snipForm.style.left = cursorScreenPosition.x + 50 + 'px'
    snipForm.name = document.createElement('div')
    snipForm.name.className = 'snipName'
    snipForm.name.innerText = snip.name
    snipForm.appendChild(snipForm.name)


    if (snip.variables && snip.variables.length) {
        snip.variables.forEach((snipVar, idx) => {
            snipForm[snipVar.name] = document.createElement('div')
            snipForm[snipVar.name].name = document.createElement('div')
            snipForm[snipVar.name].name.innerText = snipVar.name + ':'
            snipForm[snipVar.name].name.style.float = 'left';
            snipForm[snipVar.name].appendChild(snipForm[snipVar.name].name)
            snipForm[snipVar.name].input = document.createElement('input')
            snipForm[snipVar.name].input.tabIndex = 0
            snipForm[snipVar.name].input.style.marginLeft = '1em'
            if (snipVar.default !== undefined) {
                snipForm[snipVar.name].input.value = snipVar.default
            }
            snipForm[snipVar.name].input.addEventListener('input', () => {
                generateSnipBody(snip, snipForm)
            })

            snipForm[snipVar.name].input.addEventListener('keydown', (key) => {
                if (key.key === 'Backspace') {
                    snipForm[snipVar.name].input.value = snipForm[snipVar.name].input.value.slice(0, -1)
                    generateSnipBody(snip, snipForm)
                }

                if (key.key === 'ArrowDown') {
                    if (idx < snip.variables.length - 1) {
                        snipForm[snip.variables[idx + 1].name].input.focus()
                    } else {
                        snipForm[snip.variables[0].name].input.focus()
                    }
                }

                if (key.key === 'ArrowUp') {
                    if (idx > 0) {
                        snipForm[snip.variables[idx - 1].name].input.focus()
                    } else {
                        snipForm[snip.variables[snip.variables.length - 1].name].input.focus()
                    }
                }

                if (key.key === 'Enter') {
                    let Editor = atom.workspace.getActiveTextEditor()
                    Editor.setCursorScreenPosition(cursorPosition)

                    let text = snipForm.body.innerText.replace(/<br>/g , '\n')

                    Editor.insertText(text)
                    atom.workspace.getPanes()[0].activate()


                    let sinumerikSnippetDiv = document.getElementsByClassName('sinumerikSnippetsMenu')

                    let snippetDivParent = sinumerikSnippetDiv[0].parentElement
                    if (snippetDivParent) {
                        while (sinumerikSnippetDiv[0].children.length) {
                            sinumerikSnippetDiv[0].removeChild(sinumerikSnippetDiv[0].lastChild)
                        }
                        snippetDivParent.removeChild(snippetDivParent.lastChild)
                    }
                    if (View.sinumerikView.snipForm) {
                        View.sinumerikView.snipForm.destroy()
                    }

                    View.sinumerikView.snipForm.destroy()
                    View.sinumerikView.snippetsTopPanel.destroy()
                }


            })
            snipForm[snipVar.name].appendChild(snipForm[snipVar.name].input)
            snipForm.appendChild(snipForm[snipVar.name])
        })
    }



    snipForm.body = document.createElement('div')
    snipForm.body.className = 'snipFormBody'
    snipForm.appendChild(snipForm.body)
    generateSnipBody(snip, snipForm)

    snipForm.tabIndex = 0
    snipForm.addEventListener('keydown', (key) => {
        if (key.key === 'ArrowLeft' || key.key === 'Escape') {
            View.sinumerikView.snippetsDiv.input.focus()
            View.sinumerikView.snipForm.destroy()
        }

        if (key.key === 'Enter' && !snip.variables) {
            let Editor = atom.workspace.getActiveTextEditor()
            Editor.setCursorScreenPosition(cursorPosition)

            let text = snipForm.body.innerText.replace(/<br>/g , '\n')

            Editor.insertText(text)
            atom.workspace.getPanes()[0].activate()


            let sinumerikSnippetDiv = document.getElementsByClassName('sinumerikSnippetsMenu')

            let snippetDivParent = sinumerikSnippetDiv[0].parentElement
            if (snippetDivParent) {
                while (sinumerikSnippetDiv[0].children.length) {
                    sinumerikSnippetDiv[0].removeChild(sinumerikSnippetDiv[0].lastChild)
                }
                snippetDivParent.removeChild(snippetDivParent.lastChild)
            }
            if (View.sinumerikView.snipForm) {
                View.sinumerikView.snipForm.destroy()
            }

            View.sinumerikView.snipForm.destroy()
            View.sinumerikView.snippetsTopPanel.destroy()
        }

    })



    View.sinumerikView.snipForm = atom.workspace.addTopPanel({item: snipForm})
    if (snip.variables && snip.variables.length) {
        snipForm[snip.variables[0].name].input.focus()
    } else {
        snipForm.focus()
    }


}

function generateSnipBody(snip, snipForm) {
    snipForm.body.innerHTML = '<br>'

    snip.body.forEach(str => {
        // if (str.search(/\w/)) {
        //     console.log(str)
        // }

        if (str.match(/(?<=[{])\w+(?=})/)) {
            str.match(/(?<=[{])\w+(?=})/g).forEach((varInStr) => {
                    let regExp = new RegExp(`{${varInStr}}`, 'g')
                    if (snipForm[varInStr] !== undefined) {
                        str = str.replace(`{${varInStr}}`, snipForm[varInStr].input.value)
                    }
                    if (snip.calc && snip.calc.filter(calc => {
                        return calc.name === varInStr
                    }).length) {
                        let expression = snip.calc.filter(calc => {
                            return calc.name === varInStr
                        })[0].expression
                        if (expression.match(/(?<=[{])\w+(?=})/)) {
                            expression.match(/(?<=[{])\w+(?=})/g).forEach((varInExpr) => {
                                let regExp = new RegExp(`{${varInExpr}}`, 'g')
                                if (snipForm[varInExpr] !== undefined) {
                                    expression = expression.replace(regExp, snipForm[varInExpr].input.value)
                                }
                            })
                        }
                        let expressionResult = ''
                        try {
                            expressionResult = eval(expression)
                            let replaceRegEx = new RegExp(`{${varInStr}}`, 'g')
                            str = str.replace(replaceRegEx, expressionResult)
                        } catch (e) {
                        }
                    }
                }
            )
        }
        let regEx = new RegExp('<', 'g')
        str = str.replace(regEx,'&lt')
        regEx = new RegExp('>', 'g')
        str = str.replace(regEx,'&gt')

        snipForm.body.innerHTML += '<pre>' + str + '</pre>'

    })
}



function GetScreenCordinates(obj) {
    var p = {};
    p.x = obj.offsetLeft;
    p.y = obj.offsetTop;
    while (obj.offsetParent) {
        p.x = p.x + obj.offsetParent.offsetLeft;
        p.y = p.y + obj.offsetParent.offsetTop;
        if (obj.style.transform &&
            obj.style.transform.match(/translate\(/) ) {
            let transY = parseFloat(obj.style.transform.slice(obj.style.transform.indexOf(',') + 1, obj.style.transform.indexOf('px)')))
            p.y += transY
        }

        if (obj.style.transform &&
            obj.style.transform.match('translateY')) {
            let transY = parseFloat(obj.style.transform.slice(obj.style.transform.indexOf('(') + 1, obj.style.transform.indexOf('px)')))
            p.y += transY
        }

        if (obj.tagName === 'ATOM-WORKSPACE') {
            break;
        }
        else {
            // console.log(obj.tagName)
            obj = obj.offsetParent;
        }
    }
    return p;
}


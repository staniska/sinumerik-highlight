'use babel';

import View from "./sinumerik";

const beginSubstr = ';This comment is automatically created by sinumerik-highlight package';
const endSubstr = ';End of comment created by sinumerik-highlight package';


export function loadDataFromComment() {
    const Editor = atom.workspace.getActiveTextEditor();
    var filename = Editor.getTitle().replace('.','_');
    console.log('Load data from comment');
    console.log(View.sinumerikView);
    if (!View.sinumerikView.programmData) {
        View.sinumerikView.programmData = {};
    }
    View.sinumerikView.programmData[filename] = {};
    var programmText = Editor.getText();

    var containingString = '';
    var beginSubstrIndex = programmText.indexOf(beginSubstr, 0);
    while (beginSubstrIndex > 0) {
        var endSubstrIndex = programmText.indexOf(endSubstr, beginSubstrIndex + beginSubstr.length);
        if (endSubstrIndex < 0) {
            console.log('Broken comment');
        } else {
            containingString += programmText.substring(beginSubstrIndex+beginSubstr.length, endSubstrIndex).replace(';','');
        }
        beginSubstrIndex = programmText.indexOf(beginSubstr, beginSubstrIndex + beginSubstr.length + endSubstr.length);
    }

    console.log(containingString);



}

export function putDataInComment() {

}

